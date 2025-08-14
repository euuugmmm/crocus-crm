"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Category, Currency, FxRates, Transaction } from "@/lib/finance/types";
import { Button } from "@/components/ui/button";

/* ========================= Helpers ========================= */

// взять курс на дату (или ближайший предыдущий)
function pickFxForDate(list: FxRates[], d: string): FxRates | null {
  if (!list.length) return null;
  const exact = list.find(x => x.id === d);
  if (exact) return exact;
  // ближайший <= d (id в формате YYYY-MM-DD)
  const older = [...list].filter(x => x.id <= d).sort((a,b)=> (a.id < b.id ? 1 : -1))[0];
  return older || [...list].sort((a,b)=> (a.id < b.id ? 1 : -1))[0] || null;
}

// конвертация через EUR как базу
function convert(amount: number, from: Currency, to: Currency, fx: FxRates | null): number {
  if (!amount) return 0;
  if (from === to) return amount;
  if (!fx?.rates) return 0;
  // 1 EUR = r(CCY)
  let eur = amount;
  if (from !== "EUR") {
    const rFrom = (fx.rates as any)[from] as number | undefined;
    if (!rFrom || rFrom <= 0) return 0;
    eur = amount / rFrom;
  }
  if (to === "EUR") return eur;
  const rTo = (fx.rates as any)[to] as number | undefined;
  if (!rTo || rTo <= 0) return 0;
  return eur * rTo;
}

// ключ YYYY-MM для группировки по месяцам
function ymKey(iso: string) { return iso?.slice(0,7) || ""; }

// безусловный модуль числа
const abs = (v: any) => Math.abs(Number(v) || 0);

// классификация категории в PL
type PLClass = "rev" | "cogs" | "opex" | "skip";
function classifyCategory(cat?: Partial<Category> | null, fallbackByType?: "in" | "out"): PLClass {
  if (!cat) {
    // если нет категории — по типу транзакции:
    if (fallbackByType === "in") return "rev";
    if (fallbackByType === "out") return "opex";
    return "skip";
  }

  const side = (cat as any).side as "income" | "expense" | undefined;
  if (side === "income") return "rev";
  if (side !== "expense") return "skip";

  // явные признаки COGS на уровне схемы (любое подойдёт)
  const c: any = cat;
  if (c.isCogs === true || c.plGroup === "cogs" || c.kind === "cogs" || c.type === "cogs") return "cogs";

  // эвристика по названию (на случай отсутствия явного флага)
  const name = String((cat as any).name || "").toLowerCase();
  const cogsHints = [
    "себестоимость","нетто","netto","net","internal","интернал",
    "operator","оператор","supplier","поставщ","перевозчик",
    "avia","авиа","отель","hotel","туроператор","оператору"
  ];
  if (cogsHints.some(h => name.includes(h))) return "cogs";

  return "opex";
}

/* ========================= Page ========================= */

