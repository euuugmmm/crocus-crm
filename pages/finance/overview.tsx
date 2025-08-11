"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  collection, onSnapshot, orderBy, query,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Account, Category, Currency, FxRates, Planned, Transaction } from "@/lib/finance/types";

type FxMap = Partial<Record<Currency, number>>; // 1 EUR = r(CCY)

function pickLatestFx(list: FxRates[]): FxRates | null {
  if (!list.length) return null;
  const sorted = [...list].sort((a,b)=> a.id < b.id ? 1 : -1);
  return sorted[0];
}

// convert amount between currencies using EUR as pivot.
// fx.rates: 1 EUR = r(CCY)
function convert(amount: number, from: Currency, to: Currency, fx: FxRates | null): number {
  if (!amount) return 0;
  if (from === to) return amount;
  if (!fx?.rates) return 0;

  // to EUR
  let eur = amount;
  if (from !== "EUR") {
    const rFrom = (fx.rates as FxMap)[from];
    if (!rFrom || rFrom <= 0) return 0;
    eur = amount / rFrom; // 1 CCY = 1/rFrom EUR
  }
  // EUR -> to
  if (to === "EUR") return eur;
  const rTo = (fx.rates as FxMap)[to];
  if (!rTo || rTo <= 0) return 0;
  return eur * rTo;
}

function eurFrom(amount: number, ccy: Currency, fx: FxRates | null): number {
  return convert(amount, ccy, "EUR", fx);
}

