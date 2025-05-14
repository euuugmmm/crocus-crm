"use client";

import { useState } from "react";

export interface TransactionFormProps {
  initialData?: any;
  categories: { id: string; name: string }[];
  onSubmit: (data: any) => void;
}

export default function TransactionForm({ initialData = {}, categories, onSubmit }: TransactionFormProps) {
  const [amount, setAmount] = useState(initialData.amount || "");
  const [currency, setCurrency] = useState(initialData.currency || "EUR");
  const [category, setCategory] = useState(initialData.category || "");
  const [bookingId, setBookingId] = useState(initialData.bookingId || "");
  const [description, setDescription] = useState(initialData.description || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      amount: parseFloat(amount),
      currency,
      category,
      bookingId,
      description,
      date: new Date().toISOString(),
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="block font-medium">Сумма</label>
        <input className="border rounded p-2 w-full" type="number" value={amount} onChange={e => setAmount(e.target.value)} required/>
      </div>
      <div>
        <label className="block font-medium">Валюта</label>
        <select className="border rounded p-2 w-full" value={currency} onChange={e => setCurrency(e.target.value)}>
          <option value="EUR">EUR</option>
          <option value="RON">RON</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div>
        <label className="block font-medium">Категория</label>
        <select className="border rounded p-2 w-full" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Выбрать...</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.name}>{cat.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block font-medium">ID заявки (опционально)</label>
        <input className="border rounded p-2 w-full" value={bookingId} onChange={e => setBookingId(e.target.value)}/>
      </div>
      <div>
        <label className="block font-medium">Описание / назначение</label>
        <input className="border rounded p-2 w-full" value={description} onChange={e => setDescription(e.target.value)}/>
      </div>
      <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700" type="submit">Сохранить</button>
    </form>
  );
}