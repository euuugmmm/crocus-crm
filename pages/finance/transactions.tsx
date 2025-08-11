/* pages/finance/transactions.tsx */
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

type Currency = "EUR" | "RON" | "USD";
type Account = { id: string; name: string; currency: Currency; archived?: boolean };
type CategorySide = "income" | "expense";
type Category = { id: string; name: string; side: CategorySide; system?: boolean; archived?: boolean };
type Tx = {
  id: string;
  date: string;                    // YYYY-MM-DD
  accountId: string;
  accountName?: string;            // удобство в UI
  currency: Currency;
  side: CategorySide;
  amount: number;                  // в валюте счёта
  eurAmount?: number;              // в EUR (фиксируем по курсу дня)
  categoryId: string;
  categoryName?: string;
  bookingId?: string;
  note?: string;
  createdAt?: any;
};
type FxDoc = { id: string; base: "EUR"; rates: Partial<Record<Currency, number>> };

export default function FinanceTransactions() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fxList, setFxList] = useState<FxDoc[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);

  // фильтры
  const [f, setF] = useState({
    dateFrom: "",
    dateTo: "",
    accountId: "all",
    side: "all",
    search: "",
  });

  // форма
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [form, setForm] = useState<Partial<Tx>>({
    date: new Date().toISOString().slice(0,10),
    accountId: "",
    currency: "EUR",
    side: "income",
    amount: 0,
    categoryId: "",
    bookingId: "",
    note: "",
  });

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const unsubAcc = onSnapshot(query(collection(db, "finance_accounts")), snap => {
      setAccounts(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as Account[]);
    });
    const unsubCat = onSnapshot(query(collection(db, "finance_categories")), snap => {
      setCategories(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as Category[]);
    });
    const unsubFx  = onSnapshot(query(collection(db, "finance_fxRates")), snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as FxDoc[];
      setFxList(list.sort((a,b)=>a.id < b.id ? 1 : -1)); // свежие первыми
    });
    const unsubTx  = onSnapshot(query(collection(db, "finance_transactions")), snap => {
      setTxs(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as Tx[]);
    });

    return () => { unsubAcc(); unsubCat(); unsubFx(); unsubTx(); };
  }, [user, canEdit, router]);

  // актуализировать валюту формы по выбранному счёту
  useEffect(() => {
    const acc = accounts.find(a => a.id === form.accountId);
    if (acc && form.currency !== acc.currency) {
      setForm(prev => ({ ...prev, currency: acc.currency }));
    }
  }, [form.accountId, accounts]); // eslint-disable-line

  const pickRate = (d: string): FxDoc | null => {
    if (!fxList.length) return null;
    const exact = fxList.find(x => x.id === d);
    if (exact) return exact;
    // иначе берём последний известный ранее: список отсортирован по дате убыв.
    const older = fxList.find(x => x.id <= d);
    return older || fxList[fxList.length-1];
  };
  const eurFrom = (amount: number, ccy: Currency, onDate: string): number => {
    if (!amount) return 0;
    if (ccy === "EUR") return amount;
    const fx = pickRate(onDate);
    const r = fx?.rates?.[ccy];
    if (!r || r <= 0) return 0;
    return amount / r;
  };

  const displayed = useMemo(() => {
    const df = f.dateFrom ? new Date(f.dateFrom) : null;
    const dt = f.dateTo ? new Date(f.dateTo) : null;
    const q = f.search.trim().toLowerCase();

    return txs
      .filter(t => {
        if (f.accountId !== "all" && t.accountId !== f.accountId) return false;
        if (f.side !== "all" && t.side !== f.side) return false;
        if (df && new Date(t.date) < df) return false;
        if (dt && new Date(t.date) > dt) return false;
        if (q) {
          const s = [
            t.note || "",
            t.accountName || "",
            t.categoryName || "",
            t.bookingId || "",
          ].join(" ").toLowerCase();
          if (!s.includes(q)) return false;
        }
        return true;
      })
      .sort((a,b)=> a.date < b.date ? 1 : -1);
  }, [txs, f]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const t of displayed) {
      const v = t.eurAmount ?? eurFrom(Number(t.amount||0), t.currency as Currency, t.date);
      if (t.side === "income") inc += v;
      else exp += v;
    }
    return { income: inc, expense: exp, net: inc - exp };
  }, [displayed]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      date: new Date().toISOString().slice(0,10),
      accountId: accounts[0]?.id || "",
      currency: accounts[0]?.currency || "EUR",
      side: "income",
      amount: 0,
      categoryId: categories[0]?.id || "",
      bookingId: "",
      note: "",
    });
    setModalOpen(true);
  };
  const openEdit = (t: Tx) => {
    setEditing(t);
    setForm({ ...t });
    setModalOpen(true);
  };
  const remove = async (t: Tx) => {
    if (!confirm("Удалить транзакцию?")) return;
    await deleteDoc(doc(db, "finance_transactions", t.id));
  };

  const save = async () => {
    if (!form.date || !form.accountId || !form.categoryId || !form.side) return;
    const acc = accounts.find(a=>a.id===form.accountId)!;
    const cat = categories.find(c=>c.id===form.categoryId)!;

    const amount = Number(form.amount || 0);
    const eurAmount = eurFrom(amount, acc.currency, form.date!);

    const payload = {
      date: form.date!,
      accountId: acc.id,
      accountName: acc.name,
      currency: acc.currency,
      side: form.side as CategorySide,
      amount,
      eurAmount,
      categoryId: cat.id,
      categoryName: cat.name,
      bookingId: (form.bookingId || "").trim() || null,
      note: (form.note || "").trim() || "",
      createdAt: Timestamp.now(),
      source: "manual",
    };

    if (editing) {
      await updateDoc(doc(db, "finance_transactions", editing.id), payload as any);
    } else {
      await addDoc(collection(db, "finance_transactions"), payload as any);
    }
    setModalOpen(false);
  };

  return (
    <ManagerLayout>
      <Head><title>Транзакции — Финансы</title></Head>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Банковские транзакции</h1>
          <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white h-9 px-3">
            Добавить транзакцию
          </Button>
        </div>

        {/* Фильтры */}
        <div className="p-3 border rounded-lg mb-4 grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm">
          <div>
            <div className="text-xs text-gray-600 mb-1">С даты</div>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={f.dateFrom} onChange={e=>setF(s=>({ ...s, dateFrom: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">По дату</div>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={f.dateTo} onChange={e=>setF(s=>({ ...s, dateTo: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Счёт</div>
            <select className="w-full border rounded px-2 py-1"
              value={f.accountId} onChange={e=>setF(s=>({ ...s, accountId: e.target.value }))}
            >
              <option value="all">Все</option>
              {accounts.filter(a=>!a.archived).map(a=>(
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Тип</div>
            <select className="w-full border rounded px-2 py-1"
              value={f.side} onChange={e=>setF(s=>({ ...s, side: e.target.value }))}
            >
              <option value="all">Все</option>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Поиск</div>
            <input className="w-full border rounded px-2 py-1" placeholder="заметка / заявка / категория / счёт"
              value={f.search} onChange={e=>setF(s=>({ ...s, search: e.target.value }))}
            />
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border text-sm">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border px-2 py-1">Дата</th>
                <th className="border px-2 py-1">Счёт</th>
                <th className="border px-2 py-1">Тип</th>
                <th className="border px-2 py-1">Сумма (вал.)</th>
                <th className="border px-2 py-1">Сумма (EUR)</th>
                <th className="border px-2 py-1">Категория</th>
                <th className="border px-2 py-1">Заявка</th>
                <th className="border px-2 py-1">Заметка</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(t => (
                <tr key={t.id} className="text-center hover:bg-gray-50">
                  <td className="border px-2 py-1 whitespace-nowrap">{t.date}</td>
                  <td className="border px-2 py-1">{t.accountName || t.accountId}</td>
                  <td className="border px-2 py-1">
                    {t.side === "income"
                      ? <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                      : <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {Number(t.amount).toFixed(2)} {t.currency}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {(t.eurAmount ?? 0).toFixed(2)} €
                  </td>
                  <td className="border px-2 py-1">{t.categoryName || t.categoryId}</td>
                  <td className="border px-2 py-1">{t.bookingId || "—"}</td>
                  <td className="border px-2 py-1 text-left">{t.note || "—"}</td>
                  <td className="border px-2 py-1">
                    <div className="inline-flex gap-2">
                      <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={()=>openEdit(t)}>✏️</button>
                      <button className="h-7 px-2 border rounded hover:bg-red-50" onClick={()=>remove(t)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {displayed.length === 0 && (
                <tr><td colSpan={9} className="border px-2 py-4 text-center text-gray-500">Нет транзакций</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>Итого доходов (EUR):</td>
                <td className="border px-2 py-1 text-right">{totals.income.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={4}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>Итого расходов (EUR):</td>
                <td className="border px-2 py-1 text-right">{totals.expense.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={4}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>Чистый поток (EUR):</td>
                <td className="border px-2 py-1 text-right">{totals.net.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Модалка */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-2xl bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{editing ? "Редактировать транзакцию" : "Новая транзакция"}</h2>
              <button className="text-2xl leading-none" onClick={()=>setModalOpen(false)}>×</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Дата">
                <input type="date" className="w-full border rounded px-2 py-1"
                  value={form.date || ""} onChange={e=>setForm(s=>({ ...s, date: e.target.value }))}
                />
              </Field>
              <Field label="Счёт">
                <select className="w-full border rounded px-2 py-1"
                  value={form.accountId || ""}
                  onChange={e=>setForm(s=>({ ...s, accountId: e.target.value }))}
                >
                  <option value="" disabled>— выберите счёт —</option>
                  {accounts.filter(a=>!a.archived).map(a=>(
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </Field>
              <Field label="Тип">
                <select className="w-full border rounded px-2 py-1"
                  value={form.side || "income"} onChange={e=>setForm(s=>({ ...s, side: e.target.value as CategorySide }))}
                >
                  <option value="income">Доход</option>
                  <option value="expense">Расход</option>
                </select>
              </Field>
              <Field label="Категория">
                <select className="w-full border rounded px-2 py-1"
                  value={form.categoryId || ""}
                  onChange={e=>setForm(s=>({ ...s, categoryId: e.target.value }))}
                >
                  <option value="" disabled>— выберите категорию —</option>
                  {categories.filter(c=>!c.archived && c.side === form.side).map(c=>(
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={`Сумма (${form.currency})`}>
                <input type="number" step="0.01" className="w-full border rounded px-2 py-1"
                  value={form.amount ?? 0}
                  onChange={e=>setForm(s=>({ ...s, amount: Number(e.target.value || 0) }))}
                />
              </Field>
              <Field label="ID заявки (опц.)">
                <input className="w-full border rounded px-2 py-1"
                  value={form.bookingId || ""} onChange={e=>setForm(s=>({ ...s, bookingId: e.target.value }))}
                  placeholder="например, Firestore id заявки"
                />
              </Field>
              <Field label="Заметка" full>
                <input className="w-full border rounded px-2 py-1"
                  value={form.note || ""} onChange={e=>setForm(s=>({ ...s, note: e.target.value }))}
                  placeholder="комментарий"
                />
              </Field>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={()=>setModalOpen(false)} className="h-8 px-3 text-xs">
                Отмена
              </Button>
              <Button onClick={save} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}

function Field({ label, children, full }: { label: string; children: any; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[11px] text-gray-600 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}