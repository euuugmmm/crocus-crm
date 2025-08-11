"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Account, Category, Currency, FxRates, Transaction, TxStatus, TxType } from "@/lib/finance/types";
import { today, eurRateFor } from "@/lib/finance/db";

export default function TransactionForm({ onClose }:{ onClose: ()=>void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rates, setRates] = useState<FxRates[]>([]);

  useEffect(() => {
    const ua = onSnapshot(query(collection(db,"finance_accounts"), orderBy("name","asc")), snap => {
      setAccounts(snap.docs.map(d=>({id:d.id, ...(d.data() as any)})));
    });
    const uc = onSnapshot(query(collection(db,"finance_categories"), orderBy("side","asc"), orderBy("name","asc")), snap => {
      setCategories(snap.docs.map(d=>({id:d.id, ...(d.data() as any)})));
    });
    const ur = onSnapshot(query(collection(db,"finance_fxRates")), snap => {
      setRates(snap.docs.map(d=>({id:d.id, ...(d.data() as any)})));
    });
    return () => { ua(); uc(); ur(); };
  }, []);

  const [type, setType] = useState<TxType>("in");
  const [status, setStatus] = useState<TxStatus>("actual");
  const [date, setDate] = useState<string>(today());
  const [accountId, setAccountId] = useState<string>("");
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [categoryId, setCategoryId] = useState<string>("");
  const [method, setMethod] = useState<"card"|"bank"|"cash"|"iban"|"other">("bank");
  const [note, setNote] = useState<string>("");

  const rateDoc = useMemo(()=> rates.find(r=>r.id===date), [rates, date]);
  const fxRateToBase = useMemo(()=> {
    if (currency==="EUR") return 1;
    return eurRateFor(rateDoc, currency);
  }, [rateDoc, currency]);
  const baseAmount = useMemo(()=> +(amount * fxRateToBase).toFixed(2), [amount, fxRateToBase]);

  async function save() {
const payload: Omit<Transaction,"id"> = {
  date, status, type,
  amount: { value: amount, currency },
  fxRateToBase,
  baseAmount,
  eurAmount: baseAmount,
  side: type === "in" ? "income" : type === "out" ? "expense" : undefined,
  categoryId: categoryId || undefined,
  method,
  note: note?.trim() || undefined,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};

    if (type === "transfer") {
      if (!fromAccountId || !toAccountId || fromAccountId===toAccountId) return alert("Выберите разные счета");
      (payload as any).fromAccountId = fromAccountId;
      (payload as any).toAccountId = toAccountId;
    } else {
      if (!accountId) return alert("Выберите счёт");
      (payload as any).accountId = accountId;
    }

    await addDoc(collection(db,"finance_transactions"), payload as any);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Новое движение</h2>
          <button onClick={onClose} className="text-2xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Тип">
            <select className="border rounded px-2 py-1 w-full" value={type} onChange={e=>setType(e.target.value as TxType)}>
              <option value="in">Поступление</option>
              <option value="out">Выплата</option>
              <option value="transfer">Перевод</option>
            </select>
          </Field>
          <Field label="Статус">
            <select className="border rounded px-2 py-1 w-full" value={status} onChange={e=>setStatus(e.target.value as any)}>
              <option value="planned">План</option>
              <option value="actual">Факт</option>
              <option value="reconciled">Сверено</option>
            </select>
          </Field>
          <Field label="Дата">
            <input type="date" className="border rounded px-2 py-1 w-full" value={date} onChange={e=>setDate(e.target.value)} />
          </Field>

          {type === "transfer" ? (
            <>
              <Field label="Со счёта">
                <select className="border rounded px-2 py-1 w-full" value={fromAccountId} onChange={e=>setFromAccountId(e.target.value)}>
                  <option value="">—</option>
                  {accounts.map(a=> <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
              </Field>
              <Field label="На счёт">
                <select className="border rounded px-2 py-1 w-full" value={toAccountId} onChange={e=>setToAccountId(e.target.value)}>
                  <option value="">—</option>
                  {accounts.map(a=> <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
              </Field>
              <div />
            </>
          ) : (
            <Field label="Счёт">
              <select className="border rounded px-2 py-1 w-full" value={accountId} onChange={e=>setAccountId(e.target.value)}>
                <option value="">—</option>
                {accounts.map(a=> <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </Field>
          )}

          <Field label="Сумма">
            <input className="border rounded px-2 py-1 w-full" inputMode="decimal" value={amount} onChange={e=>setAmount(Number(e.target.value||0))}/>
          </Field>
          <Field label="Валюта">
            <select className="border rounded px-2 py-1 w-full" value={currency} onChange={e=>setCurrency(e.target.value as any)}>
              <option value="EUR">EUR</option>
              <option value="RON">RON</option>
              <option value="USD">USD</option>
            </select>
          </Field>
          <Field label="Категория">
            <select className="border rounded px-2 py-1 w-full" value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <Field label="Метод">
            <select className="border rounded px-2 py-1 w-full" value={method} onChange={e=>setMethod(e.target.value as any)}>
              <option value="bank">Банк</option>
              <option value="card">Карта (эквайринг)</option>
              <option value="cash">Наличные</option>
              <option value="iban">IBAN</option>
              <option value="other">Другое</option>
            </select>
          </Field>
          <Field label="Комментарий" full>
            <input className="border rounded px-2 py-1 w-full" value={note} onChange={e=>setNote(e.target.value)}/>
          </Field>
        </div>

        <div className="text-xs text-gray-600">
          Курс к EUR: <b>{fxRateToBase.toFixed(6)}</b> • В EUR: <b>{baseAmount.toFixed(2)}</b>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-3 rounded border">Отмена</button>
          <button onClick={save} className="h-9 px-3 rounded bg-green-600 text-white">Сохранить</button>
        </div>
      </div>
    </div>
  );
}

function Field({label, children, full}:{label:string; children:any; full?:boolean}) {
  return (
    <div className={full ? "sm:col-span-3" : ""}>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      {children}
    </div>
  );
}