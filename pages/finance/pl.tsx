/* pages/finance/pl.tsx */
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  documentId,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Button } from "@/components/ui/button";
import { canViewFinance } from "@/lib/finance/roles";

/** ----- types (локально) ----- */
type CacheMeta = {
  id: string;
  lastRunAt?: any;     // Firestore TS / ISO / number
  status?: "running" | "done";
  range?: { from?: string; to?: string };
  error?: string;
};

type PLMonthlyDoc = {
  id: string;          // = "YYYY-MM" (documentId)
  ym?: string;         // поле может быть или нет — не критично
  revenue?: number;    // EUR
  cogs?: number;       // EUR
  opex?: number;       // EUR
  gross?: number;      // revenue - cogs
  net?: number;        // gross - opex
  updatedAt?: any;
};

/** ----- helpers (локальные даты, без UTC) ----- */
function localISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISO(iso: string): Date {
  // ожидаем YYYY-MM-DD
  const [y, m, d] = (iso || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
const ymOf = (iso: string) => (iso || "").slice(0, 7);
function listMonths(fromISO: string, toISO: string) {
  const out: string[] = [];
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}
function tsToLocal(ts: any, locale = "ru-RU") {
  const d =
    ts?.toDate?.() ??
    (typeof ts === "number"
      ? new Date(ts)
      : typeof ts === "string"
      ? new Date(ts)
      : null);
  return d instanceof Date && !isNaN(+d) ? d.toLocaleString(locale) : "—";
}

export default function PLPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();

  // просмотр и пересчёт — временно оставляем менеджерам тоже
  const canView = canViewFinance(
    { isManager, isSuperManager, isAdmin },
    { includeManager: true }
  );
  // можно оставить менеджеру право пересчёта — как просили
  const canRebuild = !!(isManager || isSuperManager || isAdmin);

  // фильтры периода (ЛОКАЛЬНО!)
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState<string>(localISO(thisMonthStart));
  const [dateTo, setDateTo] = useState<string>(localISO(new Date()));
  const [groupBy, setGroupBy] = useState<"month" | "total">("month");

  // данные из кэша
  const [rows, setRows] = useState<PLMonthlyDoc[]>([]);
  const [meta, setMeta] = useState<CacheMeta | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // редиректы по роли/логину
  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canView) { router.replace("/agent/bookings"); return; }
  }, [user, canView, router]);

  // подписки на кэш и мету (по диапазону месяцев) — ФИЛЬТР ПО ID
  useEffect(() => {
    if (!user || !canView) return;

    const ymFrom = ymOf(dateFrom);
    const ymTo = ymOf(dateTo);
    setLoadError(null);

    const unsubRows = onSnapshot(
      query(
        collection(db, "finance_plMonthly"),
        where(documentId(), ">=", ymFrom),
        where(documentId(), "<=", ymTo),
        orderBy(documentId(), "asc")
      ),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as any) } as PLMonthlyDoc)
        );
        setRows(list);
      },
      (err) => {
        console.error("[plMonthly] onSnapshot error:", err);
        setRows([]);
        setLoadError(err?.message || String(err));
      }
    );

    const unsubMeta = onSnapshot(
      doc(db, "finance_cacheMeta", "plMonthly"),
      (snap) => {
        if (snap.exists()) setMeta({ id: snap.id, ...(snap.data() as any) } as CacheMeta);
        else setMeta(null);
      },
      (err) => console.error("[cacheMeta/plMonthly] onSnapshot error:", err)
    );

    return () => { unsubRows(); unsubMeta(); };
  }, [user, canView, dateFrom, dateTo]);

  // агрегаты для экрана
  const view = useMemo(() => {
    const months = listMonths(dateFrom, dateTo);
    const byId = new Map<string, PLMonthlyDoc>();
    for (const r of rows) byId.set(r.id, r);

    const arr = months.map((ym) => {
      const r = byId.get(ym);
      const revenue = Number(r?.revenue || 0);
      const cogs    = Number(r?.cogs || 0);
      const opex    = Number(r?.opex || 0);
      const gross   = r?.gross != null ? Number(r.gross) : revenue - cogs;
      const net     = r?.net   != null ? Number(r.net)   : gross - opex;
      return {
        ym,
        revenue: +revenue.toFixed(2),
        cogs:    +cogs.toFixed(2),
        gross:   +gross.toFixed(2),
        opex:    +opex.toFixed(2),
        net:     +net.toFixed(2),
      };
    });

    if (groupBy === "total") {
      const t = arr.reduce(
        (s, r) => ({
          revenue: s.revenue + r.revenue,
          cogs: s.cogs + r.cogs,
          gross: s.gross + r.gross,
          opex: s.opex + r.opex,
          net: s.net + r.net,
        }),
        { revenue: 0, cogs: 0, gross: 0, opex: 0, net: 0 }
      );
      return { rows: [{ ...t, ym: `${dateFrom} — ${dateTo}` }], totals: t };
    }

    const totals = arr.reduce(
      (s, r) => ({
        revenue: s.revenue + r.revenue,
        cogs: s.cogs + r.cogs,
        gross: s.gross + r.gross,
        opex: s.opex + r.opex,
        net: s.net + r.net,
      }),
      { revenue: 0, cogs: 0, gross: 0, opex: 0, net: 0 }
    );

    return { rows: arr, totals };
  }, [rows, dateFrom, dateTo, groupBy]);

  // пресеты дат (ЛОКАЛЬНО!)
  function setPreset(p: "thisMonth" | "prevMonth" | "ytd") {
    const now = new Date();
    if (p === "thisMonth") {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(localISO(from));
      setDateTo(localISO(new Date()));
    } else if (p === "prevMonth") {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to   = new Date(now.getFullYear(), now.getMonth(), 0); // последний день прошл. месяца
      setDateFrom(localISO(from));
      setDateTo(localISO(to));
    } else if (p === "ytd") {
      const from = new Date(now.getFullYear(), 0, 1);
      setDateFrom(localISO(from));
      setDateTo(localISO(new Date()));
    }
  }

  // экспорт CSV (из кэша, что на экране)
  function exportCsv() {
    const header = [
      "Период",
      "Выручка (EUR)",
      "Себестоимость (EUR)",
      "Валовая прибыль (EUR)",
      "Опер.расходы (EUR)",
      "Чистая прибыль (EUR)",
    ];
    const lines = [header.join(",")];
    for (const r of view.rows) {
      lines.push([r.ym, r.revenue, r.cogs, r.gross, r.opex, r.net].join(","));
    }
    const t = view.totals;
    lines.push(["ИТОГО", t.revenue, t.cogs, t.gross, t.opex, t.net].join(","));
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PL_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // пересчёт кэша (месячный PL) за выбранный период
  const handleRebuild = async () => {
    if (!canRebuild || !user) return;
    try {
      setRebuilding(true);
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/finance/cache/build-plMonthly?from=${encodeURIComponent(
          dateFrom
        )}&to=${encodeURIComponent(dateTo)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || res.statusText);
      // onSnapshot сам подтянет обновления
    } catch (e: any) {
      alert(`Ошибка обновления кэша: ${e?.message || e}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <ManagerLayout>
      <Head>
        <title>P&L — Финансы</title>
      </Head>

      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">P&L (Прибыли/убытки)</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPreset("thisMonth")}
              className="h-8 px-3 text-xs"
            >
              Тек. месяц
            </Button>
            <Button
              variant="outline"
              onClick={() => setPreset("prevMonth")}
              className="h-8 px-3 text-xs"
            >
              Прошл. месяц
            </Button>
            <Button
              variant="outline"
              onClick={() => setPreset("ytd")}
              className="h-8 px-3 text-xs"
            >
              YTD
            </Button>
            <Button
              onClick={exportCsv}
              className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              Экспорт CSV
            </Button>
          </div>
        </div>

        {/* Панель фильтров + синхронизация */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-sm border rounded-xl p-3">
          <div>
            <div className="text-[11px] text-gray-600 mb-1">С даты</div>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">По дату</div>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Группировка</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
            >
              <option value="month">По месяцам</option>
              <option value="total">Итог за период</option>
            </select>
          </div>

          {/* синхронизация + кнопка обновления */}
          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              <div>
                Используется кэш <b>finance_plMonthly</b>. Включены только
                статусы <b>Факт</b> и <b>Сверено</b>. Суммы в EUR.
              </div>
              <div className="mt-1">
                <span className="text-gray-500">Последняя синхронизация:</span>{" "}
                <b>{tsToLocal(meta?.lastRunAt)}</b>
                {meta?.status && (
                  <span
                    className={`ml-2 inline-flex items-center gap-1 text-[11px] px-2 py-[2px] rounded-full ${
                      meta.status === "running"
                        ? "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
                        : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                    }`}
                  >
                    {meta.status === "running" ? "в процессе…" : "готово"}
                  </span>
                )}
                {meta?.error && (
                  <div className="text-rose-600 mt-1">
                    Ошибка последнего запуска: {meta.error}
                  </div>
                )}
                {loadError && (
                  <div className="text-rose-600 mt-1">
                    Ошибка чтения кэша: {loadError}
                  </div>
                )}
              </div>
            </div>

            {canRebuild && (
              <Button
                onClick={handleRebuild}
                disabled={rebuilding}
                className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                title="Пересчитать и сохранить кэш P&L за выбранный период"
              >
                {rebuilding ? "Обновляю…" : "Обновить кэш"}
              </Button>
            )}
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border text-sm">
            <thead className="bg-gray-100">
              <tr className="text-center">
                <th className="border px-2 py-1">
                  {groupBy === "month" ? "Месяц" : "Период"}
                </th>
                <th className="border px-2 py-1">Выручка (EUR)</th>
                <th className="border px-2 py-1">Себестоимость (EUR)</th>
                <th className="border px-2 py-1">Валовая прибыль (EUR)</th>
                <th className="border px-2 py-1">Опер.расходы (EUR)</th>
                <th className="border px-2 py-1">Чистая прибыль (EUR)</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.ym} className="text-center">
                  <td className="border px-2 py-1">
                    {groupBy === "month" ? r.ym : `${dateFrom} — ${dateTo}`}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {r.revenue.toFixed(2)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {r.cogs.toFixed(2)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {r.gross.toFixed(2)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {r.opex.toFixed(2)}
                  </td>
                  <td className="border px-2 py-1 text-right font-semibold">
                    {r.net.toFixed(2)}
                  </td>
                </tr>
              ))}
              {view.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="border px-2 py-4 text-center text-gray-500"
                  >
                    Кэш пуст за выбранный период.{" "}
                    {canRebuild ? (
                      <button
                        onClick={handleRebuild}
                        className="underline text-blue-600"
                      >
                        Обновить кэш
                      </button>
                    ) : (
                      "Обратитесь к администратору."
                    )}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="border px-2 py-1 text-right">Итого:</td>
                <td className="border px-2 py-1 text-right">
                  {view.totals.revenue.toFixed(2)}
                </td>
                <td className="border px-2 py-1 text-right">
                  {view.totals.cogs.toFixed(2)}
                </td>
                <td className="border px-2 py-1 text-right">
                  {view.totals.gross.toFixed(2)}
                </td>
                <td className="border px-2 py-1 text-right">
                  {view.totals.opex.toFixed(2)}
                </td>
                <td className="border px-2 py-1 text-right">
                  {view.totals.net.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ManagerLayout>
  );
}