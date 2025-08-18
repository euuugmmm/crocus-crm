"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { RotateCcw, Clock } from "lucide-react";

/** ===== helpers ===== */
const fmtDMY = (iso?: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
};
const toLocalISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

/** ===== cache doc shape (минимально нужное под UI) ===== */
type CachedAccountRow = {
  id: string;
  name: string;
  currency: string;
  balAmt: number;
  balEur: number;
};
type CachedPlanned = {
  id: string;
  date: string; // YYYY-MM-DD
  side: "income" | "expense";
  amount: number;
  currency: string;
  eurAmount: number;
  accountName?: string;
  accountId?: string;
  categoryName?: string;
  categoryId?: string;
};
type CachedRecentTx = {
  id: string;
  date: string; // YYYY-MM-DD
  type: "in" | "out" | "transfer";
  status: string;
  account: string;  // уже резолвленное имя или «Перевод»
  category: string; // уже резолвленное имя
  amountLabel: string; // "123.45 USD"
  eur: number;
  note?: string;
};
type FlowDailyRow = { date: string; inflow: number; outflow: number; net: number };
type OverviewCacheDoc = {
  updatedAt?: any;
  accounts?: CachedAccountRow[];
  totalEur?: number;
  flowDaily?: FlowDailyRow[];
  plannedUpcoming?: CachedPlanned[];
  plannedOverdue?: CachedPlanned[];
  sumUpcoming?: number;
  sumOverdue?: number;
  recentTx?: CachedRecentTx[];
};

const CACHE_DOC_REF = doc(db, "finance_overviewCache", "summary");

