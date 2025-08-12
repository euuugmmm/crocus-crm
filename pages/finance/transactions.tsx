/* pages/finance/transactions.tsx */
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

/** === Types (UI) === */
type Currency = "EUR" | "RON" | "USD";
type Account = { id: string; name: string; currency: Currency; archived?: boolean };

type CategorySide = "income" | "expense";
type Category = { id: string; name: string; side: CategorySide; archived?: boolean; order?: number };

type Counterparty = { id: string; name: string; archived?: boolean };

type OwnerWho = "crocus" | "igor" | "evgeniy" | "split50" | null;

type BookingAllocation = { bookingId: string; amountBase: number }; // в EUR

/** Унифицированная строка для UI после нормализации любого документа */
type TxRow = {
  id: string;
  date: string; // YYYY-MM-DD
  status?: "planned" | "actual" | "reconciled";
  accountId: string;
  accountName?: string;
  currency: Currency;
  side: CategorySide;
  amount: number; // в валюте счёта
  baseAmount: number; // в EUR (всегда положительное число, знак учитывается стороной)
  categoryId: string | null;
  categoryName?: string;
  counterpartyId?: string | null;
  counterpartyName?: string;
  ownerWho?: OwnerWho; // «чей расход» (только для расходов)
  bookingId?: string | null; // для совместимости — если распределений нет
  bookingAllocations?: BookingAllocation[]; // распределения по заявкам в EUR
  note?: string;
  method?: "bank" | "card" | "cash" | "iban" | "other";
  source?: string;
  createdAt?: any;
};

type FxDoc = { id: string; base: "EUR"; rates: Partial<Record<Currency, number>> };

/** Бронь — учитываем разные схемы хранения */
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

  payments?: { amount?: number }[];

  createdAt?: any;
};

/** === Helpers === */
const todayISO = () => new Date().toISOString().slice(0, 10);

function eurFrom(amount: number, ccy: Currency, dateISO: string, fxList: FxDoc[]) {
  if (!amount) return 0;
  if (ccy === "EUR") return +amount.toFixed(2);
  if (!fxList.length) return 0;
  const exact = fxList.find((r) => r.id === dateISO);
  const candidate =
    exact ||
    [...fxList].sort((a, b) => (a.id < b.id ? 1 : -1)).find((r) => r.id <= dateISO) ||
    fxList[fxList.length - 1];
  const inv = candidate?.rates?.[ccy];
  if (!inv || inv <= 0) return 0;
  // 1 EUR = inv CCY → 1 CCY = 1/inv EUR
  return +(amount / inv).toFixed(2);
}

// нормализация «сырых» документов к UI-формату
function normalizeTx(raw: any, accounts: Account[], fxList: FxDoc[]): TxRow {
  const side: CategorySide =
    raw.side ||
    (raw.type === "in" ? "income" : raw.type === "out" ? "expense" : "income");

  const currency: Currency =
    raw.currency ||
    raw.amount?.currency ||
    (accounts.find((a) => a.id === raw.accountId)?.currency as Currency) ||
    "EUR";

const rawAmt = typeof raw.amount === "number"
  ? Number(raw.amount || 0)
  : Number(raw.amount?.value || 0);

const rawBase = Number(
  raw.baseAmount ?? raw.eurAmount ?? eurFrom(rawAmt, currency, raw.date || todayISO(), fxList)
);

const amount = Math.abs(rawAmt);
const baseAmount = Math.abs(rawBase);

  return {
    id: raw.id,
    date: raw.date || todayISO(),
    status: raw.status,
    accountId: raw.accountId,
    accountName: raw.accountName,
    currency,
    side,
    amount,
    baseAmount,
    categoryId: raw.categoryId ?? null,
    categoryName: raw.categoryName,
    counterpartyId: raw.counterpartyId ?? null,
    counterpartyName: raw.counterpartyName,
    ownerWho: (raw.ownerWho as OwnerWho) ?? null,
    bookingId: raw.bookingId ?? null,
    bookingAllocations: Array.isArray(raw.bookingAllocations)
      ? raw.bookingAllocations.map((a: any) => ({
          bookingId: String(a.bookingId),
          amountBase: Number(a.amountBase || 0),
        }))
      : undefined,
    note: raw.note ?? "",
    method: raw.method,
    source: raw.source,
    createdAt: raw.createdAt,
  };
}

