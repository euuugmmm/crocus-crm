/* pages/finance/report.tsx */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { Button } from "@/components/ui/button";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { RotateCcw, Clock, AlertTriangle } from "lucide-react";

/** ==== helpers ==== */
const money = (n: number) => `${(n >= 0 ? "" : "−")}${Math.abs(n).toFixed(2)} €`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const defaultFrom = () => addDays(new Date(), -60).toISOString().slice(0,10);

const fmtDMY = (iso?: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
};
const toLocalISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

function toneBySign(x: number) {
  if (x > 0.01) return "good";
  if (x < -0.01) return "bad";
  return "neutral";
}

function StatCard({
  title, value, hint, tone = "neutral",
}: { title: string; value: string; hint?: string; tone?: "neutral"|"good"|"warn"|"bad" }) {
  const cls =
    tone === "good" ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20" :
    tone === "warn" ? "bg-amber-50 text-amber-800 ring-amber-600/20" :
    tone === "bad"  ? "bg-rose-50 text-rose-800 ring-rose-600/20" :
                      "bg-slate-50 text-slate-800 ring-slate-600/20";
  return (
    <div className={`rounded-xl p-3 ring-1 ring-inset ${cls}`}>
      <div className="text-[11px] opacity-80">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
      {hint && <div className="text-[11px] opacity-70 mt-1">{hint}</div>}
    </div>
  );
}

/** ==== API types ==== */
type Totals = {
  Z0: number;
  CI_period: number;
  CE_period: number;
  Z_asOf: number;
  OwnToBookings: number;

  OperatorsDebtTotal: number;
  ClientsAdvanceTotal: number;

  OwnersProfitRecognized: number;
  OwnersPayout: number;
  OwnersUnwithdrawn: number;

  AgentAccrued: number;
  AgentPaid: number;
  AgentLeft: number;
};

type BookingRow = {
  bookingId: string;
  bookingNumber?: string;
  title: string;
  operator?: string;

  B: number; N: number; CI: number; CE: number;
  expToSupplier: number; refundsEtc: number;
  clientOverpay: number; operatorDebtAsOf: number;
  bookingCashBalance: number; fullyPaid: boolean;

  agentAccrued: number; agentPaid: number;
  ownersProfit: number;
};

type OperatorRow = {
  operator: string;
  bookings: number;
  fullyPaid: number;
  B: number; N: number; CI: number; CE: number;
  debt: number; overpay: number; cash: number;
  agentAccrued: number; agentPaid: number;
};

type SeriesItem = { date: string; CI: number; CE: number; Z: number };

type ReportResponse = {
  meta: any;
  totals: Totals;
  bank: { period: { bankCI: number; bankCE: number; bankNet: number }, ordersNet: number, otherNet: number };
  bookings: BookingRow[];
  operators: OperatorRow[];
  timeseries: SeriesItem[];
  anomalies?: {
    overpayClients?: Array<{ bookingId: string; overpay: number }>;
    ceBeyondNetto?: Array<{ bookingId: string; refunds: number }>;
    negativeCash?: Array<{ bookingId: string; cash: number }>;
  }
};

/** ==== cache doc shape (из overview) ==== */
type CachedAccountRow = {
  id: string;
  name: string;
  currency: string;
  balAmt: number;
  balEur: number;
};
type FlowDailyRow = { date: string; inflow: number; outflow: number; net: number };
type OverviewCacheDoc = {
  updatedAt?: any;
  accounts?: CachedAccountRow[];
  totalEur?: number;
  flowDaily?: FlowDailyRow[];
};

const CACHE_DOC_REF = doc(db, "finance_overviewCache", "summary");

