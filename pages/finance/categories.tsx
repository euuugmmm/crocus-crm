"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

type CategorySide = "income" | "expense";
type Category = {
  id: string;
  name: string;
  side: CategorySide;
  order?: number;          // порядок внутри side
  archived?: boolean;
  system?: boolean;        // системные (не удаляем)
  createdAt?: any;
};
export const getServerSideProps = async ({ locale }: any) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'ru', ['common'])),
  },
});
export default function FinanceCategoriesPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [rows, setRows] = useState<Category[]>([]);
  const [filterSide, setFilterSide] = useState<"all" | CategorySide>("all");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // форма создания
  const [newName, setNewName] = useState("");
  const [newSide, setNewSide] = useState<CategorySide>("expense");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const unsub = onSnapshot(
      query(collection(db, "finance_categories"), orderBy("side"), orderBy("order"), orderBy("name")),
      snap => setRows(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }) as Category))
    );
    return () => unsub();
  }, [user, canEdit, router]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows
      .filter(c => (filterSide === "all" ? true : c.side === filterSide))
      .filter(c => (showArchived ? true : !c.archived))
      .filter(c => (text ? c.name.toLowerCase().includes(text) : true))
      .sort((a,b) => {
        if (a.side !== b.side) return a.side < b.side ? -1 : 1;
        const ao = a.order ?? 0, bo = b.order ?? 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      });
  }, [rows, filterSide, q, showArchived]);

  const maxOrderBySide = (side: CategorySide) =>
    (rows.filter(r => r.side === side).reduce((m, r) => Math.max(m, r.order ?? 0), 0) || 0);

  const createCategory = async () => {
    const name = newName.trim();
    if (!name) return;
    const orderVal = maxOrderBySide(newSide) + 100; // шаг 100 — удобно для будущих вставок
    await addDoc(collection(db, "finance_categories"), {
      name,
      side: newSide,
      order: orderVal,
      archived: false,
      system: false,
      createdAt: serverTimestamp(),
    });
    setNewName("");
  };

  const rename = async (id: string, name: string) => {
    await updateDoc(doc(db, "finance_categories", id), { name: name.trim() });
  };

  const toggleArchived = async (id: string, archived: boolean) => {
    await updateDoc(doc(db, "finance_categories", id), { archived });
  };

  const move = async (row: Category, dir: "up" | "down") => {
    const sameSide = filtered.filter(r => r.side === row.side);
    const idx = sameSide.findIndex(r => r.id === row.id);
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sameSide.length) return;

    const a = sameSide[idx];
    const b = sameSide[targetIdx];
    const aOrder = a.order ?? 0;
    const bOrder = b.order ?? 0;

    const batch = writeBatch(db as any);
    batch.update(doc(db, "finance_categories", a.id), { order: bOrder });
    batch.update(doc(db, "finance_categories", b.id), { order: aOrder });
    await batch.commit();
  };

  const remove = async (row: Category) => {
    if (row.system) { alert("Системную категорию удалять нельзя"); return; }
    if (!confirm(`Удалить категорию «${row.name}»?`)) return;
    await deleteDoc(doc(db, "finance_categories", row.id));
  };

  return (
    <ManagerLayout>
      <Head><title>Категории — Финансы</title></Head>
      <div className="max-w-5xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Категории</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={()=>router.push("/finance/transactions")} className="h-9 px-3">
              ← Транзакции
            </Button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="p-3 border rounded-lg grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm">
          <div>
            <div className="text-xs text-gray-600 mb-1">Тип</div>
            <select className="w-full border rounded px-2 py-1"
              value={filterSide} onChange={e=>setFilterSide(e.target.value as any)}>
              <option value="all">Все</option>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Поиск</div>
            <input className="w-full border rounded px-2 py-1"
              value={q} onChange={e=>setQ(e.target.value)} placeholder="название…"
            />
          </div>
          <label className="inline-flex items-center gap-2 self-end mb-1">
            <input type="checkbox" className="h-4 w-4" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)} />
            Показывать архив
          </label>
        </div>

        {/* Создание */}
        <div className="p-3 border rounded-lg grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm">
          <div className="sm:col-span-3">
            <div className="text-xs text-gray-600 mb-1">Название</div>
            <input className="w-full border rounded px-2 py-1" value={newName} onChange={e=>setNewName(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Тип</div>
            <select className="w-full border rounded px-2 py-1" value={newSide} onChange={e=>setNewSide(e.target.value as CategorySide)}>
              <option value="expense">Расход</option>
              <option value="income">Доход</option>
            </select>
          </div>
          <div className="self-end">
            <Button onClick={createCategory} className="h-9 px-3 bg-green-600 hover:bg-green-700 text-white">Добавить</Button>
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border text-sm">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border px-2 py-1">Порядок</th>
                <th className="border px-2 py-1">Тип</th>
                <th className="border px-2 py-1">Название</th>
                <th className="border px-2 py-1">Статус</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => (
                <tr key={c.id} className="text-center hover:bg-gray-50">
                  <td className="border px-2 py-1 whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <button className="h-7 px-2 border rounded" onClick={()=>move(c, "up")} disabled={idx===0}>↑</button>
                      <button className="h-7 px-2 border rounded" onClick={()=>move(c, "down")} disabled={idx===filtered.length-1}>↓</button>
                    </div>
                  </td>
                  <td className="border px-2 py-1">
                    {c.side === "income"
                      ? <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                      : <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>}
                  </td>
                  <td className="border px-2 py-1 text-left">
                    <input
                      className="w-full border rounded px-2 py-1"
                      defaultValue={c.name}
                      onBlur={e => e.target.value !== c.name && rename(c.id, e.target.value)}
                    />
                  </td>
                  <td className="border px-2 py-1">
                    {c.archived
                      ? <span className="px-2 py-0.5 rounded bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-400/40">В архиве</span>
                      : <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20">Активна</span>}
                  </td>
                  <td className="border px-2 py-1">
                    <div className="inline-flex gap-2">
                      <button className="h-7 px-2 border rounded hover:bg-gray-100"
                        onClick={()=>toggleArchived(c.id, !c.archived)}>
                        {c.archived ? "Разархив." : "В архив"}
                      </button>
                      <button className="h-7 px-2 border rounded hover:bg-red-50"
                        onClick={()=>remove(c)} disabled={!!c.system}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0 && (
                <tr><td colSpan={5} className="border px-2 py-4 text-center text-gray-500">Пусто</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ManagerLayout>
  );
}