// безопасное число
const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// итог суммы по брони (учитываем обе схемы)
const bookingTotalBrutto = (b: BookingFull) => toNum(b.clientPrice ?? b.bruttoClient ?? 0);
// итог нетто/факт по брони для расходов
const bookingTotalInternal = (b: BookingFull) =>
  toNum(b.internalNet ?? b.internalNetto ?? b.nettoOlimpya ?? b.nettoOperator ?? 0);

// ISO → dd.MM.yyyy (для таблицы)
const fmtISO = (iso?: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
};

// универсальный dmy
const dmy = (v?: any) => {
  if (!v && v !== 0) return "—";
  if (typeof v === "string") {
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return v; // dd.MM.yyyy
    const d = new Date(v);
    if (!isNaN(+d)) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }
    return v;
  }
  const d = (v && typeof v.toDate === "function") ? v.toDate() : new Date(v);
  if (d instanceof Date && !isNaN(+d)) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  return "—";
};

const moneyEUR = (n: number) => {
  if (!isFinite(n)) return "0 €";
  const abs = Math.abs(n);
  const s = Math.round(abs) === +abs.toFixed(0) ? String(Math.round(abs)) : abs.toFixed(2);
  return `${s} €`;
};

// взять первый определённый атрибут
const first = <T,>(...vals: T[]) => vals.find(v => v !== undefined && v !== null && v !== "") as T | undefined;

// нормализуем поля брони для подписи
const pickOperator = (b: BookingFull) => first(b.operator, b.operatorName, b.tourOperator) || "—";
const pickPlace = (b: BookingFull) => first(b.hotel, b.tourName, b.destination, b.region, b.arrivalCity) || "—";
const pickCheckIn = (b: BookingFull) => first(
  b.checkIn, b.checkInDate, b.startDate, b.dateFrom, b.fromDate, b.start, b.departureDate
);
const pickCheckOut = (b: BookingFull) => first(
  b.checkOut, b.checkOutDate, b.endDate, b.dateTo, b.toDate, b.end, b.returnDate
);

