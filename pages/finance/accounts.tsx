/* pages/finance/accounts.tsx */
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

type Currency = "EUR" | "RON" | "USD";
type Account = {
  id: string;
  name: string;
  currency: Currency;
  openingBalance?: number;         // в валюте счёта
  createdAt?: any;
  archived?: boolean;
};

type Tx = {
  id: string;
  accountId: string;
  side: "income" | "expense";
  amount: number;                  // в валюте счёта
  currency: Currency;              // дублируем валюту счёта для удобства
  date: string;                    // YYYY-MM-DD
};

type FxDoc = { id: string; base: "EUR"; rates: Partial<Record<Currency, number>> };

export default function FinanceAccounts() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [fx, setFx] = useState<FxDoc | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<Pick<Account, "name"|"currency"|"openingBalance">>({
    name: "",
    currency: "EUR",
    openingBalance: 0,
  });

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const unsubAcc = onSnapshot(query(collection(db, "finance_accounts")), snap => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    const unsubTx = onSnapshot(query(collection(db, "finance_transactions")), snap => {
      setTxs(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    const unsubFx = onSnapshot(query(collection(db, "finance_fxRates")), snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as FxDoc[];
      // берём самый свежий по дате id (YYYY-MM-DD)
      const last = [...list].sort((a,b)=>a.id < b.id ? 1 : -1)[0];
      setFx(last || { id: "—", base: "EUR", rates: { RON: 4.97, USD: 1.08 } });
    });

    return () => { unsubAcc(); unsubTx(); unsubFx(); };
  }, [user, canEdit, router]);

  const eurFrom = (amount: number, ccy: Currency): number => {
    if (!amount) return 0;
    if (ccy === "EUR") return amount;
    const r = fx?.rates?.[ccy];
    if (!r || r <= 0) return 0; // нет курса — считаем 0
    // rates: 1 EUR = r(CCY) -> 1 CCY = 1/r EUR
    return amount / r;
  };

  // агрегируем движения по каждому счёту
  const movementsByAccount = useMemo(() => {
    const map = new Map<string, { amt: number; eur: number }>();
    for (const t of txs) {
      const sign = t.side === "income" ? 1 : -1;
      const prev = map.get(t.accountId) || { amt: 0, eur: 0 };
      const deltaAmt = sign * (Number(t.amount) || 0);
      const deltaEur = sign * eurFrom(Number(t.amount) || 0, t.currency);
      map.set(t.accountId, { amt: prev.amt + deltaAmt, eur: prev.eur + deltaEur });
    }
    return map;
  }, [txs, fx]);

  const rows = useMemo(() => {
    return accounts
      .filter(a => !a.archived)
      .map(a => {
        const mv = movementsByAccount.get(a.id) || { amt: 0, eur: 0 };
        const opening = Number(a.openingBalance || 0);
        const balAmt = opening + mv.amt;           // в валюте счёта
        const openingEur = eurFrom(opening, a.currency);
        const balEur = openingEur + mv.eur;        // в EUR
        return { ...a, balAmt, balEur };
      });
  }, [accounts, movementsByAccount, fx]);

  const totalEur = rows.reduce((s, r) => s + r.balEur, 0);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", currency: "EUR", openingBalance: 0 });
    setModalOpen(true);
  };
  const openEdit = (a: Account) => {
    setEditing(a);
    setForm({ name: a.name, currency: a.currency, openingBalance: a.openingBalance || 0 });
    setModalOpen(true);
  };
  const save = async () => {
    const payload = {
      name: form.name.trim(),
      currency: form.currency,
      openingBalance: Number(form.openingBalance || 0),
      createdAt: Timestamp.now(),
    };
    if (!payload.name) return;
    if (editing) {
      await updateDoc(doc(db, "finance_accounts", editing.id), {
        name: payload.name,
        currency: payload.currency,
        openingBalance: payload.openingBalance,
      });
    } else {
      await addDoc(collection(db, "finance_accounts"), payload);
    }
    setModalOpen(false);
  };
  const archive = async (a: Account) => {
    if (!confirm(`Архивировать счёт '${a.name}'?`)) return;
    await updateDoc(doc(db, "finance_accounts", a.id), { archived: true });
  };
  const seedBtEur = async () => {
    if (!confirm("Создать дефолтный счёт 'BT EUR'?")) return;
    await addDoc(collection(db, "finance_accounts"), {
      name: "BT EUR",
      currency: "EUR",
      openingBalance: 0,
      createdAt: Timestamp.now(),
    });
  };

  return (
    <ManagerLayout>
      <Head><title>Счета — Финансы</title></Head>
      <div className="max-w-5xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Счета</h1>
          <div className="flex gap-2">
            {accounts.length === 0 && (
              <Button onClick={seedBtEur} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-3">
                Создать BT EUR
              </Button>
            )}
            <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white h-9 px-3">
              Добавить счёт
            </Button>
          </div>
        </div>

        <div className="mb-3 text-sm text-gray-600">
          Текущий курс: {fx ? `EUR→RON ${fx.rates?.RON ?? "—"} | EUR→USD ${fx.rates?.USD ?? "—"} (на ${fx.id})` : "—"}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border text-sm">
            <thead className="bg-gray-100">
              <tr className="text-center">
                <th className="border px-2 py-1">Название</th>
                <th className="border px-2 py-1">Валюта</th>
                <th className="border px-2 py-1">Остаток (валюта)</th>
                <th className="border px-2 py-1">Остаток (EUR)</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} className="text-center hover:bg-gray-50">
                  <td className="border px-2 py-1">{a.name}</td>
                  <td className="border px-2 py-1">{a.currency}</td>
                  <td className="border px-2 py-1">{a.balAmt.toFixed(2)} {a.currency}</td>
                  <td className="border px-2 py-1">{a.balEur.toFixed(2)} €</td>
                  <td className="border px-2 py-1">
                    <div className="inline-flex gap-2">
                      <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={() => openEdit(a)}>✏️</button>
                      <button className="h-7 px-2 border rounded hover:bg-red-50" onClick={() => archive(a)}>🗂️ Архив</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="border px-2 py-4 text-center text-gray-500">Нет активных счетов</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={3}>Итого по всем счетам (в EUR):</td>
                <td className="border px-2 py-1 text-center">{totalEur.toFixed(2)} €</td>
                <td className="border px-2 py-1" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-md bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{editing ? "Редактировать счёт" : "Новый счёт"}</h2>
              <button className="text-2xl leading-none" onClick={()=>setModalOpen(false)}>×</button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">Название</div>
                <input className="w-full border rounded px-2 py-1"
                  value={form.name}
                  onChange={e=>setForm(f=>({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Валюта</div>
                  <select className="w-full border rounded px-2 py-1"
                    value={form.currency}
                    onChange={e=>setForm(f=>({ ...f, currency: e.target.value as Currency }))}
                  >
                    <option>EUR</option><option>RON</option><option>USD</option>
                  </select>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Нач. остаток (в валюте счёта)</div>
                  <input className="w-full border rounded px-2 py-1"
                    type="number" step="0.01"
                    value={form.openingBalance ?? 0}
                    onChange={e=>setForm(f=>({ ...f, openingBalance: Number(e.target.value || 0) }))}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={()=>setModalOpen(false)} className="h-8 px-3 text-xs">Отмена</Button>
              <Button onClick={save} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">Сохранить</Button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}