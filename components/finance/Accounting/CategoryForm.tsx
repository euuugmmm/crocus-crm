"use client";

import { useState } from "react";

export interface CategoryFormProps {
  initialData?: any;
  onSubmit: (data: any) => void;
}

export default function CategoryForm({ initialData = {}, onSubmit }: CategoryFormProps) {
  const [name, setName] = useState(initialData.name || "");
  const [type, setType] = useState(initialData.type || "income");
  const [description, setDescription] = useState(initialData.description || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, type, description });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="block font-medium">Название</label>
        <input className="border rounded p-2 w-full" value={name} onChange={e => setName(e.target.value)} required/>
      </div>
      <div>
        <label className="block font-medium">Тип</label>
        <select className="border rounded p-2 w-full" value={type} onChange={e => setType(e.target.value)} required>
          <option value="income">Доход</option>
          <option value="expense">Расход</option>
          <option value="transfer">Перевод/Внутренняя операция</option>
        </select>
      </div>
      <div>
        <label className="block font-medium">Описание</label>
        <input className="border rounded p-2 w-full" value={description} onChange={e => setDescription(e.target.value)}/>
      </div>
      <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" type="submit">Сохранить</button>
    </form>
  );
}