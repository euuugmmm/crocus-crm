// components/Finance/Accounting/CategoriesTable.tsx

"use client";

import { useEffect, useState } from "react";

interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer" | "other";
  description?: string;
}

const API_URL = "/api/finance/categories";

export default function CategoriesTable() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<Category["type"]>("income");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    const res = await fetch(API_URL);
    const data = await res.json();
    setCategories(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const addCategory = async () => {
    if (!name) return;
    setLoading(true);
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, description }),
    });
    setName("");
    setType("income");
    setDescription("");
    fetchCategories();
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <h2 className="text-xl font-semibold mb-4">Категории учёта</h2>
      <div className="mb-6 flex gap-4 items-end">
        <div>
          <label className="block text-sm">Название</label>
          <input value={name} onChange={e => setName(e.target.value)} className="border rounded p-2" />
        </div>
        <div>
          <label className="block text-sm">Тип</label>
          <select value={type} onChange={e => setType(e.target.value as Category["type"])} className="border rounded p-2">
            <option value="income">Доход</option>
            <option value="expense">Расход</option>
            <option value="transfer">Перевод</option>
            <option value="other">Другое</option>
          </select>
        </div>
        <div>
          <label className="block text-sm">Описание</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className="border rounded p-2" />
        </div>
        <button onClick={addCategory} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" disabled={loading}>
          Добавить
        </button>
      </div>
      <table className="min-w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">ID</th>
            <th className="p-2 border">Название</th>
            <th className="p-2 border">Тип</th>
            <th className="p-2 border">Описание</th>
          </tr>
        </thead>
        <tbody>
          {categories.map(c => (
            <tr key={c.id}>
              <td className="border px-2">{c.id}</td>
              <td className="border px-2">{c.name}</td>
              <td className="border px-2">{c.type === "income" ? "Доход" : c.type === "expense" ? "Расход" : c.type === "transfer" ? "Перевод" : "Другое"}</td>
              <td className="border px-2">{c.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!categories.length && <div className="py-10 text-center text-gray-400">Нет категорий.</div>}
    </div>
  );
}