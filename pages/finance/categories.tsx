// pages/finance/categories.tsx

import { useState, useEffect } from "react";
import { Category } from "@/types/Category";
import axios from "axios";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("income");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const loadCategories = async () => {
    const res = await axios.get("/api/finance/categories");
    setCategories(res.data);
  };

  const handleAdd = async () => {
    if (!name || !type) return;
    setLoading(true);
    try {
      await axios.post("/api/finance/categories", { name, type, description });
      setName("");
      setType("income");
      setDescription("");
      await loadCategories();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">Категории</h1>

      <div className="mb-6">
        <input
          className="border p-2 rounded mr-2"
          placeholder="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="border p-2 rounded mr-2"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="income">Доход</option>
          <option value="expense">Расход</option>
        </select>
        <input
          className="border p-2 rounded mr-2"
          placeholder="Описание (необязательно)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          onClick={handleAdd}
          disabled={loading || !name}
        >
          Добавить
        </button>
      </div>

      <table className="w-full table-auto border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 border">Название</th>
            <th className="p-2 border">Тип</th>
            <th className="p-2 border">Описание</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat.id}>
              <td className="border px-2 py-1">{cat.name}</td>
              <td className="border px-2 py-1">{cat.type}</td>
              <td className="border px-2 py-1">{cat.description || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}