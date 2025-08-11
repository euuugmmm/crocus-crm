"use client";

import Head from "next/head";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loadOwners, splitAmount } from "@/lib/finance/owners";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import dynamic from "next/dynamic";
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
  bookingType?: string; // "olimpya_base" | "subagent" | ...
  bookingNumber?: string;
  createdAt?: any;

  agentName?: string;
  operator?: string;
  hotel?: string;
  payerName?: string;
  checkIn?: any;
  checkOut?: any;

  bruttoClient?: number;   // €
  internalNet?: number;    // €
  nettoOlimpya?: number;   // €
  realCommission?: number; // если задана — берём её
  commission?: number;     // расчётная (запасной вариант)
  overCommission?: number;

  commissionIgor?: number;
  commissionEvgeniy?: number;

  owners?: Array<{ ownerId?: string; name?: string; share?: number }>;
  backofficeEntered?: boolean;
};

type TxDoc = {
  id: string;
  bookingId?: string;
  type?: "in" | "out" | "transfer";
  side?: "income" | "expense"; // на всякий случай совместимость
  status?: "planned" | "actual" | "reconciled";
  date?: string; // YYYY-MM-DD
  accountId?: string;
  currency?: Currency;
  amount?: number; // в валюте счёта
  baseAmount?: number; // в EUR
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
  try {
    return new Date(v).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
};

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "ru", ["common"])),
    },
  };
}