export default function FinanceOverview() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  // окно для KPI «Приток/Отток/Net»
  const [daysWindow, setDaysWindow] = useState(30);

  // кэш
  const [cache, setCache] = useState<OverviewCacheDoc | null>(null);
  const [cacheUpdatedISO, setCacheUpdatedISO] = useState<string | null>(null);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [cacheRefreshing, setCacheRefreshing] = useState(false);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canView) { router.replace("/agent/bookings"); return; }
  }, [user, canView, router]);

  const loadCacheOnce = async () => {
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

  const refreshCache = async () => {
    try {
      setCacheRefreshing(true);
      const r = await fetch("/api/finance/overview-cache/rebuild", { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      await loadCacheOnce();
      alert("Кэш обновлён");
    } catch (e) {
      console.error("[FinanceOverview] refresh cache failed:", e);
      alert("Не удалось обновить кэш. См. консоль.");
    } finally {
      setCacheRefreshing(false);
    }
  };

  /** ===== вычисления по кэшу ===== */
  const accountRows = useMemo(() => {
    const rows = cache?.accounts || [];
    const totalEur = Number(cache?.totalEur || 0);
    return { rows, totalEur: +totalEur.toFixed(2) };
  }, [cache]);

  const flow = useMemo(() => {
    const list = cache?.flowDaily || [];
    if (!list.length) {
      const now = new Date();
      const from = new Date(now); from.setDate(now.getDate() - daysWindow);
      const label = `${toLocalISO(from)} — ${toLocalISO(now)}`;
      return { inflow: 0, outflow: 0, net: 0, periodLabel: label };
    }
    const nowISO = toLocalISO(new Date());
    const fromISO = toLocalISO(new Date(Date.now() - daysWindow * 86400000));
    let inflow = 0, outflow = 0;
    for (const r of list) {
      if (r.date >= fromISO && r.date <= nowISO) {
        inflow += r.inflow || 0;
        outflow += r.outflow || 0;
      }
    }
    const net = inflow - outflow;
    return {
      inflow: +inflow.toFixed(2),
      outflow: +outflow.toFixed(2),
      net: +net.toFixed(2),
      periodLabel: `${fromISO} — ${nowISO}`,
    };
  }, [cache, daysWindow]);

  const plannedLists = useMemo(() => ({
    upcoming: cache?.plannedUpcoming || [],
    overdue: cache?.plannedOverdue || [],
    sumUpcoming: +(cache?.sumUpcoming || 0).toFixed(2),
    sumOverdue: +(cache?.sumOverdue || 0).toFixed(2),
  }), [cache]);

  const recentTx = useMemo(() => cache?.recentTx || [], [cache]);

  return (
    <ManagerLayout>
      <Head><title>Финансовый обзор</title></Head>

      <div className="max-w-7xl mx-auto py-8 space-y-6">
        {/* Заголовок + окно + кэш-контролы */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Финансовый обзор</h1>
            <div className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {cacheLoading ? "Кэш: загрузка…" : `Кэш от ${cacheUpdatedISO ? fmtDMY(cacheUpdatedISO) : "—"}`}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Окно:</span>
              <select
                className="border rounded px-2 py-1 text-sm"
                value={daysWindow}
                onChange={e=>setDaysWindow(Number(e.target.value))}
              >
                <option value={7}>7 дней</option>
                <option value={30}>30 дней</option>
                <option value={90}>90 дней</option>
              </select>
            </div>
            <Button onClick={refreshCache} disabled={cacheRefreshing} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white">
              <RotateCcw className={`w-4 h-4 ${cacheRefreshing ? "animate-spin" : ""}`} />
              {cacheRefreshing ? "Обновляю кэш…" : "Обновить кэш"}
            </Button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi title="Денежные средства (EUR)" value={accountRows.totalEur} emphasis />
          <Kpi title="Приток за период (EUR)" value={flow.inflow} />
          <Kpi title="Отток за период (EUR)" value={flow.outflow} />
          <Kpi title="Net поток (EUR)" value={flow.net} emphasis />
        </div>
        <div className="text-xs text-gray-600">Период: {flow.periodLabel}</div>

        {/* Балансы по счетам */}
        <section className="border rounded-xl">
          <div className="px-3 py-2 bg-gray-50 font-semibold rounded-t-xl">Счета и остатки</div>
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
                {accountRows.rows.map(r=>(
                  <tr key={r.id} className="text-center">
                    <td className="border px-2 py-1">{r.name}</td>
                    <td className="border px-2 py-1">{r.currency}</td>
                    <td className="border px-2 py-1">{r.balAmt.toFixed(2)} {r.currency}</td>
                    <td className="border px-2 py-1">{r.balEur.toFixed(2)} €</td>
                  </tr>
                ))}
                {accountRows.rows.length===0 && (
                  <tr><td colSpan={4} className="border px-2 py-4 text-center text-gray-500">Нет счетов</td></tr>
                )}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td className="border px-2 py-1 text-right" colSpan={3}>Итого в EUR:</td>
                  <td className="border px-2 py-1 text-center">{accountRows.totalEur.toFixed(2)} €</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Плановые платежи */}
        <section className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-xl">
            <div className="px-3 py-2 bg-gray-50 font-semibold rounded-t-xl">
              Ближайшие плановые (до 10) — всего {plannedLists.sumUpcoming.toFixed(2)} €
            </div>
            <table className="w-full min-w-[600px] border text-sm">
              <thead className="bg-gray-100 text-center">
                <tr>
                  <th className="border px-2 py-1">Дата</th>
                  <th className="border px-2 py-1">Тип</th>
                  <th className="border px-2 py-1">Сумма</th>
                  <th className="border px-2 py-1">EUR</th>
                  <th className="border px-2 py-1">Счёт</th>
                  <th className="border px-2 py-1">Категория</th>
                </tr>
              </thead>
              <tbody>
                {(plannedLists.upcoming || []).map(p=>(
                  <tr key={p.id} className="text-center">
                    <td className="border px-2 py-1 whitespace-nowrap">{p.date}</td>
                    <td className="border px-2 py-1">
                      {p.side==="income"
                        ? <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                        : <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>}
                    </td>
                    <td className="border px-2 py-1 text-right">{Number(p.amount||0).toFixed(2)} {p.currency}</td>
                    <td className="border px-2 py-1 text-right">{Number(p.eurAmount||0).toFixed(2)} €</td>
                    <td className="border px-2 py-1">{p.accountName || p.accountId}</td>
                    <td className="border px-2 py-1">{p.categoryName || p.categoryId}</td>
                  </tr>
                ))}
                {(plannedLists.upcoming || []).length===0 && (
                  <tr><td colSpan={6} className="border px-2 py-4 text-center text-gray-500">Нет данных</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border rounded-xl">
            <div className="px-3 py-2 bg-gray-50 font-semibold rounded-t-xl">
              Просроченные плановые (до 10) — всего {plannedLists.sumOverdue.toFixed(2)} €
            </div>
            <table className="w-full min-w-[600px] border text-sm">
              <thead className="bg-gray-100 text-center">
                <tr>
                  <th className="border px-2 py-1">Дата</th>
                  <th className="border px-2 py-1">Тип</th>
                  <th className="border px-2 py-1">Сумма</th>
                  <th className="border px-2 py-1">EUR</th>
                  <th className="border px-2 py-1">Счёт</th>
                  <th className="border px-2 py-1">Категория</th>
                </tr>
              </thead>
              <tbody>
                {(plannedLists.overdue || []).map(p=>(
                  <tr key={p.id} className="text-center">
                    <td className="border px-2 py-1 whitespace-nowrap">{p.date}</td>
                    <td className="border px-2 py-1">
                      {p.side==="income"
                        ? <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                        : <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>}
                    </td>
                    <td className="border px-2 py-1 text-right">{Number(p.amount||0).toFixed(2)} {p.currency}</td>
                    <td className="border px-2 py-1 text-right">{Number(p.eurAmount||0).toFixed(2)} €</td>
                    <td className="border px-2 py-1">{p.accountName || p.accountId}</td>
                    <td className="border px-2 py-1">{p.categoryName || p.categoryId}</td>
                  </tr>
                ))}
                {(plannedLists.overdue || []).length===0 && (
                  <tr><td colSpan={6} className="border px-2 py-4 text-center text-gray-500">Нет данных</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Последние транзакции */}
        <section className="border rounded-xl">
          <div className="px-3 py-2 bg-gray-50 font-semibold rounded-t-xl">Последние транзакции</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border text-sm">
              <thead className="bg-gray-100 text-center">
                <tr>
                  <th className="border px-2 py-1">Дата</th>
                  <th className="border px-2 py-1">Тип</th>
                  <th className="border px-2 py-1">Статус</th>
                  <th className="border px-2 py-1">Счёт / Перевод</th>
                  <th className="border px-2 py-1">Категория</th>
                  <th className="border px-2 py-1">Сумма</th>
                  <th className="border px-2 py-1">EUR</th>
                  <th className="border px-2 py-1">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map(r=>(
                  <tr key={r.id} className="text-center">
                    <td className="border px-2 py-1 whitespace-nowrap">{r.date}</td>
                    <td className="border px-2 py-1">{r.type}</td>
                    <td className="border px-2 py-1">{r.status}</td>
                    <td className="border px-2 py-1">{r.account}</td>
                    <td className="border px-2 py-1">{r.category}</td>
                    <td className="border px-2 py-1 whitespace-nowrap text-right">{r.amountLabel}</td>
                    <td className="border px-2 py-1 whitespace-nowrap text-right">{r.eur.toFixed(2)} €</td>
                    <td className="border px-2 py-1 text-left">{r.note || "—"}</td>
                  </tr>
                ))}
                {recentTx.length===0 && (
                  <tr><td colSpan={8} className="border px-2 py-4 text-center text-gray-500">Нет данных</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Быстрые ссылки */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={()=>router.push("/finance/transactions")} variant="outline" className="h-9 px-3">В транзакции</Button>
          <Button onClick={()=>router.push("/finance/planned")} variant="outline" className="h-9 px-3">В план-факт</Button>
          <Button onClick={()=>router.push("/finance/pl")} variant="outline" className="h-9 px-3">В P&L</Button>
          <Button onClick={()=>router.push("/finance/accounts")} variant="outline" className="h-9 px-3">Счета</Button>
          <Button onClick={()=>router.push("/finance/rates")} variant="outline" className="h-9 px-3">Курсы</Button>
        </div>
      </div>
    </ManagerLayout>
  );
}

function Kpi({ title, value, emphasis }:{title:string; value:number; emphasis?:boolean}) {
  return (
    <div className={`border rounded-lg p-3 ${emphasis ? "bg-emerald-50" : ""}`}>
      <div className="text-xs text-gray-600">{title}</div>
      <div className={`mt-1 text-lg font-semibold ${emphasis ? "text-emerald-800" : ""}`}>{(value||0).toFixed(2)}</div>
    </div>
  );
}