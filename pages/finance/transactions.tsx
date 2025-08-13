/* pages/finance/transactions.tsx */
"use client";

import Head from "next/head";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

import TxModal from "@/components/finance/TxModal";
import { normalizeTx, removeTxWithOrders } from "@/lib/finance/tx";

import {
  Account,
  Category,
  Counterparty,
  FxDoc,
  TxRow,
  CategorySide,
  BookingOption,
  Allocation,
} from "@/types/finance";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

/** ===== Helpers for bookings formatting ===== */
type BookingFull = {
  id: string;
  bookingNumber?: string;
  operator?: string;
  operatorName?: string;
  tourOperator?: string;

  hotel?: string;
  tourName?: string;
  destination?: string;
  region?: string;
  arrivalCity?: string;

  checkIn?: any;
  checkInDate?: any;
  startDate?: any;
  dateFrom?: any;
  fromDate?: any;
  start?: any;
  departureDate?: any;

  checkOut?: any;
  checkOutDate?: any;
  endDate?: any;
  dateTo?: any;
  toDate?: any;
  end?: any;
  returnDate?: any;

  status?: string;
  agentName?: string;

  clientPrice?: number;     // «классика»
  bruttoClient?: number;    // Олимпия

  internalNet?: number;     // fact / net
  internalNetto?: number;
  nettoOlimpya?: number;
  nettoOperator?: number;

  tourists?: Array<{ name?: string }>;
  payerName?: string;

  createdAt?: any;
};

type OrderDoc = {
  id: string;
  txId: string;
  date: string; // YYYY-MM-DD
  side: CategorySide; // income | expense
  bookingId: string;
  baseAmount: number; // EUR
  status?: string;    // posted / ...
};

const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const moneyEUR = (n: number) => `${Math.abs(n).toFixed(2)} €`;

const first = <T,>(...vals: T[]) => vals.find(v => v !== undefined && v !== null && v !== "") as T | undefined;
const dmy = (v?: any) => {
  if (!v && v !== 0) return "—";
  const d = (v && typeof v.toDate === "function") ? v.toDate() : new Date(v);
  if (d instanceof Date && !isNaN(+d)) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  if (typeof v === "string") return v;
  return "—";
};
const pickOperator = (b: BookingFull) => first(b.operator, b.operatorName, b.tourOperator) || "—";
const pickPlace = (b: BookingFull) => first(b.hotel, b.tourName, b.destination, b.region, b.arrivalCity) || "—";
const pickCheckIn = (b: BookingFull) => first(
  b.checkIn, b.checkInDate, b.startDate, b.dateFrom, b.fromDate, b.start, b.departureDate
);
const pickCheckOut = (b: BookingFull) => first(
  b.checkOut, b.checkOutDate, b.endDate, b.dateTo, b.toDate, b.end, b.returnDate
);
const bookingBrutto = (b: BookingFull) => toNum(b.clientPrice ?? b.bruttoClient ?? 0);
const bookingInternal = (b: BookingFull) => toNum(b.internalNet ?? b.internalNetto ?? b.nettoOlimpya ?? b.nettoOperator ?? 0);

