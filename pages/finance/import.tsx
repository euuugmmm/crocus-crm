"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/router";
import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Account, Category, Currency, FxRates, Transaction } from "@/lib/finance/types";

// Простейший CSV-парсер (без внешних зависимостей). Поддержка ; и , как разделителей.
function parseCSV(raw: string): string[][] {
  const lines = raw.replace(/\r/g, "").split("\n").filter(l => l.trim().length > 0);
  // определяем разделитель по первой строке
  const first = lines[0];
  const delimiter = first.split(";").length > first.split(",").length ? ";" : ",";
  // очень простой split (без кавычек внутри) — для банковских CSV обычно хватает
  return lines.map(l => l.split(delimiter).map(c => c.trim()));
}

type Row = {
  date: string;
  amount: number;
  currency: Currency;
  note?: string;
  accountId?: string; // можно промаппить по имени, но проще выбрать один счёт для всего пакета
  type?: "in"|"out";  // если знак != 0 — определим сами
};

export default function ImportBankStatements() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  // справочники
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rates, setRates] = useState<FxRates[]>([]);

  // входные данные
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<string>("");
  const [rows, setRows] = useState<string[][]>([]);

  // маппинг колонок
  const [hasHeader, setHasHeader] = useState(true);
  const [dateCol, setDateCol] = useState(0);
  const [amtCol, setAmtCol] = useState(1);
  const [ccyCol, setCcyCol] = useState<number | null>(null);
  const [noteCol, setNoteCol] = useState<number | null>(null);

  // опции применения
  const [defaultAccountId, setDefaultAccountId] = useState<string>("");
  const [defaultCurrency, setDefaultCurrency] = useState<Currency>("EUR");
  const [method, setMethod] = useState<"bank"|"card"|"cash"|"iban"|"other">("bank");
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>(""); // опционально
  const [signRule, setSignRule] = useState<"bySign"|"positiveIsIn"|"positiveIsOut">("bySign");
  const [dateFormat, setDateFormat] = useState<"YYYY-MM-DD"|"DD.MM.YYYY"|"MM/DD/YYYY">("YYYY-MM-DD");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const ua = onSnapshot(query(collection(db,"finance_accounts"), orderBy("name","asc")), snap => {
      const acc = snap.docs.map(d=>({id:d.id, ...(d.data() as any)})) as Account[];
      setAccounts(acc);
      if (!defaultAccountId && acc.length) setDefaultAccountId(acc.find(a=>!a.archived)?.id || acc[0].id);
    });
    const uc = onSnapshot(query(collection(db,"finance_categories")), snap => {
      setCategories(snap.docs.map(d=>({id:d.id, ...(d.data() as any)})));
    });
    const ur = onSnapshot(query(collection(db,"finance_fxRates")), snap => {
      const list = snap.docs.map(d=>({id:d.id, ...(d.data() as any)})) as FxRates[];
      setRates(list.sort((a,b)=>a.id < b.id ? 1 : -1));
    });
    return () => { ua(); uc(); ur(); };
  }, [user, canEdit, router, defaultAccountId]);

  const headers = useMemo(() => rows[0] || [], [rows]);
  const dataRows = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setRaw(text);
      setRows(parseCSV(text));
    };
    reader.readAsText(f, "utf-8");
  }

  function parseDate(s: string): string | null {
    s = s.trim();
    if (!s) return null;
    // нормализуем в YYYY-MM-DD
    try {
      if (dateFormat === "YYYY-MM-DD") {
        // уже норм
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // иногда приходит с временем
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : null;
      }
      if (dateFormat === "DD.MM.YYYY") {
        const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
        if (!m) return null;
        return `${m[3]}-${m[2]}-${m[1]}`;
      }
      if (dateFormat === "MM/DD/YYYY") {
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!m) return null;
        const mm = m[1].padStart(2,"0");
        const dd = m[2].padStart(2,"0");
        return `${m[3]}-${mm}-${dd}`;
      }
      return null;
    } catch { return null; }
  }

  function toNumberSafe(v: any) {
    // заменяем запятую на точку
    if (typeof v === "string") v = v.replace(/\s/g,"").replace(",",".");
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  const preview: Row[] = useMemo(() => {
    if (!dataRows.length) return [];
    return dataRows.map((r) => {
      const dateRaw = r[dateCol] ?? "";
      const amountRaw = r[amtCol] ?? "";
      const ccyRaw = (ccyCol!=null ? r[ccyCol] : defaultCurrency) as string;
      const noteRaw = noteCol!=null ? r[noteCol] : "";

      const date = parseDate(String(dateRaw)) || "";
      const amount = toNumberSafe(amountRaw);
      const currency = (String(ccyRaw).toUpperCase().trim() || "EUR") as Currency;

      return {
        date,
        amount,
        currency,
        note: String(noteRaw || ""),
        accountId: defaultAccountId,
        type: undefined
      };
    }).filter(p => p.date && p.amount !== 0);
  }, [dataRows, dateCol, amtCol, ccyCol, noteCol, defaultAccountId, defaultCurrency, dateFormat]);

  // определяем тип операции по правилу
  function decideType(amount: number): "in"|"out" {
    if (signRule === "positiveIsIn") return amount >= 0 ? "in" : "out";
    if (signRule === "positiveIsOut") return amount >= 0 ? "out" : "in";
    // bySign: >0 = in, <0 = out
    return amount >= 0 ? "in" : "out";
  }

  // курс на дату
  function fxRateToBase(date: string, ccy: Currency): number {
    if (ccy === "EUR") return 1;
    const doc = rates.find(r => r.id === date) || rates.find(r => r.id <= date) || rates[rates.length-1];
    const r = doc?.rates?.[ccy];
    return r && r > 0 ? 1 / r : 1; // baseAmount = amount * (1/rateEUR->CCY)
  }

  async function saveAll() {
    if (!preview.length) return alert("Нет валидных строк для импорта.");
    if (!defaultAccountId) return alert("Выберите счёт для импорта.");

    let saved = 0;
    for (const p of preview) {
      const type = decideType(p.amount);
      const amountAbs = Math.abs(p.amount);
      const fx = fxRateToBase(p.date, p.currency);
      const baseAmount = +(amountAbs * fx).toFixed(2);

      const payload: Omit<Transaction,"id"> = {
        date: p.date,
        status: "actual",
        type,
        amount: { value: amountAbs, currency: p.currency },
        fxRateToBase: fx,
        baseAmount,
        categoryId: defaultCategoryId || undefined,
        method,
        note: p.note || undefined,
        accountId: p.accountId!,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "finance_transactions"), payload as any);
      saved++;
    }
    alert(`Импортировано: ${saved}`);
    setFileName("");
    setRaw("");
    setRows([]);
  }

  return (
    <ManagerLayout>
      <Head><title>Импорт выписки — Финансы</title></Head>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Импорт банковской выписки (CSV)</h1>
        </div>

        {/* Шаг 1 — файл */}
        <div className="border rounded-lg p-4 mb-4">
          <div className="text-sm font-semibold mb-2">1) Загрузите CSV-файл</div>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
          {fileName && <div className="mt-2 text-xs text-gray-600">Файл: {fileName}</div>}
        </div>

        {/* Шаг 2 — настройки маппинга */}
        {rows.length > 0 && (
          <div className="border rounded-lg p-4 mb-4">
            <div className="text-sm font-semibold mb-3">2) Настройте маппинг колонок</div>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={hasHeader} onChange={e=>setHasHeader(e.target.checked)} />
                Первая строка — заголовки
              </label>

              <label>Дата:&nbsp;
                <select className="border rounded px-2 py-1"
                        value={dateCol} onChange={e=>setDateCol(Number(e.target.value))}>
                  {headers.map((h, i) => <option key={i} value={i}>{`${i}: ${h}`}</option>)}
                </select>
              </label>

              <label>Сумма:&nbsp;
                <select className="border rounded px-2 py-1"
                        value={amtCol} onChange={e=>setAmtCol(Number(e.target.value))}>
                  {headers.map((h, i) => <option key={i} value={i}>{`${i}: ${h}`}</option>)}
                </select>
              </label>

              <label>Валюта:&nbsp;
                <select className="border rounded px-2 py-1"
                        value={ccyCol ?? ""}
                        onChange={e=>setCcyCol(e.target.value==="" ? null : Number(e.target.value))}>
                  <option value="">— одна на весь файл —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{`${i}: ${h}`}</option>)}
                </select>
              </label>

              <label>Колонка примечания:&nbsp;
                <select className="border rounded px-2 py-1"
                        value={noteCol ?? ""}
                        onChange={e=>setNoteCol(e.target.value==="" ? null : Number(e.target.value))}>
                  <option value="">— нет —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{`${i}: ${h}`}</option>)}
                </select>
              </label>

              <label>Формат даты:&nbsp;
                <select className="border rounded px-2 py-1"
                        value={dateFormat} onChange={e=>setDateFormat(e.target.value as any)}>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {/* Шаг 3 — параметры применения */}
        {rows.length > 0 && (
          <div className="border rounded-lg p-4 mb-4">
            <div className="text-sm font-semibold mb-3">3) Параметры применения</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-[11px] text-gray-600 mb-1">Счёт для всех записей</div>
                <select className="w-full border rounded px-2 py-1"
                        value={defaultAccountId} onChange={e=>setDefaultAccountId(e.target.value)}>
                  {accounts.filter(a=>!a.archived).map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[11px] text-gray-600 mb-1">Если валюты нет в файле</div>
                <select className="w-full border rounded px-2 py-1"
                        value={defaultCurrency} onChange={e=>setDefaultCurrency(e.target.value as Currency)}>
                  <option value="EUR">EUR</option>
                  <option value="RON">RON</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <div className="text-[11px] text-gray-600 mb-1">Определение типа</div>
                <select className="w-full border rounded px-2 py-1"
                        value={signRule} onChange={e=>setSignRule(e.target.value as any)}>
                  <option value="bySign">знак суммы: {'>0'} поступление, {'<0'} выплата</option>
                  <option value="positiveIsIn">положительная — поступление</option>
                  <option value="positiveIsOut">положительная — выплата</option>
                </select>
              </div>
              <div>
                <div className="text-[11px] text-gray-600 mb-1">Метод оплаты</div>
                <select className="w-full border rounded px-2 py-1"
                        value={method} onChange={e=>setMethod(e.target.value as any)}>
                  <option value="bank">Банк</option>
                  <option value="card">Карта (эквайринг)</option>
                  <option value="cash">Наличные</option>
                  <option value="iban">IBAN</option>
                  <option value="other">Другое</option>
                </select>
              </div>
              <div>
                <div className="text-[11px] text-gray-600 mb-1">Категория (опц.)</div>
                <select className="w-full border rounded px-2 py-1"
                        value={defaultCategoryId} onChange={e=>setDefaultCategoryId(e.target.value)}>
                  <option value="">— не задавать —</option>
                  {categories.filter(c=>!c.archived).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Превью */}
        {preview.length > 0 && (
          <div className="border rounded-lg">
            <div className="px-3 py-2 bg-gray-50 font-semibold flex items-center justify-between">
              <div>Предпросмотр ({preview.length} строк)</div>
              <button
                onClick={saveAll}
                className="h-8 px-3 rounded bg-green-600 hover:bg-green-700 text-white text-sm"
              >
                Импортировать
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="border px-2 py-1">Дата</th>
                    <th className="border px-2 py-1">Сумма</th>
                    <th className="border px-2 py-1">Валюта</th>
                    <th className="border px-2 py-1">Тип</th>
                    <th className="border px-2 py-1">Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 200).map((r, i) => (
                    <tr key={i} className="text-center hover:bg-gray-50">
                      <td className="border px-2 py-1">{r.date}</td>
                      <td className="border px-2 py-1 text-right">{r.amount.toFixed(2)} {r.currency}</td>
                      <td className="border px-2 py-1">{r.currency}</td>
                      <td className="border px-2 py-1">
                        {(() => {
                          const t = (signRule === "positiveIsOut")
                            ? (r.amount >= 0 ? "out" : "in")
                            : (r.amount >= 0 ? "in" : "out");
                          return t === "in"
                            ? <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Поступление</span>
                            : <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Выплата</span>;
                        })()}
                      </td>
                      <td className="border px-2 py-1 text-left">{r.note || "—"}</td>
                    </tr>
                  ))}
                  {preview.length > 200 && (
                    <tr><td colSpan={5} className="border px-2 py-2 text-center text-gray-500">Показаны первые 200 строк…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}