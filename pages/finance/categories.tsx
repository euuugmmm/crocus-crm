/* pages/finance/categories.tsx */
"use client";

import Head from "next/head";
import { useEffect, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { db } from "@/firebaseConfig";
import {
  collection, query, onSnapshot, addDoc, updateDoc, doc, Timestamp,
} from "firebase/firestore";
import type { Category, CategorySide } from "@/lib/finance/types";

const SYSTEM_PRESET: Array<Omit<Category, "id">> = [
  { name: "Поступление от клиента", side: "income", system: true },
  { name: "Прочие доходы",          side: "income", system: true },
  { name: "Оплата оператору",       side: "expense", system: true },
  { name: "Возврат клиенту",        side: "expense", system: true },
  { name: "Банковская комиссия",    side: "expense", system: true },
  { name: "Налоги",                 side: "expense", system: true },
  { name: "Выплата агенту",         side: "expense", system: true },
];

export default function FinanceCategories() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [list, setList] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [side, setSide] = useState<CategorySide>("income");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const unsub = onSnapshot(query(collection(db, "finance_categories")), snap => {
      setList(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [user, canEdit, router]);

  async function addCategory() {
    if (!name.trim()) return;
    await addDoc(collection(db, "finance_categories"), {
      name: name.trim(),
      side,
      description: description.trim() || "",
      system: false,
      archived: false,
      createdAt: Timestamp.now(),
    });
    setName(""); setDescription(""); setSide("income");
  }

  async function toggleArchive(c: Category) {
    await updateDoc(doc(db, "finance_categories", c.id), { archived: !c.archived });
  }

  async function seedSystem() {
    if (!confirm("Создать системные категории?")) return;
    const existing = new Set(list.map(c => `${c.side}:${c.name}`.toLowerCase()));
    for (const item of SYSTEM_PRESET) {
      const key = `${item.side}:${item.name}`.toLowerCase();
      if (existing.has(key)) continue;
      await addDoc(collection(db, "finance_categories"), {
        ...item,
        description: "",
        archived: false,
        createdAt: Timestamp.now(),
      });
    }
    alert("Готово.");
  }

  return (
    <ManagerLayout>
      <Head><title>Категории — Финансы</title></Head>
      <div className="max-w-5xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Категории</h1>
          <div className="flex gap-2">
            <Button onClick={seedSystem} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-3">
              Сид системных
            </Button>
          </div>
        </div>

        <div className="p-3 border rounded-lg mb-6 grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm">
          <div className="sm:col-span-2">
            <div className="text-[11px] text-gray-600 mb-1">Название</div>
            <input className="w-full border rounded px-2 py-1" value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Тип</div>
            <select className="w-full border rounded px-2 py-1" value={side} onChange={e=>setSide(e.target.value as CategorySide)}>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Описание (опц.)</div>
            <input className="w-full border rounded px-2 py-1" value={description} onChange={e=>setDescription(e.target.value)} />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <Button onClick={addCategory} className="bg-green-600 hover:bg-green-700 text-white h-9 px-3">
              Добавить
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border text-sm">
            <thead className="bg-gray-100">
              <tr className="text-center">
                <th className="border px-2 py-1">Название</th>
                <th className="border px-2 py-1">Тип</th>
                <th className="border px-2 py-1">Системная</th>
                <th className="border px-2 py-1">Статус</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id} className="text-center hover:bg-gray-50">
                  <td className="border px-2 py-1 text-left">{c.name}</td>
                  <td className="border px-2 py-1">{c.side === "income" ? "Доход" : "Расход"}</td>
                  <td className="border px-2 py-1">{c.system ? "✓" : "—"}</td>
                  <td className="border px-2 py-1">{c.archived ? "архив" : "активна"}</td>
                  <td className="border px-2 py-1">
                    <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={()=>toggleArchive(c)}>
                      {c.archived ? "Разархивировать" : "Архивировать"}
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={5} className="border px-2 py-4 text-center text-gray-500">Нет категорий</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ManagerLayout>
  );
}