export default function FinanceOverview() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [fxList, setFxList] = useState<FxRates[]>([]);

  // Параметры дашборда
  const [daysWindow, setDaysWindow] = useState(30);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canView) { router.replace("/agent/bookings"); return; }

    const ua = onSnapshot(query(collection(db, "finance_accounts")), snap => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    const uc = onSnapshot(query(collection(db, "finance_categories")), snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    const ut = onSnapshot(query(collection(db, "finance_transactions"), orderBy("date","desc")), snap => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    const up = onSnapshot(query(collection(db, "finance_planned"), orderBy("date","asc")), snap => {
      setPlanned(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    const ur = onSnapshot(query(collection(db, "finance_fxRates")), snap => {
      setFxList(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
    });

    return () => { ua(); uc(); ut(); up(); ur(); };
  }, [user, canView, router]);

  const latestFx = useMemo(()=> pickLatestFx(fxList), [fxList]);

  // Индексы для удобства
  const catById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) if (c.id) m.set(c.id, c);
    return m;
  }, [categories]);

  const accById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of accounts) if (a.id) m.set(a.id, a);
    return m;
  }, [accounts]);

  // Балансы по счетам (по факту/сверено)
  const accountRows = useMemo(() => {
    // map accountId -> { amt (в валюте счёта), eur }
    const agg = new Map<string, { amt: number; eur: number }>();
    for (const a of accounts) {
      agg.set(a.id, { amt: Number(a.openingBalance || 0), eur: eurFrom(Number(a.openingBalance || 0), a.currency, latestFx) });
    }

    for (const t of transactions) {
      if (!(t.status === "actual" || t.status === "reconciled")) continue;
      if (t.type === "in") {
        const accId = t.accountId!;
        const acc = accById.get(accId);
        if (!acc) continue;
        const deltaAccCcy =
          t.amount?.currency === acc.currency
            ? Number(t.amount?.value || 0)
            : convert(Number(t.amount?.value || 0), t.amount?.currency || acc.currency, acc.currency, latestFx);
        const prev = agg.get(accId) || { amt: 0, eur: 0 };
        agg.set(accId, {
          amt: prev.amt + deltaAccCcy,
          eur: prev.eur + Number(t.baseAmount || 0), // baseAmount уже в EUR
        });
      } else if (t.type === "out") {
        const accId = t.accountId!;
        const acc = accById.get(accId);
        if (!acc) continue;
        const deltaAccCcy =
          t.amount?.currency === acc.currency
            ? Number(t.amount?.value || 0)
            : convert(Number(t.amount?.value || 0), t.amount?.currency || acc.currency, acc.currency, latestFx);
        const prev = agg.get(accId) || { amt: 0, eur: 0 };
        agg.set(accId, {
          amt: prev.amt - deltaAccCcy,
          eur: prev.eur - Number(t.baseAmount || 0),
        });
      } else if (t.type === "transfer") {
        // списание со from
        if (t.fromAccountId) {
          const from = accById.get(t.fromAccountId);
          if (from) {
            const deltaFrom =
              t.amount?.currency === from.currency
                ? Number(t.amount?.value || 0)
                : convert(Number(t.amount?.value || 0), t.amount?.currency || from.currency, from.currency, latestFx);
            const prev = agg.get(t.fromAccountId) || { amt: 0, eur: 0 };
            agg.set(t.fromAccountId, {
              amt: prev.amt - deltaFrom,
              eur: prev.eur - Number(t.baseAmount || 0), // допущение: transfer baseAmount считает по from
            });
          }
        }
        // зачисление на to
        if (t.toAccountId) {
          const to = accById.get(t.toAccountId);
          if (to) {
            const deltaTo =
              t.amount?.currency === to.currency
                ? Number(t.amount?.value || 0)
                : convert(Number(t.amount?.value || 0), t.amount?.currency || to.currency, to.currency, latestFx);
            const prev = agg.get(t.toAccountId) || { amt: 0, eur: 0 };
            agg.set(t.toAccountId, {
              amt: prev.amt + deltaTo,
              eur: prev.eur + Number(t.baseAmount || 0),
            });
          }
        }
      }
    }

    const rows = accounts
      .filter(a => !a.archived)
      .map(a => {
        const val = agg.get(a.id) || { amt: 0, eur: 0 };
        return {
          id: a.id,
          name: a.name,
          currency: a.currency,
          balAmt: +Number(val.amt).toFixed(2),
          balEur: +Number(val.eur).toFixed(2),
        };
      });

    const totalEur = rows.reduce((s, r) => s + r.balEur, 0);
    return { rows, totalEur: +totalEur.toFixed(2) };
  }, [accounts, accById, transactions, latestFx]);

  // Приток/отток за последние N дней (actual+reconciled, без transfer)
  const flow = useMemo(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - daysWindow);

    let inflow = 0, outflow = 0;
    for (const t of transactions) {
      if (!(t.status === "actual" || t.status === "reconciled")) continue;
      if (t.type === "transfer") continue;
      const d = new Date(t.date);
      if (d < from || d > now) continue;
      const eur = Number(t.baseAmount || 0);
      if (t.type === "in") inflow += eur;
      else if (t.type === "out") outflow += eur;
    }
    const net = inflow - outflow;
    return {
      inflow: +inflow.toFixed(2),
      outflow: +outflow.toFixed(2),
      net: +net.toFixed(2),
      periodLabel: `${from.toISOString().slice(0,10)} — ${now.toISOString().slice(0,10)}`
    };
  }, [transactions, daysWindow]);

  // Плановые платежи
  const plannedLists = useMemo(() => {
    const today = new Date().toISOString().slice(0,10);
    const upcoming = planned
      .filter(p => !p.matchedTxId && p.date >= today)
      .sort((a,b)=> a.date < b.date ? -1 : 1)
      .slice(0, 10);
    const overdue = planned
      .filter(p => !p.matchedTxId && p.date < today)
      .sort((a,b)=> a.date < b.date ? -1 : 1)
      .slice(0, 10);

    const sumEur = (list: Planned[]) => +list.reduce((s,p)=> s + Number(p.eurAmount || 0), 0).toFixed(2);

    return {
      upcoming,
      overdue,
      sumUpcoming: sumEur(upcoming),
      sumOverdue: sumEur(overdue),
    };
  }, [planned]);

  // Последние транзакции (факт/сверено)
  const recentTx = useMemo(() => {
    return transactions
      .filter(t => t.status === "actual" || t.status === "reconciled")
      .slice(0, 10)
      .map(t => {
        const cat = t.categoryId ? catById.get(t.categoryId)?.name : undefined;
        const accName =
          t.type === "transfer"
            ? "Перевод"
            : (t.accountId ? (accById.get(t.accountId)?.name || t.accountId) : "—");
        return {
          id: t.id!,
          date: t.date,
          type: t.type,
          status: t.status,
          account: accName,
          category: cat || "—",
          amountLabel: `${(t.amount?.value||0).toFixed(2)} ${t.amount?.currency || ""}`,
          eur: +Number(t.baseAmount || 0).toFixed(2),
          note: t.note || "",
        };
      });
  }, [transactions, catById, accById]);

  return (
    <ManagerLayout>
      <Head><title>Финансовый обзор</title></Head>
      <div className="max-w-7xl mx-auto py-8 space-y-6">

        {/* Заголовок + окно */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Финансовый обзор</h1>
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
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi title="Денежные средства (EUR)" value={accountRows.totalEur} emphasis />
          <Kpi title="Приток за период (EUR)" value={flow.inflow} />
          <Kpi title="Отток за период (EUR)" value={flow.outflow} />
          <Kpi title="Net поток (EUR)" value={flow.net} emphasis={true} />
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
                {plannedLists.upcoming.map(p=>(
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
                {plannedLists.upcoming.length===0 && (
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
                {plannedLists.overdue.map(p=>(
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
                {plannedLists.overdue.length===0 && (
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