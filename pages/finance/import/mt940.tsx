// pages/finance/import/mt940.tsx
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type {
  Account,
  Category,
  Currency,
  FxRates,
  Transaction,
} from "@/lib/finance/types";
import { parseMt940, type Mt940Tx } from "@/lib/finance/import/mt940";

/** локальные типы */
type Counterparty = { id: string; name: string; archived?: boolean };

/** fx-utils */
const pickRateDoc = (rates: FxRates[], isoDate: string): FxRates | null => {
  if (!rates.length) return null;
  const exact = rates.find((r) => r.id === isoDate);
  if (exact) return exact;
  const sorted = [...rates].sort((a, b) => (a.id < b.id ? 1 : -1));
  return sorted.find((r) => r.id <= isoDate) || sorted[sorted.length - 1] || null;
};
const eurRateFor = (doc: FxRates | null | undefined, currency: Currency): number => {
  if (!doc || currency === "EUR") return 1;
  const r = doc.rates?.[currency];
  if (!r || r <= 0) return 1;
  // rates: 1 EUR = r CCY → 1 CCY = 1/r EUR
  return 1 / r;
};

/** утилита очистки payload для Firestore */
const cleanForFirestore = (obj: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) => v !== undefined && v === v // отбрасываем undefined и NaN
    )
  );

