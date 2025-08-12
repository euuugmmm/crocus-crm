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
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

type CounterpartyType = "operator" | "client" | "supplier" | "budget" | "other";
type Counterparty = {
  id: string;
  name: string;
  type: CounterpartyType;
  archived?: boolean;
  createdAt?: any;
  note?: string;
};
export const getServerSideProps = async ({ locale }: any) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'ru', ['common'])),
  },
});
export default function FinanceCounterpartiesPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [rows, setRows] = useState<Counterparty[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | CounterpartyType>("all");
  const [showArchived, setShowArchived] = useState(false);

  // создание
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CounterpartyType>("operator");
  const [newNote, setNewNote] = useState("");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const unsub = onSnapshot(
      query(collection(db, "finance_counterparties"), orderBy("type"), orderBy("name")),
      snap => setRows(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }) as Counterparty))
    );
    return () => unsub();
  }, [user, canEdit, router]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows
      .filter(r => (type === "all" ? true : r.type === type))
      .filter(r => (showArchived ? true : !r.archived))
      .filter(r => (text ? r.name.toLowerCase().includes(text) || (r.note || "").toLowerCase().includes(text) : true));
  }, [rows, q, type, showArchived]);

  const createRow = async () => {
    const name = newName.trim();
    if (!name) return;
    await addDoc(collection(db, "finance_counterparties"), {
      name, type: newType, note: newNote.trim() || null, archived: false, createdAt: serverTimestamp(),
    });
    setNewName(""); setNewNote("");
  };

  const rename = async (id: string, name: string) =>
    updateDoc(doc(db, "finance_counterparties", id), { name: name.trim() });

  const retag = async (id: string, t: CounterpartyType) =>
    updateDoc(doc(db, "finance_counterparties", id), { type: t });

  const renote = async (id: string, note: string) =>
    updateDoc(doc(db, "finance_counterparties", id), { note: note.trim() || null });

  const toggleArchived = async (id: string, archived: boolean) =>
    updateDoc(doc(db, "finance_counterparties", id), { archived });

  const remove = async (row: Counterparty) => {
    if (!confirm(`Удалить контрагента «${row.name}»?`)) return;
    await deleteDoc(doc(db, "finance_counterparties", row.id));
  };

  return (
    <ManagerLayout>
      <Head><title>Контрагенты — Финансы</title></Head>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Контрагенты</h1>
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
            <select className="w-full border rounded px-2 py-1" value={type} onChange={e=>setType(e.target.value as any)}>
              <option value="all">Все</option>
              <option value="operator">Оператор</option>
              <option value="client">Покупатель</option>
              <option value="supplier">Поставщик</option>
              <option value="budget">Бюджет/Налоги</option>
              <option value="other">Другое</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <div className="text-xs text-gray-600 mb-1">Поиск</div>
            <input className="w-full border rounded px-2 py-1"
              value={q} onChange={e=>setQ(e.target.value)} placeholder="название / примечание…"
            />
          </div>
          <label className="inline-flex items-center gap-2 self-end mb-1">
            <input type="checkbox" className="h-4 w-4" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)} />
            Показывать архив
          </label>
        </div>

        {/* Создание */}
        <div className="p-3 border rounded-lg grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm">
          <div className="sm:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Название</div>
            <input className="w-full border rounded px-2 py-1" value={newName} onChange={e=>setNewName(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Тип</div>
            <select className="w-full border rounded px-2 py-1" value={newType} onChange={e=>setNewType(e.target.value as CounterpartyType)}>
              <option value="operator">Оператор</option>
              <option value="client">Покупатель</option>
              <option value="supplier">Поставщик</option>
              <option value="budget">Бюджет/Налоги</option>
              <option value="other">Другое</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Заметка</div>
            <input className="w-full border rounded px-2 py-1" value={newNote} onChange={e=>setNewNote(e.target.value)} />
          </div>
          <div className="self-end">
            <Button onClick={createRow} className="h-9 px-3 bg-green-600 hover:bg-green-700 text-white">Добавить</Button>
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border text-sm">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border px-2 py-1">Название</th>
                <th className="border px-2 py-1">Тип</th>
                <th className="border px-2 py-1">Заметка</th>
                <th className="border px-2 py-1">Статус</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="text-center hover:bg-gray-50">
                  <td className="border px-2 py-1 text-left">
                    <input
                      className="w-full border rounded px-2 py-1"
                      defaultValue={r.name}
                      onBlur={e=> e.target.value !== r.name && rename(r.id, e.target.value)}
                    />
                  </td>
                  <td className="border px-2 py-1">
                    <select
                      className="w-full border rounded px-2 py-1"
                      value={r.type}
                      onChange={e=>retag(r.id, e.target.value as CounterpartyType)}
                    >
                      <option value="operator">Оператор</option>
                      <option value="client">Покупатель</option>
                      <option value="supplier">Поставщик</option>
                      <option value="budget">Бюджет/Налоги</option>
                      <option value="other">Другое</option>
                    </select>
                  </td>
                  <td className="border px-2 py-1">
                    <input
                      className="w-full border rounded px-2 py-1"
                      defaultValue={r.note || ""}
                      onBlur={e=> (e.target.value || "") !== (r.note || "") && renote(r.id, e.target.value)}
                    />
                  </td>
                  <td className="border px-2 py-1">
                    {r.archived
                      ? <span className="px-2 py-0.5 rounded bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-400/40">В архиве</span>
                      : <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20">Активен</span>}
                  </td>
                  <td className="border px-2 py-1">
                    <div className="inline-flex gap-2">
                      <button className="h-7 px-2 border rounded hover:bg-gray-100"
                        onClick={()=>toggleArchived(r.id, !r.archived)}>
                        {r.archived ? "Разархив." : "В архив"}
                      </button>
                      <button className="h-7 px-2 border rounded hover:bg-red-50"
                        onClick={()=>remove(r)}>Удалить</button>
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