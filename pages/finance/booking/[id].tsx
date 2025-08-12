/* pages/finance/booking/[id].tsx */
"use client";

import Head from "next/head";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import {
  collection, doc, onSnapshot, query, where,
  addDoc, updateDoc, deleteDoc, Timestamp
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadOwners, splitAmount } from "@/lib/finance/owners";

const ManagerLayout = dynamic(() => import("@/components/layouts/ManagerLayout"), { ssr: false });

type Currency = "EUR" | "RON" | "USD";

type Account = {
  id: string;
  name: string;
  currency: Currency;
  archived?: boolean;
};

type FxDoc = { id: string; base: "EUR"; rates: Partial<Record<Currency, number>> };

type Booking = {
  id?: string;
  bookingType?: string;                // "olimpya_base" | "subagent" | ...
  bookingNumber?: string;
  createdAt?: any;

  agentName?: string;
  operator?: string;
  hotel?: string;
  payerName?: string;
  checkIn?: any; checkOut?: any;

  bruttoClient?: number;               // €
  internalNet?: number;                // €
  nettoOlimpya?: number;               // €
  realCommission?: number;             // если задана — берём её
  commission?: number;                 // расчётная (fallback)
  overCommission?: number;

  commissionIgor?: number;
  commissionEvgeniy?: number;

  owners?: Array<{ ownerId?: string; name?: string; share?: number }>;

  // флаг бэкофиса (поддержим оба названия для совместимости)
  backofficePosted?: boolean;
  backofficeEntered?: boolean;
};

type TxDoc = {
  id?: string;
  bookingId?: string;
  type: "in" | "out";
  status: "planned" | "actual" | "reconciled";
  // даты
  dueDate?: string;        // YYYY-MM-DD (для planned)
  actualDate?: string;     // YYYY-MM-DD (для actual/reconciled)
  date?: string;           // дублируем для совместимости/календаря
  // деньги
  accountId?: string;
  currency?: Currency;
  amount?: number;         // в валюте счёта
  baseAmount?: number;     // в EUR
  // прочее
  title?: string;
  category?: string;
  note?: string;
  createdAt?: any;
};

const n = (v: any) => Number(v ?? 0) || 0;
const fmt2 = (v: any) => n(v).toFixed(2);
const fmtDate = (v: any) => {
  if (!v) return "—";
  if (typeof v === "string") return v;
  if ((v as any)?.toDate) return (v as any).toDate().toISOString().slice(0, 10);
  try { return new Date(v).toISOString().slice(0, 10); } catch { return "—"; }
};

