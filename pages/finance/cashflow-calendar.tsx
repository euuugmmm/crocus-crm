// pages/finance/cashflow-calendar.tsx
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  getDocs,
  doc,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/firebaseConfig";
import type { Account, Planned, Transaction } from "@/lib/finance/types";
import type { AccountDailyDoc, CacheMeta } from "@/types/finance-cache";
import { Button } from "@/components/ui/button";
import {
  localISO,
  startOfMonth,
  endOfMonth,
  startOfCalendar,
  addDays,
  sameDay,
} from "@/lib/finance/ranges";
import { canViewFinance } from "@/lib/finance/roles";

/** безопасное модульное число */
const absNum = (v: any) => Math.abs(Number(v) || 0);
type Mode = "cache" | "live";

/** безопасный показ даты/времени из Firestore Timestamp / ISO / number */
function tsToLocal(ts: any, locale: string = "ru-RU") {
  const d =
    ts?.toDate?.() ??
    (typeof ts === "number" ? new Date(ts) : typeof ts === "string" ? new Date(ts) : null);
  return d instanceof Date && !isNaN(+d) ? d.toLocaleString(locale) : "—";
}

/** получаем Firebase ID-токен из контекста/авторизации */
async function getIdTokenSafely(user: any): Promise<string | null> {
  try {
    if (user?.getIdToken) return await user.getIdToken();
    const auth = getAuth();
    if (auth.currentUser) return await auth.currentUser.getIdToken();
    return null;
  } catch {
    return null;
  }
}

