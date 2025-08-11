/* pages/finance/categories.tsx */
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
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  Timestamp,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Category, CategorySide } from "@/lib/finance/types";

export default function CategoriesPage() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [items, setItems] = useState<Category[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");

  // modal
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<Pick<Category, "name" | "side" | "description">>({
    name: "",
    side: "income",
    description: "",
  });

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const unsub = onSnapshot(
      query(collection(db, "finance_categories"), orderBy("side", "asc"), orderBy("name", "asc")),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    return () => unsub();
  }, [user, canEdit, router]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((c) => (showArchived ? true : !c.archived))
      .filter((c) => {
        if (!term) return true;
        return [c.name, c.side, c.description || ""].join(" ").toLowerCase().includes(term);
      });
  }, [items, showArchived, q]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", side: "income", description: "" });
    setOpen(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, side: c.side as CategorySide, description: c.description || "" });
    setOpen(true);
  };

  async function save() {
    const name = form.name.trim();
    if (!name) return alert("Введите название");
    // запрет дублей: name+side
    const dupQ = query(
      collection(db, "finance_categories"),
      where("name", "==", name),
      where("side", "==", form.side)
    );
    const dup = await getDocs(dupQ);
    if (!editing && !dup.empty) return alert("Такая категория уже существует");
    if (editing && !dup.empty && dup.docs[0].id !== editing.id) {
      return alert("Другая категория с таким названием и типом уже есть");
    }

    const payload = {
      name,
      side: form.side as CategorySide, // "income" | "expense" | "cogs"
      description: form.description?.trim() || "",
    };

    // системные категории нельзя переводить в другой side
    if (editing) {
      const changes: any = { description: payload.description, name: payload.name };
      if (!editing.isSystem) changes.side = payload.side;
      await updateDoc(doc(db, "finance_categories", editing.id), changes);
    } else {
      await addDoc(collection(db, "finance_categories"), {
        ...payload,
        isSystem: false,
        archived: false,
        createdAt: Timestamp.now(),
      });
    }
    setOpen(false);
  }

  async function archive(c: Category, flag: boolean) {
    await updateDoc(doc(db, "finance_categories", c.id), { archived: flag });
  }

  return (
    <ManagerLayout>
      <Head><title>Категории — Финансы</title></Head>
      <div className="max-w-5xl mx-auto py-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Категории</h1>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Показать архив
            </label>
            <Button className="bg-green-600 hover:bg-green-700 text-white h-9 px-3" onClick={openCreate}>
              Добавить
            </Button>
          </div>
        </div>

        <div className="mb-3">
          <input
            className="w-72 border rounded px-2 py-1"
            placeholder="Поиск…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border text-sm">
            <thead className="bg-gray-100">
              <tr className="text-center">
                <th className="border px-2 py-1">Название</th>
                <th className="border px-2 py-1">Тип</th>
                <th className="border px-2 py-1">Системная</th>
                <th className="border px-2 py-1">Описание</th>
                <th className="border px-2 py-1">Статус</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="text-center hover:bg-gray-50">
                  <td className="border px-2 py-1 text-left">{c.name}</td>
                  <td className="border px-2 py-1">
                    {c.side === "income" && (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Доход</span>
                    )}
                    {c.side === "expense" && (
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">Расход</span>
                    )}
                    {c.side === "cogs" && (
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20">Себестоимость</span>
                    )}
                  </td>
                  <td className="border px-2 py-1">
                    {c.isSystem ? (
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20">Да</span>
                    ) : "—"}
                  </td>
                  <td className="border px-2 py-1 text-left">{c.description || "—"}</td>
                  <td className="border px-2 py-1">
                    {c.archived ? (
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-400/30">Архив</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20">Активна</span>
                    )}
                  </td>
                  <td className="border px-2 py-1">
                    <div className="inline-flex gap-2">
                      <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={() => openEdit(c)}>✏️</button>
                      {!c.archived ? (
                        <button className="h-7 px-2 border rounded hover:bg-red-50" onClick={() => archive(c, true)}>🗂️ Архив</button>
                      ) : (
                        <button className="h-7 px-2 border rounded hover:bg-emerald-50" onClick={() => archive(c, false)}>↩️ Вернуть</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="border px-2 py-4 text-center text-gray-500">Ничего не найдено</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-md bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{editing ? "Изменить категорию" : "Новая категория"}</h2>
              <button className="text-2xl leading-none" onClick={() => setOpen(false)}>×</button>
            </div>

            <div className="space-y-3">
              <Field label="Название">
                <input
                  className="w-full border rounded px-2 py-1"
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Тип">
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.side}
                    onChange={(e) => setForm((s) => ({ ...s, side: e.target.value as CategorySide }))}
                    disabled={!!editing?.isSystem}
                    title={editing?.isSystem ? "Системную категорию нельзя менять по типу" : ""}
                  >
                    <option value="income">Доход</option>
                    <option value="expense">Расход</option>
                    <option value="cogs">Себестоимость</option>
                  </select>
                </Field>

                <Field label="Описание">
                  <input
                    className="w-full border rounded px-2 py-1"
                    value={form.description || ""}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} className="h-8 px-3 text-xs">Отмена</Button>
              <Button onClick={save} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">Сохранить</Button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      {children}
    </div>
  );
}