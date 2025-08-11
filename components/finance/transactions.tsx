"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/router";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Account, Category, Transaction } from "@/lib/finance/types";
import TransactionForm from "@/components/finance/TransactionForm";

export default function TransactionsPage() {
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const router = useRouter();
  const canView = isManager || isSuperManager || isAdmin;

  const [tx, setTx] = useState<Transaction[]>([]);
  const [acc, setAcc] = useState<Account[]>([]);
  const [cat, setCat] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);

  // фильтры
  const [qText, setQText] = useState("");
  const [status, setStatus] = useState<"all"|"planned"|"actual"|"reconciled">("all");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canView) { router.replace("/agent/bookings"); return; }

    const ut = onSnapshot(query(collection(db, "finance_transactions"), orderBy("date","desc")), snap => {
      setTx(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
    });
    const ua = onSnapshot(query(collection(db,"finance_accounts")), snap => setAcc(snap.docs.map(d=>({id:d.id, ...(d.data() as any)}))));
    const uc = onSnapshot(query(collection(db,"finance_categories")), snap => setCat(snap.docs.map(d=>({id:d.id, ...(d.data() as any)}))));
    return () => { ut(); ua(); uc(); };
  }, [user, canView, router]);

  const filtered = useMemo(() => {
    const lower = qText.trim().toLowerCase();
    return tx.filter(t => {
      if (status !== "all" && t.status !== status) return false;
      if (!lower) return true;
      const a = acc.find(x=>x.id===t.accountId || x.id===t.fromAccountId || x.id===t.toAccountId);
      const c = cat.find(x=>x.id===t.categoryId);
      const row = [
        t.date, t.type, t.status, t.amount?.value, t.amount?.currency,
        a?.name, c?.name, t.method, t.note
      ].join(" ").toLowerCase();
      return row.includes(lower);
    });
  }, [tx, acc, cat, qText, status]);

  return (
    <ManagerLayout>
      <Head><title>Транзакции — Финансы</title></Head>
      <div className="max-w-7xl mx-auto py-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">ДДС / Транзакции</h1>
          <button onClick={()=>setShowForm(true)} className="h-9 px-3 rounded bg-green-600 text-white">Добавить</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input value={qText} onChange={e=>setQText(e.target.value)} placeholder="Поиск…" className="border rounded px-2 py-1 w-64"/>
          <select value={status} onChange={e=>setStatus(e.target.value as any)} className="border rounded px-2 py-1">
            <option value="all">Все статусы</option>
            <option value="planned">План</option>
            <option value="actual">Факт</option>
            <option value="reconciled">Сверено</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border text-sm">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border px-2 py-1">Дата</th>
                <th className="border px-2 py-1">Тип</th>
                <th className="border px-2 py-1">Статус</th>
                <th className="border px-2 py-1">Счёт / Перевод</th>
                <th className="border px-2 py-1">Категория</th>
                <th className="border px-2 py-1">Сумма</th>
                <th className="border px-2 py-1">В EUR</th>
                <th className="border px-2 py-1">Метод</th>
                <th className="border px-2 py-1">Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const account =
                  t.type==="transfer"
                    ? `${acc.find(a=>a.id===t.fromAccountId)?.name || "—"} → ${acc.find(a=>a.id===t.toAccountId)?.name || "—"}`
                    : (acc.find(a=>a.id===t.accountId)?.name || "—");
                const category = cat.find(c=>c.id===t.categoryId)?.name || "—";
                return (
                  <tr key={t.id} className="text-center border-t">
                    <td className="border px-2 py-1 whitespace-nowrap">{t.date}</td>
                    <td className="border px-2 py-1">{t.type}</td>
                    <td className="border px-2 py-1">{t.status}</td>
                    <td className="border px-2 py-1">{account}</td>
                    <td className="border px-2 py-1">{category}</td>
                    <td className="border px-2 py-1 whitespace-nowrap text-right">{t.amount.value.toFixed(2)} {t.amount.currency}</td>
                    <td className="border px-2 py-1 whitespace-nowrap text-right">{t.baseAmount.toFixed(2)} EUR</td>
                    <td className="border px-2 py-1">{t.method || "—"}</td>
                    <td className="border px-2 py-1 text-left">{t.note || "—"}</td>
                  </tr>
                );
              })}
              {filtered.length===0 && (
                <tr><td colSpan={9} className="border px-2 py-4 text-center text-gray-500">Нет данных</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <TransactionForm onClose={()=>setShowForm(false)} />}
    </ManagerLayout>
  );
}