export default function FinanceReportPage() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(todayISO());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [report, setReport] = useState<ReportResponse | null>(null);

  // cache (остатки по счетам)
  const [cache, setCache] = useState<OverviewCacheDoc | null>(null);
  const [cacheUpdatedISO, setCacheUpdatedISO] = useState<string | null>(null);
  const [cacheRefreshing, setCacheRefreshing] = useState(false);

  /** ==== load accounts cache ==== */
  const loadCache = async () => {
    const snap = await getDoc(CACHE_DOC_REF);
    if (snap.exists()) {
      const d = snap.data() as any as OverviewCacheDoc;
      setCache(d || null);
      setCacheUpdatedISO(d?.updatedAt?.toDate ? toLocalISO(d.updatedAt.toDate()) : null);
    } else {
      setCache(null);
      setCacheUpdatedISO(null);
    }
  };

  /** ==== load report ==== */
  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const q = new URLSearchParams({ from, to });
      const r = await fetch(`/api/finance/report?${q.toString()}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed");
      setReport(j as ReportResponse);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadCache(), load()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCache = async () => {
    try {
      setCacheRefreshing(true);
      const r = await fetch("/api/finance/overview-cache/rebuild", { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      await loadCache();
      alert("Кэш остатков по счетам обновлён");
    } catch (e) {
      console.error("[FinanceReport] refresh cache failed:", e);
      alert("Не удалось обновить кэш (смотри консоль).");
    } finally {
      setCacheRefreshing(false);
    }
  };

  /** ==== derived ==== */
  const totals = report?.totals;
  const series = report?.timeseries || [];
  const operators = report?.operators || [];
  const bookings = report?.bookings || [];

  const accountsBlock = useMemo(() => {
    const rows = cache?.accounts || [];
    const totalEur = +(cache?.totalEur || 0).toFixed(2);
    return { rows, totalEur };
  }, [cache]);

  // Ключевая увязка денег и обязательств
  const zAsOf = totals?.Z_asOf || 0;
  const cashTotal = accountsBlock.totalEur || 0;
  const freeCash = +(cashTotal - zAsOf).toFixed(2); // не зарезервированные под заявки
  const operatorsDebt = totals?.OperatorsDebtTotal || 0;
  const agentsLeft = totals?.AgentLeft || 0;
  const obligations = +(operatorsDebt + agentsLeft).toFixed(2);
  const coverage = +(freeCash - obligations).toFixed(2); // запас/дефицит

  // KPI для «контур заявок»
  const fullyPaidCount = useMemo(
    () => bookings.filter(b => b.fullyPaid).length,
    [bookings]
  );

  // Фильтры витрины (простые)
  const [flt, setFlt] = useState({
    search: "",
    operator: "",
    fully: "all" as "all" | "yes" | "no",
    hasDebt: "all" as "all" | "yes",
    hasOverpay: "all" as "all" | "yes",
  });
  const filteredBookings = useMemo(() => {
    const q = flt.search.trim().toLowerCase();
    const op = flt.operator.trim().toLowerCase();
    return bookings.filter(b => {
      if (flt.fully !== "all") {
        const want = flt.fully === "yes";
        if (b.fullyPaid !== want) return false;
      }
      if (flt.hasDebt === "yes" && !(b.operatorDebtAsOf > 0.009)) return false;
      if (flt.hasOverpay === "yes" && !(b.clientOverpay > 0.009)) return false;

      if (op) {
        const s = (b.operator || "").toLowerCase();
        if (!s.includes(op)) return false;
      }
      if (q) {
        const s = [b.bookingNumber || "", b.title || "", b.operator || ""].join(" ").toLowerCase();
        if (!s.includes(q)) return false;
      }
      return true;
    }).sort((a,b) => (b.operatorDebtAsOf - a.operatorDebtAsOf) || (a.fullyPaid === b.fullyPaid ? 0 : a.fullyPaid ? -1 : 1));
  }, [bookings, flt]);

  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head><title>Отчёт — деньги, обязательства и покрытия</title></Head>

      <div className="w-full max-w-none py-6 space-y-6 px-4">
        {/* Шапка: диапазон + действия */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Отчёт: деньги, обязательства, покрытия</h1>
            <div className="text-xs text-gray-500 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Кэш остатков от {cacheUpdatedISO ? fmtDMY(cacheUpdatedISO) : "—"}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <div className="text-[11px] text-gray-600">С даты</div>
              <input type="date" className="border rounded px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <div className="text-[11px] text-gray-600">По дату</div>
              <input type="date" className="border rounded px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button onClick={load} disabled={loading} className="h-9">{loading ? "Считаем..." : "Обновить отчёт"}</Button>
            <Button onClick={refreshCache} disabled={cacheRefreshing} className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
              <RotateCcw className={`w-4 h-4 ${cacheRefreshing ? "animate-spin" : ""}`} />
              {cacheRefreshing ? "Кэш…" : "Обновить кэш остатков"}
            </Button>
          </div>
        </div>

        {err && (
          <div className="p-3 rounded-lg bg-rose-50 text-rose-800 ring-1 ring-rose-600/20">
            Ошибка: {err}
          </div>
        )}

        {/* 1) СЧЕТА И ОСТАТКИ */}
        <section className="border rounded-xl">
          <div className="px-3 py-2 bg-gray-50 font-semibold rounded-t-xl">Счета и остатки (факт)</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border text-sm">
              <thead className="bg-gray-100">
                <tr className="text-center">
                  <th className="border px-2 py-1">Счёт</th>
                  <th className="border px-2 py-1">Валюта</th>
                  <th className="border px-2 py-1">Остаток (вал.)</th>
                  <th className="border px-2 py-1">Остаток (EUR)</th>
                </tr>
              </thead>
              <tbody>
                {(accountsBlock.rows || []).map(r=>(
                  <tr key={r.id} className="text-center">
                    <td className="border px-2 py-1">{r.name}</td>
                    <td className="border px-2 py-1">{r.currency}</td>
                    <td className="border px-2 py-1">{r.balAmt.toFixed(2)} {r.currency}</td>
                    <td className="border px-2 py-1">{r.balEur.toFixed(2)} €</td>
                  </tr>
                ))}
                {(accountsBlock.rows || []).length===0 && (
                  <tr><td colSpan={4} className="border px-2 py-4 text-center text-gray-500">Нет счетов</td></tr>
                )}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td className="border px-2 py-1 text-right" colSpan={3}>Итого в EUR:</td>
                  <td className="border px-2 py-1 text-center">{accountsBlock.totalEur.toFixed(2)} €</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {!!totals && (
          <>
            {/* 2) ЗАЯВКИ: КОНТУР ДЕНЕГ И АВАНСОВ */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard title="Z на начало" value={money(totals.Z0)} hint="Деньги в заявках на начало периода" />
              <StatCard title="Поступило от клиентов (CI)" value={money(totals.CI_period)} />
              <StatCard title="Оплачено по заявкам (CE)" value={money(-totals.CE_period)} />
              <StatCard title="Z на конец (as-of)" value={money(totals.Z_asOf)} tone="good" hint="Сколько должно быть зарезервировано под заявки" />
            </section>

            {/* 3) СОПОСТАВЛЕНИЕ ДЕНЕГ И ОБЯЗАТЕЛЬСТВ */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard title="Фактические деньги на счетах" value={money(cashTotal)} />
              <StatCard title="Свободные деньги (Cash − Z)" value={money(freeCash)} tone={toneBySign(freeCash)} />
              <StatCard title="Обязательства к покрытию (операторы + агенты)" value={money(obligations)} tone={obligations>0?"warn":"neutral"} />
              <StatCard title="Запас / Дефицит (своб. − обяз.)" value={money(coverage)} tone={coverage>=0?"good":"bad"} />
            </section>

            {/* 4) ОБЯЗАТЕЛЬСТВА И АВАНСЫ ДЕТАЛЬНЕЕ */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard title="Долг операторам (as-of)" value={money(totals.OperatorsDebtTotal)} tone={totals.OperatorsDebtTotal>0?"warn":"good"} hint="Правило авансов: можно платить оператору не больше полученного от клиента, пока клиент не оплатил полностью" />
              <StatCard title="Авансы клиентов (не закрыты)" value={money(totals.ClientsAdvanceTotal)} hint="Поступления от клиентов по не полностью оплаченным заявкам" />
              <StatCard title="Оплачено операторам сверх клиентских" value={money(totals.OwnToBookings)} tone={totals.OwnToBookings>0?"warn":"neutral"} hint="CE_to − CI_to (свои деньги, подвязанные в заявках)" />
              <StatCard title="Полностью оплаченных заявок" value={String(fullyPaidCount)} />
            </section>

            {/* 5) АГЕНТЫ */}
            <section className="rounded-xl p-3 ring-1 ring-slate-200">
              <div className="font-semibold mb-2">Агенты</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard title="Начислено (только по полностью оплаченным клиентом)" value={money(totals.AgentAccrued)} />
                <StatCard title="Выплачено агентам" value={money(-totals.AgentPaid)} />
                <StatCard title="К выплате (остаток)" value={money(totals.AgentLeft)} tone={totals.AgentLeft>0?"warn":"good"} />
              </div>
            </section>

            {/* 6) УЧРЕДИТЕЛИ */}
            <section className="rounded-xl p-3 ring-1 ring-slate-200">
              <div className="font-semibold mb-2">Учредители</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard title="Признанная прибыль (fully paid)" value={money(totals.OwnersProfitRecognized)} />
                <StatCard title="Выплачено учредителям" value={money(-totals.OwnersPayout)} />
                <StatCard title="Не выведено (потенциально к распределению)" value={money(totals.OwnersUnwithdrawn)} tone={totals.OwnersUnwithdrawn>=0?"good":"bad"} />
              </div>
            </section>

            {/* 7) ОПЕРАТОРЫ (as-of) */}
            <section className="border rounded-xl">
              <div className="px-3 py-2 bg-gray-50 font-semibold rounded-t-xl">Операторы (as-of {to})</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border text-sm">
                  <thead className="bg-gray-100">
                    <tr className="text-center">
                      <th className="border px-2 py-1 text-left">Оператор</th>
                      <th className="border px-2 py-1">Заявок</th>
                      <th className="border px-2 py-1">Полностью оплачено</th>
                      <th className="border px-2 py-1 text-right">Брутто</th>
                      <th className="border px-2 py-1 text-right">Нетто</th>
                      <th className="border px-2 py-1 text-right">CI</th>
                      <th className="border px-2 py-1 text-right">CE</th>
                      <th className="border px-2 py-1 text-right">Долг as-of</th>
                      <th className="border px-2 py-1 text-right">Переплата клиента</th>
                      <th className="border px-2 py-1 text-right">Баланс (CI−CE)</th>
                      <th className="border px-2 py-1 text-right">Агент начисл.</th>
                      <th className="border px-2 py-1 text-right">Агент выпл.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operators.map(o=>(
                      <tr key={o.operator} className="text-center">
                        <td className="border px-2 py-1 text-left">{o.operator || "—"}</td>
                        <td className="border px-2 py-1">{o.bookings}</td>
                        <td className="border px-2 py-1">{o.fullyPaid}</td>
                        <td className="border px-2 py-1 text-right">{o.B.toFixed(2)}</td>
                        <td className="border px-2 py-1 text-right">{o.N.toFixed(2)}</td>
                        <td className="border px-2 py-1 text-right">{o.CI.toFixed(2)}</td>
                        <td className="border px-2 py-1 text-right">{o.CE.toFixed(2)}</td>
                        <td className="border px-2 py-1 text-right">{o.debt.toFixed(2)}</td>
                        <td className="border px-2 py-1 text-right">{o.overpay.toFixed(2)}</td>
                        <td className="border px-2 py-1 text-right">{o.cash.toFixed(2)}</td>
                        <td className="border px-2 py-1 text-right">{o.agentAccrued.toFixed(2)}</td>
                        <td className="border px-2 py-1 text-right">{o.agentPaid.toFixed(2)}</td>
                      </tr>
                    ))}
                    {!operators.length && (
                      <tr><td colSpan={12} className="border px-2 py-4 text-center text-gray-500">Нет данных</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 8) ВИТРИНА ЗАЯВОК */}
            <section className="rounded-xl p-3 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Заявки (as-of {to})</div>
                <div className="text-[11px] text-gray-600">показываются заявки, встречающиеся в ордерах</div>
              </div>

              {/* Фильтры */}
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm mt-2">
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">Поиск</div>
                  <input className="w-full border rounded px-2 py-1"
                         value={flt.search} onChange={(e)=>setFlt(s=>({...s,search:e.target.value}))}
                         placeholder="№ / клиент / турист / оператор" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">Оператор</div>
                  <input className="w-full border rounded px-2 py-1"
                         value={flt.operator} onChange={(e)=>setFlt(s=>({...s,operator:e.target.value}))}
                         placeholder="название" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">Оплата клиента</div>
                  <select className="w-full border rounded px-2 py-1"
                          value={flt.fully} onChange={(e)=>setFlt(s=>({...s,fully:e.target.value as any}))}>
                    <option value="all">Все</option>
                    <option value="yes">Полностью оплачены</option>
                    <option value="no">Оплачены частично</option>
                  </select>
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">Есть долг оператору</div>
                  <select className="w-full border rounded px-2 py-1"
                          value={flt.hasDebt} onChange={(e)=>setFlt(s=>({...s,hasDebt:e.target.value as any}))}>
                    <option value="all">Все</option>
                    <option value="yes">Только с долгом</option>
                  </select>
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">Есть переплата клиента</div>
                  <select className="w-full border rounded px-2 py-1"
                          value={flt.hasOverpay} onChange={(e)=>setFlt(s=>({...s,hasOverpay:e.target.value as any}))}>
                    <option value="all">Все</option>
                    <option value="yes">Только с переплатой</option>
                  </select>
                </div>
                <div className="self-end">
                  <Button variant="outline" className="w-full" onClick={()=>setFlt({search:"",operator:"",fully:"all",hasDebt:"all",hasOverpay:"all"})}>
                    Сбросить
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto mt-2">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left">№/ID</th>
                      <th className="px-2 py-1 text-left">Клиент/Турист</th>
                      <th className="px-2 py-1 text-left">Оператор</th>
                      <th className="px-2 py-1 text-right">Брутто B</th>
                      <th className="px-2 py-1 text-right">Нетто N</th>
                      <th className="px-2 py-1 text-right">Пришло CI</th>
                      <th className="px-2 py-1 text-right">Ушло CE</th>
                      <th className="px-2 py-1 text-right">Оплачено операторам</th>
                      <th className="px-2 py-1 text-right">Сверх нетто</th>
                      <th className="px-2 py-1 text-right">Переплата клиента</th>
                      <th className="px-2 py-1 text-right">Долг оператору (as-of)</th>
                      <th className="px-2 py-1 text-right">Баланс заявки (CI−CE)</th>
                      <th className="px-2 py-1 text-center">Клиент оплатил</th>
                      <th className="px-2 py-1 text-right">Агент начисл.</th>
                      <th className="px-2 py-1 text-right">Агент выпл.</th>
                      <th className="px-2 py-1 text-right">Учред. прибыль</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.map(b=>(
                      <tr key={b.bookingId} className="border-t">
                        <td className="px-2 py-1">{b.bookingNumber}</td>
                        <td className="px-2 py-1">{b.title || "—"}</td>
                        <td className="px-2 py-1">{b.operator || "—"}</td>
                        <td className="px-2 py-1 text-right">{b.B.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.N.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.CI.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.CE.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.expToSupplier.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.refundsEtc.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.clientOverpay.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.operatorDebtAsOf.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.bookingCashBalance.toFixed(2)}</td>
                        <td className="px-2 py-1 text-center">
                          {b.fullyPaid ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">Да</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-amber-600/20">Нет</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">{b.agentAccrued.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.agentPaid.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{b.ownersProfit.toFixed(2)}</td>
                      </tr>
                    ))}
                    {!filteredBookings.length && <tr><td className="px-2 py-2 text-gray-500" colSpan={16}>Нет заявок</td></tr>}
                  </tbody>
                </table>
              </div>

              {!!report?.anomalies && (
                <div className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg p-2 ring-1 ring-amber-600/20">
                  <div className="font-semibold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Контроль качества данных</div>
                  <ul className="list-disc ml-5 mt-1 space-y-0.5">
                    {(report.anomalies.overpayClients||[]).length>0 && (
                      <li>Переплата клиентов по {report.anomalies.overpayClients!.length} заявкам</li>
                    )}
                    {(report.anomalies.ceBeyondNetto||[]).length>0 && (
                      <li>Расходы сверх нетто по {report.anomalies.ceBeyondNetto!.length} заявкам</li>
                    )}
                    {(report.anomalies.negativeCash||[]).length>0 && (
                      <li>Отрицательный денежный баланс заявки (CI−CE) по {report.anomalies.negativeCash!.length} заявкам</li>
                    )}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </ManagerLayout>
  );
}