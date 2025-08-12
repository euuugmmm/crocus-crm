// pages/finance/cashflow-calendar.tsx
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import {
  collection, onSnapshot, orderBy, query, where
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Account, Planned, Transaction } from "@/lib/finance/types";
import { Button } from "@/components/ui/button";

/** utils: локальные YYYY-MM-DD (без UTC-сдвигов) */
const localISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth   = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const startOfCalendar = (d: Date) => {
  const first = startOfMonth(d);
  const dow = (first.getDay() + 6) % 7; // понедельник=0
  const res = new Date(first);
  res.setDate(first.getDate() - dow);
  return res;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const sameDay = (a: Date, b: Date) => localISO(a) === localISO(b);

export default function CashflowCalendarPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  /** месяц */
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const monthStart = startOfMonth(anchor);
  const monthEnd   = endOfMonth(anchor);
  const calStart   = startOfCalendar(anchor);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(calStart, i)), [calStart]); // 6 недель

  /** фильтры */
  const [onlyAccount, setOnlyAccount] = useState<string>("all");
  const [onlySide, setOnlySide] = useState<"all" | "income" | "expense">("all");
  const [showPlan, setShowPlan] = useState(true);
  const [showActual, setShowActual] = useState(true);

  /** данные */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [planned, setPlanned]   = useState<Planned[]>([]);
  const [txs, setTxs]           = useState<Transaction[]>([]);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canView) { router.replace("/agent/bookings"); return; }

    const ua = onSnapshot(
      query(collection(db, "finance_accounts")),
      snap => setAccounts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })))
    );

    // диапазон месяца (6 недель сетки)
    const qFrom = localISO(addDays(calStart, 0));
    const qTo   = localISO(addDays(calStart, 41));

    const up = onSnapshot(
      query(
        collection(db, "finance_planned"),
        where("date", ">=", qFrom),
        where("date", "<=", qTo),
        orderBy("date", "asc")
      ),
      snap => setPlanned(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })))
    );

    const ut = onSnapshot(
      query(
        collection(db, "finance_transactions"),
        where("date", ">=", qFrom),
        where("date", "<=", qTo),
        orderBy("date", "asc")
      ),
      snap => setTxs(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })))
    );

    return () => { ua(); up(); ut(); };
  }, [user, canView, router, calStart]);

  /** индексы (на будущее; сейчас в рендере ищем прямо в массиве) */
  const accById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of accounts) if (a.id) m.set(a.id, a);
    return m;
  }, [accounts]);

  /** агрегация по дням */
  type DayAgg = {
    planIncome: number; planExpense: number;
    planIncomeOverdue: number; planExpenseOverdue: number;
    planIncomeMatched: number; planExpenseMatched: number;
    actualIncome: number; actualExpense: number;
    planItems: Planned[]; // и псевдо-элементы планов из transactions
    txItems: Transaction[];
  };

  const perDay = useMemo(() => {
    const map = new Map<string, DayAgg>();
    const todayISO = localISO(new Date());

    const fitAcc = (accId?: string | null) =>
      onlyAccount === "all" || (accId && accId === onlyAccount);
    const fitSide = (side: "income" | "expense") =>
      onlySide === "all" || side === onlySide;

    if (showPlan) {
      // 1) Старые планы (finance_planned)
      for (const p of planned) {
        if (!fitAcc((p as any).accountId)) continue;
        if (!fitSide(p.side)) continue;

        const key = p.date; // YYYY-MM-DD
        if (!key) continue;

        if (!map.has(key)) map.set(key, {
          planIncome: 0, planExpense: 0,
          planIncomeOverdue: 0, planExpenseOverdue: 0,
          planIncomeMatched: 0, planExpenseMatched: 0,
          actualIncome: 0, actualExpense: 0,
          planItems: [], txItems: []
        });
        const agg = map.get(key)!;
        const val = Number((p as any).eurAmount ?? (p as any).amount ?? 0);

        const isOverdue = (p as any).matchedTxId ? false : (key < todayISO);
        const isMatched = !!(p as any).matchedTxId;

        if (p.side === "income") {
          agg.planIncome += val;
          if (isOverdue) agg.planIncomeOverdue += val;
          if (isMatched) agg.planIncomeMatched += val;
        } else {
          agg.planExpense += val;
          if (isOverdue) agg.planExpenseOverdue += val;
          if (isMatched) agg.planExpenseMatched += val;
        }
        agg.planItems.push(p);
      }

      // 2) НОВЫЕ планы (finance_transactions, status="planned")
      for (const t of txs) {
        if (t.status !== "planned") continue;
        if (t.type === "transfer") continue;

        const side: "income" | "expense" = t.type === "in" ? "income" : "expense";
        if (!fitSide(side)) continue;
        if (!fitAcc((t as any).accountId)) continue;

        // ключ дня: dueDate предпочтительнее, иначе date
        const key = (t as any).dueDate || t.date;
        if (!key) continue;

        if (!map.has(key)) map.set(key, {
          planIncome: 0, planExpense: 0,
          planIncomeOverdue: 0, planExpenseOverdue: 0,
          planIncomeMatched: 0, planExpenseMatched: 0,
          actualIncome: 0, actualExpense: 0,
          planItems: [], txItems: []
        });
        const agg = map.get(key)!;

        const val = Number((t as any).baseAmount ?? (t as any).amount?.value ?? 0);
        const isOverdue = key < todayISO;

        if (side === "income") {
          agg.planIncome += val;
          if (isOverdue) agg.planIncomeOverdue += val;
        } else {
          agg.planExpense += val;
          if (isOverdue) agg.planExpenseOverdue += val;
        }

        // Псевдо-элемент плана для модалки
        agg.planItems.push({
          id: t.id!,
          date: key,
          side,
          amount: val,
          eurAmount: val,
          accountId: (t as any).accountId,
          accountName: undefined,
          matchedTxId: undefined,
        } as any as Planned);
      }
    }

    if (showActual) {
      for (const t of txs) {
        if (!(t.status === "actual" || t.status === "reconciled")) continue;
        if (t.type === "transfer") continue;

        if (!fitAcc((t as any).accountId)) continue;

        const side: "income" | "expense" = t.type === "in" ? "income" : "expense";
        if (!fitSide(side)) continue;

        // для факта используем actualDate, если задан; иначе date
        const key = (t as any).actualDate || t.date;
        if (!key) continue;

        if (!map.has(key)) map.set(key, {
          planIncome: 0, planExpense: 0,
          planIncomeOverdue: 0, planExpenseOverdue: 0,
          planIncomeMatched: 0, planExpenseMatched: 0,
          actualIncome: 0, actualExpense: 0,
          planItems: [], txItems: []
        });
        const agg = map.get(key)!;
        const val = Number((t as any).baseAmount ?? (t as any).amount?.value ?? 0);

        if (side === "income") agg.actualIncome += val;
        else agg.actualExpense += val;

        agg.txItems.push(t);
      }
    }

    return map;
  }, [planned, txs, onlyAccount, onlySide, showPlan, showActual]);

  /** выбранный день — модалка */
  const [openDay, setOpenDay] = useState<string | null>(null);
  const picked = openDay ? perDay.get(openDay) : undefined;

  /** итоги месяца */
  const monthTotals = useMemo(() => {
    let pi = 0, pe = 0, ai = 0, ae = 0, od = 0;
    for (const d of days) {
      const k = localISO(d);
      const v = perDay.get(k);
      if (!v) continue;
      pi += v.planIncome; pe += v.planExpense;
      ai += v.actualIncome; ae += v.actualExpense;
      od += v.planIncomeOverdue + v.planExpenseOverdue;
    }
    return {
      planIn: +pi.toFixed(2), planOut: +pe.toFixed(2),
      actIn: +ai.toFixed(2),  actOut: +ae.toFixed(2),
      overdue: +od.toFixed(2),
      planNet: +(pi - pe).toFixed(2),
      actNet:  +(ai - ae).toFixed(2),
    };
  }, [perDay, days]);

  return (
    <ManagerLayout>
      <Head><title>Календарь ДДС — Финансы</title></Head>
      <div className="max-w-7xl mx-auto py-8 space-y-6">

        {/* Заголовок + навигация по месяцу */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">Календарь ДДС (План/Факт/Сверка)</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-8 px-3 text-xs"
              onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth()-1, 1))}>
              ← Пред. месяц
            </Button>
            <div className="text-sm font-medium w-40 text-center">
              {anchor.toLocaleDateString("ru-RU", { year: "numeric", month: "long" })}
            </div>
            <Button variant="outline" className="h-8 px-3 text-xs"
              onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth()+1, 1))}>
              След. месяц →
            </Button>
            <Button variant="outline" className="h-8 px-3 text-xs"
              onClick={() => setAnchor(new Date())}>
              Сегодня
            </Button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-sm border rounded-xl p-3">
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Счёт</div>
            <select className="w-full border rounded px-2 py-1"
              value={onlyAccount} onChange={e => setOnlyAccount(e.target.value)}>
              <option value="all">Все</option>
              {accounts.filter(a=>!a.archived).map(a=>(
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Тип</div>
            <select className="w-full border rounded px-2 py-1"
              value={onlySide} onChange={e => setOnlySide(e.target.value as any)}>
              <option value="all">Все</option>
              <option value="income">Поступления</option>
              <option value="expense">Выплаты</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={showPlan}
                     onChange={e=>setShowPlan(e.target.checked)} />
              План
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={showActual}
                     onChange={e=>setShowActual(e.target.checked)} />
              Факт/Сверено
            </label>
          </div>
          <div className="sm:col-span-2 flex items-center">
            <div className="text-xs text-gray-600">
              <b>Просрочка</b> = плановые без сопоставления и датой меньше сегодня. Суммы в EUR.
            </div>
          </div>
        </div>

        {/* Легенда */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" /> План</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Факт</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-500" /> Просрочка (план)</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-sky-500" /> План сопоставлен</span>
        </div>

        {/* Сетка календаря */}
        <div className="grid grid-cols-7 gap-[1px] bg-gray-200 rounded-lg overflow-hidden">
          {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(d=>(
            <div key={d} className="bg-gray-50 text-center text-xs font-semibold py-2">{d}</div>
          ))}
          {days.map((d, idx) => {
            const key = localISO(d);
            const v = perDay.get(key);
            const inMonth = d.getMonth() === anchor.getMonth();
            const isToday = sameDay(d, new Date());
            return (
              <div key={idx} className={`bg-white min-h-[108px] p-2 text-xs ${inMonth ? "" : "bg-gray-50 text-gray-400"}`}>
                <div className="flex items-center justify-between">
                  <div className={`text-sm ${isToday ? "font-bold text-blue-600" : ""}`}>{d.getDate()}</div>
                  {v && (v.planIncomeOverdue + v.planExpenseOverdue) > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-red-700">
                      ● просрочено
                    </span>
                  )}
                </div>

                {/* суммы дня */}
                {v && (
                  <div className="mt-1 space-y-1">
                    {/* план */}
                    {(v.planIncome !== 0 || v.planExpense !== 0) && (
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1">
                          <i className="h-2 w-2 rounded-full bg-amber-400" /> План
                        </span>
                        <div className="text-right">
                          <div>+{v.planIncome.toFixed(2)} €</div>
                          <div>-{v.planExpense.toFixed(2)} €</div>
                        </div>
                      </div>
                    )}
                    {/* факт */}
                    {(v.actualIncome !== 0 || v.actualExpense !== 0) && (
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1">
                          <i className="h-2 w-2 rounded-full bg-emerald-500" /> Факт
                        </span>
                        <div className="text-right">
                          <div>+{v.actualIncome.toFixed(2)} €</div>
                          <div>-{v.actualExpense.toFixed(2)} €</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* кнопка подробностей */}
                {v && (
                  <div className="mt-2">
                    <button className="w-full border rounded px-2 py-1 hover:bg-gray-50"
                      onClick={()=>setOpenDay(key)}>
                      Детали
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Итого по месяцу */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KPI title="План поступления" value={monthTotals.planIn} />
          <KPI title="План выплаты" value={monthTotals.planOut} />
          <KPI title="Плановый чистый поток" value={monthTotals.planNet} emphasis />
          <KPI title="Факт поступления" value={monthTotals.actIn} />
          <KPI title="Факт выплаты" value={monthTotals.actOut} />
          <KPI title="Фактический чистый поток" value={monthTotals.actNet} emphasis />
        </div>

      </div>

      {/* Модалка дня */}
      {openDay && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="w-full max-w-3xl bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Детали: {openDay}</h2>
              <button className="text-2xl leading-none" onClick={()=>setOpenDay(null)}>×</button>
            </div>

            {picked ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {/* План */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-amber-50 font-semibold">Плановые</div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr className="text-center">
                        <th className="border px-2 py-1">Тип</th>
                        <th className="border px-2 py-1">Сумма (EUR)</th>
                        <th className="border px-2 py-1">Счёт</th>
                        <th className="border px-2 py-1">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {picked.planItems.map((p:any)=>(
                        <tr key={p.id} className="text-center">
                          <td className="border px-2 py-1">{p.side==="income" ? "Поступление" : "Выплата"}</td>
                          <td className="border px-2 py-1 text-right">{Number(p.eurAmount ?? p.amount ?? 0).toFixed(2)}</td>
                          <td className="border px-2 py-1">{p.accountName || accounts.find(a=>a.id===p.accountId)?.name || "—"}</td>
                          <td className="border px-2 py-1">
                            {p.matchedTxId
                              ? <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20">Сопоставлено</span>
                              : (p.date < localISO(new Date())
                                  ? <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Просрочено</span>
                                  : <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20">Предстоит</span>)}
                          </td>
                        </tr>
                      ))}
                      {picked.planItems.length===0 && (
                        <tr><td colSpan={4} className="border px-2 py-3 text-center text-gray-500">Нет плановых</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Факт */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-emerald-50 font-semibold">Факт / Сверено</div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr className="text-center">
                        <th className="border px-2 py-1">Тип</th>
                        <th className="border px-2 py-1">Сумма (EUR)</th>
                        <th className="border px-2 py-1">Счёт</th>
                        <th className="border px-2 py-1">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {picked.txItems.map(t=>{
                        const side = t.type==="in" ? "Поступление" : t.type==="out" ? "Выплата" : "—";
                        const accId = (t as any).accountId as string | undefined;
                        return (
                          <tr key={t.id} className="text-center">
                            <td className="border px-2 py-1">{side}</td>
                            <td className="border px-2 py-1 text-right">{Number((t as any).baseAmount ?? (t as any).amount?.value ?? 0).toFixed(2)}</td>
                            <td className="border px-2 py-1">{accounts.find(a=>a.id===accId)?.name || "—"}</td>
                            <td className="border px-2 py-1">{t.status}</td>
                          </tr>
                        );
                      })}
                      {picked.txItems.length===0 && (
                        <tr><td colSpan={4} className="border px-2 py-3 text-center text-gray-500">Нет фактических</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Нет данных</div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={()=>setOpenDay(null)} className="h-8 px-3 text-xs">Закрыть</Button>
              <Button variant="outline" onClick={()=>router.push("/finance/planned")} className="h-8 px-3 text-xs">
                Открыть План-Факт
              </Button>
              <Button variant="outline" onClick={()=>router.push("/finance/transactions")} className="h-8 px-3 text-xs">
                Открыть Транзакции
              </Button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}

function KPI({ title, value, emphasis }:{ title:string; value:number; emphasis?:boolean }) {
  return (
    <div className={`border rounded-lg p-3 ${emphasis ? "bg-blue-50" : ""}`}>
      <div className="text-[11px] text-gray-600">{title}</div>
      <div className={`mt-1 text-lg font-semibold ${emphasis ? "text-blue-800" : ""}`}>{value.toFixed(2)} €</div>
    </div>
  );
}