export default function CashflowCalendarPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();

  // Просмотр: временно включаем и менеджерам
  const canView = canViewFinance(
    { isManager, isSuperManager, isAdmin },
    { includeManager: true }
  );
  // Пересборка кэша: тоже оставляем менеджеру (временно)
  const canRebuild = !!(isManager || isSuperManager || isAdmin);

  /** месяц (якорь) */
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  // calStart должен быть стабильным между рендерами
  const calStart = useMemo(() => startOfCalendar(anchor), [anchor]);
  const days = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(calStart, i)),
    [calStart]
  ); // 6 недель

  /** фильтры */
  const [onlyAccount, setOnlyAccount] = useState<string>("all");
  const [onlySide, setOnlySide] = useState<"all" | "income" | "expense">("all");
  const [showPlan, setShowPlan] = useState(true);
  const [showActual, setShowActual] = useState(true);

  /** режим (кэш/лайв) */
  const mode: Mode = onlyAccount === "all" ? "cache" : "live";

  /** данные */
  const [accounts, setAccounts] = useState<Account[]>([]);

  // КЭШ: дневные агрегаты + мета
  const [daily, setDaily] = useState<AccountDailyDoc[]>([]);
  const [meta, setMeta] = useState<CacheMeta | null>(null);

  // LIVE: планы и транзакции на диапазон сетки (используем только если выбран конкретный счёт)
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);

  // состояние кнопки обновления
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canView) {
      router.replace("/agent/bookings");
      return;
    }
  }, [user, canView, router]);

  useEffect(() => {
    if (!user || !canView) return;

    const ua = onSnapshot(
      query(collection(db, "finance_accounts")),
      (snap) =>
        setAccounts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );

    // подписка на мета-кэш (время последнего обновления и статус)
    const um = onSnapshot(
      doc(db, "finance_cacheMeta", "accountDaily"),
      (snap) => {
        if (snap.exists()) {
          setMeta({ id: snap.id, ...(snap.data() as any) } as CacheMeta);
        } else {
          setMeta(null);
        }
      },
      (err) => console.error("[cacheMeta] onSnapshot error:", err)
    );

    // диапазон месяца (6 недель сетки)
    const qFrom = localISO(addDays(calStart, 0));
    const qTo = localISO(addDays(calStart, 41));

    let unsubCache: (() => void) | undefined;
    let unsubPlan: (() => void) | undefined;
    let unsubTx: (() => void) | undefined;

    if (mode === "cache") {
      // Лёгкий поток: читаем только 42 дня агрегатов
      unsubCache = onSnapshot(
        query(
          collection(db, "finance_accountDaily"),
          where("date", ">=", qFrom),
          where("date", "<=", qTo),
          orderBy("date", "asc")
        ),
        (snap) =>
          setDaily(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any
          ),
        (err) => console.error("[accountDaily] onSnapshot error:", err)
      );
      // В кэш-режиме НЕ подписываемся на большие коллекции
      setPlanned([]);
      setTxs([]);
    } else {
      // Live-режим: фильтр по счёту → читаем узкий диапазон из оригинальных коллекций
      unsubPlan = onSnapshot(
        query(
          collection(db, "finance_planned"),
          where("date", ">=", qFrom),
          where("date", "<=", qTo),
          orderBy("date", "asc")
        ),
        (snap) =>
          setPlanned(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
          ),
        (err) => console.error("[planned] onSnapshot error:", err)
      );

      unsubTx = onSnapshot(
        query(
          collection(db, "finance_transactions"),
          where("date", ">=", qFrom),
          where("date", "<=", qTo),
          orderBy("date", "asc")
        ),
        (snap) =>
          setTxs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
        (err) => console.error("[transactions] onSnapshot error:", err)
      );

      setDaily([]);
    }

    return () => {
      ua();
      um();
      if (unsubCache) unsubCache();
      if (unsubPlan) unsubPlan();
      if (unsubTx) unsubTx();
    };
  }, [user, canView, calStart, mode]);

  /** индексы аккаунтов */
  const accById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of accounts) if (a.id) m.set(a.id, a);
    return m;
  }, [accounts]);

  /** агрегация по дням для сетки (из кэша или из live-данных) */
  type DayAgg = {
    planIncome: number;
    planExpense: number;
    planIncomeOverdue: number;
    planExpenseOverdue: number;
    planIncomeMatched: number;
    planExpenseMatched: number;
    actualIncome: number;
    actualExpense: number;
  };

  const perDay = useMemo(() => {
    const map = new Map<string, DayAgg>();
    const todayISO = localISO(new Date());

    const fitAcc = (accId?: string | null) =>
      onlyAccount === "all" || (accId && accId === onlyAccount);
    const fitSide = (side: "income" | "expense") =>
      onlySide === "all" || side === onlySide;

    // инициализируем пустые дни (чтобы потом легко суммировать)
    for (const d of days) {
      const k = localISO(d);
      map.set(k, {
        planIncome: 0,
        planExpense: 0,
        planIncomeOverdue: 0,
        planExpenseOverdue: 0,
        planIncomeMatched: 0,
        planExpenseMatched: 0,
        actualIncome: 0,
        actualExpense: 0,
      });
    }

    if (mode === "cache") {
      // Быстрая ветка: используем предрассчитанные дневные суммы
      for (const doc of daily) {
        const k = doc.date;
        const agg = map.get(k);
        if (!agg) continue;

        if (showPlan) {
          if (onlySide !== "expense") {
            agg.planIncome += absNum(doc.planIncome || 0);
            agg.planIncomeOverdue += absNum(doc.planIncomeOverdue || 0);
            agg.planIncomeMatched += absNum(doc.planIncomeMatched || 0);
          }
          if (onlySide !== "income") {
            agg.planExpense += absNum(doc.planExpense || 0);
            agg.planExpenseOverdue += absNum(doc.planExpenseOverdue || 0);
            agg.planExpenseMatched += absNum(doc.planExpenseMatched || 0);
          }
        }
        if (showActual) {
          if (onlySide !== "expense") {
            agg.actualIncome += absNum(doc.actualIncome || 0);
          }
          if (onlySide !== "income") {
            agg.actualExpense += absNum(doc.actualExpense || 0);
          }
        }
      }
      return map;
    }

    // Live-ветка
    if (showPlan) {
      // Старые планы (finance_planned)
      for (const p of planned) {
        if (!fitAcc((p as any).accountId)) continue;
        if (!fitSide(p.side)) continue;
        const key = p.date;
        if (!key) continue;
        const agg = map.get(key);
        if (!agg) continue;

        const val = absNum((p as any).eurAmount ?? (p as any).amount ?? 0);
        const isOverdue = (p as any).matchedTxId ? false : key < todayISO;
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
      }

      // Новые планы (finance_transactions, status="planned")
      for (const t of txs) {
        if (t.status !== "planned") continue;
        if (t.type === "transfer") continue;

        const side: "income" | "expense" = t.type === "in" ? "income" : "expense";
        if (!fitSide(side)) continue;
        if (!fitAcc((t as any).accountId)) continue;

        const key = (t as any).dueDate || t.date;
        if (!key) continue;
        const agg = map.get(key);
        if (!agg) continue;

        const val = absNum((t as any).baseAmount ?? (t as any).amount?.value ?? 0);
        const isOverdue = key < todayISO;

        if (side === "income") {
          agg.planIncome += val;
          if (isOverdue) agg.planIncomeOverdue += val;
        } else {
          agg.planExpense += val;
          if (isOverdue) agg.planExpenseOverdue += val;
        }
      }
    }

    if (showActual) {
      for (const t of txs) {
        if (!(t.status === "actual" || t.status === "reconciled")) continue;
        if (t.type === "transfer") continue;
        if (!fitAcc((t as any).accountId)) continue;

        const side: "income" | "expense" = t.type === "in" ? "income" : "expense";
        if (!fitSide(side)) continue;

        const key = (t as any).actualDate || t.date;
        if (!key) continue;

        const agg = map.get(key);
        if (!agg) continue;

        const val = absNum((t as any).baseAmount ?? (t as any).amount?.value ?? 0);

        if (side === "income") agg.actualIncome += val;
        else agg.actualExpense += val;
      }
    }

    return map;
  }, [mode, daily, planned, txs, days, onlyAccount, onlySide, showPlan, showActual]);

  /** выбранный день — модалка + ленивые детали (узкие запросы на 1 дату) */
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [dayPlans, setDayPlans] = useState<Planned[]>([]);
  const [dayTxs, setDayTxs] = useState<Transaction[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    if (!openDay) return;
    let cancelled = false;

    (async () => {
      setDetailsLoading(true);
      setDetailsError(null);
      setDayPlans([]);
      setDayTxs([]);

      try {
        // PLANNED (legacy, по дате)
        const pSnap = await getDocs(
          query(collection(db, "finance_planned"), where("date", "==", openDay))
        );
        const pList = pSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Planned[];

        // TX planned: dueDate == day и date == day (две выборки, потом фильтр по статусу)
        const [tPlannedDue, tPlannedDate] = await Promise.all([
          getDocs(query(collection(db, "finance_transactions"), where("dueDate", "==", openDay))),
          getDocs(query(collection(db, "finance_transactions"), where("date", "==", openDay))),
        ]);

        const plannedPseudo: Planned[] = [...tPlannedDue.docs, ...tPlannedDate.docs]
          .map((d) => {
            const t: any = d.data();
            const val = absNum(t.baseAmount ?? t.amount?.value ?? 0);
            return {
              id: d.id,
              date: openDay,
              side: t.type === "in" ? "income" : "expense",
              amount: val,
              eurAmount: val,
              accountId: t.accountId,
              matchedTxId: undefined,
              status: t.status,
            } as any;
          })
          .filter((p) => p.status === "planned"); // фильтруем статус на клиенте

        // объединяем planned без дублей
        const plannedMap = new Map<string, Planned>();
        for (const p of [...pList, ...plannedPseudo]) plannedMap.set(p.id!, p);
        const plannedArr = Array.from(plannedMap.values());
        if (!cancelled) setDayPlans(plannedArr);

        // TX actual/reconciled: actualDate == day и date == day (без фильтра в запросе)
        const [tActualActual, tActualDate] = await Promise.all([
          getDocs(query(collection(db, "finance_transactions"), where("actualDate", "==", openDay))),
          getDocs(query(collection(db, "finance_transactions"), where("date", "==", openDay))),
        ]);

        const txMap = new Map<string, Transaction>();
        for (const d of [...tActualActual.docs, ...tActualDate.docs]) {
          const t = { id: d.id, ...(d.data() as any) } as Transaction;
          const st = (t as any).status;
          if ((t as any).type === "transfer") continue;
          if (st !== "actual" && st !== "reconciled") continue; // фильтр статуса на клиенте
          txMap.set(t.id!, t);
        }
        const txArr = Array.from(txMap.values());
        if (!cancelled) setDayTxs(txArr);
      } catch (e: any) {
        if (!cancelled) setDetailsError(e?.message || String(e));
        console.error("[openDay details] error:", e);
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openDay]);

  /** итоги месяца */
  const monthTotals = useMemo(() => {
    let pi = 0,
      pe = 0,
      ai = 0,
      ae = 0,
      od = 0;
    for (const d of days) {
      const k = localISO(d);
      const v = perDay.get(k);
      if (!v) continue;
      pi += v.planIncome;
      pe += v.planExpense;
      ai += v.actualIncome;
      ae += v.actualExpense;
      od += v.planIncomeOverdue + v.planExpenseOverdue;
    }
    return {
      planIn: +pi.toFixed(2),
      planOut: +pe.toFixed(2),
      actIn: +ai.toFixed(2),
      actOut: +ae.toFixed(2),
      overdue: +od.toFixed(2),
      planNet: +(pi - pe).toFixed(2),
      actNet: +(ai - ae).toFixed(2),
    };
  }, [perDay, days]);

  // UI бейдж режима
  const ModeBadge = () => (
    <span
      className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
        mode === "cache"
          ? "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20"
          : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
      }`}
      title={
        mode === "cache"
          ? "Режим кэша: данные приходят из finance_accountDaily"
          : "Режим live: выбран конкретный счёт — считаем на лету за 6 недель"
      }
    >
      {mode === "cache" ? "режим: кэш" : "режим: live"}
    </span>
  );

  // обработчик обновления кэша для видимого диапазона (6 недель)
  const handleRebuild = async () => {
    if (!canRebuild) return;
    const from = localISO(addDays(calStart, 0));
    const to = localISO(addDays(calStart, 41));
    setRebuilding(true);
    try {
      const token = await getIdTokenSafely(user);
      if (!token) {
        alert("Ошибка обновления кэша: No token (войдите заново)");
        return;
      }

      const params = new URLSearchParams({ from, to }).toString();
      const res = await fetch(`/api/finance/cache/build-accountDaily?${params}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || res.statusText);

      // успех — onSnapshot кэш-коллекции и меты подтянет новые данные
    } catch (e: any) {
      alert(`Ошибка обновления кэша: ${e?.message || e}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <ManagerLayout>
      <Head>
        <title>Календарь ДДС — Финансы</title>
      </Head>
      <div className="max-w-7xl mx-auto py-8 space-y-6">
        {/* Заголовок + навигация по месяцу */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold">Календарь ДДС (План/Факт/Сверка)</h1>
            <ModeBadge />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={() =>
                setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))
              }
            >
              ← Пред. месяц
            </Button>
            <div className="text-sm font-medium w-40 text-center">
              {anchor.toLocaleDateString("ru-RU", {
                year: "numeric",
                month: "long",
              })}
            </div>
            <Button
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={() =>
                setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))
              }
            >
              След. месяц →
            </Button>
            <Button
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={() => setAnchor(new Date())}
            >
              Сегодня
            </Button>
          </div>
        </div>

        {/* Панель: фильтры + блок "последняя синхронизация" + кнопка обновления */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-sm border rounded-xl p-3">
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Счёт</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={onlyAccount}
              onChange={(e) => setOnlyAccount(e.target.value)}
            >
              <option value="all">Все (кэш)</option>
              {accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Тип</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={onlySide}
              onChange={(e) => setOnlySide(e.target.value as any)}
            >
              <option value="all">Все</option>
              <option value="income">Поступления</option>
              <option value="expense">Выплаты</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={showPlan}
                onChange={(e) => setShowPlan(e.target.checked)}
              />
              План
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={showActual}
                onChange={(e) => setShowActual(e.target.checked)}
              />
              Факт/Сверено
            </label>
          </div>

          {/* Последняя синхронизация */}
          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              <div>
                <b>Просрочка</b> = плановые без сопоставления и датой меньше сегодня. Суммы в EUR.
              </div>
              <div className="mt-1">
                <span className="text-gray-500">Последняя синхронизация:</span>{" "}
                <b>{tsToLocal(meta?.lastRunAt)}</b>
                {meta?.status ? (
                  <span
                    className={`ml-2 inline-flex items-center gap-1 text-[11px] px-2 py-[2px] rounded-full ${
                      meta.status === "running"
                        ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
                        : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                    }`}
                  >
                    {meta.status === "running" ? "в процессе…" : "готово"}
                  </span>
                ) : null}
              </div>
            </div>

            {canRebuild && (
              <Button
                onClick={handleRebuild}
                disabled={rebuilding || mode !== "cache"}
                className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                title={
                  mode === "cache"
                    ? "Пересчитать и сохранить кэш за видимый диапазон (6 недель)"
                    : "Доступно только в режиме кэша (выберите «Все (кэш)» в фильтре счёта)"
                }
              >
                {rebuilding ? "Обновляю…" : "Обновить кэш (6 недель)"}
              </Button>
            )}
          </div>
        </div>

        {/* Легенда */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-amber-400" /> План
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-emerald-500" /> Факт
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-red-500" /> Просрочка (план)
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-sky-500" /> План сопоставлен
          </span>
        </div>

        {/* Сетка календаря */}
        <div className="grid grid-cols-7 gap-[1px] bg-gray-200 rounded-lg overflow-hidden">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
            <div
              key={d}
              className="bg-gray-50 text-center text-xs font-semibold py-2"
            >
              {d}
            </div>
          ))}
          {days.map((d, idx) => {
            const key = localISO(d);
            const v = perDay.get(key);
            const inMonth = d.getMonth() === anchor.getMonth();
            const isToday = sameDay(d, new Date());
            return (
              <div
                key={idx}
                className={`bg-white min-h-[108px] p-2 text-xs ${
                  inMonth ? "" : "bg-gray-50 text-gray-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`text-sm ${
                      isToday ? "font-bold text-blue-600" : ""
                    }`}
                  >
                    {d.getDate()}
                  </div>
                  {v && v.planIncomeOverdue + v.planExpenseOverdue > 0 && (
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
                    <button
                      className="w-full border rounded px-2 py-1 hover:bg-gray-50"
                      onClick={() => setOpenDay(key)}
                    >
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
          <KPI
            title="Плановый чистый поток"
            value={monthTotals.planNet}
            emphasis
          />
          <KPI title="Факт поступления" value={monthTotals.actIn} />
          <KPI title="Факт выплаты" value={monthTotals.actOut} />
          <KPI
            title="Фактический чистый поток"
            value={monthTotals.actNet}
            emphasis
          />
        </div>
      </div>

      {/* Модалка дня (детали) */}
      {openDay && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="w-full max-w-3xl bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Детали: {openDay}</h2>
              <button
                className="text-2xl leading-none"
                onClick={() => setOpenDay(null)}
              >
                ×
              </button>
            </div>

            {detailsLoading ? (
              <div className="p-6 text-center text-sm text-gray-500">Загрузка…</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {/* План */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-amber-50 font-semibold">
                    Плановые
                  </div>
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
                      {dayPlans.map((p: any) => (
                        <tr key={p.id} className="text-center">
                          <td className="border px-2 py-1">
                            {p.side === "income" ? "Поступление" : "Выплата"}
                          </td>
                          <td className="border px-2 py-1 text-right">
                            {absNum(p.eurAmount ?? p.amount ?? 0).toFixed(2)}
                          </td>
                          <td className="border px-2 py-1">
                            {p.accountName ||
                              accById.get(p.accountId)?.name ||
                              "—"}
                          </td>
                          <td className="border px-2 py-1">
                            {p.matchedTxId ? (
                              <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20">
                                Сопоставлено
                              </span>
                            ) : p.date < localISO(new Date()) ? (
                              <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">
                                Просрочено
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                Предстоит
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {dayPlans.length === 0 && !detailsLoading && (
                        <tr>
                          <td
                            colSpan={4}
                            className="border px-2 py-3 text-center text-gray-500"
                          >
                            Нет плановых
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Факт */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-emerald-50 font-semibold">
                    Факт / Сверено
                  </div>
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
                      {dayTxs.map((t) => {
                        const side =
                          t.type === "in"
                            ? "Поступление"
                            : t.type === "out"
                            ? "Выплата"
                            : "—";
                        const accId = (t as any).accountId as string | undefined;
                        const val = absNum(
                          (t as any).baseAmount ?? (t as any).amount?.value ?? 0
                        );
                        return (
                          <tr key={t.id} className="text-center">
                            <td className="border px-2 py-1">{side}</td>
                            <td className="border px-2 py-1 text-right">
                              {val.toFixed(2)}
                            </td>
                            <td className="border px-2 py-1">
                              {accById.get(accId || "")?.name || "—"}
                            </td>
                            <td className="border px-2 py-1">{t.status}</td>
                          </tr>
                        );
                      })}
                      {dayTxs.length === 0 && !detailsLoading && (
                        <tr>
                          <td
                            colSpan={4}
                            className="border px-2 py-3 text-center text-gray-500"
                          >
                            Нет фактических
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detailsError && (
              <div className="mt-3 text-xs text-red-600">{detailsError}</div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setOpenDay(null)}
                className="h-8 px-3 text-xs"
              >
                Закрыть
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/finance/planned")}
                className="h-8 px-3 text-xs"
              >
                Открыть План-Факт
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/finance/transactions")}
                className="h-8 px-3 text-xs"
              >
                Открыть Транзакции
              </Button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}

function KPI({
  title,
  value,
  emphasis,
}: {
  title: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className={`border rounded-lg p-3 ${emphasis ? "bg-blue-50" : ""}`}>
      <div className="text-[11px] text-gray-600">{title}</div>
      <div
        className={`mt-1 text-lg font-semibold ${
          emphasis ? "text-blue-800" : ""
        }`}
      >
        {value.toFixed(2)} €
      </div>
    </div>
  );
}