export default function PLPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  const [tx, setTx] = useState<Transaction[]>([]);
  const [cat, setCat] = useState<Category[]>([]);
  const [fxList, setFxList] = useState<FxRates[]>([]);

  // фильтры
  const today = new Date().toISOString().slice(0,10);
  const monthStart = new Date(); monthStart.setDate(1);
  const [dateFrom, setDateFrom] = useState<string>(monthStart.toISOString().slice(0,10));
  const [dateTo, setDateTo]     = useState<string>(today);
  const [groupBy, setGroupBy]   = useState<"month"|"total">("month");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canView) { router.replace("/agent/bookings"); return; }

    const ut = onSnapshot(
      query(collection(db,"finance_transactions"), orderBy("date","asc")),
      snap => setTx(snap.docs.map(d=>({ id:d.id, ...(d.data() as any) })))
    );
    const uc = onSnapshot(
      query(collection(db,"finance_categories")),
      snap => setCat(snap.docs.map(d=>({ id:d.id, ...(d.data() as any) })))
    );
    const ur = onSnapshot(
      query(collection(db,"finance_fxRates")),
      snap => setFxList(snap.docs.map(d=>({ id:d.id, ...(d.data() as any) })) as FxRates[])
    );
    return () => { ut(); uc(); ur(); };
  }, [user, canView, router]);

  const catById = useMemo(()=>{
    const m = new Map<string, Category>();
    for (const c of cat) if (c.id) m.set(c.id, c);
    return m;
  }, [cat]);

  // P&L расчёт: учитываем только actual/reconciled, исключаем transfers
  const rows = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to   = dateTo   ? new Date(dateTo)   : null;

    type Agg = { rev: number; cogs: number; opex: number };
    const map = new Map<string, Agg>();

    for (const t of tx) {
      // статусы
      if (!(t.status === "actual" || t.status === "reconciled")) continue;
      // исключаем переводы
      if (t.type === "transfer") continue;

      // дата для P&L: actualDate предпочтительнее
      const dateStr = (t as any).actualDate || t.date;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (from && d < from) continue;
      if (to && d > to) continue;

      // EUR: приоритет baseAmount; иначе конвертация; иначе если валюта EUR — берём amount.value
      let eur = abs((t as any).baseAmount);
      if (!eur) {
        const val = Number(t.amount?.value || 0);
        const ccy = (t.amount?.currency || "EUR") as Currency;
        if (ccy === "EUR") eur = abs(val);
        else {
          const rateDoc = pickFxForDate(fxList, dateStr);
          eur = abs(convert(val, ccy, "EUR", rateDoc));
        }
      }
      // если всё ещё 0 — пропускаем (неизвестный курс/сумма)
      if (!eur) continue;

      // классификация
      const catDoc = t.categoryId ? catById.get(t.categoryId) : undefined;
      const byType: "in" | "out" | undefined = t.type === "in" ? "in" : t.type === "out" ? "out" : undefined;
      const cls = classifyCategory(catDoc, byType);

      // ключ агрегации
      const k = groupBy === "month" ? ymKey(dateStr) : "TOTAL";
      if (!map.has(k)) map.set(k, { rev: 0, cogs: 0, opex: 0 });
      const cur = map.get(k)!;

      if (cls === "rev") cur.rev  += eur;
      else if (cls === "cogs") cur.cogs += eur;
      else if (cls === "opex") cur.opex += eur;
      // "skip" — игнорируем
    }

    // превращаем в строки
    const arr = Array.from(map.entries()).map(([k, v]) => {
      const gross = v.rev - v.cogs;
      const net   = gross - v.opex;
      return {
        key: k,
        revenue: +v.rev.toFixed(2),
        cogs:    +v.cogs.toFixed(2),
        gross:   +gross.toFixed(2),
        opex:    +v.opex.toFixed(2),
        net:     +net.toFixed(2),
      };
    });

    // сортировка по месяцу
    if (groupBy === "month") arr.sort((a,b)=> (a.key < b.key ? -1 : 1));

    // totals (выводим всегда — даже при одной строке удобно сверять)
    const totals = arr.reduce((s,r)=>({
      revenue: s.revenue + r.revenue,
      cogs:    s.cogs    + r.cogs,
      gross:   s.gross   + r.gross,
      opex:    s.opex    + r.opex,
      net:     s.net     + r.net,
    }), { revenue:0, cogs:0, gross:0, opex:0, net:0 });

    return {
      rows: arr,
      totals: {
        revenue:+totals.revenue.toFixed(2),
        cogs:   +totals.cogs.toFixed(2),
        gross:  +totals.gross.toFixed(2),
        opex:   +totals.opex.toFixed(2),
        net:    +totals.net.toFixed(2),
      }
    };
  }, [tx, catById, fxList, dateFrom, dateTo, groupBy]);

  function setPreset(p: "thisMonth"|"prevMonth"|"ytd") {
    const now = new Date();
    if (p === "thisMonth") {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(from.toISOString().slice(0,10));
      setDateTo(new Date().toISOString().slice(0,10));
    } else if (p === "prevMonth") {
      const from = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const to   = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(from.toISOString().slice(0,10));
      setDateTo(to.toISOString().slice(0,10));
    } else if (p === "ytd") {
      const from = new Date(now.getFullYear(), 0, 1);
      setDateFrom(from.toISOString().slice(0,10));
      setDateTo(new Date().toISOString().slice(0,10));
    }
  }

  // экспорт CSV
  function exportCsv() {
    const header = ["Период","Выручка (EUR)","Себестоимость (EUR)","Валовая прибыль (EUR)","Опер.расходы (EUR)","Чистая прибыль (EUR)"];
    const lines = [header.join(",")];
    for (const r of rows.rows) {
      lines.push([r.key, r.revenue, r.cogs, r.gross, r.opex, r.net].join(","));
    }
    lines.push(["ИТОГО", rows.totals.revenue, rows.totals.cogs, rows.totals.gross, rows.totals.opex, rows.totals.net].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `PL_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ManagerLayout>
      <Head><title>P&L — Финансы</title></Head>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">P&L (Прибыли/убытки)</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={()=>setPreset("thisMonth")} className="h-8 px-3 text-xs">Тек. месяц</Button>
            <Button variant="outline" onClick={()=>setPreset("prevMonth")} className="h-8 px-3 text-xs">Прошл. месяц</Button>
            <Button variant="outline" onClick={()=>setPreset("ytd")} className="h-8 px-3 text-xs">YTD</Button>
            <Button onClick={exportCsv} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white">Экспорт CSV</Button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-sm border rounded-xl p-3">
          <div>
            <div className="text-[11px] text-gray-600 mb-1">С даты</div>
            <input type="date" className="w-full border rounded px-2 py-1" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">По дату</div>
            <input type="date" className="w-full border rounded px-2 py-1" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Группировка</div>
            <select className="w-full border rounded px-2 py-1" value={groupBy} onChange={e=>setGroupBy(e.target.value as any)}>
              <option value="month">По месяцам</option>
              <option value="total">Итог за период</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex items-end">
            <div className="text-xs text-gray-600">
              Учитываются только транзакции со статусом <b>Факт</b> и <b>Сверено</b>. Переводы между счетами исключены. Суммы в EUR.
            </div>
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border text-sm">
            <thead className="bg-gray-100">
              <tr className="text-center">
                <th className="border px-2 py-1">{groupBy==="month" ? "Месяц" : "Период"}</th>
                <th className="border px-2 py-1">Выручка (EUR)</th>
                <th className="border px-2 py-1">Себестоимость (EUR)</th>
                <th className="border px-2 py-1">Валовая прибыль (EUR)</th>
                <th className="border px-2 py-1">Опер.расходы (EUR)</th>
                <th className="border px-2 py-1">Чистая прибыль (EUR)</th>
              </tr>
            </thead>
            <tbody>
              {rows.rows.map(r=>(
                <tr key={r.key} className="text-center">
                  <td className="border px-2 py-1">
                    {groupBy==="month" ? r.key : `${dateFrom} — ${dateTo}`}
                  </td>
                  <td className="border px-2 py-1 text-right">{r.revenue.toFixed(2)}</td>
                  <td className="border px-2 py-1 text-right">{r.cogs.toFixed(2)}</td>
                  <td className="border px-2 py-1 text-right">{r.gross.toFixed(2)}</td>
                  <td className="border px-2 py-1 text-right">{r.opex.toFixed(2)}</td>
                  <td className="border px-2 py-1 text-right font-semibold">{r.net.toFixed(2)}</td>
                </tr>
              ))}
              {rows.rows.length===0 && (
                <tr><td colSpan={6} className="border px-2 py-4 text-center text-gray-500">Нет данных за выбранный период</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="border px-2 py-1 text-right">Итого:</td>
                <td className="border px-2 py-1 text-right">{rows.totals.revenue.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">{rows.totals.cogs.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">{rows.totals.gross.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">{rows.totals.opex.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">{rows.totals.net.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ManagerLayout>
  );
}