export default function FinanceTransactions() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [fxList, setFxList] = useState<FxDoc[]>([]);
  const [rowsRaw, setRowsRaw] = useState<any[]>([]);
  const [bookingsAll, setBookingsAll] = useState<BookingFull[]>([]);

  // фильтры
  const [f, setF] = useState({ dateFrom: "", dateTo: "", accountId: "all", side: "all", search: "" });

  // инлайн-редактирование
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TxRow>>({});

  // модалка
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<TxRow>>({
    date: todayISO(),
    accountId: "",
    currency: "EUR",
    side: "income",
    amount: 0,
    baseAmount: 0,
    categoryId: null,
    counterpartyId: null,
    ownerWho: null,
    bookingId: "",
    bookingAllocations: [],
    note: "",
    method: "bank",
    status: "actual",
  });

  // мини-поиск по заявкам в модалке
  const [bookingSearch, setBookingSearch] = useState("");

  /** загрузка справочников и транзакций */
  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    // Accounts
    const ua = onSnapshot(
      query(collection(db, "finance_accounts"), orderBy("name", "asc")),
      (s) => setAccounts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Account[]),
      (err) => console.error("[accounts] onSnapshot error:", err)
    );

    // Categories
    const uc = onSnapshot(
      query(collection(db, "finance_categories"), orderBy("order", "asc")),
      (s) => setCategories(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Category[]),
      (err) => console.error("[categories] onSnapshot error:", err)
    );

    // Counterparties
    const up = onSnapshot(
      collection(db, "finance_counterparties"),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Counterparty[];
        list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        setCounterparties(list);
      },
      (err) => console.error("[counterparties] onSnapshot error:", err)
    );

    // FX
    const uf = onSnapshot(
      collection(db, "finance_fxRates"),
      (s) => setFxList(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FxDoc[]),
      (err) => console.error("[fxRates] onSnapshot error:", err)
    );

    // Transactions — по дате
    const ut = onSnapshot(
      query(collection(db, "finance_transactions"), orderBy("date", "desc")),
      (s) => setRowsRaw(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => console.error("[transactions] onSnapshot error:", err)
    );

    // Bookings — остатки считаем на клиенте
    const ub = onSnapshot(
      collection(db, "bookings"),
      (s) => {
        const all = s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as BookingFull[];
        all.sort((a, b) => {
          const ax = (a as any).createdAt?.toMillis?.() ?? 0;
          const bx = (b as any).createdAt?.toMillis?.() ?? 0;
          return bx - ax;
        });
        setBookingsAll(all);
      },
      (err) => console.error("[bookings] onSnapshot error:", err)
    );

    return () => { ua(); uc(); up(); uf(); ut(); ub(); };
  }, [user, canEdit, router]);

  /** нормализованный список */
  const txs: TxRow[] = useMemo(
    () => rowsRaw.map((raw) => normalizeTx(raw, accounts, fxList)),
    [rowsRaw, accounts, fxList]
  );

  // актуализировать валюту формы по выбранному счёту
  useEffect(() => {
    if (!form.accountId) return;
    const acc = accounts.find((a) => a.id === form.accountId);
    if (acc && form.currency !== acc.currency) {
      setForm((prev) => ({ ...prev, currency: acc.currency as Currency }));
    }
  }, [form.accountId, accounts]); // eslint-disable-line

  /** отображаемый список с фильтрами */
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
            t.bookingId || "",
          ].join(" ").toLowerCase();
          if (!s.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [txs, f]);

  /** итоги (доход +, расход −) */
  const totals = useMemo(() => {
let inc = 0, exp = 0;
for (const t of displayed) {
  if (t.side === "income") inc += t.baseAmount;   // baseAmount всегда >0
  else exp += t.baseAmount;                        // baseAmount всегда >0
}
const net = inc - exp;
return {
  income: +inc.toFixed(2),
  expense: +exp.toFixed(2),
  net: +net.toFixed(2),
};
  }, [displayed]);

  /** суммы по заявке (для «осталось …» с учётом распределений) */
  const sumsByBooking = useMemo(() => {
    const m = new Map<string, { inc: number; exp: number }>();
    for (const t of txs) {
      // если есть распределения — учитываем их
      if (Array.isArray(t.bookingAllocations) && t.bookingAllocations.length > 0) {
        for (const a of t.bookingAllocations) {
          const cur = m.get(a.bookingId) || { inc: 0, exp: 0 };
          if (t.side === "income") cur.inc += Math.abs(a.amountBase);
          else cur.exp += Math.abs(a.amountBase);
          m.set(a.bookingId, cur);
        }
        continue;
      }
      // иначе — старая схема bookingId = вся сумма
      if (t.bookingId) {
        const cur = m.get(t.bookingId) || { inc: 0, exp: 0 };
        if (t.side === "income") cur.inc += Math.abs(t.baseAmount);
        else cur.exp += Math.abs(t.baseAmount);
        m.set(t.bookingId, cur);
      }
    }
    return m;
  }, [txs]);

  /** расчёт остатков/переплат и витрины опций */
  const bookingOptionsBase = useMemo(() => {
    // кэш по заявке
    const map = new Map<string, {
      id: string;
      bookingNumber: string;
      created: string;
      operator: string;
      place: string;
      period: string;
      brutto: number;
      internal: number;
      incDone: number;
      expDone: number;
      leftIncome: number;   // сколько осталось принять (клиент платит нам)
      leftExpense: number;  // сколько осталось оплатить (мы оператору)
    }>();

    for (const b of bookingsAll) {
      const brutto = bookingTotalBrutto(b);
      const internal = bookingTotalInternal(b);
      const sums = sumsByBooking.get(b.id) || { inc: 0, exp: 0 };

      map.set(b.id, {
        id: b.id,
        bookingNumber: b.bookingNumber || b.id,
        created: dmy(b.createdAt),
        operator: pickOperator(b),
        place: pickPlace(b),
        period: `${dmy(pickCheckIn(b))} → ${dmy(pickCheckOut(b))}`,
        brutto,
        internal,
        incDone: sums.inc,
        expDone: sums.exp,
        leftIncome: Math.max(0, brutto - sums.inc),
        leftExpense: Math.max(0, internal - sums.exp),
      });
    }
    return map;
  }, [bookingsAll, sumsByBooking]);

  /** список опций под выбранную сторону + мини-фильтр (с учётом суммы) */
  const isIncome = form.side === "income";
  const bookingChoices = useMemo(() => {
    const arr = Array.from(bookingOptionsBase.values())
      .map(x => ({
        id: x.id,
        bookingNumber: x.bookingNumber,
        created: x.created,
        operator: x.operator,
        place: x.place,
        period: x.period,
        left: isIncome ? x.leftIncome : x.leftExpense,
      }))
      .filter(x => x.left > 0.0001);

    // мини-поиск: ищем по тексту и по сумме «left»
    const q = bookingSearch.trim().toLowerCase();
    if (!q) {
      return arr.sort((a, b) => (a.created < b.created ? 1 : -1));
    }

    const qNum = Number(q.replace(/[^\d.,-]/g, "").replace(",", "."));
    const numericQuery = Number.isFinite(qNum);

    const matches = arr.filter(b => {
      const hay = `${b.bookingNumber} ${b.created} ${b.operator} ${b.place} ${b.period} ${b.left}`.toLowerCase();
      if (hay.includes(q)) return true;
      if (numericQuery) {
        // доп. условие: разница <= 0.5 EUR или строковое вхождение целой части
        if (Math.abs(b.left - qNum) <= 0.5) return true;
        if (String(Math.round(b.left)).includes(String(Math.round(qNum)))) return true;
      }
      return false;
    });

    return matches.sort((a, b) => (a.created < b.created ? 1 : -1));
  }, [bookingOptionsBase, bookingSearch, isIncome]);

  /** текущая выбранная заявка (для показа в селекте даже при left=0) */
  const currentBookingOption = useMemo(() => {
    const id = form.bookingId || form.bookingAllocations?.[0]?.bookingId;
    if (!id) return null;
    const x = bookingOptionsBase.get(id);
    if (!x) return null;
    return {
      id,
      bookingNumber: x.bookingNumber,
      created: x.created,
      operator: x.operator,
      place: x.place,
      period: x.period,
      left: isIncome ? x.leftIncome : x.leftExpense,
    };
  }, [form.bookingId, form.bookingAllocations, bookingOptionsBase, isIncome]);

  const formatBookingLabel = (o: {
    bookingNumber: string; created: string; operator: string; place: string; period: string; left: number;
  }) =>
    `${o.bookingNumber} · ${o.created} · ${o.operator} · ${o.place} · ${o.period} · осталось ${moneyEUR(o.left)}`;

  /** EUR к распределению из формы */
  const formEUR = useMemo(() => {
    const ccy = (form.currency as Currency) || "EUR";
    return form.baseAmount != null
      ? Number(form.baseAmount)
      : eurFrom(Number(form.amount || 0), ccy, form.date || todayISO(), fxList);
  }, [form.amount, form.baseAmount, form.currency, form.date, fxList]);

  /** сумма по распределениям */
  const allocatedSum = useMemo(
    () => (form.bookingAllocations || []).reduce((s, a) => s + Math.max(0, Number(a.amountBase || 0)), 0),
    [form.bookingAllocations]
  );

  const allocateRemain = +(Math.max(0, formEUR - allocatedSum).toFixed(2));

  /** Добавить строку распределения из выбранной заявки (form.bookingId) */
  const addAllocationFromSelect = () => {
    const chosen = form.bookingId || currentBookingOption?.id;
    if (!chosen) return;
    const mapItem = bookingOptionsBase.get(chosen);
    if (!mapItem) return;

    const leftHere = isIncome ? mapItem.leftIncome : mapItem.leftExpense;
    const amount = Math.min(leftHere, allocateRemain || formEUR);

    setForm((s) => ({
      ...s,
      bookingId: "",
      bookingAllocations: [
        ...(s.bookingAllocations || []),
        { bookingId: chosen, amountBase: +amount.toFixed(2) },
      ],
    }));
  };

  /** Удалить строку распределения */
  const removeAllocation = (idx: number) => {
    setForm(s => ({
      ...s,
      bookingAllocations: (s.bookingAllocations || []).filter((_, i) => i !== idx),
    }));
  };

  /** Обновить сумму распределения */
  const changeAllocationAmount = (idx: number, value: number) => {
    setForm(s => {
      const list = [...(s.bookingAllocations || [])];
      list[idx] = { ...list[idx], amountBase: Math.max(0, Number(value) || 0) };
      return { ...s, bookingAllocations: list };
    });
  };

  /** модалка: создать */
  const openCreate = () => {
    const firstAcc = accounts.find((a) => !a.archived);
    setEditingId(null);
    setForm({
      date: todayISO(),
      accountId: firstAcc?.id || "",
      currency: (firstAcc?.currency as Currency) || "EUR",
      side: "income",
      amount: 0,
      baseAmount: 0,
      categoryId: null,
      counterpartyId: null,
      ownerWho: null,
      bookingId: "",
      bookingAllocations: [],
      note: "",
      method: "bank",
      status: "actual",
    });
    setBookingSearch("");
    setModalOpen(true);
  };

  /** модалка: редактировать */
