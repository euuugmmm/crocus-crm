// pages/finance/orders.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import TxModal from "@/components/finance/TxModal";
import { normalizeTx } from "@/lib/finance/tx";

import {
  Account,
  BookingOption,
  Category,
  Counterparty,
  FxDoc,
  TxRow,
} from "@/types/finance";
import { Button } from "@/components/ui/button";

/** ───────── локальный тип брони (минимум полей, как в transactions) ───────── */
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

  checkIn?: any; checkInDate?: any; startDate?: any; dateFrom?: any; fromDate?: any; start?: any; departureDate?: any;
  checkOut?: any; checkOutDate?: any; endDate?: any; dateTo?: any; toDate?: any; end?: any; returnDate?: any;

  createdAt?: any;

  clientPrice?: number;
  bruttoClient?: number;

  internalNet?: number;
  internalNetto?: number;
  nettoOlimpya?: number;
  nettoOperator?: number;

  tourists?: Array<{ name?: string }>;
  payerName?: string;
};

type Side = "income" | "expense";

type OrderDoc = {
  id: string;
  txId: string;
  bookingId: string;
  date: string; // YYYY-MM-DD
  side: Side;
  baseAmount: number; // EUR
  accountId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  note?: string | null;
  status: string; // posted
};

type MiniTx = {
  id: string;
  categoryId?: string | null;
  categoryName?: string | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
};

