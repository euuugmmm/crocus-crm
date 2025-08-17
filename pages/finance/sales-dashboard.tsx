/* pages/finance/sales-dashboard.tsx */
"use client";

import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { canViewFinance } from "@/lib/finance/roles";
import { db } from "@/firebaseConfig";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
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

/** -------- Types (кэш) -------- */
type SalesCacheMeta = {
  lastRunAt?: any;
  status?: "running" | "done" | "error";
  range?: { from?: string; to?: string; basis?: "createdAt" | "checkIn" };
  error?: string;
  lastDocId?: string;
};
type SalesDailyRow = { date: string; gross: number; count: number };
type FoundersDailyRow = { date: string; igor: number; evg: number };
type OperatorSalesRow = { operator: string; gross: number; count: number };
type OperatorFoundersRow = { operator: string; igor: number; evg: number; total: number };
type SalesCacheDoc = {
  id: string;
  basis: "createdAt" | "checkIn";
  from: string;
  to: string;
  generatedAt?: any;
  totals: { sumGross: number; count: number };
  salesDaily: SalesDailyRow[];
  foundersDaily: FoundersDailyRow[];
  operatorSales: OperatorSalesRow[];
  operatorsFounders: OperatorFoundersRow[];
};

/** -------- Date helpers -------- */
const pad2 = (n: number) => String(n).padStart(2, "0");
const toLocalISODate = (d: Date) => {
  // local YYYY-MM-DD
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
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
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

type Granularity = "day" | "week" | "month";
type DateBasis = "createdAt" | "checkIn";
type TabKey = "sales" | "founders" | "operators";

/** -------- Money/helpers -------- */
const money = (n: number) =>
  `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** -------- Группировка рядов кэша -------- */
const labelFor = (iso: string, g: Granularity) => {
  const d = new Date(iso + "T00:00:00");
  if (g === "day") return formatDMY(d);
  if (g === "week") {
    const tmp = d;
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    const weekStart = startOfWeekISO(tmp);
    const week0 = startOfWeekISO(yearStart);
    const diff = (weekStart.getTime() - week0.getTime()) / (1000 * 3600 * 24);
    const week = Math.floor(diff / 7) + 1;
    return `${tmp.getFullYear()}-W${pad2(week)}`;
  }
  const mm = pad2(d.getMonth() + 1);
  return `${d.getFullYear()}-${mm}`;
};

function groupSales(daily: SalesDailyRow[], g: Granularity) {
  const m = new Map<string, { gross: number; count: number }>();
  for (const r of daily) {
    const k = labelFor(r.date, g);
    if (!m.has(k)) m.set(k, { gross: 0, count: 0 });
    const v = m.get(k)!;
    v.gross += r.gross;
    v.count += r.count;
  }
  return Array.from(m.entries())
    .map(([label, v]) => ({ label, gross: +v.gross.toFixed(2), count: v.count }))
    .sort((a, b) => (a.label > b.label ? 1 : -1));
}
function groupFounders(daily: FoundersDailyRow[], g: Granularity) {
  const m = new Map<string, { igor: number; evg: number }>();
  for (const r of daily) {
    const k = labelFor(r.date, g);
    if (!m.has(k)) m.set(k, { igor: 0, evg: 0 });
    const v = m.get(k)!;
    v.igor += r.igor;
    v.evg += r.evg;
  }
  return Array.from(m.entries())
    .map(([label, v]) => ({ label, igor: +v.igor.toFixed(2), evg: +v.evg.toFixed(2), total: +(v.igor + v.evg).toFixed(2) }))
    .sort((a, b) => (a.label > b.label ? 1 : -1));
}

/** -------- Palette (понятные цвета) -------- */
const C_IGOR = "#2563eb";       // blue-600
const C_EVG = "#f59e0b";        // amber-500
const C_TOTAL = "#059669";      // emerald-600
const C_GRID = "#e5e7eb";       // gray-200

export default function SalesDashboard() {
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = canViewFinance({ isManager, isSuperManager, isAdmin }, { includeManager: true });
  const canRebuild = !!(isManager || isSuperManager || isAdmin);

  // вкладки и фильтры UI
  const [tab, setTab] = useState<TabKey>("sales");
  const [basis, setBasis] = useState<DateBasis>("createdAt");
  const [gran, setGran] = useState<Granularity>("day");
  const [range, setRange] = useState<{ from: Date; to: Date }>(() => {
    const from = startOfMonth();
    const to = endOfMonth();
    return { from, to };
  });

  // кэш + мета
  const [meta, setMeta] = useState<SalesCacheMeta | null>(null);
  const [cache, setCache] = useState<SalesCacheDoc | null>(null);
  const [prevCache, setPrevCache] = useState<SalesCacheDoc | null>(null);
  const [loadingCache, setLoadingCache] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const expectedId = `${basis}_${toLocalISODate(range.from)}_${toLocalISODate(range.to)}`;

  // prev-range для дельт
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
  const prevId = `${basis}_${toLocalISODate(prevRange.from)}_${toLocalISODate(prevRange.to)}`;

  // meta
  useEffect(() => {
    if (!canView) return;
    const unsub = onSnapshot(doc(db, "finance_cacheMeta", "salesDashboard"), (s) => {
      setMeta(s.exists() ? ({ id: s.id, ...(s.data() as any) }) : null);
    });
    return () => unsub();
  }, [canView]);

  // exact cache doc
  useEffect(() => {
    if (!canView) return;
    setLoadingCache(true);
    setIsFallback(false);
    const unsub = onSnapshot(
      doc(db, "finance_salesDashboardCache", expectedId),
      (s) => {
        if (s.exists()) {
          setCache({ id: expectedId, ...(s.data() as any) });
        } else {
          setCache(null);
        }
        setLoadingCache(false);
      },
      () => setLoadingCache(false)
    );
    return () => unsub();
  }, [canView, expectedId]);

  // prev cache (one-shot)
  useEffect(() => {
    if (!canView) return;
    (async () => {
      const snap = await getDoc(doc(db, "finance_salesDashboardCache", prevId));
      setPrevCache(snap.exists() ? ({ id: prevId, ...(snap.data() as any) }) : null);
    })();
  }, [canView, prevId]);

  // fallback: если точного нет, но есть meta.lastDocId — подхватываем его
  useEffect(() => {
    if (!canView) return;
    if (cache) return;
    if (!meta?.lastDocId) return;
    if (meta.lastDocId === expectedId) return;

    const unsub = onSnapshot(doc(db, "finance_salesDashboardCache", meta.lastDocId), (s) => {
      if (s.exists() && !cache) {
        setCache({ id: meta.lastDocId!, ...(s.data() as any) });
        setIsFallback(true);
      }
    });
    return () => unsub();
  }, [canView, cache, meta?.lastDocId, expectedId]);

  // KPI из кэша
  const kpi = useMemo(() => {
    const sum = cache?.totals?.sumGross || 0;
    const cnt = cache?.totals?.count || 0;
    const avg = cnt ? sum / cnt : 0;

    const prevSum = prevCache?.totals?.sumGross || 0;
    const prevCnt = prevCache?.totals?.count || 0;

    const deltaSum = prevSum ? ((sum - prevSum) / prevSum) * 100 : sum > 0 ? 100 : 0;
    const deltaCnt = prevCnt ? ((cnt - prevCnt) / prevCnt) * 100 : cnt > 0 ? 100 : 0;

    return {
      sum: +sum.toFixed(2),
      cnt,
      avg: +avg.toFixed(2),
      prev: { sum: +prevSum.toFixed(2), cnt: prevCnt },
      delta: { sum: +deltaSum.toFixed(1), cnt: +deltaCnt.toFixed(1) },
    };
  }, [cache, prevCache]);

  // серии
  const seriesSales = useMemo(() => {
    if (!cache?.salesDaily?.length) return [];
    return groupSales(cache.salesDaily, gran);
  }, [cache?.salesDaily, gran]);

  const foundersSeries = useMemo(() => {
    if (!cache?.foundersDaily?.length) return [];
    return groupFounders(cache.foundersDaily, gran);
  }, [cache?.foundersDaily, gran]);

  const foundersCumulative = useMemo(() => {
    let sIgor = 0, sEvg = 0;
    return foundersSeries.map((r) => {
      sIgor += r.igor;
      sEvg += r.evg;
      return { label: r.label, igor: +sIgor.toFixed(2), evg: +sEvg.toFixed(2), total: +(sIgor + sEvg).toFixed(2) };
    });
  }, [foundersSeries]);

  const foundersByOperator = useMemo(() => {
    return (cache?.operatorsFounders || []).slice(0, 15);
  }, [cache?.operatorsFounders]);

  const topByOperatorSales = useMemo(() => {
    return (cache?.operatorSales || []).slice(0, 12);
  }, [cache?.operatorSales]);

  // rebuild
  const handleRebuild = async () => {
    if (!user || !canRebuild) return;
    try {
      setRebuilding(true);
      const token = await user.getIdToken();
      const q = new URLSearchParams({
        from: toLocalISODate(range.from),
        to: toLocalISODate(range.to),
        basis,
      });
      const res = await fetch(`/api/finance/cache/build-salesDashboard?${q.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || res.statusText);
      // onSnapshot подхватит созданный снапшот
    } catch (e: any) {
      alert(`Ошибка обновления кэша: ${e?.message || e}`);
    } finally {
      setRebuilding(false);
    }
  };

  // ---- UI ----
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
              {cache ? (
                <>
                  Диапазон кэша: <b>{cache.from}</b> — <b>{cache.to}</b> · Основа даты:{" "}
                  <b>{cache.basis === "checkIn" ? "check-in" : "создание"}</b>
                  {isFallback && (
                    <span className="ml-2 text-xs px-2 py-[2px] rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-600/20">
                      показан последний доступный снимок
                    </span>
                  )}
                </>
              ) : (
                <>
                  Запрошенный диапазон: <b>{toLocalISODate(range.from)}</b> — <b>{toLocalISODate(range.to)}</b> · Основа:{" "}
                  <b>{basis === "checkIn" ? "check-in" : "создание"}</b>
                </>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Последняя синхронизация:{" "}
              <b>
                {meta?.lastRunAt?.toDate?.()
                  ? meta.lastRunAt.toDate().toLocaleString("ru-RU")
                  : meta?.lastRunAt
                  ? new Date(meta.lastRunAt).toLocaleString("ru-RU")
                  : "—"}
              </b>
              {meta?.status && (
                <span
                  className={`ml-2 inline-flex items-center gap-1 text-[11px] px-2 py-[2px] rounded-full ${
                    meta.status === "running"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
                      : meta.status === "error"
                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20"
                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                  }`}
                >
                  {meta.status}
                </span>
              )}
              {meta?.range && (
                <span className="ml-2 text-gray-400">
                  [{meta.range.from} — {meta.range.to}; {meta.range.basis}]
                </span>
              )}
              {meta?.error && <div className="text-rose-600 mt-1">Ошибка: {meta.error}</div>}
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

          {canRebuild && (
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="ml-auto text-sm px-3 py-1.5 rounded-lg border bg-blue-600 text-white hover:bg-blue-700"
              title="Пересчитать и сохранить кэш за выбранный диапазон"
            >
              {rebuilding ? "Обновляю…" : "Обновить кэш"}
            </button>
          )}
        </div>

        {!cache && !loadingCache && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Для диапазона {toLocalISODate(range.from)} — {toLocalISODate(range.to)} ({basis}) кэш-снимок не найден.
            {canRebuild ? " Нажмите «Обновить кэш»." : " Обратитесь к администратору."}
          </div>
        )}
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
              compare={
                kpi.prev.sum
                  ? `${kpi.delta.sum > 0 ? "+" : ""}${kpi.delta.sum}% к пред. периоду`
                  : "нет данных для сравнения"
              }
              trend={kpi.delta.sum}
              icon={<BarChart3 className="w-5 h-5" />}
            />
            <KPI
              title="Количество заявок"
              value={kpi.cnt.toString()}
              compare={
                kpi.prev.cnt
                  ? `${kpi.delta.cnt > 0 ? "+" : ""}${kpi.delta.cnt}% к пред. периоду`
                  : "нет данных для сравнения"
              }
              trend={kpi.delta.cnt}
              icon={<Gauge className="w-5 h-5" />}
            />
            <KPI
              title="Средний чек"
              value={money(kpi.avg)}
              compare="среднее в выбранном диапазоне (кэш)"
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
              value={money((foundersSeries as any[]).reduce((s,r)=>s + (r.igor||0), 0))}
              compare={prevCache ? "сравнение по кэшу пред. периода" : "нет данных для сравнения"}
              trend={0}
              icon={<Users2 className="w-5 h-5" />}
            />
            <KPI
              title="Евгений — доход (период)"
              value={money((foundersSeries as any[]).reduce((s,r)=>s + (r.evg||0), 0))}
              compare={prevCache ? "сравнение по кэшу пред. периода" : "нет данных для сравнения"}
              trend={0}
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
                    <Bar dataKey="evg"  name="Евгений" stackId="founders" fill={C_EVG} />
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
                    <Area type="monotone" dataKey="igor"  name="Игорь"   stroke={C_IGOR}  fill={C_IGOR+"22"} />
                    <Area type="monotone" dataKey="evg"   name="Евгений" stroke={C_EVG}   fill={C_EVG+"22"} />
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
                              from: cache?.from ?? toLocalISODate(range.from),
                              to: cache?.to ?? toLocalISODate(range.to),
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
        {cache ? (
          <>Кэш: {cache.from} — {cache.to} · Основа: {cache.basis === "checkIn" ? "check-in" : "создание"}</>
        ) : (
          <>Запрошено: {formatDMY(range.from)} — {formatDMY(range.to)} · Основа: {basis === "checkIn" ? "check-in" : "создание"}</>
        )}
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