const openEdit = (t: TxRow) => {
  setEditingId(t.id);
  setForm({
    ...t,
    amount: Math.abs(Number(t.amount || 0)),
    baseAmount: Math.abs(Number(t.baseAmount || 0)),
    bookingAllocations: t.bookingAllocations || [],
    bookingId: t.bookingAllocations?.[0]?.bookingId || t.bookingId || "",
  });
  setBookingSearch("");
  setModalOpen(true);
};

  /** удалить */
  const remove = async (t: TxRow) => {
    if (!confirm("Удалить транзакцию?")) return;
    await deleteDoc(doc(db, "finance_transactions", t.id));
  };

  /** payload для Firestore (канонический формат + обратная совместимость) */
 /** payload для Firestore (канонический формат + обратная совместимость) */
const buildPayload = (data: Partial<TxRow>, forId?: string) => {
  const acc = accounts.find((a) => a.id === data.accountId);
  const ccy = (acc?.currency || data.currency || "EUR") as Currency;

  // исходные числа
  const amt = Number(data.amount || 0);
  const eurRaw =
    data.baseAmount != null
      ? Number(data.baseAmount)
      : eurFrom(amt, ccy, data.date || todayISO(), fxList);

  // ВСЕГДА храним положительные числа, знак задаёт side
  const amtAbs = Math.abs(amt);
  const eurAbs = Math.abs(eurRaw);

  const cat = categories.find((c) => c.id === data.categoryId);
  const cp  = counterparties.find((x) => x.id === data.counterpartyId);

  const side = (data.side || "income") as CategorySide;

  const payload: any = {
    date: data.date || todayISO(),
    status: data.status || "actual",

    accountId: data.accountId,
    accountName: acc?.name || null,

    currency: ccy,
    side,
    type: side === "income" ? "in" : "out", // обратная совместимость

    // суммы в канонике — положительные
    amount: { value: amtAbs, currency: ccy },
    baseAmount: +eurAbs.toFixed(2),

    categoryId: data.categoryId ?? null,
    categoryName: cat?.name || null,

    counterpartyId: data.counterpartyId ?? null,
    counterpartyName: cp?.name || null,

    ownerWho: side === "expense" ? ((data.ownerWho ?? null) as OwnerWho) : null,

    // для совместимости оставляем одиночную ссылку
    bookingId: (data.bookingId ?? null) || null,

    note: (data.note || "").trim(),
    method: data.method || "bank",

    source: forId ? "manual_edit" : "manual",
    updatedAt: Timestamp.now(),
    ...(forId ? {} : { createdAt: Timestamp.now() }),
  };

  return payload;
};

  /** сохранить из модалки */
  const saveModal = async () => {
    if (!form.date || !form.accountId || !form.side) {
      alert("Дата, счёт и тип обязательны");
      return;
    }
    // контроль распределения: предупреждение, если распределено больше, чем EUR
    if (allocatedSum - formEUR > 0.01) {
      if (!confirm("Распределено больше, чем сумма транзакции в EUR. Сохранить всё равно?")) return;
    }

    const payload = buildPayload(form, editingId || undefined);

    if (editingId) {
      await updateDoc(doc(db, "finance_transactions", editingId), payload);
    } else {
      await addDoc(collection(db, "finance_transactions"), payload);
    }
    setModalOpen(false);
  };

  /** === Inline edit (dblclick) — служебные поля без распределений === */
  const startInline = (row: TxRow) => {
    setEditingRowId(row.id);
    setEditDraft({
      categoryId: row.categoryId ?? null,
      counterpartyId: row.counterpartyId ?? null,
      ownerWho: row.ownerWho ?? null,
    });
  };
  const cancelInline = () => { setEditingRowId(null); setEditDraft({}); };
  const saveInline = async (row: TxRow) => {
    const patch: Partial<TxRow> = {
      categoryId: (editDraft.categoryId ?? row.categoryId) ?? null,
      counterpartyId: (editDraft.counterpartyId ?? row.counterpartyId) ?? null,
      ownerWho: (editDraft.ownerWho ?? row.ownerWho) ?? null,
    };
    const payload = buildPayload({ ...row, ...patch }, row.id);
    await updateDoc(doc(db, "finance_transactions", row.id), payload);
    cancelInline();
  };

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
              placeholder="заметка / заявка / категория / контрагент / счёт"
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
                <th className="border px-2 py-1">Сумма (вал.)</th>
                <th className="border px-2 py-1">Сумма (EUR)</th>
                <th className="border px-2 py-1">Категория</th>
                <th className="border px-2 py-1">Контрагент</th>
                <th className="border px-2 py-1">Чей расход</th>
                <th className="border px-2 py-1">Заявка</th>
                <th className="border px-2 py-1 w-[440px]">Заметка</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((t) => {
                const isEditing = editingRowId === t.id;
                // подпись для ячейки «Заявка»: одиночная или множественная
                let bookingCell: React.ReactNode = t.bookingId || "—";
                if (Array.isArray(t.bookingAllocations) && t.bookingAllocations.length > 0) {
                  const tip = t.bookingAllocations
                    .map(a => `${a.bookingId} · ${a.amountBase.toFixed(2)} €`)
                    .join("\n");
                  bookingCell = (
                    <span title={tip} className="inline-flex items-center gap-1">
                      Множ.: {t.bookingAllocations.length}
                    </span>
                  );
                }

                return (
                  <tr key={t.id} className="text-center hover:bg-gray-50 align-top">
                    <td className="border px-2 py-1 whitespace-nowrap">{fmtISO(t.date)}</td>
                    <td className="border px-2 py-1">{t.accountName || t.accountId}</td>
                    <td className="border px-2 py-1">
                      {t.side === "income" ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>
                      )}
                    </td>

                    {/* суммы — без переноса */}
                    <td className="border px-2 py-1 text-right whitespace-nowrap">
                      {t.amount.toFixed(2)} {t.currency}
                    </td>
                    <td className="border px-2 py-1 text-right whitespace-nowrap">
                      {t.baseAmount.toFixed(2)} €
                    </td>

                    {/* Категория — dblclick → select */}
                    <td className="border px-2 py-1" onDoubleClick={() => startInline(t)}>
                      {isEditing ? (
                        <select className="w-full border rounded px-2 py-1"
                          value={editDraft.categoryId ?? t.categoryId ?? ""}
                          onChange={(e) => setEditDraft((s) => ({ ...s, categoryId: e.target.value || null }))}>
                          <option value="">— не задано —</option>
                          {categories.filter((c) => !c.archived && c.side === t.side).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : (t.categoryName || "—")}
                    </td>

                    {/* Контрагент — dblclick → select */}
                    <td className="border px-2 py-1" onDoubleClick={() => startInline(t)}>
                      {isEditing ? (
                        <select className="w-full border rounded px-2 py-1"
                          value={editDraft.counterpartyId ?? t.counterpartyId ?? ""}
                          onChange={(e) => setEditDraft((s) => ({ ...s, counterpartyId: e.target.value || null }))}>
                          <option value="">— не задан —</option>
                          {counterparties.filter((x) => !x.archived).map((x) => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                      ) : (t.counterpartyName || "—")}
                    </td>

                    {/* Чей расход — только для расхода (dblclick) */}
                    <td className="border px-2 py-1" onDoubleClick={() => startInline(t)}>
                      {t.side === "expense" ? (
                        isEditing ? (
                          <select className="w-full border rounded px-2 py-1"
                            value={editDraft.ownerWho ?? t.ownerWho ?? ""}
                            onChange={(e) => setEditDraft((s) => ({ ...s, ownerWho: (e.target.value || null) as OwnerWho }))}>
                            <option value="">— не указан —</option>
                            <option value="crocus">Крокус</option>
                            <option value="igor">Игорь</option>
                            <option value="evgeniy">Евгений</option>
                            <option value="split50">Крокус (50/50)</option>
                          </select>
                        ) : t.ownerWho ? (
                          t.ownerWho === "split50" ? "Крокус 50/50"
                          : t.ownerWho === "crocus" ? "Крокус"
                          : t.ownerWho === "igor" ? "Игорь"
                          : t.ownerWho === "evgeniy" ? "Евгений"
                          : "—"
                        ) : "—"
                      ) : "—"}
                    </td>

                    {/* Заявка — не переносим */}
                    <td className="border px-2 py-1 whitespace-nowrap">{bookingCell}</td>

                    {/* Заметка — шире и не более 2 строк */}
                    <td className="border px-2 py-1 text-left align-top"
                      style={{ maxWidth: 440, overflow: "hidden", display: "-webkit-box",
                               WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}
                      title={t.note || ""}>
                      {t.note || "—"}
                    </td>

                    <td className="border px-2 py-1">
                      {isEditing ? (
                        <div className="inline-flex gap-2">
                          <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={() => saveInline(t)}>✔︎</button>
                          <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={cancelInline}>✖︎</button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-2">
                          <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={() => openEdit(t)}>✏️</button>
                          <button className="h-7 px-2 border rounded hover:bg-red-50" onClick={() => remove(t)}>🗑️</button>
                        </div>
                      )}
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
                <td className="border px-2 py-1 text-right" colSpan={4}>Итого доходов (EUR):</td>
                <td className="border px-2 py-1 text-right whitespace-nowrap">{totals.income.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={6}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>Итого расходов (EUR):</td>
                <td className="border px-2 py-1 text-right whitespace-nowrap">-{totals.expense.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={6}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>Чистый поток (EUR):</td>
                <td className="border px-2 py-1 text-right whitespace-nowrap">{totals.net.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={6}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Модалка */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-3xl bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{editingId ? "Редактировать транзакцию" : "Новая транзакция"}</h2>
              <button className="text-2xl leading-none" onClick={() => setModalOpen(false)}>×</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Дата">
                <input type="date" className="w-full border rounded px-2 py-1"
                  value={form.date || ""} onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}/>
              </Field>
              <Field label="Счёт">
                <select className="w-full border rounded px-2 py-1"
                  value={form.accountId || ""} onChange={(e) => setForm((s) => ({ ...s, accountId: e.target.value }))}>
                  <option value="" disabled>— выберите счёт —</option>
                  {accounts.filter((a) => !a.archived).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </Field>

              <Field label="Тип">
                <select className="w-full border rounded px-2 py-1"
                  value={form.side || "income"}
                  onChange={(e) => setForm((s) => ({ ...s, side: e.target.value as CategorySide, bookingId: "", bookingAllocations: [] }))}>
                  <option value="income">Доход</option>
                  <option value="expense">Расход</option>
                </select>
              </Field>
              <Field label="Категория">
                <select className="w-full border rounded px-2 py-1"
                  value={form.categoryId ?? ""} onChange={(e) => setForm((s) => ({ ...s, categoryId: e.target.value || null }))}>
                  <option value="">— не задано —</option>
                  {categories.filter((c) => !c.archived && c.side === form.side).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>

              <Field label={`Сумма (${form.currency})`}>
                <input type="number" step="0.01" className="w-full border rounded px-2 py-1"
                  value={form.amount ?? 0}
                  onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value || 0) }))}/>
              </Field>
              <Field label="Контрагент">
                <select className="w-full border rounded px-2 py-1"
                  value={form.counterpartyId ?? ""} onChange={(e) => setForm((s) => ({ ...s, counterpartyId: e.target.value || null }))}>
                  <option value="">— не задан —</option>
                  {counterparties.filter((x) => !x.archived).map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </Field>

              {form.side === "expense" && (
                <Field label="Чей расход">
                  <select className="w-full border rounded px-2 py-1"
                    value={form.ownerWho ?? ""} onChange={(e) => setForm((s) => ({ ...s, ownerWho: (e.target.value || null) as OwnerWho }))}>
                    <option value="">— не указан —</option>
                    <option value="crocus">Крокус</option>
                    <option value="igor">Игорь</option>
                    <option value="evgeniy">Евгений</option>
                    <option value="split50">Крокус (50/50)</option>
                  </select>
                </Field>
              )}

              {/* Выбор заявки + мини-поиск */}
              <Field label={`Заявка (${isIncome ? "неоплаченные по клиенту" : "остаток оплаты оператору"})`}>
                <div className="space-y-1">
                  <input
                    className="w-full border rounded px-2 py-1 text-xs"
                    placeholder="Быстрый поиск по номеру/отелю/оператору/датам/сумме…"
                    value={bookingSearch}
                    onChange={(e) => setBookingSearch(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <select className="w-full border rounded px-2 py-1"
                      value={form.bookingId || ""}
                      onChange={(e) => setForm((s) => ({ ...s, bookingId: e.target.value || ("" as any) }))}>
                      <option value="">— не выбрана —</option>
                      {currentBookingOption && !bookingChoices.some(c => c.id === currentBookingOption.id) && (
                        <option value={currentBookingOption.id}>{formatBookingLabel(currentBookingOption)}</option>
                      )}
                      {bookingChoices.map((b) => (
                        <option key={b.id} value={b.id}>{formatBookingLabel(b)}</option>
                      ))}
                    </select>
                    <Button variant="outline" className="whitespace-nowrap h-9 px-3" onClick={addAllocationFromSelect}>
                      + Добавить
                    </Button>
                  </div>
                </div>
              </Field>

              {/* Распределения по заявкам */}
              <Field label={`Распределение по заявкам (EUR) · к распределению: ${formEUR.toFixed(2)} · осталось: ${allocateRemain.toFixed(2)}`} full>
                <div className="border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border px-2 py-1 text-left">Заявка</th>
                        <th className="border px-2 py-1 w-40">Сумма (EUR)</th>
                        <th className="border px-2 py-1 w-28">Статус</th>
                        <th className="border px-2 py-1 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(form.bookingAllocations || []).map((al, idx) => {
                        const x = bookingOptionsBase.get(al.bookingId);
                        const label = x
                          ? `${x.bookingNumber} · ${x.operator} · ${x.place} · ${x.period}`
                          : al.bookingId;

                        // для подсказки о переплате учитываем текущую аллокацию
                        let leftBase = 0;
                        if (x) {
                          const leftOrig = isIncome ? x.leftIncome : x.leftExpense;
                          // пересчёт left с учётом уже введённых аллокаций на эту же заявку
                          const sameSum = (form.bookingAllocations || [])
                            .filter(a => a.bookingId === al.bookingId)
                            .reduce((s, a) => s + (a === al ? 0 : a.amountBase), 0);
                          leftBase = Math.max(0, leftOrig - sameSum);
                        }
                        const over = x ? Math.max(0, al.amountBase - (isIncome ? x.leftIncome : x.leftExpense)) : 0;

                        return (
                          <tr key={`${al.bookingId}-${idx}`} className="align-top">
                            <td className="border px-2 py-1">{label}</td>
                            <td className="border px-2 py-1">
                              <input
                                type="number" step="0.01"
                                className="w-full border rounded px-2 py-1"
                                value={al.amountBase}
                                onChange={(e) => changeAllocationAmount(idx, Number(e.target.value))}
                              />
                            </td>
                            <td className="border px-2 py-1">
                              {x ? (
                                al.amountBase <= leftBase
                                  ? <span className="text-emerald-700">OK</span>
                                  : <span className="text-rose-700">переплата {moneyEUR(al.amountBase - leftBase)}</span>
                              ) : "—"}
                            </td>
                            <td className="border px-2 py-1 text-center">
                              <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={() => removeAllocation(idx)}>✖︎</button>
                            </td>
                          </tr>
                        );
                      })}
                      {(form.bookingAllocations || []).length === 0 && (
                        <tr><td className="border px-2 py-2 text-gray-500" colSpan={4}>Пока нет распределений</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Field>

              <Field label="Заметка" full>
                <input className="w-full border rounded px-2 py-1"
                  value={form.note || ""}
                  onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
                  placeholder="комментарий"/>
              </Field>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="text-xs text-gray-600">
                Подсказка: если есть переплата — это повод оформить «Возврат клиенту» как расходную транзакцию.
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setModalOpen(false)} className="h-8 px-3 text-xs">Отмена</Button>
                <Button onClick={saveModal} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">Сохранить</Button>
              </div>
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