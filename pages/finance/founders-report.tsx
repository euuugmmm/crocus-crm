/* pages/finance/founders-report.tsx */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

import {
  Users2,
  User,
  ExternalLink,
  Info,
  FileText,
  Briefcase,
  CalendarDays,
  Filter,
  LineChart as LineIcon,
  BarChart as BarIcon,
  Sigma,
  Building2,
  List,
  RotateCcw,
  Clock,
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

/** Bucketing */
type Granularity = "day" | "week" | "month";
const startOfWeekISO = (d = new Date()) => {
  const nd = new Date(d);
  const day = (nd.getDay() + 6) % 7; // 0=Mon
  nd.setDate(nd.getDate() - day);
  nd.setHours(0, 0, 0, 0);
  return nd;
};
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfQuarter = (d = new Date()) => {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
};
const endOfQuarter = (d = new Date()) => {
  const q = Math.floor(d.getMonth() / 3) * 3 + 2;
  return new Date(d.getFullYear(), q + 1, 0, 23, 59, 59, 999);
};
const startOfYear = (d = new Date()) => new Date(d.getFullYear(), 0, 1);
const endOfYear = (d = new Date()) => new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);

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
type Filters = {
  owner: "all" | "igor" | "evgeniy";
  side: "all" | "income" | "expense";
  dateFrom: string;
  dateTo: string;
  search: string;
  includeBookingIncome: boolean;
  includeOwnerTx: boolean;
  /** статус заявок: all — любые, completed — только завершённые (completion=1) */
  bookingStatus: "all" | "completed";
};

type OwnerMove = {
  kind: "booking_income" | "owner_tx";
  date: string;
  side: "income" | "expense";
  baseAmount: number;   // «величина события» для справки
  igor: number;         // движение по балансу Игоря (+/−)
  evgeniy: number;      // движение по балансу Евгения (+/−)

  bookingId?: string;
  bookingNumber?: string;
  txId?: string;

  /** Для диаграммы «Операторы» и фильтров — пришло из кэша */
  operator?: string | null;
  completion?: number; // 0..1

  accountName?: string;
  categoryName?: string | null;
  counterpartyName?: string | null;
  note?: string | null;
};

/** Куда кладём кэш */
const CACHE_DOC_REF = doc(db, "finance_foundersCache", "summary");

