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
  agentAgency?: string;                // ← добавил (для инфоблока)
  operator?: string;
  region?: string;                     // ← добавил (для инфоблока)
  departureCity?: string;              // ← добавил
  arrivalCity?: string;                // ← добавил
  flightNumber?: string;               // ← добавил
  flightTime?: string;                 // ← добавил
  hotel?: string;
  room?: string;                       // ← добавил
  mealPlan?: string;                   // ← добавил
  payerName?: string;
  checkIn?: any; checkOut?: any;

  bruttoClient?: number;               // €
  internalNet?: number;                // €
  nettoOlimpya?: number;               // €
  realCommission?: number;
  commission?: number;
  overCommission?: number;
  supplierBookingNumber?: string;      // ← добавил (для инфоблока)

  commissionIgor?: number;
  commissionEvgeniy?: number;

  owners?: Array<{ ownerId?: string; name?: string; share?: number }>;
  tourists?: Array<{ name?: string; dob?: string; nationality?: string; passportNumber?: string; passportValidUntil?: string }>;

  backofficePosted?: boolean;
  backofficeEntered?: boolean;
};

type TxDoc = {
  id?: string;
  bookingId?: string;
  type: "in" | "out";
  status: "planned" | "actual" | "reconciled";
  dueDate?: string;        // YYYY-MM-DD
  actualDate?: string;     // YYYY-MM-DD
  date?: string;           // дублируем
  accountId?: string;
  currency?: Currency;
  amount?: number;         // валюта счёта
  baseAmount?: number;     // EUR
  title?: string;
  category?: string;
  note?: string;
  createdAt?: any;
};

