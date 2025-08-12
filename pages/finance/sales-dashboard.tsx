/* pages/finance/sales-dashboard.tsx */
"use client";

import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { db } from "@/firebaseConfig";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  BarChart3,
  Filter,
  Gauge,
  Layers,
  Users2,
  Table2,
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

/** -------- Types -------- */
type BookingDoc = {
  id: string;
  bookingNumber?: string;
  operator?: string;
  agentName?: string;
  region?: string;
  hotel?: string;

  createdAt?: any;      // Firestore Timestamp | ISO | Date
  checkIn?: any;        // "DD.MM.YYYY" | Timestamp | Date

  clientPrice?: number;
  bruttoClient?: number;

  crocusProfit?: number;

  commissionIgor?: number;
  commissionEvgeniy?: number;

  bookingType?: string;
  baseType?: string;
  status?: string;
};

/** -------- Date helpers -------- */
const toLocalISODate = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10); // YYYY-MM-DD
};
const parseMaybeTimestamp = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) {
    try { return v.toDate() as Date; } catch {}
  }
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return isNaN(+dt) ? null : dt;
    }
    const dt = new Date(v);
    return isNaN(+dt) ? null : dt;
  }
  return null;
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, days: number) => {
  const nd = new Date(d);
  nd.setDate(d.getDate() + days);
  return nd;
};
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfWeekISO = (d = new Date()) => {
  const nd = new Date(d);
  const day = (nd.getDay() + 6) % 7; // 0=Mon
  nd.setDate(nd.getDate() - day);
  nd.setHours(0, 0, 0, 0);
  return nd;
};
const endOfWeekISO = (d = new Date()) => addDays(endOfDay(startOfWeekISO(d)), 6);