/** ================= page ================= */
export default function FoundersReportPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  // избегаем гидрации с разным языком/лейаутом — НО не делаем ранний return
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // кэш
  const [cachedMoves, setCachedMoves] = useState<OwnerMove[]>([]);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [cacheRefreshing, setCacheRefreshing] = useState(false);

  // доступ
  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canView) { router.replace("/agent/bookings"); return; }
  }, [user, canView, router]);

  /** Загрузка кэша один раз */
  const loadCacheOnce = async () => {
    const snap = await getDoc(CACHE_DOC_REF);
    if (snap.exists()) {
      const d: any = snap.data();
      setCachedMoves(Array.isArray(d.moves) ? d.moves : []);
      setCacheUpdatedAt(d.updatedAt?.toDate ? toLocalISO(d.updatedAt.toDate()) : null);
    } else {
      setCachedMoves([]);
      setCacheUpdatedAt(null);
    }
  };

  /** На маунте — читаем кэш */
  useEffect(() => {
    if (!user || !canView) return;
    (async () => {
      try {
        setCacheLoading(true);
        await loadCacheOnce();
      } finally {
        setCacheLoading(false);
      }
    })();
  }, [user, canView]);

  /** Кнопка: обновить кэш на сервере и перечитать */
  const refreshCache = async () => {
    try {
      setCacheRefreshing(true);
      const r = await fetch("/api/finance/founders-cache/rebuild", { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      await loadCacheOnce();
      alert("Кэш обновлён");
    } catch (e) {
      console.error("[FoundersReport] refresh cache failed:", e);
      alert("Не удалось обновить кэш. См. консоль.");
    } finally {
      setCacheRefreshing(false);
    }
  };

  /** Вся лента движений — только из кэша */
  const movesAll: OwnerMove[] = useMemo(
    () => [...cachedMoves].sort((a,b)=> (a.date < b.date ? 1 : -1)),
    [cachedMoves]
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
    bookingStatus: "all",
  });

  /** пресеты периодов */
  type PeriodPreset =
    | "custom"
    | "last7" | "last30" | "last90"
    | "mtd" | "ytd"
    | "thisMonth" | "prevMonth"
    | "thisQuarter" | "prevQuarter"
    | "thisYear" | "prevYear"
    | "all";

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("custom");

  const applyPreset = (p: PeriodPreset) => {
    const today = new Date();
    let from: Date | null = null;
    let to: Date | null = null;

    switch (p) {
      case "last7":   from = addDays(today, -6);  to = today; break;
      case "last30":  from = addDays(today, -29); to = today; break;
      case "last90":  from = addDays(today, -89); to = today; break;

      case "mtd":     from = startOfMonth(today); to = today; break;
      case "ytd":     from = startOfYear(today);  to = today; break;

      case "thisMonth":   from = startOfMonth(today); to = endOfMonth(today); break;
      case "prevMonth": {
        const d = new Date(today.getFullYear(), today.getMonth() - 1, 15);
        from = startOfMonth(d); to = endOfMonth(d); break;
      }

      case "thisQuarter": from = startOfQuarter(today); to = endOfQuarter(today); break;
      case "prevQuarter": {
        const d = new Date(today.getFullYear(), today.getMonth() - 3, 15);
        from = startOfQuarter(d); to = endOfQuarter(d); break;
      }

      case "thisYear": from = startOfYear(today); to = endOfYear(today); break;
      case "prevYear": {
        const d = new Date(today.getFullYear() - 1, 6, 1);
        from = startOfYear(d); to = endOfYear(d); break;
      }

      case "all":
        setFilters(s => ({ ...s, dateFrom: "", dateTo: "" }));
        setPeriodPreset(p);
        return;

      default:
        setPeriodPreset("custom");
        return;
    }

    setFilters(s => ({
      ...s,
      dateFrom: toLocalISO(startOfDay(from!)),
      dateTo: toLocalISO(startOfDay(to!)),
    }));
    setPeriodPreset(p);
  };

  const filteredRows = useMemo(() => {
    const df = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dt = filters.dateTo ? new Date(filters.dateTo) : null;
    const q = filters.search.trim().toLowerCase();

    return movesAll.filter((m) => {
      if (!filters.includeBookingIncome && m.kind === "booking_income") return false;
      if (!filters.includeOwnerTx && m.kind === "owner_tx") return false;

      // фильтр по статусу заявки (только для booking_income)
      if (m.kind === "booking_income" && filters.bookingStatus === "completed") {
        const c = Number((m as any).completion ?? 0);
        if (!(c >= 0.999)) return false;
      }

      const d = new Date(m.date);
      if (df && d < df) return false;
      if (dt && d > dt) return false;
      if (filters.side !== "all" && m.side !== filters.side) return false;
      if (filters.owner === "igor" && Math.abs(m.igor) < 0.005) return false;
      if (filters.owner === "evgeniy" && Math.abs(m.evgeniy) < 0.005) return false;
      if (q) {
        const hay = [
          m.kind === "booking_income" ? `Заявка ${m.bookingNumber || m.bookingId || ""}` : "",
          (m as any).operator || "",
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

      // статус «только завершённые» влияет только на обороты периода
      if (m.kind === "booking_income" && filters.bookingStatus === "completed") {
        const c = Number((m as any).completion ?? 0);
        if (!(c >= 0.999)) continue;
      }

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
    for (const m of filteredRows) {
      const d = new Date(m.date);
      const key = labelFor(startOfDay(d), gran);
      const b = buckets.get(key) || { date: startOfDay(d), igor: 0, evg: 0 };
      b.igor += m.igor;
      b.evg  += m.evgeniy;
      buckets.set(key, b);
    }

    return Array.from(buckets.entries())
      .map(([label, v]) => ({ label, igor: +v.igor.toFixed(2), evg: +v.evg.toFixed(2), total: +(v.igor + v.evg).toFixed(2) }))
      .sort((a, b) => (a.label > b.label ? 1 : -1));
  }, [movesAll, filteredRows, gran]);

  /** Кумулятив */
  const seriesCumulative = useMemo(() => {
    let sI = 0, sE = 0;
    return series.map(r => {
      sI += r.igor; sE += r.evg;
      return { label: r.label, igor: +sI.toFixed(2), evg: +sE.toFixed(2), total: +(sI + sE).toFixed(2) };
    });
  }, [series]);

  /** Разрез по операторам — только по кэшу (booking_income.operator) */
  const topOperators = useMemo(() => {
    const m = new Map<string, { igor: number; evg: number; total: number }>();
    for (const mv of filteredRows) {
      if (mv.kind !== "booking_income") continue;
      const op = (mv as any).operator || "—";
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
  }, [filteredRows]);

  /** ===== UI ===== */
  // по умолчанию — вкладка «Таблица»
  const [view, setView] = useState<"stack" | "lines" | "cumulative" | "operators" | "table">("table");

  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head><title>Отчёт по учредителям</title></Head>

      {/* простой плейсхолдер до монтажа, без раннего return */}
      {!mounted ? (
        <div className="w-full py-12 text-center text-gray-500">Загрузка…</div>
      ) : (
        <div className="w-full py-6 px-4 space-y-4">
          {/* Header + cache controls */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Отчёт по учредителям</h1>
              <div className="text-gray-500 text-sm">
                Источники: доход по заявкам (факт из ордеров) + прочие транзакции с ownerWho/выплатами (из кэша)
              </div>
              <div className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {cacheLoading ? "Кэш: загрузка…" : `Кэш от ${cacheUpdatedAt ? fmtDMY(cacheUpdatedAt) : "—"}`}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={refreshCache} disabled={cacheRefreshing} className="inline-flex items-center gap-2">
                <RotateCcw className={`w-4 h-4 ${cacheRefreshing ? "animate-spin" : ""}`} />
                {cacheRefreshing ? "Обновляю кэш…" : "Обновить кэш"}
              </Button>
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
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 border rounded-lg text-sm">
            <div className="md:col-span-3 inline-flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              <span>С</span>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={filters.dateFrom}
                onChange={e=>{ setFilters(s=>({ ...s, dateFrom: e.target.value })); setPeriodPreset("custom"); }}
              />
            </div>
            <div className="md:col-span-3 inline-flex items-center gap-2">
              <span>по</span>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={filters.dateTo}
                onChange={e=>{ setFilters(s=>({ ...s, dateTo: e.target.value })); setPeriodPreset("custom"); }}
              />
            </div>

            {/* Presets */}
            <div className="md:col-span-3 inline-flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <select
                className="border rounded px-2 py-1 w-full"
                value={periodPreset}
                onChange={(e)=>applyPreset(e.target.value as any)}
              >
                <option value="custom">Период: вручную</option>
                <option value="last7">Последние 7 дней</option>
                <option value="last30">Последние 30 дней</option>
                <option value="last90">Последние 90 дней</option>
                <option value="mtd">С начала месяца (MTD)</option>
                <option value="ytd">С начала года (YTD)</option>
                <option value="thisMonth">Текущий месяц</option>
                <option value="prevMonth">Прошлый месяц</option>
                <option value="thisQuarter">Текущий квартал</option>
                <option value="prevQuarter">Прошлый квартал</option>
                <option value="thisYear">Текущий год</option>
                <option value="prevYear">Прошлый год</option>
                <option value="all">За всё время</option>
              </select>
            </div>

            <div>
              <div className="text-xs text-gray-600 mb-1">Учредитель</div>
              <select
                className="border rounded px-2 py-1 w-full"
                value={filters.owner}
                onChange={e=>setFilters(s=>({ ...s, owner: e.target.value as any }))}
              >
                <option value="all">Оба</option>
                <option value="igor">Игорь</option>
                <option value="evgeniy">Евгений</option>
              </select>
            </div>

            <div>
              <div className="text-xs text-gray-600 mb-1">Сторона</div>
              <select
                className="border rounded px-2 py-1 w-full"
                value={filters.side}
                onChange={e=>setFilters(s=>({ ...s, side: e.target.value as any }))}
              >
                <option value="all">Все</option>
                <option value="income">Доход</option>
                <option value="expense">Расход</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-gray-600 mb-1">Поиск</div>
              <input
                className="border rounded px-2 py-1 w-full"
                placeholder="заявка / оператор / счёт / категория / контрагент / заметка"
                value={filters.search}
                onChange={e=>setFilters(s=>({ ...s, search: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-gray-600 mb-1">Статус заявок</div>
              <select
                className="border rounded px-2 py-1 w-full"
                value={filters.bookingStatus}
                onChange={e=>setFilters(s=>({ ...s, bookingStatus: e.target.value as any }))}
              >
                <option value="all">Все статусы</option>
                <option value="completed">Только завершённые</option>
              </select>
            </div>

            <div className="md:col-span-3 flex items-center gap-3">
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={filters.includeBookingIncome}
                  onChange={e=>setFilters(s=>({ ...s, includeBookingIncome: e.target.checked }))}
                />
                <span className="text-xs">Доход по заявкам</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={filters.includeOwnerTx}
                  onChange={e=>setFilters(s=>({ ...s, includeOwnerTx: e.target.checked }))}
                />
                <span className="text-xs">Прочие транзакции</span>
              </label>
            </div>

            <div>
              <div className="text-xs text-gray-600 mb-1">&nbsp;</div>
              <Button
                variant="outline"
                className="w-full"
                onClick={()=>{
                  setFilters({
                    owner:"all", side:"all", dateFrom:"", dateTo:"", search:"",
                    includeBookingIncome:true, includeOwnerTx:true, bookingStatus:"all"
                  });
                  setPeriodPreset("custom");
                }}
              >
                Сбросить
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="inline-flex rounded-xl border bg-white overflow-hidden">
            <SubTabBtn active={view==="stack"} onClick={()=>setView("stack")} icon={<BarIcon className="w-4 h-4" />}>Столбцы (стек)</SubTabBtn>
            <SubTabBtn active={view==="lines"} onClick={()=>setView("lines")} icon={<LineIcon className="w-4 h-4" />}>Линии</SubTabBtn>
            <SubTabBtn active={view==="cumulative"} onClick={()=>setView("cumulative")} icon={<Sigma className="w-4 h-4" />}>Кумулятив</SubTabBtn>
            <SubTabBtn active={view==="operators"} onClick={()=>setView("operators")} icon={<Building2 className="w-4 h-4" />}>Операторы</SubTabBtn>
            <SubTabBtn active={view==="table"} onClick={()=>setView("table")} icon={<List className="w-4 h-4" />}>Таблица</SubTabBtn>
          </div>

          {/* Гранулярность для графиков */}
          {(view === "stack" || view === "lines" || view === "cumulative") && (
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
          )}

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
                    <Area type="monotone" dataKey="evg"   name="Евгений" fill={C_EVG+"22"} />
                    <Area type="monotone" dataKey="total" name="Всего"   stroke={C_TOT}  fill={C_TOT+"22"} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {view === "operators" && (
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm text-gray-600 mb-2">Операторы — доходы учредителей (по факту заявок, кэш)</div>
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
                      <td
                        className="border px-2 py-1 text-left"
                        style={{ maxWidth: 420, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}
                      >
                        {m.note || (m.kind === "booking_income"
                          ? `Доход по заявке ${m.bookingNumber || m.bookingId}${(m as any).operator ? ` · ${(m as any).operator}` : ""}${(m as any).completion!=null ? ` · ${(Math.round(((m as any).completion || 0)*100))}%` : ""}`
                          : "—")}
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
      )}
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