/** ===== ORDERS ===== */
type OrderAllocation = { bookingId: string; amountBase: number };
type OrderDoc = {
  id: string;
  date: string; // YYYY-MM-DD
  side: "income" | "expense";
  status: "planned" | "actual" | "reconciled";
  accountId: string;
  accountName?: string;
  currency: Currency;
  amount: number;     // валюта счёта (абс.)
  baseAmount: number; // EUR (абс.)
  categoryId?: string | null;
  categoryName?: string | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  method?: "bank" | "card" | "cash" | "iban" | "other";
  note?: string;
  bookingAllocations?: OrderAllocation[];
  bookingIds?: string[];
  /** legacy: */
  bookingId?: string;
  createdAt?: any;
  updatedAt?: any;
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
  const bookingId = typeof id === "string" ? id : "";
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [txs, setTxs] = useState<TxDoc[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fx, setFx] = useState<FxDoc | null>(null);
  const [owners, setOwners] = useState<{ id: string; name: string; share: number }[]>([]);

  // ORDERS: новые + legacy
  const [ordersAC, setOrdersAC] = useState<OrderDoc[]>([]);
  const [ordersLegacy, setOrdersLegacy] = useState<OrderDoc[]>([]);

  // UI
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txForm, setTxForm] = useState<{
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
    date: localISO(new Date()),
    accountId: "",
    amount: 0,
    title: "",
    category: "",
    note: "",
  });
  const [editing, setEditing] = useState<{ id?: string; field?: "baseAmount" | "amount"; value?: number }>({});

  useEffect(() => {
    if (!router.isReady) return;
    if (!user || !canView) { router.replace("/login"); return; }
    if (!bookingId) return;

    const unsubB = onSnapshot(doc(db, "bookings", bookingId), (snap) => {
      if (!snap.exists()) return;
      const v = snap.data() as any;
      setBooking({ id: snap.id, ...v });
    });

    const unsubT = onSnapshot(query(collection(db, "finance_transactions"), where("bookingId", "==", bookingId)), (snap) => {
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

    // ORDERS (новые: bookingIds contains)
    const unsubOrdersAC = onSnapshot(
      query(collection(db, "finance_orders"), where("bookingIds", "array-contains", bookingId)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as OrderDoc[];
        setOrdersAC(list);
      },
      (err) => console.error("[orders AC] onSnapshot error:", err)
    );

    // ORDERS (legacy: bookingId == id)
    const unsubOrdersLegacy = onSnapshot(
      query(collection(db, "finance_orders"), where("bookingId", "==", bookingId)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as OrderDoc[];
        setOrdersLegacy(list);
      },
      (err) => console.error("[orders legacy] onSnapshot error:", err)
    );

    return () => { unsubB(); unsubT(); unsubAcc(); unsubFx(); unsubOrdersAC(); unsubOrdersLegacy(); };
  }, [router.isReady, bookingId, user, canView, router]);

  // FX helpers
  const eurFrom = (amount: number, ccy: Currency): number => {
    if (!amount) return 0;
    if (ccy === "EUR") return amount;
    const r = fx?.rates?.[ccy];
    if (!r || r <= 0) return 0;
    return amount / r;
  };
  const ccyFromEur = (eur: number, ccy: Currency): number => {
    if (!eur) return 0;
    if (ccy === "EUR") return eur;
    const r = fx?.rates?.[ccy];
    if (!r || r <= 0) return 0;
    return eur * r;
  };

  // суммы из заявки
  const brutto = n(booking?.bruttoClient);
  const netCrocus = n(booking?.internalNet);
  const netOlimp = n(booking?.nettoOlimpya) || netCrocus;

  const baseCommission =
    n(booking?.realCommission) || n(booking?.commission) || (brutto - netCrocus);

  const crocusAmount =
    booking?.bookingType === "olimpya_base" ? baseCommission : (brutto - netCrocus);

  const over = n(booking?.overCommission) || (brutto - netOlimp);

  // сплит
  const [ownersList, setOwnersList] = useState<{ id: string; name: string; share: number }[]>([]);
  useEffect(() => { setOwnersList(owners); }, [owners]);

  const splitView = useMemo(() => {
    const preset: Record<string, number> = {};
    if (n(booking?.commissionIgor)) preset["Igor"] = n(booking?.commissionIgor);
    if (n(booking?.commissionEvgeniy)) preset["Evgeniy"] = n(booking?.commissionEvgeniy);

    if (booking?.bookingType === "olimpya_base") {
      if (preset.Igor || preset.Evgeniy) {
        return { Igor: +n(preset.Igor).toFixed(2), Evgeniy: +n(preset.Evgeniy).toFixed(2) };
      }
      const parts = splitAmount(baseCommission, ownersList, booking?.owners);
      const m: Record<string, number> = {};
      parts.forEach(p => m[p.name] = n(m[p.name]) + n(p.amount));
      return { Igor: +n(m["Igor"]).toFixed(2), Evgeniy: +n(m["Evgeniy"]).toFixed(2) };
    } else {
      const parts = splitAmount(brutto - netCrocus, ownersList);
      const m: Record<string, number> = {};
      parts.forEach(p => m[p.name] = n(m[p.name]) + n(p.amount));
      return { Igor: +n(m["Igor"]).toFixed(2), Evgeniy: +n(m["Evgeniy"]).toFixed(2) };
    }
  }, [booking, ownersList, baseCommission, brutto, netCrocus]);

  /** ===== ORDERS: merge + helpers ===== */
  const orders: OrderDoc[] = useMemo(() => {
    const m = new Map<string, OrderDoc>();
    [...ordersAC, ...ordersLegacy].forEach(o => m.set(o.id, o));
    const list = Array.from(m.values());
    list.sort((a, b) => (a.date < b.date ? 1 : -1));
    return list;
  }, [ordersAC, ordersLegacy]);

  const allocationsForThis = (o: OrderDoc) => {
    const baseList =
      (Array.isArray(o.bookingAllocations) && o.bookingAllocations.length > 0)
        ? o.bookingAllocations
        : (o.bookingId ? [{ bookingId: o.bookingId, amountBase: o.baseAmount }] : []);
    return baseList.map((a, i) => ({ ...a, _idx: i })).filter(a => a.bookingId === bookingId);
  };
  const accById = useMemo(() => {
    const m = new Map<string, Account>();
    accounts.forEach(a => m.set(a.id, a));
    return m;
  }, [accounts]);

  /** ФАКТ по ордерам */
  const factByOrders = useMemo(() => {
    let inEUR = 0, outEUR = 0;
    for (const o of orders) {
      const allocs = allocationsForThis(o);
      if (allocs.length === 0) continue;
      const sumForThis = allocs.reduce((s, a) => s + n(a.amountBase), 0);
      if (o.side === "income") inEUR += sumForThis;
      else outEUR += sumForThis;
    }
    return { inEUR: +inEUR.toFixed(2), outEUR: +outEUR.toFixed(2) };
  }, [orders, bookingId]);

  // подсветка карточек
  const payClass = (paid: number, target: number) => {
    if (target <= 0) return "";
    if (paid <= 0.01) return "bg-rose-50 text-rose-800";
    if (paid + 0.01 >= target) return "bg-emerald-50 text-emerald-800";
    return "bg-amber-50 text-amber-800";
  };
  const bruttoCls = payClass(factByOrders.inEUR, brutto);
  const netCls = payClass(factByOrders.outEUR, netCrocus);

  // транзакции (для списка)
  const planned = txs.filter(t => t.status === "planned");
  const facts = txs.filter(t => t.status === "actual" || t.status === "reconciled");

  // форма новой транзакции
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
  const localDate = txForm.date;

  const payload = {
    bookingId: booking.id,
    type: txForm.type,
    status: txForm.status,
    date: localDate,
    ...(txForm.status === "planned" ? { dueDate: localDate } : {}),
    ...(txForm.status === "actual"  ? { actualDate: localDate } : {}),
    accountId: txForm.accountId,
    currency: acc.currency,
    amount: n(txForm.amount),
    baseAmount: +baseEURForForm.toFixed(2),
    title: txForm.title?.trim() || "",
    category: txForm.category?.trim() || "",
    note: txForm.note?.trim() || "",
    createdAt: Timestamp.now(),
  };

  await addDoc(collection(db, "finance_transactions"), payload as any);
  setTxModalOpen(false);
};

  // редактирование плана (сумма/дата)
  const updatePlanDueDate = async (t: TxDoc, value: string) => {
    if (!t.id) return;
    await updateDoc(doc(db, "finance_transactions", t.id), { dueDate: value, date: value });
  };
  const commitEdit = async () => {
    if (!editing.id || editing.value === undefined) { setEditing({}); return; }
    const t = txs.find(x => x.id === editing.id);
    if (!t || t.status !== "planned") { setEditing({}); return; }
    try {
      if (editing.field === "baseAmount") {
        const newBase = +n(editing.value).toFixed(2);
        const newAmt = +ccyFromEur(newBase, (t.currency as Currency) || "EUR").toFixed(2);
        await updateDoc(doc(db, "finance_transactions", editing.id), { baseAmount: newBase, amount: newAmt });
      } else {
        const newAmt = +n(editing.value).toFixed(2);
        const newBase = +eurFrom(newAmt, (t.currency as Currency) || "EUR").toFixed(2);
        await updateDoc(doc(db, "finance_transactions", editing.id), { amount: newAmt, baseAmount: newBase });
      }
    } finally { setEditing({}); }
  };

  // статусы транзакций
  const markAsActual = async (t: TxDoc) => {
    if (!t.id) return;
    const today = localISO(new Date());
    await updateDoc(doc(db, "finance_transactions", t.id), { status: "actual", actualDate: today, date: today });
  };
  const reconcileTx = async (t: TxDoc) => {
    if (!t.id) return;
    await updateDoc(doc(db, "finance_transactions", t.id), { status: "reconciled" });
  };
  const removeTx = async (t: TxDoc) => {
    if (!t.id) return;
    if (!confirm("Удалить транзакцию?")) return;
    await deleteDoc(doc(db, "finance_transactions", t.id));
  };

  // бэкофис
  const backoffice = !!(booking?.backofficePosted ?? booking?.backofficeEntered);
  const toggleBackoffice = async () => {
    if (!booking?.id) return;
    const v = !backoffice;
    await updateDoc(doc(db, "bookings", booking.id), {
      backofficePosted: v,
      backofficeEntered: v,
      updatedAt: Timestamp.now(),
    });
  };

  // ==== ORDERS: инлайн-правки аллокаций по текущей заявке ====
  const [orderEdit, setOrderEdit] = useState<{ orderId?: string; allocIdx?: number; value?: number }>({});
  const [orderMove, setOrderMove] = useState<{ orderId?: string; allocIdx?: number; targetBookingId?: string }>({});

  const updateOrderAllocations = async (order: OrderDoc, nextAllocs: OrderAllocation[]) => {
    const nextIds = Array.from(new Set(nextAllocs.map(a => a.bookingId))).filter(Boolean);
    await updateDoc(doc(db, "finance_orders", order.id), {
      bookingAllocations: nextAllocs,
      bookingIds: nextIds,
      updatedAt: Timestamp.now(),
    } as any);
  };

  const startEditAlloc = (orderId: string, allocIdx: number, current: number) => {
    setOrderEdit({ orderId, allocIdx, value: current });
  };
  const cancelEditAlloc = () => setOrderEdit({});
  const saveEditAlloc = async (order: OrderDoc) => {
    if (!orderEdit.orderId || orderEdit.allocIdx === undefined) return;
    const baseList =
      (Array.isArray(order.bookingAllocations) && order.bookingAllocations.length > 0)
        ? [...order.bookingAllocations]
        : (order.bookingId ? [{ bookingId: order.bookingId, amountBase: order.baseAmount }] : []);
    const idx = orderEdit.allocIdx!;
    baseList[idx] = { ...baseList[idx], amountBase: +n(orderEdit.value).toFixed(2) };
    await updateOrderAllocations(order, baseList);
    cancelEditAlloc();
  };
  const removeAlloc = async (order: OrderDoc, allocIdx: number) => {
    if (!confirm("Удалить эту аллокацию ордера для заявки?")) return;
    const baseList =
      (Array.isArray(order.bookingAllocations) && order.bookingAllocations.length > 0)
        ? [...order.bookingAllocations]
        : (order.bookingId ? [{ bookingId: order.bookingId, amountBase: order.baseAmount }] : []);
    baseList.splice(allocIdx, 1);
    await updateOrderAllocations(order, baseList);
  };
  const startMoveAlloc = (orderId: string, allocIdx: number) => {
    setOrderMove({ orderId, allocIdx, targetBookingId: "" });
  };
  const cancelMoveAlloc = () => setOrderMove({});
  const doMoveAlloc = async (order: OrderDoc) => {
    if (!orderMove.orderId || orderMove.allocIdx === undefined) return;
    const target = (orderMove.targetBookingId || "").trim();
    if (!target) { alert("Укажите ID заявки, на которую перенести."); return; }
    const baseList =
      (Array.isArray(order.bookingAllocations) && order.bookingAllocations.length > 0)
        ? [...order.bookingAllocations]
        : (order.bookingId ? [{ bookingId: order.bookingId, amountBase: order.baseAmount }] : []);
    baseList[orderMove.allocIdx!] = { ...baseList[orderMove.allocIdx!], bookingId: target };
    await updateOrderAllocations(order, baseList);
    cancelMoveAlloc();
  };
  const removeOrder = async (order: OrderDoc) => {
    if (!confirm("Удалить ордер целиком?")) return;
    await deleteDoc(doc(db, "finance_orders", order.id));
  };

  // UI helpers
  const factHasIncome = factByOrders.inEUR > 0.01;
  const factHasExpense = factByOrders.outEUR > 0.01;

  // ===== вычисление пути на страницу редактирования =====
  const editHref = useMemo(() => {
    if (!bookingId) return "";
    // olympya vs subagent/manager
    return (booking?.bookingType === "olimpya_base")
      ? `/olimpya/${bookingId}`
      : `/manager/${bookingId}`;
  }, [booking?.bookingType, bookingId]);

  return (
    <ManagerLayout>
      <Head><title>Заявка: финансы</title></Head>

      <div className="max-w-6xl mx-auto py-6 space-y-6">

        {/* Шапка-инфо */}
        <div className="rounded-xl border p-4 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Заявка</div>
              <div className="text-[17px] sm:text-lg font-semibold">
                {(booking?.bookingNumber || "—")} • {booking?.hotel || "—"} • {fmtDate(booking?.checkIn)} → {fmtDate(booking?.checkOut)}
              </div>
              <div className="text-sm text-gray-700 mt-1">
                {(booking?.operator || "—")} • {(booking?.agentName ? `${booking.agentName} (Агентство)` : "—")} • Плательщик: {booking?.payerName || "—"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <label className="inline-flex items-center gap-2 text-sm border rounded px-3 py-1 bg-gray-50">
                <input type="checkbox" checked={backoffice} onChange={toggleBackoffice} />
                Заведено в бэкофис
              </label>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.push("/finance/bookings-finance")} className="h-8 px-3 text-sm">
                  ← К списку
                </Button>
                <Button
                  onClick={() => { if (editHref) router.push(editHref); }}
                  className="h-8 px-3 text-sm"
                >
                  Редактировать заявку
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Инфоблок (read-only) из формы Олимпии ===== */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-lg font-semibold">Информация о заявке</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <p><strong>Агент:</strong> {booking?.agentName || "—"}</p>
              <p><strong>Агентство:</strong> {booking?.agentAgency || "—"}</p>
              <p><strong>Номер заявки (внутр.):</strong> {booking?.bookingNumber || "—"}</p>
              <p><strong>Номер у оператора:</strong> {booking?.supplierBookingNumber || "—"}</p>
              <p><strong>Оператор:</strong> {booking?.operator || "—"}</p>
              <p><strong>Направление:</strong> {booking?.region || "—"}</p>
              <p><strong>Город вылета:</strong> {booking?.departureCity || "—"}</p>
              <p><strong>Город прилёта:</strong> {booking?.arrivalCity || "—"}</p>
              <p><strong>Отель:</strong> {booking?.hotel || "—"}</p>
              <p><strong>Период:</strong> {fmtDate(booking?.checkIn)} → {fmtDate(booking?.checkOut)}</p>
              <p><strong>Комната:</strong> {booking?.room || "—"}</p>
              <p><strong>Питание:</strong> {booking?.mealPlan || "—"}</p>
              <p><strong>Brutto клиента:</strong> {fmt2(booking?.bruttoClient)} €</p>
              <p><strong>Netto Олимпия:</strong> {fmt2(booking?.nettoOlimpya)} €</p>
              <p><strong>Netto Fact:</strong> {fmt2(booking?.internalNet)} €</p>
              <p><strong>Плательщик:</strong> {booking?.payerName || "—"}</p>

              <div className="col-span-full">
                <strong>Туристы:</strong>
                <div className="mt-1 text-sm">
                  {Array.isArray(booking?.tourists) && booking?.tourists?.length
                    ? booking!.tourists!.map((t, i) => (
                        <div key={i} className="text-gray-800">
                          {t?.name || "—"}
                        </div>
                      ))
                    : <div className="text-gray-500">—</div>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Сводка: факт теперь из ОРДЕРОВ */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className={`p-3 rounded border ${bruttoCls}`}>
                <div className="text-gray-500">Брутто (€)</div>
                <div className="text-lg font-semibold">{fmt2(brutto)}</div>
                <div className="text-[11px]">факт IN (ордера): {fmt2(factByOrders.inEUR)}</div>
              </div>
              <div className={`p-3 rounded border ${netCls}`}>
                <div className="text-gray-500">Netto Crocus (€)</div>
                <div className="text-lg font-semibold">{fmt2(netCrocus)}</div>
                <div className="text-[11px]">факт OUT (ордера): {fmt2(factByOrders.outEUR)}</div>
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

        {/* Движение денег — план/факт */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Движение денег</h2>
              <div className="flex gap-2">
                <Button onClick={async () => {
                  if (!booking?.id) return;
                  const due =
                    booking?.checkIn
                      ? (String(booking.checkIn).match(/^\d{4}-\d{2}-\d{2}$/)
                        ? String(booking.checkIn)
                        : localISO(new Date(booking.createdAt?.toDate?.() ?? booking.checkIn)))
                      : booking?.createdAt?.toDate
                        ? localISO(booking.createdAt.toDate())
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
                      baseAmount: brutto,
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
                }}>
                  Создать план по умолчанию
                </Button>
                <Button variant="outline" onClick={async () => {
                  if (!booking?.id) return;
                  const base = crocusAmount;
                  const parts = splitAmount(base, ownersList, booking?.owners)
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
                }}>
                  Планы выплат учредителям
                </Button>
                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => openTxModal()}>
                  + Новая транзакция
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border text-sm">
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="border px-2 py-1">Тип</th>
                    <th className="border px-2 py-1">Статус</th>
                    <th className="border px-2 py-1 w-[110px]">EUR</th>
                    <th className="border px-2 py-1">Срок/Дата</th>
                    <th className="border px-2 py-1">Счёт / сумма</th>
                    <th className="border px-2 py-1">Описание</th>
                    <th className="border px-2 py-1 w-[260px]">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {[...planned, ...facts].map((t) => {
                    const acc = accounts.find((a) => a.id === t.accountId);
                    const accLabel = acc ? `${acc.name} (${acc.currency})` : "—";
                    const canEdit = t.status === "planned";
                    const isEditingEUR = canEdit && editing.id === t.id && editing.field === "baseAmount";
                    const isEditingAmt = canEdit && editing.id === t.id && editing.field === "amount";

                    // индикатор: есть ли ордер по стороне
                    const sideFact = t.type === "in" ? factByOrders.inEUR : factByOrders.outEUR;
                    const hasOrderForSide = sideFact > 0.01;

                    return (
                      <tr key={t.id} className="text-center border-t">
                        <td className="border px-2 py-1">
                          {t.type === "in" ? "Поступление" : "Оплата"}
                        </td>
                        <td className="border px-2 py-1">
                          {t.status === "planned" ? (
                            <span className="inline-flex items-center gap-2">
                              План
                              <span
                                className={`text-[11px] px-1.5 py-0.5 rounded ${
                                  hasOrderForSide
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                                title={hasOrderForSide ? "По этой стороне есть ордер (факт)" : "Ордеров по этой стороне пока нет"}
                              >
                                {hasOrderForSide ? "Есть ордер" : "Без ордера"}
                              </span>
                            </span>
                          ) : t.status === "actual" ? "Факт" : "Сверено"}
                        </td>

                        {/* EUR */}
                        <td
                          className="border px-2 py-1 text-right"
                          onDoubleClick={() => canEdit && setEditing({ id: t.id, field: "baseAmount", value: n(t.baseAmount) })}
                        >
                          {isEditingEUR ? (
                            <input
                              autoFocus
                              type="number"
                              step="0.01"
                              className="w-28 border rounded px-1 py-1 text-right"
                              value={editing.value ?? 0}
                              onChange={(e) => setEditing(prev => ({ ...prev, value: Number(e.target.value) }))}
                              onBlur={commitEdit}
                              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing({}); }}
                            />
                          ) : (
                            `${fmt2(t.baseAmount)} €`
                          )}
                        </td>

                        {/* Дата */}
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

                        {/* Счёт / сумма */}
                        <td
                          className="border px-2 py-1"
                          onDoubleClick={() => canEdit && setEditing({ id: t.id, field: "amount", value: n(t.amount) })}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>{accLabel}</span>
                            {t.amount ? (
                              isEditingAmt ? (
                                <input
                                  autoFocus
                                  type="number"
                                  step="0.01"
                                  className="w-28 border rounded px-1 py-1 text-right"
                                  value={editing.value ?? 0}
                                  onChange={(e) => setEditing(prev => ({ ...prev, value: Number(e.target.value) }))}
                                  onBlur={commitEdit}
                                  onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing({}); }}
                                />
                              ) : (
                                <span>• {fmt2(t.amount)} {t.currency}</span>
                              )
                            ) : null}
                          </div>
                        </td>

                        <td className="border px-2 py-1 text-left">{t.title || t.note || "—"}</td>
                        <td className="border px-2 py-1">
                          <div className="flex flex-wrap gap-2 justify-center">
                            {t.status === "planned" && <Button size="sm" onClick={() => markAsActual(t)}>Сделать фактом</Button>}
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

        {/* ====== ЖУРНАЛ ОРДЕРОВ (по текущей заявке) ====== */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Журнал ордеров (по заявке)</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border text-sm">
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="border px-2 py-1">Дата</th>
                    <th className="border px-2 py-1">Тип</th>
                    <th className="border px-2 py-1">EUR всего</th>
                    <th className="border px-2 py-1">Счёт</th>
                    <th className="border px-2 py-1">Категория</th>
                    <th className="border px-2 py-1">Контрагент</th>
                    <th className="border px-2 py-1 w-[320px]">Аллокации по заявке</th>
                    <th className="border px-2 py-1">Заметка</th>
                    <th className="border px-2 py-1 w-[240px]">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const allocs = allocationsForThis(o);
                    if (allocs.length === 0) return null;
                    return (
                      <tr key={o.id} className="text-center align-top border-t">
                        <td className="border px-2 py-1 whitespace-nowrap">{o.date || "—"}</td>
                        <td className="border px-2 py-1">
                          {o.side === "income"
                            ? <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                            : <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>}
                        </td>
                        <td className="border px-2 py-1 text-right whitespace-nowrap">{fmt2(o.baseAmount)} €</td>
                        <td className="border px-2 py-1">{accById.get(o.accountId)?.name || o.accountName || "—"}</td>
                        <td className="border px-2 py-1">{o.categoryName || "—"}</td>
                        <td className="border px-2 py-1">{o.counterpartyName || "—"}</td>

                        {/* Аллокации по текущей заявке */}
                        <td className="border px-2 py-1 text-left">
                          <OrderAllocationsList
                            order={o}
                            allocations={allocs}
                            onEditStart={startEditAlloc}
                            onEditCancel={cancelEditAlloc}
                            onEditSave={() => saveEditAlloc(o)}
                            onRemove={(idx) => removeAlloc(o, idx)}
                            onMoveStart={(idx) => startMoveAlloc(o.id, idx)}
                            onMoveCancel={cancelMoveAlloc}
                            onMove={() => doMoveAlloc(o)}
                            editing={orderEdit}
                            moving={orderMove}
                            setEditingValue={(v) => setOrderEdit(s => ({ ...s, value: v }))}
                            setMoveTarget={(v) => setOrderMove(s => ({ ...s, targetBookingId: v }))}
                          />
                        </td>

                        <td className="border px-2 py-1 text-left">{o.note || "—"}</td>
                        <td className="border px-2 py-1">
                          <div className="inline-flex gap-2">
                            <button className="h-7 px-2 border rounded hover:bg-red-50" onClick={() => removeOrder(o)}>Удалить ордер</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {orders.filter(o => allocationsForThis(o).length > 0).length === 0 && (
                    <tr><td colSpan={9} className="border px-2 py-4 text-center text-gray-500">Нет ордеров по этой заявке</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Модалка — новая транзакция по заявке */}
      {txModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-2xl bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Новая транзакция</h2>
              <button className="text-2xl leading-none" onClick={() => setTxModalOpen(false)}>×</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Тип">
                <select className="w-full border rounded px-2 py-1"
                  value={txForm.type}
                  onChange={(e) => setTxForm((s) => ({ ...s, type: e.target.value as "in" | "out" }))}>
                  <option value="in">Поступление</option>
                  <option value="out">Оплата</option>
                </select>
              </Field>
              <Field label="Статус">
                <select className="w-full border rounded px-2 py-1"
                  value={txForm.status}
                  onChange={(e) => setTxForm((s) => ({ ...s, status: e.target.value as "planned" | "actual" }))}>
                  <option value="planned">План</option>
                  <option value="actual">Факт</option>
                </select>
              </Field>

              <Field label="Дата">
                <input type="date" className="w-full border rounded px-2 py-1"
                  value={txForm.date}
                  onChange={(e) => setTxForm((s) => ({ ...s, date: e.target.value }))}/>
              </Field>
              <Field label="Счёт">
                <select className="w-full border rounded px-2 py-1"
                  value={txForm.accountId}
                  onChange={(e) => setTxForm((s) => ({ ...s, accountId: e.target.value }))}>
                  <option value="" disabled>— выберите счёт —</option>
                  {accounts.filter((a) => !a.archived).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </Field>

              <Field label="Сумма (в валюте счёта)">
                <input
                  type="number" step="0.01"
                  className="w-full border rounded px-2 py-1"
                  value={txForm.amount}
                  onChange={(e) => setTxForm((s) => ({ ...s, amount: Number(e.target.value || 0) }))}
                />
                <div className="text-[11px] text-gray-500 mt-1">
                  В EUR: {fmt2(baseEURForForm)}
                </div>
              </Field>
              <Field label="Заголовок/Категория">
                <div className="flex gap-2">
                  <Input
                    placeholder="заголовок (опционально)"
                    value={txForm.title}
                    onChange={(e) => setTxForm((s) => ({ ...s, title: e.target.value }))}
                  />
                  <Input
                    placeholder="категория (опц.)"
                    value={txForm.category}
                    onChange={(e) => setTxForm((s) => ({ ...s, category: e.target.value }))}
                  />
                </div>
              </Field>

              <Field label="Заметка" full>
                <Input
                  placeholder="комментарий"
                  value={txForm.note}
                  onChange={(e) => setTxForm((s) => ({ ...s, note: e.target.value }))}
                />
              </Field>
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

function Field({ label, children, full }: { label: string; children: any; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[11px] text-gray-600 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function OrderAllocationsList({
  order,
  allocations,
  onEditStart,
  onEditCancel,
  onEditSave,
  onRemove,
  onMoveStart,
  onMoveCancel,
  onMove,
  editing,
  moving,
  setEditingValue,
  setMoveTarget,
}: {
  order: any;
  allocations: Array<{ bookingId: string; amountBase: number; _idx: number }>;
  onEditStart: (orderId: string, idx: number, cur: number) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onRemove: (idx: number) => void;
  onMoveStart: (idx: number) => void;
  onMoveCancel: () => void;
  onMove: () => void;
  editing: { orderId?: string; allocIdx?: number; value?: number };
  moving: { orderId?: string; allocIdx?: number; targetBookingId?: string };
  setEditingValue: (v: number) => void;
  setMoveTarget: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {allocations.map(a => {
        const isEdit = editing.orderId === order.id && editing.allocIdx === a._idx;
        const isMove = moving.orderId === order.id && moving.allocIdx === a._idx;
        return (
          <div key={`${order.id}-${a._idx}`} className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">#{a._idx + 1}</span>
            <span className="text-xs text-gray-500">EUR:</span>
            {isEdit ? (
              <>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  className="w-28 border rounded px-2 py-1 text-right"
                  value={editing.value ?? a.amountBase}
                  onChange={(e) => setEditingValue(Number(e.target.value || 0))}
                  onKeyDown={(e) => { if (e.key === "Enter") onEditSave(); if (e.key === "Escape") onEditCancel(); }}
                  onBlur={onEditSave}
                />
                <Button variant="outline" size="sm" onClick={onEditSave}>✔︎</Button>
                <Button variant="outline" size="sm" onClick={onEditCancel}>✖︎</Button>
              </>
            ) : (
              <>
                <span className="font-medium">{fmt2(a.amountBase)} €</span>
                <Button variant="outline" size="sm" onClick={() => onEditStart(order.id, a._idx, a.amountBase)}>✏️</Button>
              </>
            )}

            {isMove ? (
              <>
                <input
                  className="w-48 border rounded px-2 py-1"
                  placeholder="ID новой заявки"
                  value={moving.targetBookingId || ""}
                  onChange={(e) => setMoveTarget(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onMove(); if (e.key === "Escape") onMoveCancel(); }}
                />
                <Button variant="outline" size="sm" onClick={onMove}>Перенести</Button>
                <Button variant="outline" size="sm" onClick={onMoveCancel}>Отмена</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => onMoveStart(a._idx)}>Перекинуть</Button>
            )}

            <Button variant="outline" size="sm" onClick={() => onRemove(a._idx)}>Удалить</Button>
          </div>
        );
      })}
    </div>
  );
}