export default function ImportMt940Page() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const { accountId: accountIdParam } = router.query as { accountId?: string };

  /** справочники */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [fxList, setFxList] = useState<FxRates[]>([]);

  /** настройки импорта */
  const [selectedAcc, setSelectedAcc] = useState<string>("");
  const [status, setStatus] = useState<Transaction["status"]>("actual");
  const [method, setMethod] = useState<"bank" | "card" | "cash" | "iban" | "other">("bank");
  const [defaultCatId, setDefaultCatId] = useState<string>("");
  const [defaultCpId, setDefaultCpId] = useState<string>("");

  /** файл/строки */
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<Mt940Tx[]>([]);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [rowCat, setRowCat] = useState<Record<string, string>>({});
  const [rowCp, setRowCp] = useState<Record<string, string>>({});

  /* ===== загрузка справочников ===== */
  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const ua = onSnapshot(
      query(collection(db, "finance_accounts"), orderBy("name", "asc")),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Account[];
        setAccounts(list);

        // предвыбор счёта
        if (accountIdParam && list.some(a => a.id === accountIdParam)) {
          setSelectedAcc(accountIdParam);
        } else if (!selectedAcc) {
          const eur = list.find(a => a.currency === "EUR" && !a.archived);
          if (eur) setSelectedAcc(eur.id);
        }
      }
    );

    const uc = onSnapshot(
      query(collection(db, "finance_categories"), orderBy("side","asc"), orderBy("name","asc")),
      (snap) => setCategories(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Category[])
    );

    const up = onSnapshot(
      query(collection(db, "finance_counterparties"), orderBy("name","asc")),
      (snap) => setCounterparties(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Counterparty[])
    );

    const ur = onSnapshot(query(collection(db, "finance_fxRates")),
      (snap) => setFxList(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as FxRates[])
    );

    return () => { ua(); uc(); up(); ur(); };
  }, [user, canEdit, router, accountIdParam, selectedAcc]);

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedAcc) || null,
    [accounts, selectedAcc]
  );
  const accCurrency = (selectedAccount?.currency || "EUR") as Currency;

  /* ===== загрузка и парсинг файла ===== */
  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseMt940(text);
    setRows(parsed);

    // по умолчанию всё выделяем, проставляем дефолт-кат/контрагента
    const nextChosen: Record<string, boolean> = {};
    const nextCat: Record<string, string> = {};
    const nextCp: Record<string, string> = {};
    for (const r of parsed) {
      const id = `${r.date}_${r.sign}_${r.amount}_${Math.random().toString(36).slice(2,8)}`;
      // присвоим стабильный id внутри страницы
      (r as any).__id = id;
      nextChosen[id] = true;
      if (defaultCatId) nextCat[id] = defaultCatId;
      if (defaultCpId) nextCp[id] = defaultCpId;
    }
    setChosen(nextChosen);
    setRowCat(nextCat);
    setRowCp(nextCp);
  };

  const toggleAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    rows.forEach(r => { next[(r as any).__id] = val; });
    setChosen(next);
  };

  /* ===== импорт ===== */
  const importSelected = async () => {
    if (!selectedAccount) { alert("Выберите счёт"); return; }
    if (!rows.length) { alert("Нет распознанных строк"); return; }

    const picked = rows.filter(r => chosen[(r as any).__id]);
    if (!picked.length) { alert("Не выбрано ни одной операции"); return; }

    let ok = 0;
    for (const r of picked) {
      const id = (r as any).__id as string;
      const catId = rowCat[id] || defaultCatId || "";
      const cpId  = rowCp[id]  || defaultCpId  || "";

      // сумма в валюте счёта (signed)
      const signedAmount = r.sign === "C" ? +r.amount : -r.amount;

      // конвертация в EUR
      const fxDoc = pickRateDoc(fxList, r.date);
      const fxRateToBase = eurRateFor(fxDoc, accCurrency);
      const baseAmount = +(signedAmount * fxRateToBase).toFixed(2);

      const payload = cleanForFirestore({
        date: r.date,                                     // YYYY-MM-DD
        status,                                           // planned | actual | reconciled
        type: r.sign === "C" ? "in" : "out",              // in/out
        method,                                           // bank/card/cash/iban/other

        // совместимый формат:
        amount: +signedAmount.toFixed(2),                 // число в валюте счёта
        currency: accCurrency,                            // строка валюты счёта
        baseAmount,                                       // EUR
        fxRateToBase,                                     // CCY → EUR

        accountId: selectedAccount.id,
        categoryId: catId || undefined,
        counterpartyId: cpId || undefined,

        // описание
        title: r.code ? `${r.code}${r.reference ? " "+r.reference : ""}` : undefined,
        note: r.description?.slice(0, 500) || undefined,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "finance_transactions"), payload as any);
      ok++;
    }

    alert(`Импортировано: ${ok}`);
    router.push("/finance/transactions");
  };

  /* ===== рендер ===== */
  return (
    <ManagerLayout>
      <Head><title>Импорт MT940 — Финансы</title></Head>

      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Импорт MT940</h1>
          <div className="flex gap-2">
            <button onClick={()=>router.push("/finance/accounts")} className="h-9 px-3 rounded border">← К счетам</button>
            <button onClick={()=>router.push("/finance/transactions")} className="h-9 px-3 rounded border">Транзакции</button>
          </div>
        </div>

        {/* настройки */}
        <div className="p-4 border rounded-lg grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Счёт</div>
            <select className="w-full border rounded px-2 py-1"
              value={selectedAcc} onChange={(e)=>setSelectedAcc(e.target.value)}>
              <option value="">— выберите счёт —</option>
              {accounts.filter(a=>!a.archived).map(a=>(
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Статус загружаемых операций</div>
            <select className="w-full border rounded px-2 py-1"
              value={status} onChange={(e)=>setStatus(e.target.value as Transaction["status"])}>
              <option value="actual">Факт</option>
              <option value="planned">План</option>
              <option value="reconciled">Сверено</option>
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Метод платежа</div>
            <select className="w-full border rounded px-2 py-1"
              value={method} onChange={(e)=>setMethod(e.target.value as any)}>
              <option value="bank">Банк</option>
              <option value="card">Карта (эквайринг)</option>
              <option value="cash">Наличные</option>
              <option value="iban">IBAN</option>
              <option value="other">Другое</option>
            </select>
          </div>

          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-gray-600 mb-1">Категория по умолчанию (опционально)</div>
              <select className="w-full border rounded px-2 py-1"
                value={defaultCatId} onChange={(e)=>setDefaultCatId(e.target.value)}>
                <option value="">— не задавать —</option>
                {categories.filter(c=>!c.archived).map(c=>(
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-600 mb-1">Контрагент по умолчанию (опционально)</div>
              <select className="w-full border rounded px-2 py-1"
                value={defaultCpId} onChange={(e)=>setDefaultCpId(e.target.value)}>
                <option value="">— не задавать —</option>
                {counterparties.filter(c=>!c.archived).map(c=>(
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* загрузка файла */}
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-3 flex-wrap">
            <input type="file" accept=".txt,.sta,.mt940"
              onChange={(e)=> e.target.files && handleFile(e.target.files[0]) }/>
            {fileName && <div className="text-sm text-gray-600">Файл: {fileName}</div>}
            {rows.length>0 && (
              <>
                <button className="h-8 px-3 rounded border" onClick={()=>toggleAll(true)}>Выбрать все</button>
                <button className="h-8 px-3 rounded border" onClick={()=>toggleAll(false)}>Снять все</button>
                <button className="ml-auto h-9 px-3 rounded bg-green-600 hover:bg-green-700 text-white"
                  onClick={importSelected}>
                  Импортировать выбранные ({Object.values(chosen).filter(Boolean).length})
                </button>
              </>
            )}
          </div>

          {/* превью */}
          {rows.length>0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1100px] border text-sm">
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="border px-2 py-1">✓</th>
                    <th className="border px-2 py-1">Дата</th>
                    <th className="border px-2 py-1">Тип</th>
                    <th className="border px-2 py-1">Сумма ({accCurrency})</th>
                    <th className="border px-2 py-1">Категория</th>
                    <th className="border px-2 py-1">Контрагент</th>
                    <th className="border px-2 py-1">Описание</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const id = (r as any).__id as string;
                    const signed = r.sign === "C" ? r.amount : -r.amount;
                    return (
                      <tr key={id} className="text-center hover:bg-gray-50">
                        <td className="border px-2 py-1">
                          <input type="checkbox" checked={!!chosen[id]}
                            onChange={e=>setChosen(c=>({ ...c, [id]: e.target.checked }))}/>
                        </td>
                        <td className="border px-2 py-1 whitespace-nowrap">{r.date}</td>
                        <td className="border px-2 py-1">
                          {r.sign === "C" ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Поступление</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Выплата</span>
                          )}
                        </td>
                        <td className="border px-2 py-1 text-right">{signed.toFixed(2)}</td>
                        <td className="border px-2 py-1">
                          <select className="w-full border rounded px-2 py-1"
                            value={rowCat[id] ?? defaultCatId}
                            onChange={(e)=>setRowCat(v=>({ ...v, [id]: e.target.value }))}>
                            <option value="">— не зад —</option>
                            {categories.filter(c=>!c.archived).map(c=>(
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="border px-2 py-1">
                          <select className="w-full border rounded px-2 py-1"
                            value={rowCp[id] ?? defaultCpId}
                            onChange={(e)=>setRowCp(v=>({ ...v, [id]: e.target.value }))}>
                            <option value="">— не зад —</option>
                            {counterparties.filter(c=>!c.archived).map(c=>(
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="border px-2 py-1 text-left">{r.description || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 text-sm text-gray-500">Загрузите текстовый MT940 файл от банка (BT и др.).</div>
          )}
        </div>
      </div>
    </ManagerLayout>
  );
}