/* pages/finance/founders-report.tsx */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
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

import { normalizeTx } from "@/lib/finance/tx";
import { loadOwners, splitAmount } from "@/lib/finance/owners";

import {
  Account,
  Category,
  Counterparty,
  FxDoc,
  TxRow,
  OwnerWho,
} from "@/types/finance";

import {
  Users2,
  User,
  ExternalLink,
  Info,
  FileText,
  Briefcase,
  CalendarDays,
  Filter,
  BarChart3,
  LineChart as LineIcon,
  BarChart as BarIcon,
  Sigma,
  Building2,
  List,
} from "lucide-react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  AreaChart,
  Area,
} from "recharts";

/** ================= helpers ================= */
const money = (x: number) =>
  `${(x || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const fmtDMY = (iso?: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
};
const toLocalISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; };
const startOfWeekISO = (d = new Date()) => {
  const nd = new Date(d);
  const day = (nd.getDay() + 6) % 7; // 0=Mon
  nd.setDate(nd.getDate() - day);
  nd.setHours(0, 0, 0, 0);
  return nd;
};
const endOfWeekISO = (d = new Date()) => addDays(endOfDay(startOfWeekISO(d)), 6);
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

/** Bucketing */
type Granularity = "day" | "week" | "month";
const labelFor = (d: Date, g: Granularity) => {
  if (g === "day") {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${d.getFullYear()}`;
  }
  if (g === "week") {
    const tmp = new Date(d);
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    const week = Math.floor(
      (startOfWeekISO(tmp).getTime() - startOfWeekISO(yearStart).getTime()) / (1000 * 3600 * 24 * 7)
    ) + 1;
    return `${tmp.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
};
const stepFor = (g: Granularity) => (g === "day" ? 1 : g === "week" ? 7 : 30);

/** Palette */
const C_IGOR = "#2563eb";   // blue-600
const C_EVG  = "#f59e0b";   // amber-500
const C_TOT  = "#059669";   // emerald-600
const C_GRID = "#e5e7eb";   // gray-200

/** ================= data types ================= */
type Booking = {
  id: string;
  bookingType?: string;      // "olimpya_base" | "subagent" | ...
  baseType?: "igor" | "evgeniy" | "split50";
  createdAt?: any;
  bookingNumber?: string;
  agentName?: string;
  operator?: string;
  hotel?: string;
  payerName?: string;
  tourists?: Array<{ name?: string }>;

  bruttoClient?: number;     // €
  internalNet?: number;      // €
  nettoOlimpya?: number;     // €
  commission?: number;
  realCommission?: number;
  overCommission?: number;

  commissionIgor?: number;
  commissionEvgeniy?: number;

  owners?: Array<{ ownerId?: string; name?: string; share?: number }>;
};

type OrderLite = {
  id: string;
  bookingId: string;
  side: "income" | "expense";
  baseAmount: number; // EUR
  date: string;       // YYYY-MM-DD
  status: string;     // posted
};

type Filters = {
  owner: "all" | "igor" | "evgeniy";
  side: "all" | "income" | "expense";
  dateFrom: string;
  dateTo: string;
  search: string;
  includeBookingIncome: boolean;
  includeOwnerTx: boolean;
};

type OwnerMove = {
  kind: "booking_income" | "owner_tx";
  date: string;
  side: "income" | "expense";
  baseAmount: number;   // «величина события», для справки
  igor: number;         // движение по балансу Игоря (+/−)
  evgeniy: number;      // движение по балансу Евгения (+/−)

  bookingId?: string;
  bookingNumber?: string;
  txId?: string;

  accountName?: string;
  categoryName?: string | null;
  counterpartyName?: string | null;
  note?: string | null;
};

/** ================= page ================= */
export default function FoundersReportPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  // data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [fxList, setFxList] = useState<FxDoc[]>([]);
  const [rowsRaw, setRowsRaw] = useState<any[]>([]);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string; share: number }[]>([]);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canView) { router.replace("/agent/bookings"); return; }

    const ua = onSnapshot(
      query(collection(db, "finance_accounts"), orderBy("name","asc")),
      s => setAccounts(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Account[])
    );
    const uc = onSnapshot(
      query(collection(db, "finance_categories"), orderBy("order","asc")),
      s => setCategories(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Category[])
    );
    const up = onSnapshot(
      collection(db, "finance_counterparties"),
      s => {
        const list = s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Counterparty[];
        list.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
        setCounterparties(list);
      }
    );
    const uf = onSnapshot(
      collection(db, "finance_fxRates"),
      s => setFxList(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as FxDoc[])
    );
    const ut = onSnapshot(
      query(collection(db, "finance_transactions"), orderBy("date","desc")),
      s => setRowsRaw(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })))
    );
    const ub = onSnapshot(
      collection(db, "bookings"),
      s => setBookings(s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Booking)))
    );
    const uo = onSnapshot(
      query(collection(db, "finance_orders"), where("status","==","posted")),
      s => setOrders(
        s.docs.map(d => {
          const v: any = d.data();
          return {
            id: d.id,
            bookingId: String(v.bookingId),
            side: v.side as "income" | "expense",
            baseAmount: Number(v.baseAmount || 0),
            date: String(v.date || ""),
            status: String(v.status || "posted"),
          } as OrderLite;
        })
      )
    );

    loadOwners().then(setOwners).catch(console.error);

    return () => { ua(); uc(); up(); uf(); ut(); ub(); uo(); };
  }, [user, canView, router]);

  // нормализованные транзакции
  const txsAll: TxRow[] = useMemo(
    () => rowsRaw.map(raw => normalizeTx(raw, accounts, fxList)),
    [rowsRaw, accounts, fxList]
  );
  const factTxs = useMemo(
    () => txsAll.filter(t => t.status === "actual" || t.status === "reconciled"),
    [txsAll]
  );

  /** ===== факт по заявкам (только из ордеров) ===== */
  const factByBooking = useMemo(() => {
    const map = new Map<string, { inEUR: number; outEUR: number; lastDate?: string }>();
    for (const o of orders) {
      const prev = map.get(o.bookingId) || { inEUR: 0, outEUR: 0, lastDate: undefined as string | undefined };
      if (o.side === "income") prev.inEUR += Math.abs(o.baseAmount);
      else if (o.side === "expense") prev.outEUR += Math.abs(o.baseAmount);
      if (!prev.lastDate || o.date > prev.lastDate) prev.lastDate = o.date; // дата признания = последняя дата ордера
      map.set(o.bookingId, prev);
    }
    return map;
  }, [orders]);

  /** ===== распределение Crocus по заявке (правила) =====
   *  priority:
   *   1) commissionIgor / commissionEvgeniy — явные суммы
   *   2) bookingType != "olimpya_base" → жёстко 50/50
   *   3) baseType: "igor"|"evgeniy" → 100% одному
   *   4) fallback: splitAmount по конфигу owners / b.owners
   */
  const splitForBooking = (b: Booking) => {
    const brutto = toNum(b.bruttoClient);
    const netCrocus = toNum(b.internalNet);
    const netOlimp = toNum(b.nettoOlimpya) || netCrocus;

    const baseCommission = toNum(b.realCommission) || toNum(b.commission) || (brutto - netCrocus);
    const crocusAmount = b.bookingType === "olimpya_base" ? baseCommission : (brutto - netCrocus);

    // 1) явные суммы
    let igExpl = toNum(b.commissionIgor);
    let evExpl = toNum(b.commissionEvgeniy);
    if (igExpl > 0 || evExpl > 0) {
      if (igExpl > 0 && evExpl <= 0) evExpl = +(crocusAmount - igExpl).toFixed(2);
      if (evExpl > 0 && igExpl <= 0) igExpl = +(crocusAmount - evExpl).toFixed(2);
      if (igExpl < 0) igExpl = 0;
      if (evExpl < 0) evExpl = 0;
      const fix = +(crocusAmount - (igExpl + evExpl)).toFixed(2);
      if (Math.abs(fix) >= 0.01) {
        if (igExpl <= evExpl) igExpl = +(igExpl + fix).toFixed(2);
        else evExpl = +(evExpl + fix).toFixed(2);
      }
      return { brutto, netCrocus, netOlimp, crocusAmount: +crocusAmount.toFixed(2), Igor: +igExpl.toFixed(2), Evgeniy: +evExpl.toFixed(2) };
    }

    // 2) субагент → 50/50
    if (b.bookingType && b.bookingType !== "olimpya_base") {
      const half = +(crocusAmount / 2).toFixed(2);
      const rest = +(crocusAmount - half).toFixed(2);
      return { brutto, netCrocus, netOlimp, crocusAmount: +crocusAmount.toFixed(2), Igor: half, Evgeniy: rest };
    }

    // 3) baseType
    if (b.baseType === "igor")     return { brutto, netCrocus, netOlimp, crocusAmount: +crocusAmount.toFixed(2), Igor: +crocusAmount.toFixed(2), Evgeniy: 0 };
    if (b.baseType === "evgeniy")  return { brutto, netCrocus, netOlimp, crocusAmount: +crocusAmount.toFixed(2), Igor: 0, Evgeniy: +crocusAmount.toFixed(2) };

    // 4) fallback
    const parts =
      b.bookingType === "olimpya_base"
        ? splitAmount(baseCommission, owners, b.owners)
        : splitAmount(brutto - netCrocus, owners);
    let Igor = 0, Evgeniy = 0;
    for (const p of parts) {
      if (p.name === "Igor") Igor += p.amount;
      if (p.name === "Evgeniy") Evgeniy += p.amount;
    }
    return { brutto, netCrocus, netOlimp, crocusAmount: +crocusAmount.toFixed(2), Igor: +Igor.toFixed(2), Evgeniy: +Evgeniy.toFixed(2) };
  };

  /** ===== доходы учредителей по заявкам (факт из ордеров) =====
   * completion = min( inFact/brutto, outFact/netCrocus )
   * OwnerIncome = completion * OwnerShare(CrocusAmount)
   */
  const ownerBookingIncomeMoves: OwnerMove[] = useMemo(() => {
    const list: OwnerMove[] = [];
    for (const b of bookings) {
      const { brutto, netCrocus, crocusAmount, Igor, Evgeniy } = splitForBooking(b);
      if (crocusAmount <= 0) continue;

      const fact = factByBooking.get(b.id) || { inEUR: 0, outEUR: 0, lastDate: undefined };
      const ratioIn  = brutto     > 0 ? fact.inEUR  / brutto     : (netCrocus > 0 ? fact.outEUR / netCrocus : 0);
      const ratioOut = netCrocus  > 0 ? fact.outEUR / netCrocus  : (brutto    > 0 ? fact.inEUR  / brutto    : 0);
      const completion = clamp01(Math.min(ratioIn || 0, ratioOut || 0));

      const inc = +(crocusAmount * completion).toFixed(2);
      const ig  = +(Igor         * completion).toFixed(2);
      const ev  = +(Evgeniy      * completion).toFixed(2);
      if (inc <= 0.01 && Math.abs(ig) < 0.01 && Math.abs(ev) < 0.01) continue;

      let when = fact.lastDate;
      if (!when) {
        const d = (b as any).createdAt?.toDate?.() as Date | undefined;
        when = d ? toLocalISO(d) : toLocalISO(new Date());
      }

      list.push({
        kind: "booking_income",
        date: when!,
        side: "income",
        baseAmount: inc,
        igor: ig,
        evgeniy: ev,
        bookingId: b.id,
        bookingNumber: b.bookingNumber,
        note: `Доход по заявке ${b.bookingNumber || b.id}`,
      });
    }
    list.sort((a,b)=> (a.date < b.date ? 1 : -1));
    return list;
  }, [bookings, factByBooking, owners]);

  /** ===== прочие движения из транзакций (ownerWho / выплаты) ===== */
  const isOwnerPayout = (t: TxRow) => {
    const cat = (t.categoryName || "").toLowerCase();
    const txt = [t.note, (t as any).title, t.counterpartyName].filter(Boolean).join(" ").toLowerCase();
    if (cat.includes("owner") || cat.includes("учред") || cat.includes("дивид")) return true;
    if (txt.includes("учред")) return true;
    if (txt.includes("выплата") && (txt.includes("igor") || txt.includes("игор") || txt.includes("evgen") || txt.includes("евген"))) return true;
    return false;
  };
  const detectOwnerFromText = (txt?: string | null): OwnerWho | null => {
    const v = (txt || "").toLowerCase();
    if (v.includes("igor") || v.includes("игор")) return "igor";
    if (v.includes("evgen") || v.includes("евген")) return "evgeniy";
    return null;
  };

  const ownerTxMoves: OwnerMove[] = useMemo(() => {
    const list: OwnerMove[] = [];
    for (const t of factTxs) {
      const eur = t.baseAmount; // normalizeTx даёт модуль
      let ig = 0, ev = 0;
      let pushed = false;

      const ow = (t as any).ownerWho as OwnerWho | null | undefined;
      if (ow) {
        const sign = t.side === "income" ? +1 : -1;
        if (ow === "igor") ig += sign * eur;
        else if (ow === "evgeniy") ev += sign * eur;
        else if (ow === "split50" || ow === "crocus") { ig += sign * eur / 2; ev += sign * eur / 2; }
        pushed = true;
      }

      if (isOwnerPayout(t)) {
        const who =
          detectOwnerFromText((t as any).title) ||
          detectOwnerFromText(t.note) ||
          detectOwnerFromText(t.counterpartyName) ||
          null;
        const delta = -eur; // компания заплатила владельцу → баланс владельца уменьшается
        if (who === "igor") ig += delta;
        else if (who === "evgeniy") ev += delta;
        else { ig += delta / 2; ev += delta / 2; }
        pushed = true;
      }

      if (!pushed) continue;
      if (Math.abs(ig) < 0.005 && Math.abs(ev) < 0.005) continue;

      list.push({
        kind: "owner_tx",
        date: t.date,
        side: t.side,
        baseAmount: eur,
        igor: +ig.toFixed(2),
        evgeniy: +ev.toFixed(2),
        txId: t.id,
        accountName: t.accountName || t.accountId,
        categoryName: t.categoryName || null,
        counterpartyName: t.counterpartyName || null,
        note: t.note || null,
      });
    }
    list.sort((a,b)=> (a.date < b.date ? 1 : -1));
    return list;
  }, [factTxs]);

  /** ===== общий журнал ===== */
  const movesAll: OwnerMove[] = useMemo(
    () => [...ownerBookingIncomeMoves, ...ownerTxMoves].sort((a,b)=> (a.date < b.date ? 1 : -1)),
    [ownerBookingIncomeMoves, ownerTxMoves]
  );

  /** ===== фильтры / диапазон / гранулярность ===== */
  const [filters, setFilters] = useState<Filters>({
    owner: "all",
    side: "all",
    dateFrom: "",
    dateTo: "",
    search: "",
    includeBookingIncome: true,
    includeOwnerTx: true,
  });

  const filteredRows = useMemo(() => {
    const df = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dt = filters.dateTo ? new Date(filters.dateTo) : null;
    const q = filters.search.trim().toLowerCase();

    return movesAll.filter((m) => {
      if (!filters.includeBookingIncome && m.kind === "booking_income") return false;
      if (!filters.includeOwnerTx && m.kind === "owner_tx") return false;
      const d = new Date(m.date);
      if (df && d < df) return false;
      if (dt && d > dt) return false;
      if (filters.side !== "all" && m.side !== filters.side) return false;
      if (filters.owner === "igor" && Math.abs(m.igor) < 0.005) return false;
      if (filters.owner === "evgeniy" && Math.abs(m.evgeniy) < 0.005) return false;
      if (q) {
        const hay = [
          m.kind === "booking_income" ? `Заявка ${m.bookingNumber || m.bookingId || ""}` : "",
          m.accountName,
          m.categoryName,
          m.counterpartyName,
          m.note,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movesAll, filters]);

  /** ===== балансы opening/period/closing для выбранного периода ===== */
  const { opening, period, closing } = useMemo(() => {
    const df = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dt = filters.dateTo ? new Date(filters.dateTo) : null;

    let openIg = 0, openEv = 0;
    let perIg = 0, perEv = 0;

    for (const m of movesAll) {
      if (!filters.includeBookingIncome && m.kind === "booking_income") continue;
      if (!filters.includeOwnerTx && m.kind === "owner_tx") continue;

      const d = new Date(m.date);
      const inside = (!df || d >= df) && (!dt || d <= dt);

      if (inside) {
        if (filters.side !== "all" && m.side !== filters.side) continue;
        if (filters.owner === "igor") perIg += m.igor;
        else if (filters.owner === "evgeniy") perEv += m.evgeniy;
        else { perIg += m.igor; perEv += m.evgeniy; }
      } else {
        if (df && d < df) { openIg += m.igor; openEv += m.evgeniy; }
      }
    }
    const closeIg = openIg + perIg;
    const closeEv = openEv + perEv;

    return {
      opening: { igor: +openIg.toFixed(2), evgeniy: +openEv.toFixed(2) },
      period: { igor: +perIg.toFixed(2), evgeniy: +perEv.toFixed(2) },
      closing: { igor: +closeIg.toFixed(2), evgeniy: +closeEv.toFixed(2) },
    };
  }, [movesAll, filters]);

  /** ===== общий текущий баланс (по всем датам) ===== */
  const currentTotals = useMemo(() => {
    let ig = 0, ev = 0;
    for (const m of movesAll) { ig += m.igor; ev += m.evgeniy; }
    return { igor: +ig.toFixed(2), evgeniy: +ev.toFixed(2), net: +(ig + ev).toFixed(2) };
  }, [movesAll]);

  /** ===== серии для графиков (по фильтру) ===== */
  const [gran, setGran] = useState<Granularity>("month");
  const series = useMemo(() => {
    const df = filters.dateFrom ? startOfDay(new Date(filters.dateFrom)) : null;
    const dt = filters.dateTo ? endOfDay(new Date(filters.dateTo)) : null;

    // подготовить «пустые» корзины
    const buckets = new Map<string, { date: Date; igor: number; evg: number }>();
    let seed = df ? new Date(df) : (movesAll.length ? new Date(movesAll[movesAll.length - 1].date) : new Date());
    seed = startOfDay(seed);
    const end = dt ? new Date(dt) : (movesAll.length ? new Date(movesAll[0].date) : new Date());
    const step = stepFor(gran);
    for (let d = new Date(seed); d <= end; d = addDays(d, step)) {
      buckets.set(labelFor(d, gran), { date: new Date(d), igor: 0, evg: 0 });
    }

    // разложить движения
    for (const m of movesAll) {
      if (!filters.includeBookingIncome && m.kind === "booking_income") continue;
      if (!filters.includeOwnerTx && m.kind === "owner_tx") continue;
      const d = new Date(m.date);
      if (df && d < df) continue;
      if (dt && d > dt) continue;
      if (filters.side !== "all" && m.side !== filters.side) continue;
      if (filters.owner === "igor" && Math.abs(m.igor) < 0.005) continue;
      if (filters.owner === "evgeniy" && Math.abs(m.evgeniy) < 0.005) continue;

      const key = labelFor(startOfDay(d), gran);
      const b = buckets.get(key) || { date: startOfDay(d), igor: 0, evg: 0 };
      b.igor += m.igor;
      b.evg  += m.evgeniy;
      buckets.set(key, b);
    }

    return Array.from(buckets.entries())
      .map(([label, v]) => ({ label, igor: +v.igor.toFixed(2), evg: +v.evg.toFixed(2), total: +(v.igor + v.evg).toFixed(2) }))
      .sort((a, b) => (a.label > b.label ? 1 : -1));
  }, [movesAll, filters, gran]);

  /** Кумулятив */
  const seriesCumulative = useMemo(() => {
    let sI = 0, sE = 0;
    return series.map(r => {
      sI += r.igor; sE += r.evg;
      return { label: r.label, igor: +sI.toFixed(2), evg: +sE.toFixed(2), total: +(sI + sE).toFixed(2) };
    });
  }, [series]);

  /** Разрез по операторам — только для доходов по заявкам в периоде */
  const topOperators = useMemo(() => {
    const df = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dt = filters.dateTo ? new Date(filters.dateTo) : null;
    const m = new Map<string, { igor: number; evg: number; total: number }>();
    for (const mv of ownerBookingIncomeMoves) {
      const d = new Date(mv.date);
      if (df && d < df) continue;
      if (dt && d > dt) continue;
      if (filters.side !== "all" && mv.side !== filters.side) continue;

      // найти оператор из заявки
      const b = bookings.find(x => x.id === mv.bookingId);
      const op = b?.operator || "—";
      const cur = m.get(op) || { igor: 0, evg: 0, total: 0 };
      cur.igor += mv.igor;
      cur.evg  += mv.evgeniy;
      cur.total += (mv.igor + mv.evgeniy);
      m.set(op, cur);
    }
    return Array.from(m.entries())
      .map(([operator, v]) => ({ operator, igor: +v.igor.toFixed(2), evg: +v.evg.toFixed(2), total: +v.total.toFixed(2) }))
      .sort((a,b)=> b.total - a.total)
      .slice(0, 15);
  }, [ownerBookingIncomeMoves, filters, bookings]);

  /** ===== UI ===== */
  const [view, setView] = useState<"stack" | "lines" | "cumulative" | "operators" | "table">("stack");

  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head><title>Отчёт по учредителям</title></Head>

      {/* Header + quick preset */}
      <div className="w-full py-6 px-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Отчёт по учредителям</h1>
            <div className="text-gray-500 text-sm">
              Источники: доход по заявкам (факт из ордеров) + прочие транзакции с ownerWho/выплатами
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <PresetBtn label="Этот месяц" onClick={() => setFilters(s=>({
              ...s, dateFrom: toLocalISO(startOfMonth()), dateTo: toLocalISO(endOfMonth())
            }))} />
            <PresetBtn label="Прошлый месяц" onClick={() => {
              const d = new Date(); d.setMonth(d.getMonth() - 1);
              setFilters(s=>({ ...s, dateFrom: toLocalISO(startOfMonth(d)), dateTo: toLocalISO(endOfMonth(d)) }));
            }} />
            <PresetBtn label="Эта неделя" onClick={() => setFilters(s=>({
              ...s, dateFrom: toLocalISO(startOfWeekISO()), dateTo: toLocalISO(endOfWeekISO())
            }))} />
            <PresetBtn label="Последние 30 дней" onClick={() => {
              const to = endOfDay(new Date());
              setFilters(s=>({ ...s, dateFrom: toLocalISO(addDays(to, -29)), dateTo: toLocalISO(to) }));
            }} />
          </div>
        </div>

        {/* Top balances now */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KPI
            title="Игорь — текущий баланс"
            value={money(currentTotals.igor)}
            icon={<User className="w-5 h-5" />}
            color={currentTotals.igor >= 0 ? "text-emerald-700" : "text-rose-700"}
          />
          <KPI
            title="Евгений — текущий баланс"
            value={money(currentTotals.evgeniy)}
            icon={<User className="w-5 h-5" />}
            color={currentTotals.evgeniy >= 0 ? "text-emerald-700" : "text-rose-700"}
          />
          <KPI
            title="Суммарно"
            value={money(currentTotals.net)}
            icon={<Users2 className="w-5 h-5" />}
            color={currentTotals.net >= 0 ? "text-emerald-700" : "text-rose-700"}
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-10 gap-2 p-3 border rounded-lg text-sm">
          <div className="md:col-span-2 inline-flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            <span>С</span>
            <input type="date" className="border rounded px-2 py-1 w-full"
                   value={filters.dateFrom} onChange={e=>setFilters(s=>({ ...s, dateFrom: e.target.value }))}/>
          </div>
          <div className="md:col-span-2 inline-flex items-center gap-2">
            <span>по</span>
            <input type="date" className="border rounded px-2 py-1 w-full"
                   value={filters.dateTo} onChange={e=>setFilters(s=>({ ...s, dateTo: e.target.value }))}/>
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Учредитель</div>
            <select className="border rounded px-2 py-1 w-full"
                    value={filters.owner} onChange={e=>setFilters(s=>({ ...s, owner: e.target.value as any }))}>
              <option value="all">Оба</option>
              <option value="igor">Игорь</option>
              <option value="evgeniy">Евгений</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Сторона</div>
            <select className="border rounded px-2 py-1 w-full"
                    value={filters.side} onChange={e=>setFilters(s=>({ ...s, side: e.target.value as any }))}>
              <option value="all">Все</option>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Поиск</div>
            <input className="border rounded px-2 py-1 w-full"
                   placeholder="заявка / счёт / категория / контрагент / заметка"
                   value={filters.search} onChange={e=>setFilters(s=>({ ...s, search: e.target.value }))}/>
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" className="accent-blue-600"
                     checked={filters.includeBookingIncome}
                     onChange={e=>setFilters(s=>({ ...s, includeBookingIncome: e.target.checked }))}/>
              <span className="text-xs">Доход по заявкам</span>
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" className="accent-blue-600"
                     checked={filters.includeOwnerTx}
                     onChange={e=>setFilters(s=>({ ...s, includeOwnerTx: e.target.checked }))}/>
              <span className="text-xs">Прочие транзакции</span>
            </label>
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">&nbsp;</div>
            <Button variant="outline" className="w-full"
                    onClick={()=>setFilters({ owner:"all", side:"all", dateFrom:"", dateTo:"", search:"", includeBookingIncome:true, includeOwnerTx:true })}>
              Сбросить
            </Button>
          </div>
        </div>

        {/* Period summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Panel title="Входящий баланс на начало" icon={<Info className="h-4 w-4" />}>
            <KV label="Игорь"   value={money(opening.igor)}   pos={opening.igor   >= 0} />
            <KV label="Евгений" value={money(opening.evgeniy)} pos={opening.evgeniy >= 0} />
          </Panel>
          <Panel title="Обороты за период" icon={<Info className="h-4 w-4" />}>
            <KV label="Игорь"   value={money(period.igor)}   pos={period.igor   >= 0} />
            <KV label="Евгений" value={money(period.evgeniy)} pos={period.evgeniy >= 0} />
          </Panel>
          <Panel title="Исходящий баланс на конец" icon={<Info className="h-4 w-4" />}>
            <KV label="Игорь"   value={money(closing.igor)}   pos={closing.igor   >= 0} />
            <KV label="Евгений" value={money(closing.evgeniy)} pos={closing.evgeniy >= 0} />
          </Panel>
        </div>

        {/* Charts */}
        <div className="inline-flex rounded-xl border bg-white overflow-hidden">
          <SubTabBtn active={view==="stack"} onClick={()=>setView("stack")} icon={<BarIcon className="w-4 h-4" />}>Столбцы (стек)</SubTabBtn>
          <SubTabBtn active={view==="lines"} onClick={()=>setView("lines")} icon={<LineIcon className="w-4 h-4" />}>Линии</SubTabBtn>
          <SubTabBtn active={view==="cumulative"} onClick={()=>setView("cumulative")} icon={<Sigma className="w-4 h-4" />}>Кумулятив</SubTabBtn>
          <SubTabBtn active={view==="operators"} onClick={()=>setView("operators")} icon={<Building2 className="w-4 h-4" />}>Операторы</SubTabBtn>
          <SubTabBtn active={view==="table"} onClick={()=>setView("table")} icon={<List className="w-4 h-4" />}>Таблица</SubTabBtn>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="inline-flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4" />
            <select className="border rounded px-2 py-1" value={gran} onChange={(e)=>setGran(e.target.value as Granularity)}>
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
            </select>
          </div>
        </div>

        {view === "stack" && (
          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm text-gray-600 mb-2">Распределение по периодам</div>
            <div className="w-full h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(v: any, name: any) => [money(v as number), name]} />
                  <Legend />
                  <Bar dataKey="igor" name="Игорь" stackId="f" fill={C_IGOR} />
                  <Bar dataKey="evg"  name="Евгений" stackId="f" fill={C_EVG} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {view === "lines" && (
          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm text-gray-600 mb-2">Динамика</div>
            <div className="w-full h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(v: any, name: any) => [money(v as number), name]} />
                  <Legend />
                  <Line type="monotone" dataKey="igor" name="Игорь" stroke={C_IGOR} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="evg"  name="Евгений" stroke={C_EVG} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {view === "cumulative" && (
          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm text-gray-600 mb-2">Кумулятивные суммы</div>
            <div className="w-full h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={seriesCumulative}>
                  <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(v: any, name: any) => [money(v as number), name]} />
                  <Legend />
                  <Area type="monotone" dataKey="igor"  name="Игорь"   stroke={C_IGOR} fill={C_IGOR+"22"} />
                  <Area type="monotone" dataKey="evg"   name="Евгений" stroke={C_EVG}  fill={C_EVG+"22"} />
                  <Area type="monotone" dataKey="total" name="Всего"   stroke={C_TOT}  fill={C_TOT+"22"} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {view === "operators" && (
          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm text-gray-600 mb-2">Операторы — доходы учредителей (по факту заявок)</div>
            <div className="w-full h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topOperators}>
                  <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="operator" interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip formatter={(v: any, name: any) => [money(v as number), name]} />
                  <Legend />
                  <Bar dataKey="igor"  name="Игорь"   fill={C_IGOR} />
                  <Bar dataKey="evg"   name="Евгений" fill={C_EVG} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Table */}
        {view === "table" && (
          <div className="rounded-xl border bg-white overflow-x-auto">
            <div className="p-4 border-b font-semibold">Движения за период</div>
            <table className="w-full min-w-[1300px] text-sm">
              <thead className="bg-gray-100 text-center">
                <tr>
                  <th className="border px-2 py-1">Дата</th>
                  <th className="border px-2 py-1">Источник</th>
                  <th className="border px-2 py-1">Тип</th>
                  <th className="border px-2 py-1">EUR событие</th>
                  <th className="border px-2 py-1">Δ Игорь</th>
                  <th className="border px-2 py-1">Δ Евгений</th>
                  <th className="border px-2 py-1">Счёт</th>
                  <th className="border px-2 py-1">Категория</th>
                  <th className="border px-2 py-1">Контрагент</th>
                  <th className="border px-2 py-1 w-[420px]">Заметка</th>
                  <th className="border px-2 py-1">Ссылка</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(m => (
                  <tr key={`${m.kind}-${m.txId || m.bookingId}-${m.date}`} className="text-center align-top">
                    <td className="border px-2 py-1 whitespace-nowrap">{fmtDMY(m.date)}</td>
                    <td className="border px-2 py-1">
                      {m.kind === "booking_income" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                          <Briefcase className="h-4 w-4" /> Заявка
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 text-slate-700">
                          <FileText className="h-4 w-4" /> Транзакция
                        </span>
                      )}
                    </td>
                    <td className="border px-2 py-1">
                      {m.side === "income"
                        ? <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Доход</span>
                        : <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700">Расход</span>}
                    </td>
                    <td className="border px-2 py-1 text-right whitespace-nowrap">{money(m.baseAmount)}</td>
                    <td className={`border px-2 py-1 text-right whitespace-nowrap ${m.igor >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {Math.abs(m.igor) < 0.005 ? "—" : money(m.igor)}
                    </td>
                    <td className={`border px-2 py-1 text-right whitespace-nowrap ${m.evgeniy >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {Math.abs(m.evgeniy) < 0.005 ? "—" : money(m.evgeniy)}
                    </td>
                    <td className="border px-2 py-1">{m.accountName || "—"}</td>
                    <td className="border px-2 py-1">{m.categoryName || "—"}</td>
                    <td className="border px-2 py-1">{m.counterpartyName || "—"}</td>
                    <td className="border px-2 py-1 text-left"
                        style={{ maxWidth: 420, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}>
                      {m.note || (m.kind === "booking_income" ? `Доход по заявке ${m.bookingNumber || m.bookingId}` : "—")}
                    </td>
                    <td className="border px-2 py-1">
                      {m.kind === "booking_income" && m.bookingId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => router.push(`/finance/booking/${m.bookingId}`)}
                          title="Открыть заявку"
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Заявка
                        </Button>
                      ) : m.txId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => router.push(`/finance/transactions?highlight=${m.txId}`)}
                          title="Открыть транзакцию"
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Транзакция
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={11} className="px-2 py-6 text-center text-gray-500">Нет движений</td></tr>
                )}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td className="border px-2 py-1 text-right" colSpan={4}>Итого за период · Игорь:</td>
                  <td className="border px-2 py-1 text-right">{money(period.igor)}</td>
                  <td className="border px-2 py-1" colSpan={6}></td>
                </tr>
                <tr>
                  <td className="border px-2 py-1 text-right" colSpan={4}>Итого за период · Евгений:</td>
                  <td className="border px-2 py-1 text-right">{money(period.evgeniy)}</td>
                  <td className="border px-2 py-1" colSpan={6}></td>
                </tr>
                <tr>
                  <td className="border px-2 py-1 text-right" colSpan={4}>Исходящий баланс · Игорь:</td>
                  <td className="border px-2 py-1 text-right">{money(closing.igor)}</td>
                  <td className="border px-2 py-1" colSpan={6}></td>
                </tr>
                <tr>
                  <td className="border px-2 py-1 text-right" colSpan={4}>Исходящий баланс · Евгений:</td>
                  <td className="border px-2 py-1 text-right">{money(closing.evgeniy)}</td>
                  <td className="border px-2 py-1" colSpan={6}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}

/** ================= small UI bits ================= */
function KPI({ title, value, icon, color = "text-gray-800" }: { title: string; value: string; icon?: React.ReactNode; color?: string }) {
  return (
    <div className="p-4 rounded-xl border bg-white flex items-start justify-between">
      <div>
        <div className="text-xs text-gray-600">{title}</div>
        <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
      </div>
      <div className="opacity-60">{icon}</div>
    </div>
  );
}
function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded border bg-white">
      <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
        {icon} <span>{title}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function KV({ label, value, pos }: { label: string; value: string; pos?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={`font-semibold ${pos ? "text-emerald-700" : "text-rose-700"}`}>{value}</span>
    </div>
  );
}
function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50">{label}</button>;
}
function SubTabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm inline-flex items-center gap-2 ${
        active ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
      } border-r last:border-r-0`}
    >
      {icon}
      {children}
    </button>
  );
}