export default function BookingFinanceEdit() {
  const router = useRouter();
  const { id } = router.query;
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [form, setForm] = useState<Partial<Booking>>({});
  const [txs, setTxs] = useState<TxDoc[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fx, setFx] = useState<FxDoc | null>(null);
  const [owners, setOwners] = useState<{ id: string; name: string; share: number }[]>([]);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txForm, setTxForm] = useState<{
    id?: string;
    type: "in" | "out";
    status: "planned" | "actual";
    date: string;
    accountId: string;
    amount: number;
    title: string;
    category: string;
    note: string;
  }>({
    type: "in",
    status: "planned",
    date: new Date().toISOString().slice(0, 10),
    accountId: "",
    amount: 0,
    title: "",
    category: "",
    note: "",
  });

  useEffect(() => {
    if (!router.isReady) return;
    if (!user || !canView) {
      router.replace("/login");
      return;
    }
    if (!id || typeof id !== "string") return;

    const unsubB = onSnapshot(doc(db, "bookings", id), (snap) => {
      const v = snap.data() as any;
      const b: Booking = v ? { id: snap.id, ...v } : null;
      setBooking(b);
      setForm({
        payerName: b?.payerName ?? "",
        bruttoClient: n(b?.bruttoClient),
        internalNet: n(b?.internalNet),
        nettoOlimpya: n(b?.nettoOlimpya),
        realCommission: n(b?.realCommission),
        overCommission: n(b?.overCommission),
        commissionIgor: n(b?.commissionIgor),
        commissionEvgeniy: n(b?.commissionEvgeniy),
        backofficeEntered: !!b?.backofficeEntered,
      });
    });

    const unsubT = onSnapshot(
      query(collection(db, "finance_transactions"), where("bookingId", "==", id)),
      (snap) => {
        setTxs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }
    );

    const unsubAcc = onSnapshot(query(collection(db, "finance_accounts")), (snap) => {
      setAccounts(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((a) => !a.archived)
      );
    });

    const unsubFx = onSnapshot(query(collection(db, "finance_fxRates")), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FxDoc[];
      const last = [...list].sort((a, b) => (a.id < b.id ? 1 : -1))[0];
      setFx(last || { id: "—", base: "EUR", rates: { RON: 4.97, USD: 1.08 } });
    });

    loadOwners().then(setOwners).catch(console.error);

    return () => {
      unsubB();
      unsubT();
      unsubAcc();
      unsubFx();
    };
  }, [router.isReady, id, user, canView, router]);

  // FX helpers
  const eurFrom = (amount: number, ccy: Currency): number => {
    if (!amount) return 0;
    if (ccy === "EUR") return amount;
    const r = fx?.rates?.[ccy];
    if (!r || r <= 0) return 0;
    return amount / r;
  };

  // вычисления по заявке
  const brutto = n(form.bruttoClient);
  const netCrocus = n(form.internalNet);
  const netOlimp = n(form.nettoOlimpya) || netCrocus;

  const baseCommission =
    n(form.realCommission) || n(booking?.commission) || (brutto - netCrocus);

  // для «субагентов» — прибыль Crocus = brutto - internalNet
  const crocusAmount =
    booking?.bookingType === "olimpya_base" ? baseCommission : (brutto - netCrocus);

  const over = n(form.overCommission) || (brutto - netOlimp);

  // авто-сплит по владельцам
  const autoSplit = useMemo(() => {
    const parts =
      booking?.bookingType === "olimpya_base"
        ? splitAmount(baseCommission, owners, booking?.owners)
        : splitAmount(brutto - netCrocus, owners);

    const byName: Record<string, number> = {};
    parts.forEach((p) => (byName[p.name] = n(byName[p.name]) + n(p.amount)));

    return {
      Igor: +n(byName["Igor"]).toFixed(2),
      Evgeniy: +n(byName["Evgeniy"]).toFixed(2),
    };
  }, [booking?.bookingType, baseCommission, brutto, netCrocus, owners, booking?.owners]);

  const fact = useMemo(() => {
    let inEUR = 0,
      outEUR = 0;
    txs.forEach((t) => {
      if (t.status !== "actual" && t.status !== "reconciled") return;
      if (t.type === "in") inEUR += n(t.baseAmount);
      if (t.type === "out") outEUR += n(t.baseAmount);
    });
    return { inEUR: +inEUR.toFixed(2), outEUR: +outEUR.toFixed(2) };
  }, [txs]);

  // подсветка (как в отчёте)
  const payClass = (paid: number, target: number) => {
    if (target <= 0) return "";
    if (paid <= 0.01) return "bg-rose-50 text-rose-800";
    if (paid + 0.01 >= target) return "bg-emerald-50 text-emerald-800";
    return "bg-amber-50 text-amber-800";
  };

  // save booking finance
  const saveBooking = async () => {
    if (!booking?.id) return;
    await updateDoc(doc(db, "bookings", booking.id), {
      payerName: (form.payerName || "").trim(),
      bruttoClient: n(form.bruttoClient),
      internalNet: n(form.internalNet),
      nettoOlimpya: n(form.nettoOlimpya),
      realCommission: n(form.realCommission),
      overCommission: n(form.overCommission),
      commissionIgor: n(form.commissionIgor),
      commissionEvgeniy: n(form.commissionEvgeniy),
      backofficeEntered: !!form.backofficeEntered,
      updatedAt: Timestamp.now(),
    });
    alert("Сохранено.");
  };

  // open tx modal (new)
  const openTxModal = (preset?: Partial<typeof txForm>) => {
    setTxForm((f) => ({
      ...f,
      id: undefined,
      type: (preset?.type as any) || "in",
      status: (preset?.status as any) || "planned",
      date: preset?.date || new Date().toISOString().slice(0, 10),
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
    if (!acc) {
      alert("Выберите счёт");
      return;
    }
    const payload: any = {
      bookingId: booking.id,
      type: txForm.type,
      side: txForm.type === "in" ? "income" : "expense", // совместимость
      status: txForm.status,
      date: txForm.date,
      accountId: txForm.accountId,
      currency: acc.currency,
      amount: n(txForm.amount),
      baseAmount: +baseEURForForm.toFixed(2),
      title: txForm.title?.trim() || "",
      category: txForm.category?.trim() || "",
      note: txForm.note?.trim() || "",
      createdAt: Timestamp.now(),
    };

    await addDoc(collection(db, "finance_transactions"), payload);
    setTxModalOpen(false);
  };

  const removeTx = async (t: TxDoc) => {
    if (!confirm("Удалить транзакцию?")) return;
    await deleteDoc(doc(db, "finance_transactions", t.id));
  };

  const setTxStatus = async (t: TxDoc, status: "planned" | "actual" | "reconciled") => {
    await updateDoc(doc(db, "finance_transactions", t.id), { status });
  };

  // быстрые планы
  const quickPlanIncome = () => openTxModal({ type: "in", status: "planned", amount: brutto, title: "Оплата клиента (брутто)" });
  const quickPlanExpense = () => openTxModal({ type: "out", status: "planned", amount: netCrocus, title: "Оплата оператору (нетто Crocus)" });

  return (
    <ManagerLayout>
      <Head><title>Заявка: финансы</title></Head>

      <div className="max-w-6xl mx-auto py-6 space-y-6">
        {/* Header / Back */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Заявка</div>
            <h1 className="text-2xl font-bold">
              {booking?.bookingNumber || "—"} · {booking?.bookingType === "olimpya_base" ? "Olimpya" : "Субагент"}
            </h1>
            <div className="text-sm text-gray-600">
              {booking?.operator || "—"} · {booking?.hotel || "—"} · {fmtDate(booking?.createdAt)}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/finance/bookings-finance")}>← Назад к списку</Button>
            <Button onClick={saveBooking} className="bg-blue-600 hover:bg-blue-700 text-white">Сохранить</Button>
          </div>
        </div>

        {/* Summary */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className={`rounded border p-3 ${payClass(fact.inEUR, brutto)}`}>
                <div className="text-gray-500">Брутто (€)</div>
                <div className="text-lg font-semibold">{fmt2(brutto)}</div>
                <div className="text-[11px]">факт IN: {fmt2(fact.inEUR)}</div>
              </div>
              <div className={`rounded border p-3 ${payClass(fact.outEUR, netCrocus)}`}>
                <div className="text-gray-500">Netto Crocus (€)</div>
                <div className="text-lg font-semibold">{fmt2(netCrocus)}</div>
                <div className="text-[11px]">факт OUT: {fmt2(fact.outEUR)}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-gray-500">Комиссия/Профит Crocus (€)</div>
                <div className="text-lg font-semibold">{fmt2(crocusAmount)}</div>
                <div className="text-[11px]">Over: {fmt2(over)}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-gray-500">Период</div>
                <div className="text-lg font-semibold">{fmtDate(booking?.checkIn)} → {fmtDate(booking?.checkOut)}</div>
                <div className="text-[11px]">Плательщик: {form.payerName || booking?.payerName || "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Booking finance form */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-600 mb-1">Плательщик</div>
                <Input value={form.payerName ?? ""} onChange={(e) => setForm((f) => ({ ...f, payerName: e.target.value }))} />
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Брутто (€)</div>
                <Input type="number" step="0.01" value={form.bruttoClient ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, bruttoClient: n(e.target.value) }))} />
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Netto Crocus (€)</div>
                <Input type="number" step="0.01" value={form.internalNet ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, internalNet: n(e.target.value) }))} />
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Netto Olimpya (€)</div>
                <Input type="number" step="0.01" value={form.nettoOlimpya ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, nettoOlimpya: n(e.target.value) }))} />
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Факт. комиссия (если известна) (€)</div>
                <Input type="number" step="0.01" value={form.realCommission ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, realCommission: n(e.target.value) }))} />
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Овер (€)</div>
                <Input type="number" step="0.01" value={form.overCommission ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, overCommission: n(e.target.value) }))} />
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Igor (€)</div>
                <Input type="number" step="0.01" value={form.commissionIgor ?? autoSplit.Igor}
                  onChange={(e) => setForm((f) => ({ ...f, commissionIgor: n(e.target.value) }))} />
                <div className="text-[11px] text-gray-500 mt-1">Авто: {fmt2(autoSplit.Igor)}</div>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Evgeniy (€)</div>
                <Input type="number" step="0.01" value={form.commissionEvgeniy ?? autoSplit.Evgeniy}
                  onChange={(e) => setForm((f) => ({ ...f, commissionEvgeniy: n(e.target.value) }))} />
                <div className="text-[11px] text-gray-500 mt-1">Авто: {fmt2(autoSplit.Evgeniy)}</div>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Бэкофис</div>
                <button
                  className={`h-9 px-3 rounded border ${form.backofficeEntered ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"}`}
                  onClick={() => setForm((f) => ({ ...f, backofficeEntered: !f.backofficeEntered }))}
                >
                  {form.backofficeEntered ? "Да" : "Нет"}
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button onClick={saveBooking} className="bg-blue-600 hover:bg-blue-700 text-white">Сохранить</Button>
              <Button variant="outline" onClick={quickPlanIncome}>+ План IN = Брутто</Button>
              <Button variant="outline" onClick={quickPlanExpense}>+ План OUT = Netto Crocus</Button>
            </div>
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Транзакции по заявке</h2>
              <Button onClick={() => openTxModal()} className="bg-green-600 hover:bg-green-700 text-white">+ Новая транзакция</Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border text-sm">
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="border px-2 py-1">Дата</th>
                    <th className="border px-2 py-1">Тип</th>
                    <th className="border px-2 py-1">Статус</th>
                    <th className="border px-2 py-1">Счёт</th>
                    <th className="border px-2 py-1">Сумма</th>
                    <th className="border px-2 py-1">EUR</th>
                    <th className="border px-2 py-1">Категория</th>
                    <th className="border px-2 py-1">Заметка</th>
                    <th className="border px-2 py-1">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {txs
                    .sort((a, b) => (String(a.date || "").localeCompare(String(b.date || ""))))
                    .map((t) => {
                      const acc = accounts.find((a) => a.id === t.accountId);
                      const accName = acc ? `${acc.name} (${acc.currency})` : "—";
                      return (
                        <tr key={t.id} className="text-center hover:bg-gray-50">
                          <td className="border px-2 py-1 whitespace-nowrap">{t.date || "—"}</td>
                          <td className="border px-2 py-1">{t.type === "in" ? "IN" : t.type === "out" ? "OUT" : "↔︎"}</td>
                          <td className="border px-2 py-1">{t.status || "—"}</td>
                          <td className="border px-2 py-1">{accName}</td>
                          <td className="border px-2 py-1 text-right">{fmt2(t.amount)} {t.currency || ""}</td>
                          <td className="border px-2 py-1 text-right">{fmt2(t.baseAmount)} €</td>
                          <td className="border px-2 py-1">{t.category || "—"}</td>
                          <td className="border px-2 py-1 text-left">{t.note || "—"}</td>
                          <td className="border px-2 py-1">
                            <div className="flex items-center justify-center gap-2">
                              {t.status !== "actual" && (
                                <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={() => setTxStatus(t, "actual")}>
                                  Сделать фактом
                                </button>
                              )}
                              {t.status !== "reconciled" && (
                                <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={() => setTxStatus(t, "reconciled")}>
                                  Сверить
                                </button>
                              )}
                              <button className="h-7 px-2 border rounded hover:bg-red-50" onClick={() => removeTx(t)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  {txs.length === 0 && (
                    <tr><td colSpan={9} className="border px-2 py-3 text-center text-gray-500">Нет транзакций</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal: New transaction */}
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
                <select
                  className="w-full border rounded px-2 py-1 h-9"
                  value={txForm.type}
                  onChange={(e) => setTxForm((f) => ({ ...f, type: e.target.value as "in" | "out" }))}
                >
                  <option value="in">IN (поступление)</option>
                  <option value="out">OUT (выплата)</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Статус</div>
                <select
                  className="w-full border rounded px-2 py-1 h-9"
                  value={txForm.status}
                  onChange={(e) => setTxForm((f) => ({ ...f, status: e.target.value as "planned" | "actual" }))}
                >
                  <option value="planned">План</option>
                  <option value="actual">Факт</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Дата</div>
                <Input type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Счёт</div>
                <select
                  className="w-full border rounded px-2 py-1 h-9"
                  value={txForm.accountId}
                  onChange={(e) => setTxForm((f) => ({ ...f, accountId: e.target.value }))}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Сумма (в валюте счёта)</div>
                <Input type="number" step="0.01" value={txForm.amount}
                  onChange={(e) => setTxForm((f) => ({ ...f, amount: n(e.target.value) }))} />
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">EUR (расчётно)</div>
                <div className="h-9 border rounded px-2 flex items-center">{fmt2(baseEURForForm)} €</div>
              </div>

              <div className="col-span-1">
                <div className="text-xs text-gray-600 mb-1">Категория</div>
                <Input value={txForm.category} onChange={(e) => setTxForm((f) => ({ ...f, category: e.target.value }))} placeholder="например, Турпродажа / Оплата оператору"/>
              </div>
              <div className="col-span-1">
                <div className="text-xs text-gray-600 mb-1">Заголовок</div>
                <Input value={txForm.title} onChange={(e) => setTxForm((f) => ({ ...f, title: e.target.value }))} placeholder="короткое описание"/>
              </div>

              <div className="col-span-2">
                <div className="text-xs text-gray-600 mb-1">Комментарий</div>
                <Input value={txForm.note} onChange={(e) => setTxForm((f) => ({ ...f, note: e.target.value }))} placeholder="доп. сведения"/>
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