// локальная дата "YYYY-MM-DD" без UTC-сдвига
const localISO = (d: Date = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function FinanceBookingPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [txs, setTxs] = useState<TxDoc[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fx, setFx] = useState<FxDoc | null>(null);
  const [owners, setOwners] = useState<{ id: string; name: string; share: number }[]>([]);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txForm, setTxForm] = useState<{
    type: "in" | "out";
    status: "planned" | "actual";
    date: string;           // локальная дата
    accountId: string;
    amount: number;
    title: string;
    category: string;
    note: string;
  }>({
    type: "in",
    status: "planned",
    date: localISO(new Date()),
    accountId: "",
    amount: 0,
    title: "",
    category: "",
    note: "",
  });

  useEffect(() => {
    if (!router.isReady) return;
    if (!user || !canView) { router.replace("/login"); return; }
    if (!id || typeof id !== "string") return;

    const unsubB = onSnapshot(doc(db, "bookings", id), (snap) => {
      if (!snap.exists()) return;
      const v = snap.data() as any;
      setBooking({ id: snap.id, ...v });
    });

    const unsubT = onSnapshot(query(collection(db, "finance_transactions"), where("bookingId", "==", id)), (snap) => {
      setTxs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    const unsubAcc = onSnapshot(query(collection(db, "finance_accounts")), (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((a) => !a.archived));
    });

    const unsubFx = onSnapshot(query(collection(db, "finance_fxRates")), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FxDoc[];
      const last = [...list].sort((a, b) => (a.id < b.id ? 1 : -1))[0];
      setFx(last || { id: "—", base: "EUR", rates: { RON: 4.97, USD: 1.08 } });
    });

    loadOwners().then(setOwners).catch(console.error);

    return () => { unsubB(); unsubT(); unsubAcc(); unsubFx(); };
  }, [router.isReady, id, user, canView, router]);

  // FX
  const eurFrom = (amount: number, ccy: Currency): number => {
    if (!amount) return 0;
    if (ccy === "EUR") return amount;
    const r = fx?.rates?.[ccy];
    if (!r || r <= 0) return 0;
    return amount / r;
  };

  // вычисления (информативные — без редактирования)
  const brutto = n(booking?.bruttoClient);
  const netCrocus = n(booking?.internalNet);
  const netOlimp = n(booking?.nettoOlimpya) || netCrocus;

  const baseCommission =
    n(booking?.realCommission) || n(booking?.commission) || (brutto - netCrocus);

  const crocusAmount =
    booking?.bookingType === "olimpya_base" ? baseCommission : (brutto - netCrocus);

  const over = n(booking?.overCommission) || (brutto - netOlimp);

  // авто-сплит -> только Igor и Evgeniy (если в заявке заданы точные доли — они приоритетнее)
  const splitView = useMemo(() => {
    const preset: Record<string, number> = {};
    if (n(booking?.commissionIgor)) preset["Igor"] = n(booking?.commissionIgor);
    if (n(booking?.commissionEvgeniy)) preset["Evgeniy"] = n(booking?.commissionEvgeniy);

    if (booking?.bookingType === "olimpya_base") {
      if (preset.Igor || preset.Evgeniy) {
        return {
          Igor: +n(preset.Igor).toFixed(2),
          Evgeniy: +n(preset.Evgeniy).toFixed(2),
        };
      }
      const parts = splitAmount(baseCommission, owners, booking?.owners);
      const m: Record<string, number> = {};
      parts.forEach(p => m[p.name] = n(m[p.name]) + n(p.amount));
      return { Igor: +n(m["Igor"]).toFixed(2), Evgeniy: +n(m["Evgeniy"]).toFixed(2) };
    } else {
      const parts = splitAmount(brutto - netCrocus, owners);
      const m: Record<string, number> = {};
      parts.forEach(p => m[p.name] = n(m[p.name]) + n(p.amount));
      return { Igor: +n(m["Igor"]).toFixed(2), Evgeniy: +n(m["Evgeniy"]).toFixed(2) };
    }
  }, [booking, owners, baseCommission, brutto, netCrocus]);

  // факт (actual|reconciled)
  const fact = useMemo(() => {
    let inEUR = 0, outEUR = 0;
    txs.forEach((t) => {
      if (t.status !== "actual" && t.status !== "reconciled") return;
      if (t.type === "in") inEUR += n(t.baseAmount);
      if (t.type === "out") outEUR += n(t.baseAmount);
    });
    return { inEUR: +inEUR.toFixed(2), outEUR: +outEUR.toFixed(2) };
  }, [txs]);

  // подсветка
  const payClass = (paid: number, target: number) => {
    if (target <= 0) return "";
    if (paid <= 0.01) return "bg-rose-50 text-rose-800";
    if (paid + 0.01 >= target) return "bg-emerald-50 text-emerald-800";
    return "bg-amber-50 text-amber-800";
  };

  // ----- План/транзакции -----

  const openTxModal = (preset?: Partial<typeof txForm>) => {
    setTxForm((f) => ({
      type: (preset?.type as any) || "in",
      status: (preset?.status as any) || "planned",
      date: preset?.date || localISO(new Date()),
      accountId: preset?.accountId || (accounts[0]?.id || ""),
      amount: n(preset?.amount),
      title: preset?.title || "",
      category: preset?.category || "",
      note: preset?.note || "",
    }));
    setTxModalOpen(true);
  };

  const baseEURForForm = useMemo(() => {
    const acc = accounts.find((a) => a.id === txForm.accountId);
    const ccy = acc?.currency || "EUR";
    return eurFrom(n(txForm.amount), ccy as Currency);
  }, [txForm.accountId, txForm.amount, accounts, fx]);

  const saveTx = async () => {
    if (!booking?.id) return;
    const acc = accounts.find((a) => a.id === txForm.accountId);
    if (!acc) { alert("Выберите счёт"); return; }

    const localDate = txForm.date; // уже локальный YYYY-MM-DD
    const payload: TxDoc = {
      bookingId: booking.id,
      type: txForm.type,
      status: txForm.status,
      // ключевой момент: planned -> dueDate, actual -> actualDate; и ВСЕГДА дублируем в date
      dueDate: txForm.status === "planned" ? localDate : undefined,
      actualDate: txForm.status === "actual" ? localDate : undefined,
      date: localDate,
      accountId: txForm.accountId,
      currency: acc.currency,
      amount: n(txForm.amount),
      baseAmount: +baseEURForForm.toFixed(2),
      title: txForm.title?.trim(),
      category: txForm.category?.trim(),
      note: txForm.note?.trim(),
      createdAt: Timestamp.now(),
    };

    await addDoc(collection(db, "finance_transactions"), payload as any);
    setTxModalOpen(false);
  };

  const updatePlanDueDate = async (t: TxDoc, value: string) => {
    if (!t.id) return;
    // сохраняем в dueDate И в date — чтобы календарь видел
    await updateDoc(doc(db, "finance_transactions", t.id), {
      dueDate: value,
      date: value,
    });
  };

  const markAsActual = async (t: TxDoc) => {
    if (!t.id) return;
    const today = localISO(new Date());
    await updateDoc(doc(db, "finance_transactions", t.id), {
      status: "actual",
      actualDate: today,
      date: today,
    });
  };

  const reconcileTx = async (t: TxDoc) => {
    if (!t.id) return;
    // оставим actualDate как есть, просто проставим статус
    await updateDoc(doc(db, "finance_transactions", t.id), { status: "reconciled" });
  };

  const removeTx = async (t: TxDoc) => {
    if (!t.id) return;
    if (!confirm("Удалить транзакцию?")) return;
    await deleteDoc(doc(db, "finance_transactions", t.id));
  };

  const createDefaultPlan = async () => {
    if (!booking?.id) return;
    // дата плана: по checkIn, иначе по createdAt, иначе сегодня (локально)
    const due =
      booking.checkIn ? String(booking.checkIn).match(/^\d{4}-\d{2}-\d{2}$/) ? String(booking.checkIn) : localISO(new Date(booking.createdAt?.toDate?.() ?? booking.checkIn))
      : booking.createdAt?.toDate ? localISO(booking.createdAt.toDate())
      : localISO(new Date());

    if (brutto > 0) {
      await addDoc(collection(db, "finance_transactions"), {
        bookingId: booking.id,
        type: "in",
        status: "planned",
        dueDate: due,
        date: due,
        accountId: accounts[0]?.id || null,
        currency: accounts[0]?.currency || "EUR",
        amount: brutto,
        baseAmount: brutto, // счёт в EUR по-умолчанию; поправите руками при другом счёте
        title: `Оплата клиента (план) №${booking.bookingNumber || ""}`,
        createdAt: Timestamp.now(),
      } as any);
    }
    if (netCrocus > 0) {
      await addDoc(collection(db, "finance_transactions"), {
        bookingId: booking.id,
        type: "out",
        status: "planned",
        dueDate: due,
        date: due,
        accountId: accounts[0]?.id || null,
        currency: accounts[0]?.currency || "EUR",
        amount: netCrocus,
        baseAmount: netCrocus,
        title: `Оплата оператору (план) №${booking.bookingNumber || ""}`,
        createdAt: Timestamp.now(),
      } as any);
    }
  };

  const createOwnerPayoutPlans = async () => {
    if (!booking?.id) return;
    const base = crocusAmount;
    const parts = splitAmount(base, owners, booking.owners)
      .filter(p => p.name === "Igor" || p.name === "Evgeniy");
    const due = localISO(new Date());

    for (const p of parts) {
      if (p.amount <= 0) continue;
      await addDoc(collection(db, "finance_transactions"), {
        bookingId: booking.id,
        type: "out",
        status: "planned",
        dueDate: due,
        date: due,
        accountId: accounts[0]?.id || null,
        currency: accounts[0]?.currency || "EUR",
        amount: +p.amount.toFixed(2),
        baseAmount: +p.amount.toFixed(2),
        title: `Выплата учредителю ${p.name} (план) №${booking.bookingNumber || ""}`,
        category: "owner_payout",
        createdAt: Timestamp.now(),
      } as any);
    }
  };

  // бэкофис (единый флаг)
  const backoffice = !!(booking?.backofficePosted ?? booking?.backofficeEntered);
  const toggleBackoffice = async () => {
    if (!booking?.id) return;
    const v = !backoffice;
    await updateDoc(doc(db, "bookings", booking.id), {
      backofficePosted: v,
      backofficeEntered: v, // для совместимости
      updatedAt: Timestamp.now(),
    });
  };

  // разнесём транзакции по статусу
  const planned = txs.filter(t => t.status === "planned");
  const facts = txs.filter(t => t.status === "actual" || t.status === "reconciled");

  const bruttoCls = payClass(fact.inEUR, brutto);
  const netCls = payClass(fact.outEUR, netCrocus);

  return (
    <ManagerLayout>
      <Head><title>Заявка: финансы</title></Head>

      <div className="max-w-6xl mx-auto py-6 space-y-6">

        {/* Шапка-инфо (только просмотр) */}
        <div className="rounded-xl border p-4 bg-white">
          <div className="text-xs text-gray-500 mb-1">Заявка</div>
          <div className="text-2xl font-bold">
            {(booking?.bookingNumber || "—") + " • " + (booking?.hotel || "—")}
          </div>
          <div className="text-sm text-gray-700 mt-1">
            {(booking?.operator || "—") + " • " + (booking?.agentName || "—")}
          </div>
          <div className="text-sm text-gray-700">
            {fmtDate(booking?.checkIn)} → {fmtDate(booking?.checkOut)} • Плательщик: {booking?.payerName || "—"}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={backoffice} onChange={toggleBackoffice} />
              Заведено в бэкофис
            </label>
            <Button variant="outline" onClick={() => router.push("/finance/bookings-finance")}>
              ← К списку
            </Button>
          </div>
        </div>

        {/* Сводка (информативно) */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className={`p-3 rounded border ${bruttoCls}`}>
                <div className="text-gray-500">Брутто (€)</div>
                <div className="text-lg font-semibold">{fmt2(brutto)}</div>
                <div className="text-[11px]">факт IN: {fmt2(fact.inEUR)}</div>
              </div>
              <div className={`p-3 rounded border ${netCls}`}>
                <div className="text-gray-500">Netto Crocus (€)</div>
                <div className="text-lg font-semibold">{fmt2(netCrocus)}</div>
                <div className="text-[11px]">факт OUT: {fmt2(fact.outEUR)}</div>
              </div>
              <div className="p-3 rounded border">
                <div className="text-gray-500">
                  {booking?.bookingType === "olimpya_base" ? "Комиссия Crocus (€)" : "Прибыль Crocus (€)"}
                </div>
                <div className="text-lg font-semibold">{fmt2(crocusAmount)}</div>
                <div className="text-[11px]">Over: {fmt2(over)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Распределение между учредителями */}
        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-3">Распределение между учредителями</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] border text-sm">
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="border px-2 py-1">Учредитель</th>
                    <th className="border px-2 py-1">Сумма, €</th>
                  </tr>
                </thead>
                <tbody>
                  {["Igor", "Evgeniy"].map(nm => (
                    <tr key={nm} className="text-center border-t">
                      <td className="border px-2 py-1">{nm}</td>
                      <td className="border px-2 py-1 text-right">{fmt2(splitView[nm] || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Транзакции: план/факт, с редактируемым сроком у плана */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Движение денег</h2>
              <div className="flex gap-2">
                <Button onClick={createDefaultPlan}>Создать план по умолчанию</Button>
                <Button variant="outline" onClick={createOwnerPayoutPlans}>Планы выплат учредителям</Button>
                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => openTxModal()}>
                  + Новая транзакция
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] border text-sm">
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="border px-2 py-1">Тип</th>
                    <th className="border px-2 py-1">Статус</th>
                    <th className="border px-2 py-1">Сумма, €</th>
                    <th className="border px-2 py-1">Срок/Дата</th>
                    <th className="border px-2 py-1">Счёт / сумма</th>
                    <th className="border px-2 py-1">Описание</th>
                    <th className="border px-2 py-1 w-[220px]">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {[...planned, ...facts].map((t) => {
                    const acc = accounts.find((a) => a.id === t.accountId);
                    const accLabel = acc ? `${acc.name} (${acc.currency})` : "—";
                    return (
                      <tr key={t.id} className="text-center border-t">
                        <td className="border px-2 py-1">{t.type === "in" ? "Поступление" : "Оплата"}</td>
                        <td className="border px-2 py-1">
                          {t.status === "planned" ? "План" : t.status === "actual" ? "Факт" : "Сверено"}
                        </td>
                        <td className="border px-2 py-1 text-right">{fmt2(t.baseAmount)} €</td>
                        <td className="border px-2 py-1">
                          {t.status === "planned" ? (
                            <input
                              type="date"
                              className="border rounded px-2 py-1 h-8"
                              value={t.dueDate || t.date || ""}
                              onChange={(e) => updatePlanDueDate(t, e.target.value)}
                            />
                          ) : (
                            t.actualDate || t.date || "—"
                          )}
                        </td>
                        <td className="border px-2 py-1">
                          {accLabel}{t.amount ? ` • ${fmt2(t.amount)} ${t.currency}` : ""}
                        </td>
                        <td className="border px-2 py-1 text-left">{t.title || t.note || "—"}</td>
                        <td className="border px-2 py-1">
                          <div className="flex flex-wrap gap-2 justify-center">
                            {t.status === "planned" && (
                              <Button size="sm" onClick={() => markAsActual(t)}>Сделать фактом</Button>
                            )}
                            {t.status !== "reconciled" && t.status !== "planned" && (
                              <Button size="sm" variant="outline" onClick={() => reconcileTx(t)}>Сверить</Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => removeTx(t)}>Удалить</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {txs.length === 0 && (
                    <tr><td colSpan={7} className="border px-2 py-4 text-center text-gray-500">Нет транзакций</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Модалка: новая транзакция */}
      {txModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-lg bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Новая транзакция</h3>
              <button className="text-2xl leading-none" onClick={() => setTxModalOpen(false)}>×</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">Тип</div>
                <select className="w-full border rounded px-2 py-1 h-9"
                        value={txForm.type}
                        onChange={(e) => setTxForm(f => ({ ...f, type: e.target.value as "in" | "out" }))}>
                  <option value="in">IN (поступление)</option>
                  <option value="out">OUT (выплата)</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Статус</div>
                <select className="w-full border rounded px-2 py-1 h-9"
                        value={txForm.status}
                        onChange={(e) => setTxForm(f => ({ ...f, status: e.target.value as "planned" | "actual" }))}>
                  <option value="planned">План</option>
                  <option value="actual">Факт</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Дата</div>
                <Input type="date" value={txForm.date}
                       onChange={(e) => setTxForm(f => ({ ...f, date: e.target.value }))}/>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Счёт</div>
                <select className="w-full border rounded px-2 py-1 h-9"
                        value={txForm.accountId}
                        onChange={(e) => setTxForm(f => ({ ...f, accountId: e.target.value }))}>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Сумма (валюта счёта)</div>
                <Input type="number" step="0.01" value={txForm.amount}
                       onChange={(e) => setTxForm(f => ({ ...f, amount: n(e.target.value) }))}/>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">EUR (расчётно)</div>
                <div className="h-9 border rounded px-2 flex items-center">{fmt2(baseEURForForm)} €</div>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Категория</div>
                <Input value={txForm.category}
                       onChange={(e) => setTxForm(f => ({ ...f, category: e.target.value }))}/>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Заголовок</div>
                <Input value={txForm.title}
                       onChange={(e) => setTxForm(f => ({ ...f, title: e.target.value }))}/>
              </div>

              <div className="col-span-2">
                <div className="text-xs text-gray-600 mb-1">Комментарий</div>
                <Input value={txForm.note}
                       onChange={(e) => setTxForm(f => ({ ...f, note: e.target.value }))}/>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setTxModalOpen(false)} className="h-8 px-3 text-xs">Отмена</Button>
              <Button onClick={saveTx} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">Сохранить</Button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}