const formatDMY = (d: Date | null | undefined) => {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

/** -------- Money/helpers -------- */
const money = (n: number) =>
  `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const bookingGross = (b: BookingDoc) => toNum(b.clientPrice ?? b.bruttoClient ?? 0);

/** -------- Grouping helpers -------- */
type Granularity = "day" | "week" | "month";
type DateBasis = "createdAt" | "checkIn";
type TabKey = "sales" | "founders" | "operators";

const labelFor = (d: Date, g: Granularity) => {
  if (g === "day") return formatDMY(d);
  if (g === "week") {
    const tmp = new Date(d);
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    const diff =
      (startOfWeekISO(tmp).getTime() - startOfWeekISO(yearStart).getTime()) /
      (1000 * 3600 * 24);
    const week = Math.floor(diff / 7) + 1;
    return `${tmp.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
};
const stepFor = (g: Granularity) => (g === "day" ? 1 : g === "week" ? 7 : 30);

/** -------- Palette (понятные цвета) -------- */
const C_IGOR = "#2563eb";       // blue-600
const C_EVG = "#f59e0b";        // amber-500
const C_TOTAL = "#059669";      // emerald-600
const C_GRID = "#e5e7eb";       // gray-200

export default function SalesDashboard() {
  const [tab, setTab] = useState<TabKey>("sales");
  const [allBookings, setAllBookings] = useState<BookingDoc[]>([]);
  const [basis, setBasis] = useState<DateBasis>("createdAt");
  const [gran, setGran] = useState<Granularity>("day");

  const [range, setRange] = useState<{ from: Date; to: Date }>(() => {
    const from = startOfMonth();
    const to = endOfMonth();
    return { from, to };
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as BookingDoc[];
      setAllBookings(list);
    });
    return () => unsub();
  }, []);

  const inRange = useMemo(() => {
    const f = range.from.getTime();
    const t = range.to.getTime();
    return allBookings
      .map((b) => {
        const date =
          basis === "createdAt" ? parseMaybeTimestamp(b.createdAt) : parseMaybeTimestamp(b.checkIn);
        return { ...b, __date: date || null } as BookingDoc & { __date: Date | null };
      })
      .filter((b) => b.__date && b.__date.getTime() >= f && b.__date.getTime() <= t);
  }, [allBookings, range, basis]);

  const prevRange = useMemo(() => {
    const days =
      Math.max(
        1,
        Math.ceil(
          (endOfDay(range.to).getTime() - startOfDay(range.from).getTime()) / (1000 * 3600 * 24)
        ) + 1
      );
    const to = addDays(startOfDay(range.from), -1);
    const from = addDays(to, -(days - 1));
    return { from, to };
  }, [range]);

  const inPrevRange = useMemo(() => {
    const f = prevRange.from.getTime();
    const t = prevRange.to.getTime();
    return allBookings
      .map((b) => {
        const date =
          basis === "createdAt" ? parseMaybeTimestamp(b.createdAt) : parseMaybeTimestamp(b.checkIn);
        return { ...b, __date: date || null } as BookingDoc & { __date: Date | null };
      })
      .filter((b) => b.__date && b.__date.getTime() >= f && b.__date.getTime() <= t);
  }, [allBookings, prevRange, basis]);

  /** KPI — продажи */
  const kpi = useMemo(() => {
    const sum = inRange.reduce((s, b) => s + bookingGross(b), 0);
    const cnt = inRange.length;
    const avg = cnt ? sum / cnt : 0;

    const sumPrev = inPrevRange.reduce((s, b) => s + bookingGross(b), 0);
    const cntPrev = inPrevRange.length;

    const deltaSum = sumPrev ? ((sum - sumPrev) / sumPrev) * 100 : sum > 0 ? 100 : 0;
    const deltaCnt = cntPrev ? ((cnt - cntPrev) / cntPrev) * 100 : cnt > 0 ? 100 : 0;

    return {
      sum: +sum.toFixed(2),
      cnt,
      avg: +avg.toFixed(2),
      prev: { sum: +sumPrev.toFixed(2), cnt: cntPrev },
      delta: { sum: +deltaSum.toFixed(1), cnt: +deltaCnt.toFixed(1) },
    };
  }, [inRange, inPrevRange]);

  /** Серия — продажи */
  const seriesSales = useMemo(() => {
    const buckets = new Map<string, { date: Date; gross: number; count: number }>();
    const seed = new Date(startOfDay(range.from));
    const step = stepFor(gran);
    for (let d = new Date(seed); d <= range.to; d = addDays(d, step)) {
      const key = labelFor(d, gran);
      buckets.set(key, { date: new Date(d), gross: 0, count: 0 });
    }
    for (const b of inRange) {
      const d = (b as any).__date as Date;
      const key = labelFor(d, gran);
      if (!buckets.has(key)) buckets.set(key, { date: startOfDay(d), gross: 0, count: 0 });
      const v = buckets.get(key)!;
      v.gross += bookingGross(b);
      v.count += 1;
    }
    return Array.from(buckets.entries())
      .map(([label, v]) => ({ label, gross: +v.gross.toFixed(2), count: v.count }))
      .sort((a, b) => (a.label > b.label ? 1 : -1));
  }, [inRange, range, gran]);

  /** ---------- Учредители: KPI ---------- */
  const foundersKPI = useMemo(() => {
    const cur = inRange.reduce(
      (acc, b) => {
        acc.igor += toNum((b as any).commissionIgor);
        acc.evg += toNum((b as any).commissionEvgeniy);
        return acc;
      },
      { igor: 0, evg: 0 }
    );
    const prev = inPrevRange.reduce(
      (acc, b) => {
        acc.igor += toNum((b as any).commissionIgor);
        acc.evg += toNum((b as any).commissionEvgeniy);
        return acc;
      },
      { igor: 0, evg: 0 }
    );

    const delta = {
      igor: prev.igor ? ((cur.igor - prev.igor) / prev.igor) * 100 : cur.igor > 0 ? 100 : 0,
      evg: prev.evg ? ((cur.evg - prev.evg) / prev.evg) * 100 : cur.evg > 0 ? 100 : 0,
    };

    return {
      cur: { igor: +cur.igor.toFixed(2), evg: +cur.evg.toFixed(2) },
      prev: { igor: +prev.igor.toFixed(2), evg: +prev.evg.toFixed(2) },
      delta: { igor: +delta.igor.toFixed(1), evg: +delta.evg.toFixed(1) },
    };
  }, [inRange, inPrevRange]);

  /** ---------- Учредители: серии по периодам ---------- */
  const foundersSeries = useMemo(() => {
    const buckets = new Map<string, { date: Date; igor: number; evg: number }>();
    const seed = new Date(startOfDay(range.from));
    const step = stepFor(gran);
    for (let d = new Date(seed); d <= range.to; d = addDays(d, step)) {
      const key = labelFor(d, gran);
      buckets.set(key, { date: new Date(d), igor: 0, evg: 0 });
    }
    for (const b of inRange) {
      const d = (b as any).__date as Date;
      const key = labelFor(d, gran);
      if (!buckets.has(key)) buckets.set(key, { date: startOfDay(d), igor: 0, evg: 0 });
      const v = buckets.get(key)!;
      v.igor += toNum((b as any).commissionIgor);
      v.evg += toNum((b as any).commissionEvgeniy);
    }
    return Array.from(buckets.entries())
      .map(([label, v]) => ({
        label,
        igor: +v.igor.toFixed(2),
        evg: +v.evg.toFixed(2),
        total: +(v.igor + v.evg).toFixed(2),
      }))
      .sort((a, b) => (a.label > b.label ? 1 : -1));
  }, [inRange, range, gran]);

  /** Кумулятив по учредителям */
  const foundersCumulative = useMemo(() => {
    let sIgor = 0, sEvg = 0;
    return foundersSeries.map((r) => {
      sIgor += r.igor;
      sEvg += r.evg;
      return { label: r.label, igor: +sIgor.toFixed(2), evg: +sEvg.toFixed(2), total: +(sIgor + sEvg).toFixed(2) };
    });
  }, [foundersSeries]);

  /** Разрез по операторам для учредителей */
  const foundersByOperator = useMemo(() => {
    const m = new Map<string, { igor: number; evg: number; total: number }>();
    for (const b of inRange) {
      const op = b.operator || "—";
      const cur = m.get(op) || { igor: 0, evg: 0, total: 0 };
      const i = toNum((b as any).commissionIgor);
      const e = toNum((b as any).commissionEvgeniy);
      cur.igor += i; cur.evg += e; cur.total += (i + e);
      m.set(op, cur);
    }
    return Array.from(m.entries())
      .map(([operator, v]) => ({ operator, igor: +v.igor.toFixed(2), evg: +v.evg.toFixed(2), total: +v.total.toFixed(2) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [inRange]);

  /** Топ операторов (по продажам) */
  const topByOperatorSales = useMemo(() => {
    const m = new Map<string, { gross: number; count: number }>();
    for (const b of inRange) {
      const key = b.operator || "—";
      const cur = m.get(key) || { gross: 0, count: 0 };
      cur.gross += bookingGross(b);
      cur.count += 1;
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .map(([op, v]) => ({ operator: op, gross: +v.gross.toFixed(2), count: v.count }))
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 12);
  }, [inRange]);

  /** --- UI --- */
  const [foundersView, setFoundersView] = useState<"stack" | "lines" | "cumulative" | "operators" | "table">("stack");

  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head><title>Отчёт по продажам</title></Head>

      {/* HEADER + FILTERS */}
      <div className="w-full py-6 px-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Отчёт по продажам</h1>
            <div className="text-gray-500 text-sm">
              Диапазон: <b>{formatDMY(range.from)}</b> — <b>{formatDMY(range.to)}</b> · Основа даты:{" "}
              <b>{basis === "createdAt" ? "создание" : "заезд (check-in)"}</b>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <PresetButton label="Этот месяц" onClick={() => setRange({ from: startOfMonth(), to: endOfMonth() })} />
            <PresetButton label="Прошлый месяц" onClick={() => {
              const d = new Date(); d.setMonth(d.getMonth() - 1);
              setRange({ from: startOfMonth(d), to: endOfMonth(d) });
            }} />
            <PresetButton label="Эта неделя" onClick={() => setRange({ from: startOfWeekISO(), to: endOfWeekISO() })} />
            <PresetButton label="Последние 30 дней" onClick={() => setRange({ from: addDays(new Date(), -29), to: endOfDay(new Date()) })} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="inline-flex items-center gap-2 text-sm">
            <CalendarDays className="w-4 h-4" />
            <span>С</span>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={toLocalISODate(range.from)}
              onChange={(e) => setRange((r) => ({ ...r, from: startOfDay(new Date(e.target.value)) }))}
            />
            <span>по</span>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={toLocalISODate(range.to)}
              onChange={(e) => setRange((r) => ({ ...r, to: endOfDay(new Date(e.target.value)) }))}
            />
          </div>

          <div className="inline-flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4" />
            <select className="border rounded px-2 py-1" value={basis} onChange={(e) => setBasis(e.target.value as DateBasis)}>
              <option value="createdAt">По дате создания</option>
              <option value="checkIn">По дате заезда (check-in)</option>
            </select>
            <select className="border rounded px-2 py-1" value={gran} onChange={(e) => setGran(e.target.value as Granularity)}>
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="px-4">
        <div className="inline-flex rounded-xl border bg-white overflow-hidden">
          <TabBtn active={tab==="sales"} onClick={()=>setTab("sales")} icon={<BarChart3 className="w-4 h-4" />}>Продажи</TabBtn>
          <TabBtn active={tab==="founders"} onClick={()=>setTab("founders")} icon={<Users2 className="w-4 h-4" />}>Учредители</TabBtn>
          <TabBtn active={tab==="operators"} onClick={()=>setTab("operators")} icon={<Table2 className="w-4 h-4" />}>Операторы</TabBtn>
        </div>
      </div>

      {/* TAB: ПРОДАЖИ */}
      {tab === "sales" && (
        <>
          <div className="w-full px-4 grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <KPI
              title="Продажи (брутто)"
              value={money(kpi.sum)}
              compare={kpi.prev.sum ? `${kpi.delta.sum > 0 ? "+" : ""}${kpi.delta.sum}% к пред. периоду` : "нет данных для сравнения"}
              trend={kpi.delta.sum}
              icon={<BarChart3 className="w-5 h-5" />}
            />
            <KPI
              title="Количество заявок"
              value={kpi.cnt.toString()}
              compare={kpi.prev.cnt ? `${kpi.delta.cnt > 0 ? "+" : ""}${kpi.delta.cnt}% к пред. периоду` : "нет данных для сравнения"}
              trend={kpi.delta.cnt}
              icon={<Gauge className="w-5 h-5" />}
            />
            <KPI
              title="Средний чек"
              value={money(kpi.avg)}
              compare="среднее в выбранном диапазоне"
              trend={0}
              icon={<Layers className="w-5 h-5" />}
            />
          </div>

          <div className="w-full px-4 mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 rounded-xl border bg-white p-4">
              <div className="text-sm text-gray-600 mb-2">Динамика продаж</div>
              <div className="w-full h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seriesSales}>
                    <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="label" interval="preserveStartEnd" />
                    <YAxis />
                    <Tooltip formatter={(v: any, name: any) => [name === "gross" ? money(v) : v, name === "gross" ? "Продажи" : "Заявки"]} />
                    <Line type="monotone" dataKey="gross" name="Продажи" stroke={C_TOTAL} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm text-gray-600 mb-2">Заявки по периодам</div>
              <div className="w-full h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={seriesSales}>
                    <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" name="Кол-во заявок" fill={C_TOTAL} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {/* TAB: УЧРЕДИТЕЛИ */}
      {tab === "founders" && (
        <div className="w-full px-4 mt-4 space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KPI
              title="Игорь — доход (период)"
              value={money(foundersKPI.cur.igor)}
              compare={foundersKPI.prev.igor ? `${foundersKPI.delta.igor >= 0 ? "+" : ""}${foundersKPI.delta.igor}% к пред. периоду` : "нет данных для сравнения"}
              trend={foundersKPI.delta.igor}
              icon={<Users2 className="w-5 h-5" />}
            />
            <KPI
              title="Евгений — доход (период)"
              value={money(foundersKPI.cur.evg)}
              compare={foundersKPI.prev.evg ? `${foundersKPI.delta.evg >= 0 ? "+" : ""}${foundersKPI.delta.evg}% к пред. периоду` : "нет данных для сравнения"}
              trend={foundersKPI.delta.evg}
              icon={<Users2 className="w-5 h-5" />}
            />
          </div>

          {/* Subtabs for founders */}
          <div className="inline-flex rounded-xl border bg-white overflow-hidden">
            <SubTabBtn active={foundersView==="stack"} onClick={()=>setFoundersView("stack")} icon={<BarIcon className="w-4 h-4" />}>Столбцы (стек)</SubTabBtn>
            <SubTabBtn active={foundersView==="lines"} onClick={()=>setFoundersView("lines")} icon={<LineIcon className="w-4 h-4" />}>Линии</SubTabBtn>
            <SubTabBtn active={foundersView==="cumulative"} onClick={()=>setFoundersView("cumulative")} icon={<Sigma className="w-4 h-4" />}>Кумулятив</SubTabBtn>
            <SubTabBtn active={foundersView==="operators"} onClick={()=>setFoundersView("operators")} icon={<Building2 className="w-4 h-4" />}>По операторам</SubTabBtn>
            <SubTabBtn active={foundersView==="table"} onClick={()=>setFoundersView("table")} icon={<List className="w-4 h-4" />}>Таблица</SubTabBtn>
          </div>

          {/* Charts/Views */}
          {foundersView === "stack" && (
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm text-gray-600 mb-2">Распределение доходов по периодам (стек)</div>
              <div className="w-full h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={foundersSeries}>
                    <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(v: any, name: any) => [money(v as number), name]} />
                    <Legend />
                    <Bar dataKey="igor" name="Игорь" stackId="founders" fill={C_IGOR} />
                    <Bar dataKey="evg" name="Евгений" stackId="founders" fill={C_EVG} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {foundersView === "lines" && (
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm text-gray-600 mb-2">Динамика доходов (линии)</div>
              <div className="w-full h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={foundersSeries}>
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

          {foundersView === "cumulative" && (
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm text-gray-600 mb-2">Кумулятивные суммы</div>
              <div className="w-full h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={foundersCumulative}>
                    <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(v: any, name: any) => [money(v as number), name]} />
                    <Legend />
                    <Area type="monotone" dataKey="igor"  name="Игорь"   stroke={C_IGOR} fill={C_IGOR+"22"} />
                    <Area type="monotone" dataKey="evg"   name="Евгений" stroke={C_EVG}  fill={C_EVG+"22"} />
                    <Area type="monotone" dataKey="total" name="Всего"   stroke={C_TOTAL} fill={C_TOTAL+"22"} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {foundersView === "operators" && (
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm text-gray-600 mb-2">Топ операторов для учредителей (сумма Игорь+Евгений)</div>
              <div className="w-full h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={foundersByOperator}>
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

          {foundersView === "table" && (
            <div className="rounded-xl border bg-white overflow-x-auto">
              <div className="p-4 border-b font-semibold">Таблица по периодам</div>
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 border-b">Период</th>
                    <th className="text-right px-3 py-2 border-b">Игорь</th>
                    <th className="text-right px-3 py-2 border-b">Евгений</th>
                    <th className="text-right px-3 py-2 border-b">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {foundersSeries.map((r) => (
                    <tr key={r.label} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border-b">{r.label}</td>
                      <td className="px-3 py-2 border-b text-right whitespace-nowrap">{money(r.igor)}</td>
                      <td className="px-3 py-2 border-b text-right whitespace-nowrap">{money(r.evg)}</td>
                      <td className="px-3 py-2 border-b text-right whitespace-nowrap">{money(r.total)}</td>
                    </tr>
                  ))}
                  {foundersSeries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">Нет данных</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: ОПЕРАТОРЫ */}
      {tab === "operators" && (
        <div className="w-full px-4 mt-4">
          <div className="rounded-xl border bg-white">
            <div className="p-4 border-b font-semibold">Топ операторов (по продажам)</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 border-b">Оператор</th>
                    <th className="text-right px-3 py-2 border-b">Продажи</th>
                    <th className="text-right px-3 py-2 border-b">Заявок</th>
                    <th className="text-right px-3 py-2 border-b">Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {topByOperatorSales.map((r) => (
                    <tr key={r.operator} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border-b">{r.operator}</td>
                      <td className="px-3 py-2 border-b text-right whitespace-nowrap">{money(r.gross)}</td>
                      <td className="px-3 py-2 border-b text-right">{r.count}</td>
                      <td className="px-3 py-2 border-b text-right">
                        <Link
                          className="text-blue-600 hover:underline"
                          href={{
                            pathname: "/finance/sales-details",
                            query: {
                              operator: r.operator,
                              from: toLocalISODate(range.from),
                              to: toLocalISODate(range.to),
                              basis,
                            },
                          }}
                        >
                          открыть
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {topByOperatorSales.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                        Нет данных за выбранный период
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 my-8 text-gray-400 text-xs text-center">
        Диапазон: {formatDMY(range.from)} — {formatDMY(range.to)} · Основа: {basis === "createdAt" ? "создание" : "check-in"}
      </div>
    </ManagerLayout>
  );
}

/** -------- UI bits -------- */
function KPI({
  title,
  value,
  compare,
  trend,
  icon,
}: {
  title: string;
  value: string;
  compare?: string;
  trend?: number;
  icon?: React.ReactNode;
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <div className="rounded-xl border bg-white p-4 flex items-start justify-between">
      <div>
        <div className="text-xs text-gray-600">{title}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {compare && (
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            {trend !== undefined &&
              (up ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-rose-600" />
              ))}
            {compare}
          </div>
        )}
      </div>
      <div className="opacity-60">{icon}</div>
    </div>
  );
}
function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50">
      {label}
    </button>
  );
}
function TabBtn({
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
      className={`px-4 py-2 text-sm inline-flex items-center gap-2 ${
        active ? "bg-blue-600 text-white" : "hover:bg-gray-50"
      }`}
    >
      {icon}
      {children}
    </button>
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