/** ===== Page ===== */
export default function FinanceTransactions() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  // data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [fxList, setFxList] = useState<FxDoc[]>([]);
  const [rowsRaw, setRowsRaw] = useState<any[]>([]);
  const [bookingsAll, setBookingsAll] = useState<BookingFull[]>([]);
  const [orders, setOrders] = useState<OrderDoc[]>([]);

  // UI: filters / modal / highlight
  const [f, setF] = useState({ dateFrom: "", dateTo: "", accountId: "all", side: "all", search: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState<Partial<TxRow> | null>(null);

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const ua = onSnapshot(
      query(collection(db, "finance_accounts"), orderBy("name", "asc")),
      (s) => setAccounts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Account[]),
      (err) => console.error("[accounts] onSnapshot error:", err)
    );

    const uc = onSnapshot(
      query(collection(db, "finance_categories"), orderBy("order", "asc")),
      (s) => setCategories(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Category[]),
      (err) => console.error("[categories] onSnapshot error:", err)
    );

    const up = onSnapshot(
      collection(db, "finance_counterparties"),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Counterparty[];
        list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        setCounterparties(list);
      },
      (err) => console.error("[counterparties] onSnapshot error:", err)
    );

    const uf = onSnapshot(
      collection(db, "finance_fxRates"),
      (s) => setFxList(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FxDoc[]),
      (err) => console.error("[fxRates] onSnapshot error:", err)
    );

    const ut = onSnapshot(
      query(collection(db, "finance_transactions"), orderBy("date", "desc")),
      (s) => setRowsRaw(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => console.error("[transactions] onSnapshot error:", err)
    );

    const ub = onSnapshot(
      collection(db, "bookings"),
      (s) => {
        const all = s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as BookingFull));
        all.sort((a, b) => {
          const ax = (a as any).createdAt?.toMillis?.() ?? 0;
          const bx = (b as any).createdAt?.toMillis?.() ?? 0;
          return bx - ax;
        });
        setBookingsAll(all);
      },
      (err) => console.error("[bookings] onSnapshot error:", err)
    );

    const uo = onSnapshot(
      // ордера — источник факта, фильтруем только «posted»
      query(collection(db, "finance_orders"), where("status", "==", "posted")),
      (s) => setOrders(
        s.docs.map(d => {
          const v = d.data() as any;
          return {
            id: d.id,
            txId: String(v.txId),
            date: String(v.date),
            side: v.side,
            bookingId: String(v.bookingId),
            baseAmount: Number(v.baseAmount || 0),
            status: v.status,
          } as OrderDoc;
        })
      ),
      (err) => console.error("[orders] onSnapshot error:", err)
    );

    return () => { ua(); uc(); up(); uf(); ut(); ub(); uo(); };
  }, [user, canEdit, router]);

  /** нормализованные транзакции */
  const txs: TxRow[] = useMemo(
    () => rowsRaw.map((raw) => normalizeTx(raw, accounts, fxList)),
    [rowsRaw, accounts, fxList]
  );

  /** агрегаты из ОРДЕРОВ → по txId */
  const ordersByTx = useMemo(() => {
    const m = new Map<string, { sum: number; count: number; items: Allocation[] }>();
    for (const o of orders) {
      const prev = m.get(o.txId) || { sum: 0, count: 0, items: [] as Allocation[] };
      prev.sum += Math.max(0, o.baseAmount);
      prev.count += 1;
      prev.items.push({ bookingId: o.bookingId, amountBase: o.baseAmount });
      m.set(o.txId, prev);
    }
    return m;
  }, [orders]);

  /** sums by booking из ОРДЕРОВ → для витрины заявки */
  const sumsByBooking = useMemo(() => {
    const m = new Map<string, { inc: number; exp: number }>();
    for (const o of orders) {
      const prev = m.get(o.bookingId) || { inc: 0, exp: 0 };
      if (o.side === "income") prev.inc += Math.abs(o.baseAmount);
      else prev.exp += Math.abs(o.baseAmount);
      m.set(o.bookingId, prev);
    }
    return m;
  }, [orders]);

  /** витрина заявок для модалки: остатки на оплату/получение + «турист после отеля» */
  const bookingOptionsMap: Map<string, BookingOption> = useMemo(() => {
    const map = new Map<string, BookingOption>();
    for (const b of bookingsAll) {
      const brutto = bookingBrutto(b);
      const internal = bookingInternal(b);
      const sums = sumsByBooking.get(b.id) || { inc: 0, exp: 0 };

      const firstTourist =
        (Array.isArray(b.tourists) && b.tourists[0]?.name) ||
        b.payerName ||
        "";

      const placeRich = [pickPlace(b), firstTourist].filter(Boolean).join(" • ");

      const leftIncome = Math.max(0, brutto - sums.inc);
      const leftExpense = Math.max(0, internal - sums.exp);
      const clientOverpay = Math.max(0, sums.inc - brutto);
      const operatorOverpay = Math.max(0, sums.exp - internal);

      const opt: any = {
        id: b.id,
        bookingNumber: b.bookingNumber || b.id,
        created: dmy(b.createdAt),
        operator: pickOperator(b),
        place: placeRich,
        period: `${dmy(pickCheckIn(b))} → ${dmy(pickCheckOut(b))}`,

        brutto,
        internal,
        incDone: sums.inc,
        expDone: sums.exp,

        leftIncome,
        leftExpense,

        clientOverpay,
        operatorOverpay,
      };

      map.set(b.id, opt as BookingOption);
    }
    return map;
  }, [bookingsAll, sumsByBooking]);

  /** фильтры + отображаемый список */
  const displayed = useMemo(() => {
    const df = f.dateFrom ? new Date(f.dateFrom) : null;
    const dt = f.dateTo ? new Date(f.dateTo) : null;
    const q = f.search.trim().toLowerCase();

    return txs
      .filter((t) => {
        if (f.accountId !== "all" && t.accountId !== f.accountId) return false;
        if (f.side !== "all" && t.side !== (f.side as CategorySide)) return false;
        if (df && new Date(t.date) < df) return false;
        if (dt && new Date(t.date) > dt) return false;
        if (q) {
          const s = [
            t.note || "",
            t.accountName || "",
            t.categoryName || "",
            t.counterpartyName || "",
          ].join(" ").toLowerCase();
          if (!s.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [txs, f]);

  /** итоги */
  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const t of displayed) {
      if (t.side === "income") inc += t.baseAmount;
      else exp += t.baseAmount;
    }
    return { income: +inc.toFixed(2), expense: +exp.toFixed(2), net: +(inc - exp).toFixed(2) };
  }, [displayed]);

  /** выделение строки из ?highlight=txId */
  useEffect(() => {
    const hid = (router.query.highlight as string) || null;
    setHighlightId(hid);
    if (hid && rowRefs.current[hid]) {
      rowRefs.current[hid]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlightId(null), 4000);
    }
  }, [router.query.highlight, txs.length]);

  /** действия */
  const openCreate = () => {
    setModalInitial(null);
    setModalOpen(true);
  };
  const openEdit = (row: TxRow) => {
    setModalInitial(row);
    setModalOpen(true);
  };
  const onSaved = (id: string) => {
    router.replace({ pathname: router.pathname, query: { highlight: id } }, undefined, { shallow: true });
  };
  const removeTx = async (row: TxRow) => {
    if (!confirm("Удалить транзакцию и её ордера?")) return;
    await removeTxWithOrders(row.id);
  };

  /** ── бейдж распределения (иконки + цвета) ── */
  function AllocationBadge({
    txId,
    totalEUR,
  }: {
    txId: string;
    totalEUR: number;
  }) {
    const agg = ordersByTx.get(txId) || { sum: 0, count: 0, items: [] as Allocation[] };
    const isFull = agg.sum + 0.01 >= totalEUR;
    const isNone = agg.sum <= 0.01;

    const tip = agg.items.map(a => `${a.bookingId} · ${a.amountBase.toFixed(2)} €`).join("\n");

    if (isNone) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20"
          title="Нет распределения по заявкам"
        >
          <XCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Нет</span>
        </span>
      );
    }

    if (isFull) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
          title={tip || "Распределено полностью"}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span className="hidden sm:inline">Полностью</span>
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
        title={`${agg.sum.toFixed(2)} / ${totalEUR.toFixed(2)} € (${agg.count})\n${tip}`}
      >
        <AlertTriangle className="h-4 w-4" />
        <span className="hidden sm:inline">Частично</span>
      </span>
    );
  }

  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head><title>Транзакции — Финансы</title></Head>

      <div className="w-full max-w-none py-8 space-y-6 px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Банковские транзакции</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/finance/categories")} className="h-9 px-3">
              Категории
            </Button>
            <Button variant="outline" onClick={() => router.push("/finance/counterparties")} className="h-9 px-3">
              Контрагенты
            </Button>
            <Button variant="outline" onClick={() => router.push("/finance/orders")} className="h-9 px-3">
              Журнал ордеров
            </Button>
            <Button variant="outline" onClick={() => router.push("/finance/import/mt940")} className="h-9 px-3">
              Импорт MT940
            </Button>
            <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white h-9 px-3">
              + Транзакция
            </Button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="p-3 border rounded-lg grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm">
          <div>
            <div className="text-xs text-gray-600 mb-1">С даты</div>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={f.dateFrom} onChange={(e) => setF((s) => ({ ...s, dateFrom: e.target.value }))}/>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">По дату</div>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={f.dateTo} onChange={(e) => setF((s) => ({ ...s, dateTo: e.target.value }))}/>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Счёт</div>
            <select className="w-full border rounded px-2 py-1"
              value={f.accountId} onChange={(e) => setF((s) => ({ ...s, accountId: e.target.value }))}>
              <option value="all">Все</option>
              {accounts.filter((a) => !a.archived).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Тип</div>
            <select className="w-full border rounded px-2 py-1"
              value={f.side} onChange={(e) => setF((s) => ({ ...s, side: e.target.value }))}>
              <option value="all">Все</option>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Поиск</div>
            <input className="w-full border rounded px-2 py-1"
              placeholder="заметка / категория / контрагент / счёт / турист"
              value={f.search} onChange={(e) => setF((s) => ({ ...s, search: e.target.value }))}/>
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1600px] border text-sm">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border px-2 py-1">Дата</th>
                <th className="border px-2 py-1">Счёт</th>
                <th className="border px-2 py-1">Тип</th>
                <th className="border px-2 py-1">Статус</th>
                <th className="border px-2 py-1">Сумма (вал.)</th>
                <th className="border px-2 py-1">Сумма (EUR)</th>
                <th className="border px-2 py-1">Категория</th>
                <th className="border px-2 py-1">Контрагент</th>
                <th className="border px-2 py-1">Распределение</th>
                <th className="border px-2 py-1 w-[440px]">Заметка</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((t) => {
                const highlight = t.id === highlightId;

                return (
                  <tr
                    key={t.id}
                    ref={el => { rowRefs.current[t.id] = el; }}
                    className={`text-center align-top hover:bg-gray-50 ${highlight ? "ring-2 ring-amber-400" : ""}`}
                    style={highlight ? { transition: "box-shadow 0.3s" } : undefined}
                  >
                    <td className="border px-2 py-1 whitespace-nowrap">
                      {(() => {
                        const [y, m, d] = (t.date || "").split("-");
                        return y && m && d ? `${d}.${m}.${y}` : t.date || "—";
                      })()}
                    </td>
                    <td className="border px-2 py-1">{t.accountName || t.accountId}</td>
                    <td className="border px-2 py-1">
                      {t.side === "income" ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>
                      )}
                    </td>
                    <td className="border px-2 py-1">
                      {t.status === "planned" ? "План" : t.status === "reconciled" ? "Сверено" : "Факт"}
                    </td>
                    <td className="border px-2 py-1 text-right whitespace-nowrap">{t.amount.toFixed(2)} {t.currency}</td>
                    <td className="border px-2 py-1 text-right whitespace-nowrap">{t.baseAmount.toFixed(2)} €</td>
                    <td className="border px-2 py-1">{t.categoryName || "—"}</td>
                    <td className="border px-2 py-1">{t.counterpartyName || "—"}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">
                      <AllocationBadge txId={t.id} totalEUR={t.baseAmount} />
                    </td>
                    <td className="border px-2 py-1 text-left align-top"
                        style={{ maxWidth: 440, overflow: "hidden", display: "-webkit-box",
                                WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}
                        title={t.note || ""}>
                      {t.note || "—"}
                    </td>
                    <td className="border px-2 py-1">
                      <div className="inline-flex gap-2">
                        <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={() => openEdit(t)} title="Редактировать">✏️</button>
                        <button className="h-7 px-2 border rounded hover:bg-red-50" onClick={() => removeTx(t)} title="Удалить">🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={11} className="border px-2 py-4 text-center text-gray-500">Нет транзакций</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={5}>Итого доходов (EUR):</td>
                <td className="border px-2 py-1 text-right whitespace-nowrap">{moneyEUR(totals.income)}</td>
                <td className="border px-2 py-1" colSpan={5}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={5}>Итого расходов (EUR):</td>
                <td className="border px-2 py-1 text-right whitespace-nowrap">-{moneyEUR(totals.expense)}</td>
                <td className="border px-2 py-1" colSpan={5}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={5}>Чистый поток (EUR):</td>
                <td className="border px-2 py-1 text-right whitespace-nowrap">{moneyEUR(totals.net)}</td>
                <td className="border px-2 py-1" colSpan={5}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Модалка */}
      <TxModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={onSaved}
        initial={modalInitial || undefined}
        accounts={accounts}
        categories={categories}
        counterparties={counterparties}
        fxList={fxList}
        bookingOptionsMap={bookingOptionsMap}
        existingAllocations={
          modalInitial?.id ? (ordersByTx.get(modalInitial.id)?.items ?? []) : []
        }
      />
    </ManagerLayout>
  );
}