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
  getDocs,
  deleteDoc,
  doc,
  addDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

import TxModal from "@/components/finance/TxModal";
import { normalizeTx, removeTxWithOrders, buildTxPayload } from "@/lib/finance/tx";

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
import { CheckCircle2, AlertTriangle, XCircle, Users2, User, Repeat } from "lucide-react";
import { canViewFinance } from "@/lib/finance/roles";

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

  clientPrice?: number;
  bruttoClient?: number;

  internalNet?: number;
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

/** utils: ISO YYYY-MM-DD (локально) */
function localISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

const todayISO = localISO(new Date());
const defaultFromISO = localISO(addDays(new Date(), -90)); // последние 90 дней

/** ===== Page ===== */
export default function FinanceTransactions() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin, loading } = useAuth();

  // роли считаем, но доступ истинным делаем только после загрузки auth
  const canViewRole = canViewFinance(
    { isManager, isSuperManager, isAdmin },
    { includeManager: true } // пока пускаем менеджеров
  );
  const canView = !loading && canViewRole;
  const canEdit = canView;

  // data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [fxList, setFxList] = useState<FxDoc[]>([]);
  const [rowsRaw, setRowsRaw] = useState<any[]>([]);
  const [bookingsAll, setBookingsAll] = useState<BookingFull[]>([]);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [bookingsLoaded, setBookingsLoaded] = useState(false);
  const [plannedRaw, setPlannedRaw] = useState<any[]>([]);

  // UI: filters / modal / highlight
  const [f, setF] = useState({
    dateFrom: defaultFromISO,
    dateTo: todayISO,
    accountId: "all",
    side: "all",
    search: "",
    alloc: "all" as "all" | "booked_full" | "booked_part" | "founders" | "none" | "transfer",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState<Partial<TxRow> | null>(null);

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // состояние для действий по строкам (чтобы дизейблить кнопки)
  const [rowLoadingId, setRowLoadingId] = useState<string | null>(null);

  /** единоразовый редирект-гард */
  const redirectedOnce = useRef(false);
  useEffect(() => {
    if (loading || redirectedOnce.current) return;        // ждём auth/роли
    if (!user) { redirectedOnce.current = true; router.replace("/login"); return; }
    if (!canView) { redirectedOnce.current = true; router.replace("/agent/bookings"); return; }
  }, [loading, user, canView, router]);

  /** подписки (с узким диапазоном дат) — хук ВСЕГДА объявлен, внутри — ранние выходы */
  useEffect(() => {
    if (loading || !user || !canView) return;

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

    const from = f.dateFrom || defaultFromISO;
    const to = f.dateTo || todayISO;

    // транзакции: только диапазон дат
    const ut = onSnapshot(
      query(
        collection(db, "finance_transactions"),
        where("date", ">=", from),
        where("date", "<=", to),
        orderBy("date", "desc")
      ),
      (s) => setRowsRaw(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => console.error("[transactions] onSnapshot error:", err)
    );

    // плановые: только диапазон дат
    const up2 = onSnapshot(
      query(
        collection(db, "finance_planned"),
        where("date", ">=", from),
        where("date", "<=", to),
        orderBy("date", "desc")
      ),
      (s) => setPlannedRaw(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      (err) => console.error("[planned] onSnapshot error:", err)
    );

    // ордера: только posted и только диапазон дат
    const uo = onSnapshot(
      query(
        collection(db, "finance_orders"),
        where("status", "==", "posted"),
        where("date", ">=", from),
        where("date", "<=", to),
        orderBy("date", "desc")
      ),
      (s) =>
        setOrders(
          s.docs.map((d) => {
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

    return () => { ua(); uc(); up(); uf(); ut(); uo(); up2(); };
  }, [loading, user, canView, f.dateFrom, f.dateTo]);

  /** лениво подтягиваем bookings только при открытии модалки (разово) */
  useEffect(() => {
    if (loading || !user || !canView) return;
    if (!modalOpen || bookingsLoaded) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "bookings"));
        const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as BookingFull));
        all.sort((a, b) => {
          const ax = (a as any).createdAt?.toMillis?.() ?? 0;
          const bx = (b as any).createdAt?.toMillis?.() ?? 0;
          return bx - ax;
        });
        setBookingsAll(all);
        setBookingsLoaded(true);
      } catch (e) {
        console.error("[bookings] getDocs error:", e);
      }
    })();
  }, [loading, user, canView, modalOpen, bookingsLoaded]);

  /** нормализованные транзакции (факт) */
  const txs: TxRow[] = useMemo(
    () => rowsRaw.map((raw) => normalizeTx(raw, accounts, fxList)),
    [rowsRaw, accounts, fxList]
  );

  /** плановые → TxRow (status = "planned"), показываем только непривязанные к факту */
  const plannedTxs: TxRow[] = useMemo(() => {
    return plannedRaw
      .filter(p => !p.matchedTxId)
      .map((p: any) => {
        const side = (p.side === "income" ? "income" : "expense") as CategorySide;
        const eur = Number(p.eurAmount ?? p.baseAmount ?? 0);
        const amount = Number(p.amount ?? eur);
        return {
          id: `planned_${p.id}`,
          date: String(p.date || ""),
          side,
          status: "planned",
          accountId: p.accountId || "",
          accountName: p.accountName || p.accountId || "—",
          categoryId: p.categoryId || "",
          categoryName: p.categoryName || p.categoryId || "—",
          counterpartyName: p.counterpartyName || "—",
          note: p.note || "",
          amount,
          currency: p.currency || p.baseCurrency || "EUR",
          baseAmount: eur,

          plannedId: p.id,                // важно для удаления/конвертации
          counterpartyId: p.counterpartyId || "",
          payoutId: p.payoutId || null,   // подсказка для удаления плановой из выплат
          title: p.title || "",
        } as any as TxRow;
      });
  }, [plannedRaw]);

  /** все строки для таблицы: факт + план */
  const txsAll: TxRow[] = useMemo(() => {
    return [...txs, ...plannedTxs];
  }, [txs, plannedTxs]);

  /** индекс: raw по id (нужно для признаков перевода и т.п.) */
  const rawById = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of rowsRaw) m.set(r.id, r);
    return m;
  }, [rowsRaw]);

  /** индекс: аккаунты по id — для названий счетов при переводах */
  const accById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);

  /** точные суммы по учредителям из raw (для бейджа и фильтра) */
  const foundersByTx = useMemo(() => {
    const m = new Map<string, { ig: number; ev: number }>();
    for (const r of rowsRaw) {
      const ig = Number(r.ownerIgorEUR || 0);
      const ev = Number(r.ownerEvgeniyEUR || 0);
      if (ig || ev) m.set(r.id, { ig, ev });
    }
    return m;
  }, [rowsRaw]);

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

  /** витрина заявок для модалки */
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

  /** классификация распределения (для фильтра) */
  function classifyAlloc(t: TxRow): "booked_full" | "booked_part" | "founders" | "none" | "transfer" {
    const raw = rawById.get(t.id);
    if (raw?.transferPairId || raw?.transferLeg) return "transfer";

    const agg = ordersByTx.get(t.id) || { sum: 0, count: 0, items: [] as Allocation[] };
    const bookedSum = Math.round(agg.sum * 100) / 100;
    const total = Math.round((t.baseAmount || 0) * 100) / 100;

    const hasOrders = (agg.count || 0) > 0;
    const fullByBookings = hasOrders && bookedSum + 0.01 >= total;
    const partByBookings = hasOrders && bookedSum > 0.01 && !fullByBookings;

    if (fullByBookings) return "booked_full";
    if (partByBookings) return "booked_part";

    // учредители (legacy ownerWho или точные суммы) — только для факта
    if (t.status !== "planned") {
      const fz = foundersByTx.get(t.id);
      const hasFoundersExact = !!fz && (fz.ig > 0 || fz.ev > 0);
      const hasFoundersLegacy = (t.side as CategorySide) === "expense" && !!(t as any).ownerWho;
      if (hasFoundersExact || hasFoundersLegacy) return "founders";
    }

    return "none";
  }

  /** фильтры + отображаемый список */
  const txsAllMemo = txsAll; // для замыкания, не трогаем
  const displayed = useMemo(() => {
    const df = f.dateFrom ? new Date(f.dateFrom) : null;
    const dt = f.dateTo ? new Date(f.dateTo) : null;
    const q = f.search.trim().toLowerCase();

    return txsAll
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

        // фильтр по распределению
        if (f.alloc !== "all") {
          const cls = classifyAlloc(t);
          if (cls !== f.alloc) return false;
        }

        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [txsAll, f, ordersByTx, foundersByTx, rawById]);

  /** итоги: считаем только ФАКТ, без плановых */
  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const t of displayed) {
      if (t.status === "planned") continue;
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
    if (row.status === "planned") return; // план правим отдельно
    setModalInitial(row);
    setModalOpen(true);
  };
  const onSaved = (id: string) => {
    router.replace({ pathname: router.pathname, query: { highlight: id } }, undefined, { shallow: true });
  };

  // Удаление: различаем факт/план и переводы
  const removeTx = async (row: TxRow) => {
    // Плановая
    if (row.status === "planned") {
      const plannedId = (row as any).plannedId || row.id.replace(/^planned_/, "");
      if (!plannedId) { alert("Не найден plannedId"); return; }
      const ok = confirm("Удалить плановую транзакцию?");
      if (!ok) return;
      try {
        setRowLoadingId(row.id);
        // прямая попытка удаления
        try {
          await deleteDoc(doc(db, "finance_planned", plannedId));
          setRowLoadingId(null);
          return;
        } catch (e: any) {
          // fallback по payoutId/заголовку
          const payoutId = (row as any).payoutId || null;
          if (payoutId) {
            const snap = await getDocs(query(collection(db, "finance_planned"), where("payoutId", "==", payoutId)));
            if (!snap.empty) {
              await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
              setRowLoadingId(null);
              return;
            }
          }
          // последний шанс — точное совпадение title+date
          const title = (row as any).title || "";
          const snap2 = await getDocs(query(
            collection(db, "finance_planned"),
            where("date", "==", row.date),
            where("title", "==", title)
          ));
          if (!snap2.empty) {
            await Promise.all(snap2.docs.map(d => deleteDoc(d.ref)));
            setRowLoadingId(null);
            return;
          }
          throw e; // если ничего не нашли — пробрасываем
        }
      } catch (err: any) {
        console.error("[planned] delete failed:", err);
        alert("Плановая запись уже отсутствует в базе (not-found). Обновите страницу.");
      } finally {
        setRowLoadingId(null);
      }
      return;
    }

    const raw = rawById.get(row.id);

    // Если перевод — удаляем обе ножки по transferPairId
    if (raw?.transferPairId) {
      if (!confirm("Удалить перевод (обе операции)?")) return;
      const qBoth = query(collection(db, "finance_transactions"), where("transferPairId", "==", raw.transferPairId));
      const snap = await getDocs(qBoth);
      const batchIds = snap.docs.map(d => d.id);
      for (const id of batchIds) {
        await removeTxWithOrders(id);
      }
      return;
    }

    // Обычная факт-транзакция
    if (!confirm("Удалить транзакцию и её ордера?")) return;
    await removeTxWithOrders(row.id);
  };

  // Конвертация плана в факт
  const makePlannedActual = async (row: TxRow) => {
    const plannedId = (row as any).plannedId || row.id.replace(/^planned_/, "");
    if (!plannedId) { alert("Не найден plannedId"); return; }
    if (!row.date || !row.accountId || !row.side) { alert("Не хватает данных плана (дата/счёт/тип)"); return; }

    const ok = confirm("Создать фактическую транзакцию из этой плановой и удалить план?");
    if (!ok) return;

    try {
      setRowLoadingId(row.id);

      // восстановим counterpartyId по имени, если его нет
      const counterpartyId =
        (row as any).counterpartyId ||
        (counterparties.find(c => (c.name || "").trim().toLowerCase() === (row.counterpartyName || "").trim().toLowerCase())?.id ?? null);

      // Собираем форму для buildTxPayload
      const form: Partial<TxRow> = {
        date: row.date,
        accountId: row.accountId,
        currency: row.currency as any,
        side: row.side as CategorySide,
        amount: Number(row.amount || 0),
        baseAmount: Number(row.baseAmount || 0), // EUR уже посчитан в плане
        categoryId: row.categoryId || null,
        counterpartyId: counterpartyId || null,
        note: row.note || "",
        method: "bank",
        status: "actual",
        bookingAllocations: [], // из плана обычно нет
      };

      const payload = buildTxPayload(
        form,
        { accounts, categories, counterparties, fxList },
        undefined
      );

      // пишем факт
      const ref = await addDoc(collection(db, "finance_transactions"), payload as any);

      // удаляем план (прямая попытка + фоллбэки)
      try {
        await deleteDoc(doc(db, "finance_planned", plannedId));
      } catch {
        const payoutId = (row as any).payoutId || null;
        if (payoutId) {
          const snap = await getDocs(query(collection(db, "finance_planned"), where("payoutId", "==", payoutId)));
          if (!snap.empty) await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
        } else {
          const title = (row as any).title || "";
          const snap2 = await getDocs(query(
            collection(db, "finance_planned"),
            where("date", "==", row.date),
            where("title", "==", title)
          ));
          if (!snap2.empty) await Promise.all(snap2.docs.map(d => deleteDoc(d.ref)));
        }
      }

      // подсветим новый факт
      onSaved(ref.id);
    } catch (e: any) {
      alert(`Не удалось сконвертировать: ${String(e?.message || e)}`);
    } finally {
      setRowLoadingId(null);
    }
  };

  /** ── бейдж распределения ── */
  function AllocationBadge({
    txId,
    totalEUR,
    ownerWho,
    side,
    ownerIgorEUR = 0,
    ownerEvgeniyEUR = 0,
  }: {
    txId: string;
    totalEUR: number;
    ownerWho?: string | null;
    side: CategorySide;
    ownerIgorEUR?: number;
    ownerEvgeniyEUR?: number;
  }) {
    const raw = rawById.get(txId);
    if (raw?.transferPairId || raw?.transferLeg) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20"
          title="Внутренний перевод между счетами"
        >
          <Repeat className="h-4 w-4" />
          <span className="hidden sm:inline">Перевод</span>
        </span>
      );
    }

    const r2 = (x: number) => Math.round(x * 100) / 100;
    const agg = ordersByTx.get(txId) || { sum: 0, count: 0, items: [] as Allocation[] };
    const bookedSum = r2(agg.sum);
    const hasOrders = agg.count > 0;
    const fullyByBookings = bookedSum + 0.01 >= totalEUR;
    const noneByBookings = bookedSum <= 0.01;

    const foundersLeft = r2(Math.max(0, totalEUR - bookedSum));
    const foundersSum  = r2((Number(ownerIgorEUR) || 0) + (Number(ownerEvgeniyEUR) || 0));
    const foundersMatch = Math.abs(foundersSum - foundersLeft) <= 0.01;

    const tipOrders = agg.items.map(a => `${a.bookingId} · ${a.amountBase.toFixed(2)} €`).join("\n");
    const tipFounders =
      foundersSum > 0 ? `Игорь: ${r2(Number(ownerIgorEUR)).toFixed(2)} €\nЕвгений: ${r2(Number(ownerEvgeniyEUR)).toFixed(2)} €` : "";

    if (hasOrders) {
      if (fullyByBookings) {
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
            title={tipOrders || "Распределено по заявкам полностью"}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="hidden sm:inline">Полностью</span>
          </span>
        );
      }
      if (!noneByBookings) {
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
            title={`${bookedSum.toFixed(2)} / ${totalEUR.toFixed(2)} € (${agg.count})\n${tipOrders}`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Частично</span>
          </span>
        );
      }
    }

    // 1) legacy ownerWho (100/0 или 50/50)
    if (side === "expense" && ownerWho) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
          title="Распределено по учредителям"
        >
          {ownerWho === "split50" || ownerWho === "crocus" ? <Users2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
          <span className="hidden sm:inline">Учредители</span>
        </span>
      );
    }

    // 2) новый способ — точные суммы
    if (side === "expense" && (ownerIgorEUR > 0 || ownerEvgeniyEUR > 0)) {
      if (foundersMatch) {
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
            title={tipFounders}
          >
            <Users2 className="h-4 w-4" />
            <span className="hidden sm:inline">Учредители</span>
          </span>
        );
      }
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
          title={`Учредители частично\n${tipFounders}\nОстаток: ${(foundersLeft - foundersSum).toFixed(2)} €`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span className="hidden sm:inline">Частично</span>
        </span>
      );
    }

    // совсем нет распределения
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20"
        title="Нет распределения"
      >
        <XCircle className="h-4 w-4" />
        <span className="hidden sm:inline">Нет</span>
      </span>
    );
  }

  /** подпись для колонки «Счёт» — учитываем переводы */
  function renderAccountCell(t: TxRow) {
    const raw = rawById.get(t.id);
    if (raw?.transferPairId || raw?.transferLeg) {
      const from = raw.fromAccountId ? accById.get(raw.fromAccountId)?.name || raw.fromAccountId : "—";
      const to   = raw.toAccountId   ? accById.get(raw.toAccountId)?.name   || raw.toAccountId   : "—";
      return (
        <span title="Перевод между счетами">
          {from} &rarr; {to}
        </span>
      );
    }
    return t.accountName || t.accountId || "—";
  }

  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head><title>Транзакции — Финансы</title></Head>

      {/* Скелет/заглушка во время загрузки auth/ролей — БЕЗ раннего return */}
      {loading ? (
        <div className="p-6 text-sm text-gray-500">Проверяем доступ…</div>
      ) : !user || !canView ? (
        <div className="p-6 text-sm text-gray-500">Переадресация…</div>
      ) : (
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
              {canEdit && (
                <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white h-9 px-3">
                  + Транзакция
                </Button>
              )}
            </div>
          </div>

          {/* Фильтры */}
          <div className="p-3 border rounded-lg grid grid-cols-1 sm:grid-cols-8 gap-2 text-sm">
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

            {/* Новый фильтр: Распределение */}
            <div>
              <div className="text-xs text-gray-600 mb-1">Распределение</div>
              <select
                className="w-full border rounded px-2 py-1"
                value={f.alloc}
                onChange={(e) => setF((s) => ({ ...s, alloc: e.target.value as any }))}
              >
                <option value="all">Все</option>
                <option value="booked_full">По заявкам — полностью</option>
                <option value="booked_part">По заявкам — частично</option>
                <option value="founders">Учредители</option>
                <option value="none">Нет</option>
                <option value="transfer">Переводы</option>
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

                  const founders = foundersByTx.get(t.id);
                  const ownerIgorEUR = founders?.ig || 0;
                  const ownerEvgeniyEUR = founders?.ev || 0;

                  const isPlanned = t.status === "planned";

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
                      <td className="border px-2 py-1">{renderAccountCell(t)}</td>
                      <td className="border px-2 py-1">
                        {t.side === "income" ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>
                        )}
                      </td>
                      <td className="border px-2 py-1">
                        {isPlanned ? "План" : t.status === "reconciled" ? "Сверено" : "Факт"}
                      </td>
                      <td className="border px-2 py-1 text-right whitespace-nowrap">{t.amount.toFixed(2)} {t.currency}</td>
                      <td className="border px-2 py-1 text-right whitespace-nowrap">{t.baseAmount.toFixed(2)} €</td>
                      <td className="border px-2 py-1">{t.categoryName || "—"}</td>
                      <td className="border px-2 py-1">{t.counterpartyName || "—"}</td>
                      <td className="border px-2 py-1 whitespace-nowrap">
                        <AllocationBadge
                          txId={t.id}
                          totalEUR={t.baseAmount}
                          ownerWho={(t as any).ownerWho}
                          side={t.side as CategorySide}
                          ownerIgorEUR={ownerIgorEUR}
                          ownerEvgeniyEUR={ownerEvgeniyEUR}
                        />
                      </td>
                      <td
                        className="border px-2 py-1 text-left align-top"
                        style={{ maxWidth: 440, overflow: "hidden", display: "-webkit-box",
                                 WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}
                        title={t.note || ""}
                      >
                        {t.note || "—"}
                      </td>
                      <td className="border px-2 py-1">
                        <div className="inline-flex gap-2">
                          {canEdit && (
                            <>
                              {!isPlanned && (
                                <button
                                  className="h-7 px-2 border rounded hover:bg-gray-100"
                                  onClick={() => openEdit(t)}
                                  title="Редактировать"
                                >
                                  ✏️
                                </button>
                              )}

                              {isPlanned && (
                                <button
                                  className="h-7 px-2 border rounded bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                                  onClick={() => makePlannedActual(t)}
                                  disabled={rowLoadingId === t.id}
                                  title="Сделать фактической"
                                >
                                  ✔️ 
                                </button>
                              )}

                              <button
                                className="h-7 px-2 border rounded hover:bg-red-50 disabled:opacity-50"
                                onClick={() => removeTx(t)}
                                disabled={rowLoadingId === t.id}
                                title={isPlanned ? "Удалить плановую" : "Удалить транзакцию"}
                              >
                                {rowLoadingId === t.id ? "…" : "🗑️"}
                              </button>
                            </>
                          )}
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
      )}

      {/* Модалка (может монтироваться всегда, данные подгружаем лениво) */}
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