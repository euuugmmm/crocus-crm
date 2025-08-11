/* pages/finance/planned.tsx */
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { db } from "@/firebaseConfig";
import {
  collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp,
} from "firebase/firestore";
import type { Account, Category, CategorySide, Currency, Planned, Transaction } from "@/lib/finance/types";
import type { FxRates } from "@/lib/finance/types";
import { today } from "@/lib/finance/db";

export default function PlannedPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fxList, setFxList] = useState<FxRates[]>([]);
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);

  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    status: "upcoming", // upcoming | overdue | matched | all
    side: "all",
    accountId: "all",
    search: "",
  });

  // модалки
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Planned | null>(null);
  const [form, setForm] = useState<Partial<Planned>>({
    date: today(),
    accountId: "",
    currency: "EUR",
    side: "income",
    amount: 0,
    categoryId: "",
    bookingId: "",
    note: "",
  });

  // матчинг
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchTarget, setMatchTarget] = useState<Planned | null>(null);
  const [txPick, setTxPick] = useState<string>("");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const unsubAcc = onSnapshot(query(collection(db, "finance_accounts")), snap => {
      setAccounts(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
    });
    const unsubCat = onSnapshot(query(collection(db, "finance_categories")), snap => {
      setCategories(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
    });
    const unsubFx = onSnapshot(query(collection(db, "finance_fxRates")), snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as FxRates[];
      setFxList(list.sort((a,b)=>a.id < b.id ? 1 : -1));
    });
    const unsubPlan = onSnapshot(query(collection(db, "finance_planned")), snap => {
      setPlanned(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as Planned[]);
    });
    const unsubTx = onSnapshot(query(collection(db, "finance_transactions")), snap => {
      setTxs(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })) as Transaction[]);
    });

    return () => { unsubAcc(); unsubCat(); unsubFx(); unsubPlan(); unsubTx(); };
  }, [user, canEdit, router]);

  // держим валюту формы = валюте счёта
  useEffect(() => {
    const acc = accounts.find(a => a.id === form.accountId);
    if (acc && form.currency !== acc.currency) {
      setForm(prev => ({ ...prev, currency: acc.currency }));
    }
  }, [form.accountId, accounts]); // eslint-disable-line

  const pickRate = (d: string): FxRates | null => {
    if (!fxList.length) return null;
    const exact = fxList.find(x => x.id === d);
    if (exact) return exact;
    const older = fxList.find(x => x.id <= d);
    return older || fxList[fxList.length - 1] || null;
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
    const df = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dt = filters.dateTo ? new Date(filters.dateTo) : null;
    const q = filters.search.trim().toLowerCase();
    const now = new Date(today());

    return planned
      .filter(p => {
        if (filters.side !== "all" && p.side !== filters.side) return false;
        if (filters.accountId !== "all" && p.accountId !== filters.accountId) return false;
        if (df && new Date(p.date) < df) return false;
        if (dt && new Date(p.date) > dt) return false;

        if (filters.status === "upcoming" && (!p.matchedTxId && new Date(p.date) >= now)) return true;
        if (filters.status === "overdue"  && (!p.matchedTxId && new Date(p.date) <  now)) return true;
        if (filters.status === "matched"  && p.matchedTxId) return true;
        if (filters.status === "all") return true;
        return false;
      })
      .filter(p => {
        if (!q) return true;
        const s = [
          p.note || "",
          p.accountName || "",
          p.categoryName || "",
          p.bookingId || "",
        ].join(" ").toLowerCase();
        return s.includes(q);
      })
      .sort((a,b)=> a.date < b.date ? -1 : 1);
  }, [planned, filters]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const p of displayed) {
      const v = p.eurAmount ?? eurFrom(Number(p.amount||0), p.currency as Currency, p.date);
      if (p.side === "income") inc += v;
      else exp += v;
    }
    return { income: inc, expense: exp, net: inc - exp };
  }, [displayed]);

  const openCreate = () => {
    setEditing(null);
    const firstAcc = accounts.find(a=>!a.archived);
    const firstCat = categories.find(c=>!c.archived && c.side==="income");
    setForm({
      date: today(),
      accountId: firstAcc?.id || "",
      currency: firstAcc?.currency || "EUR",
      side: "income",
      amount: 0,
      categoryId: firstCat?.id || "",
      bookingId: "",
      note: "",
    });
    setModalOpen(true);
  };
  const openEdit = (p: Planned) => {
    setEditing(p);
    setForm({ ...p });
    setModalOpen(true);
  };
  const remove = async (p: Planned) => {
    if (!confirm("Удалить плановый платёж?")) return;
    await deleteDoc(doc(db, "finance_planned", p.id));
  };

  const save = async () => {
    if (!form.date || !form.accountId || !form.categoryId || !form.side) return;
    const acc = accounts.find(a=>a.id===form.accountId)!;
    const cat = categories.find(c=>c.id===form.categoryId)!;

    const amount = Number(form.amount || 0);
    const eurAmount = eurFrom(amount, acc.currency, form.date!);

    const payload: any = {
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
      matchedTxId: form.matchedTxId ?? null,
      createdAt: Timestamp.now(),
      source: form.source || "manual",
    };

    if (editing) {
      await updateDoc(doc(db, "finance_planned", editing.id), payload);
    } else {
      await addDoc(collection(db, "finance_planned"), payload);
    }
    setModalOpen(false);
  };

  // ───────── Матчинг ─────────
  const openMatch = (p: Planned) => {
    setMatchTarget(p);
    setTxPick("");
    setMatchOpen(true);
  };
  const doMatch = async () => {
    if (!matchTarget || !txPick) return;
    await updateDoc(doc(db, "finance_planned", matchTarget.id), {
      matchedTxId: txPick,
      matchedAt: Timestamp.now(),
    });
    setMatchOpen(false);
  };

  // кандидаты транзакций: совпадает счет, side, +/- близкая сумма и по дате рядом
  const txCandidates = useMemo(() => {
    const p = matchTarget;
    if (!p) return [];
    const toleranceEur = 1.0; // допуск 1 EUR
    const days = 3;           // +/- 3 дня
    const pd = new Date(p.date);
    const from = new Date(pd); from.setDate(pd.getDate()-days);
    const to   = new Date(pd); to.setDate(pd.getDate()+days);
    const pv = p.eurAmount ?? eurFrom(p.amount, p.currency, p.date);

    return txs.filter(t => {
      if (t.accountId !== p.accountId) return false;
      if (t.side !== p.side) return false;
      const td = new Date(t.date);
      if (td < from || td > to) return false;
      const tv = t.eurAmount ?? 0;
      return Math.abs(tv - pv) <= toleranceEur;
    }).sort((a,b)=> Math.abs((a.eurAmount??0)-pv) - Math.abs((b.eurAmount??0)-pv));
  }, [matchTarget, txs, fxList]);

  return (
    <ManagerLayout>
      <Head><title>План-Факт — Финансы</title></Head>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Плановые платежи (План-Факт)</h1>
          <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white h-9 px-3">
            Добавить план
          </Button>
        </div>

        {/* Фильтры */}
        <div className="p-3 border rounded-lg mb-4 grid grid-cols-1 sm:grid-cols-7 gap-2 text-sm">
          <div>
            <div className="text-[11px] text-gray-600 mb-1">С даты</div>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={filters.dateFrom} onChange={e=>setFilters(s=>({ ...s, dateFrom: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">По дату</div>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={filters.dateTo} onChange={e=>setFilters(s=>({ ...s, dateTo: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Статус</div>
            <select className="w-full border rounded px-2 py-1"
              value={filters.status} onChange={e=>setFilters(s=>({ ...s, status: e.target.value }))}
            >
              <option value="upcoming">Предстоящие</option>
              <option value="overdue">Просроченные</option>
              <option value="matched">Сопоставлено</option>
              <option value="all">Все</option>
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Тип</div>
            <select className="w-full border rounded px-2 py-1"
              value={filters.side} onChange={e=>setFilters(s=>({ ...s, side: e.target.value }))}
            >
              <option value="all">Все</option>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Счёт</div>
            <select className="w-full border rounded px-2 py-1"
              value={filters.accountId} onChange={e=>setFilters(s=>({ ...s, accountId: e.target.value }))}
            >
              <option value="all">Все</option>
              {accounts.filter(a=>!a.archived).map(a=>(
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <div className="text-[11px] text-gray-600 mb-1">Поиск</div>
            <input className="w-full border rounded px-2 py-1" placeholder="заметка / заявка / категория / счёт"
              value={filters.search} onChange={e=>setFilters(s=>({ ...s, search: e.target.value }))}
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
                <th className="border px-2 py-1">Факт</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(p => (
                <tr key={p.id} className="text-center hover:bg-gray-50">
                  <td className="border px-2 py-1 whitespace-nowrap">{p.date}</td>
                  <td className="border px-2 py-1">{p.accountName || p.accountId}</td>
                  <td className="border px-2 py-1">
                    {p.side === "income"
                      ? <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                      : <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>}
                  </td>
                  <td className="border px-2 py-1 text-right">{Number(p.amount).toFixed(2)} {p.currency}</td>
                  <td className="border px-2 py-1 text-right">{Number(p.eurAmount ?? 0).toFixed(2)} €</td>
                  <td className="border px-2 py-1">{p.categoryName || p.categoryId}</td>
                  <td className="border px-2 py-1">{p.bookingId || "—"}</td>
                  <td className="border px-2 py-1 text-left">{p.note || "—"}</td>
                  <td className="border px-2 py-1">
                    {p.matchedTxId
                      ? <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20">Сопоставлено</span>
                      : <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20">Нет</span>}
                  </td>
                  <td className="border px-2 py-1">
                    <div className="inline-flex gap-2">
                      {!p.matchedTxId && <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={()=>openMatch(p)}>🔗 Матч</button>}
                      <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={()=>openEdit(p)}>✏️</button>
                      <button className="h-7 px-2 border rounded hover:bg-red-50" onClick={()=>remove(p)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {displayed.length === 0 && (
                <tr><td colSpan={10} className="border px-2 py-4 text-center text-gray-500">Ничего не найдено</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>Итого план доходов (EUR):</td>
                <td className="border px-2 py-1 text-right">{totals.income.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={5}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>Итого план расходов (EUR):</td>
                <td className="border px-2 py-1 text-right">{totals.expense.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={5}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>Плановый чистый поток (EUR):</td>
                <td className="border px-2 py-1 text-right">{totals.net.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={5}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Модалка: создать/редактировать план */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-2xl bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{editing ? "Редактировать план" : "Новый план"}</h2>
              <button className="text-2xl leading-none" onClick={()=>setModalOpen(false)}>×</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Дата">
                <input type="date" className="w-full border rounded px-2 py-1"
                  value={form.date || today()} onChange={e=>setForm(s=>({ ...s, date: e.target.value }))}
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
                  value={form.side || "income"} 
                  
                  onChange={e=>setForm(s=>({ ...s, side: e.target.value as ("income"|"expense") }))}
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
                  placeholder="Firestore id заявки"
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

      {/* Модалка: матчинг с транзакцией */}
      {matchOpen && matchTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-2xl bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Сопоставление платежа</h2>
              <button className="text-2xl leading-none" onClick={()=>setMatchOpen(false)}>×</button>
            </div>

            <div className="mb-3 text-sm">
              План: <b>{matchTarget.side === "income" ? "Доход" : "Расход"}</b>,
              {` ${matchTarget.amount.toFixed(2)} ${matchTarget.currency} (~${(matchTarget.eurAmount??0).toFixed(2)} €)`}
              {matchTarget.bookingId ? `, заявка: ${matchTarget.bookingId}` : ""}
            </div>

            <div className="text-sm">
              <div className="text-[11px] text-gray-600 mb-1">Выберите транзакцию</div>
              <select className="w-full border rounded px-2 py-1 h-9" value={txPick} onChange={e=>setTxPick(e.target.value)}>
                <option value="">— подходящие транзакции —</option>
               {txCandidates.map(t => {
  const accName =
    t.accountName ||
    (accounts.find(a => a.id === t.accountId || a.id === t.fromAccountId || a.id === t.toAccountId)?.name) ||
    "—";
  const val = t.amount?.value ?? 0;
  const cur = t.amount?.currency ?? "EUR";
  const eur = (t.baseAmount ?? t.eurAmount ?? 0);

  return (
    <option key={t.id} value={t.id}>
      {t.date} · {accName} · {t.side === "income" ? "+" : "-"}{val.toFixed(2)} {cur} · {eur.toFixed(2)}€
      {t.categoryName ? ` · ${t.categoryName}` : ""}
      {t.bookingId ? ` · booking:${t.bookingId}` : ""}
    </option>
  );
})}
              </select>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={()=>setMatchOpen(false)} className="h-8 px-3 text-xs">
                Отмена
              </Button>
              <Button onClick={doMatch} disabled={!txPick} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700">
                Сопоставить
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