/** ───────── helpers ───────── */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (x: number) => `${x.toFixed(2)} €`;
const first = <T,>(...vals: T[]) => vals.find(v => v !== undefined && v !== null && v !== "") as T | undefined;
const dmy = (v?: any) => {
  if (!v && v !== 0) return "—";
  const d = (v && typeof v.toDate === "function") ? v.toDate() : new Date(v);
  if (d instanceof Date && !isNaN(+d)) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}.${mm}.${yy}`;
  }
  if (typeof v === "string") return v;
  return "—";
};
const pickOperator = (b: BookingFull) => first(b.operator, b.operatorName, b.tourOperator) || "—";
const pickPlace = (b: BookingFull) => first(b.hotel, b.tourName, b.destination, b.region, b.arrivalCity) || "—";
const pickIn = (b: BookingFull) => first(b.checkIn, b.checkInDate, b.startDate, b.dateFrom, b.fromDate, b.start, b.departureDate);
const pickOut = (b: BookingFull) => first(b.checkOut, b.checkOutDate, b.endDate, b.dateTo, b.toDate, b.end, b.returnDate);
const brutto = (b: BookingFull) => n(b.clientPrice ?? b.bruttoClient ?? 0);
const internal = (b: BookingFull) => n(b.internalNet ?? b.internalNetto ?? b.nettoOlimpya ?? b.nettoOperator ?? 0);

/** ───────── страница ───────── */
export default function OrdersJournal() {
  const router = useRouter();
  const { user } = useAuth();

  // данные
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [fxList, setFxList] = useState<FxDoc[]>([]);
  const [bookings, setBookings] = useState<BookingFull[]>([]);
  const [txById, setTxById] = useState<Map<string, MiniTx>>(new Map());

  // фильтры
  const [f, setF] = useState({
    side: "all",
    booking: "",
    tx: "",
    dateFrom: "",
    dateTo: "",
    accountId: "all",
    categoryId: "all",
    minEUR: "",
    maxEUR: "",
    search: "", // по заметке
  });

  // модалка транзакции
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txInitial, setTxInitial] = useState<Partial<TxRow> | null>(null);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }

    const uOrders = onSnapshot(
      query(collection(db, "finance_orders"), where("status", "==", "posted"), orderBy("date", "desc")),
      (s) => setOrders(
        s.docs.map((d) => {
          const v = d.data() as any;
          return {
            id: d.id,
            txId: String(v.txId),
            bookingId: String(v.bookingId),
            date: String(v.date),
            side: v.side as Side,
            baseAmount: Number(v.baseAmount || 0),
            accountId: v.accountId ?? null,
            categoryId: v.categoryId ?? null,
            categoryName: v.categoryName ?? null,
            note: v.note ?? null,
            status: v.status || "posted",
          };
        })
      )
    );

    const uAcc = onSnapshot(
      query(collection(db, "finance_accounts"), orderBy("name","asc")),
      (s) => setAccounts(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Account[])
    );

    const uCat = onSnapshot(
      query(collection(db, "finance_categories"), orderBy("order","asc")),
      (s) => setCategories(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Category[])
    );

    const uCp = onSnapshot(
      collection(db, "finance_counterparties"),
      (s) => {
        const list = s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Counterparty[];
        list.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
        setCounterparties(list);
      }
    );

    const uFx = onSnapshot(
      collection(db, "finance_fxRates"),
      (s) => setFxList(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as FxDoc[])
    );

    const uBk = onSnapshot(
      collection(db, "bookings"),
      (s) => {
        const list = s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as BookingFull));
        list.sort((a,b)=>((a as any).createdAt?.toMillis?.() ?? 0) - ((b as any).createdAt?.toMillis?.() ?? 0));
        setBookings(list);
      }
    );

    // мини-словарь транзакций для категории и контрагента
    const uTx = onSnapshot(
      collection(db, "finance_transactions"),
      (s) => {
        const m = new Map<string, MiniTx>();
        s.docs.forEach(d => {
          const v = d.data() as any;
          m.set(d.id, {
            id: d.id,
            categoryId: v.categoryId ?? null,
            categoryName: v.categoryName ?? null,
            counterpartyId: v.counterpartyId ?? null,
            counterpartyName: v.counterpartyName ?? null,
          });
        });
        setTxById(m);
      }
    );

    return () => { uOrders(); uAcc(); uCat(); uCp(); uFx(); uBk(); uTx(); };
  }, [user, router]);

  // быстрые карты для отображения имён
  const accById = useMemo(() => {
    const m = new Map<string,string>();
    accounts.forEach(a => m.set(a.id, a.name));
    return m;
  }, [accounts]);

  const catById = useMemo(() => {
    const m = new Map<string,string>();
    categories.forEach(c => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const bookingById = useMemo(() => {
    const m = new Map<string, BookingFull>();
    bookings.forEach(b => m.set(b.id, b));
    return m;
  }, [bookings]);

  // агрегаты по факту (orders) → остатки по заявкам (для BookingOption)
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

  // карта вариантов заявок для TxModal (полный BookingOption)
  const bookingOptionsMap: Map<string, BookingOption> = useMemo(() => {
    const map = new Map<string, BookingOption>();
    for (const b of bookings) {
      const sums = sumsByBooking.get(b.id) || { inc: 0, exp: 0 };
      const bBrutto = brutto(b);
      const bInternal = internal(b);

      const touristFirst =
        (Array.isArray(b.tourists) && b.tourists[0]?.name) ||
        b.payerName ||
        "";

      map.set(b.id, {
        id: b.id,
        bookingNumber: b.bookingNumber || b.id,
        created: dmy(b.createdAt),
        operator: pickOperator(b),
        place: pickPlace(b),
        period: `${dmy(pickIn(b))} → ${dmy(pickOut(b))}`,

        // план
        brutto: bBrutto,
        internal: bInternal,

        // факт
        incDone: sums.inc,
        expDone: sums.exp,

        // остатки
        leftIncome: Math.max(0, bBrutto - sums.inc),
        leftExpense: Math.max(0, bInternal - sums.exp),

        // расширенные подсказки/поиск
        touristFirst,
        clientOverpay: Math.max(0, sums.inc - bBrutto),
        operatorOverpay: Math.max(0, sums.exp - bInternal),
      });
    }
    return map;
  }, [bookings, sumsByBooking]);

  // фильтрованный список
  const list = useMemo(() => {
    const qB = f.booking.trim();
    const qT = f.tx.trim();
    const qS = f.search.trim().toLowerCase();
    const df = f.dateFrom ? new Date(f.dateFrom) : null;
    const dt = f.dateTo ? new Date(f.dateTo) : null;
    const minE = f.minEUR ? Number(f.minEUR) : null;
    const maxE = f.maxEUR ? Number(f.maxEUR) : null;

    return orders.filter((o) => {
      if (f.side !== "all" && o.side !== (f.side as Side)) return false;
      if (f.accountId !== "all" && (o.accountId || "") !== f.accountId) return false;
      if (f.categoryId !== "all" && (o.categoryId || "") !== f.categoryId) return false;
      if (qB && !o.bookingId.includes(qB)) return false;
      if (qT && !o.txId.includes(qT)) return false;
      if (qS) {
        const hay = (o.note || "").toLowerCase();
        if (!hay.includes(qS)) return false;
      }
      if (df && new Date(o.date) < df) return false;
      if (dt && new Date(o.date) > dt) return false;
      if (minE !== null && o.baseAmount < minE) return false;
      if (maxE !== null && o.baseAmount > maxE) return false;
      return true;
    });
  }, [orders, f]);

  const sumInc = list.filter(x=>x.side==="income").reduce((s,x)=>s+x.baseAmount,0);
  const sumExp = list.filter(x=>x.side==="expense").reduce((s,x)=>s+x.baseAmount,0);

  // открыть TxModal по txId ордера
  const openTx = async (o: OrderDoc) => {
    try {
      const snap = await getDoc(doc(db, "finance_transactions", o.txId));
      if (!snap.exists()) { alert("Транзакция не найдена"); return; }
      const raw = { id: snap.id, ...(snap.data() as any) };
      const norm = normalizeTx(raw, accounts, fxList);
      setTxInitial(norm);
      setTxModalOpen(true);
    } catch (e) {
      console.error(e);
      alert("Не удалось открыть транзакцию");
    }
  };

  // вычисление категории и контрагента для строки
  const renderCategory = (o: OrderDoc): string => {
    const tx = txById.get(o.txId);
    return (
      o.categoryName ||
      (tx?.categoryName ?? (tx?.categoryId ? (catById.get(tx.categoryId) || "—") : "—"))
    );
  };

  const renderCounterparty = (o: OrderDoc): string => {
    if (o.side === "income") {
      const b = bookingById.get(o.bookingId);
      const touristFirst =
        (Array.isArray(b?.tourists) && b?.tourists?.[0]?.name) ||
        b?.payerName ||
        "";
      return touristFirst || "—";
    }
    // expense
    const tx = txById.get(o.txId);
    return tx?.counterpartyName || "—";
  };

  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head><title>Журнал ордеров</title></Head>

      <div className="w-full max-w-none py-6 space-y-4 px-4">

        {/* Кнопки навигации */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h1 className="text-xl font-semibold">Журнал ордеров</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push("/finance/transactions")}>Транзакции</Button>
            <Button variant="outline" onClick={() => router.push("/finance/categories")}>Категории</Button>
            <Button variant="outline" onClick={() => router.push("/finance/bookings-finance")}>Фин. отчёт по заявкам</Button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 border rounded-lg text-sm">
          <div>
            <div className="text-xs text-gray-600 mb-1">Сторона</div>
            <select
              className="border rounded px-2 py-1 w-full"
              value={f.side}
              onChange={(e) => setF({ ...f, side: e.target.value })}
            >
              <option value="all">Все</option>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Счёт</div>
            <select
              className="border rounded px-2 py-1 w-full"
              value={f.accountId}
              onChange={(e) => setF({ ...f, accountId: e.target.value })}
            >
              <option value="all">Все</option>
              {accounts.filter(a=>!a.archived).map(a=>(
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Категория</div>
            <select
              className="border rounded px-2 py-1 w-full"
              value={f.categoryId}
              onChange={(e) => setF({ ...f, categoryId: e.target.value })}
            >
              <option value="all">Все</option>
              {categories.filter(c=>!c.archived).map(c=>(
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Сумма от (EUR)</div>
            <input
              className="border rounded px-2 py-1 w-full"
              value={f.minEUR}
              onChange={(e) => setF({ ...f, minEUR: e.target.value })}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Сумма до (EUR)</div>
            <input
              className="border rounded px-2 py-1 w-full"
              value={f.maxEUR}
              onChange={(e) => setF({ ...f, maxEUR: e.target.value })}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Поиск в заметке</div>
            <input
              className="border rounded px-2 py-1 w-full"
              value={f.search}
              onChange={(e) => setF({ ...f, search: e.target.value })}
              placeholder="текст заметки"
            />
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">С даты</div>
            <input
              type="date"
              className="border rounded px-2 py-1 w-full"
              value={f.dateFrom}
              onChange={(e) => setF({ ...f, dateFrom: e.target.value })}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">По дату</div>
            <input
              type="date"
              className="border rounded px-2 py-1 w-full"
              value={f.dateTo}
              onChange={(e) => setF({ ...f, dateTo: e.target.value })}
            />
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Заявка (ID содержит)</div>
            <input
              className="border rounded px-2 py-1 w-full"
              placeholder="bookingId"
              value={f.booking}
              onChange={(e) => setF({ ...f, booking: e.target.value })}
            />
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Транзакция (ID содержит)</div>
            <input
              className="border rounded px-2 py-1 w-full"
              placeholder="txId"
              value={f.tx}
              onChange={(e) => setF({ ...f, tx: e.target.value })}
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs text-gray-600 mb-1"> </div>
            <Button variant="outline" className="w-full" onClick={() => setF({
              side: "all",
              booking: "",
              tx: "",
              dateFrom: "",
              dateTo: "",
              accountId: "all",
              categoryId: "all",
              minEUR: "",
              maxEUR: "",
              search: "",
            })}>
              Сбросить фильтры
            </Button>
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] border text-sm">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border px-2 py-1">Дата</th>
                <th className="border px-2 py-1">Сторона</th>
                <th className="border px-2 py-1">EUR</th>
                <th className="border px-2 py-1">Заявка</th>
                <th className="border px-2 py-1">Транзакция</th>
                <th className="border px-2 py-1">Категория</th>
                <th className="border px-2 py-1">Счёт</th>
                <th className="border px-2 py-1">Контрагент</th>
                <th className="border px-2 py-1">Заметка</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const accountName = o.accountId ? (accById.get(o.accountId) || o.accountId) : "—";
                const categoryName = renderCategory(o);
                const counterpartyName = renderCounterparty(o);

                return (
                  <tr key={o.id} className="text-center">
                    <td className="border px-2 py-1 whitespace-nowrap">{o.date}</td>
                    <td className="border px-2 py-1">
                      {o.side === "income" ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Доход</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700">Расход</span>
                      )}
                    </td>
                    <td className="border px-2 py-1 text-right whitespace-nowrap">{money(o.baseAmount)}</td>

                    <td className="border px-2 py-1 whitespace-nowrap">
                      <Link href={`/finance/booking/${o.bookingId}`} className="text-indigo-600 hover:underline">
                        {o.bookingId}
                      </Link>
                    </td>

                    <td className="border px-2 py-1 whitespace-nowrap">
                      <Link
                        href={`/finance/transactions?highlight=${o.txId}`}
                        className="text-indigo-600 hover:underline"
                        title={`Открыть транзакцию ${o.txId}`}
                      >
                        ссылка
                      </Link>
                    </td>

                    <td className="border px-2 py-1">{categoryName}</td>
                    <td className="border px-2 py-1">{accountName}</td>
                    <td className="border px-2 py-1">{counterpartyName}</td>
                    <td className="border px-2 py-1 text-left">{o.note || "—"}</td>
                    <td className="border px-2 py-1">
                      <div className="inline-flex gap-2">
                        <button
                          className="h-7 px-2 border rounded hover:bg-gray-100"
                          onClick={() => openTx(o)}
                          title="Редактировать (через транзакцию)"
                        >
                          ✏️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={10} className="border px-2 py-4 text-center text-gray-500">Нет ордеров</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={2}>Итого доходы:</td>
                <td className="border px-2 py-1 text-right whitespace-nowrap">{money(sumInc)}</td>
                <td className="border px-2 py-1" colSpan={7}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={2}>Итого расходы:</td>
                <td className="border px-2 py-1 text-right whitespace-nowrap">{money(sumExp)}</td>
                <td className="border px-2 py-1" colSpan={7}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Единая модалка транзакции — редактирование аллокаций/категории/заметки */}
      <TxModal
        open={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        onSaved={() => setTxModalOpen(false)}
        initial={txInitial || undefined}
        accounts={accounts}
        categories={categories}
        counterparties={counterparties}
        fxList={fxList}
        bookingOptionsMap={bookingOptionsMap}
      />
    </ManagerLayout>
  );
}