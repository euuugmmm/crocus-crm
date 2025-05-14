"use client";

import { useState } from "react";

export interface BookingFormProps {
  initialData?: any;
  onSubmit: (data: any) => void;
}

export default function BookingForm({ initialData = {}, onSubmit }: BookingFormProps) {
  const [market, setMarket] = useState(initialData.market || "");
  const [category, setCategory] = useState(initialData.category || "");
  const [bookingNumber, setBookingNumber] = useState(initialData.bookingNumber || "");
  const [clientName, setClientName] = useState(initialData.clientName || "");
  const [amount, setAmount] = useState(initialData.amount || "");
  const [currency, setCurrency] = useState(initialData.currency || "EUR");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      market,
      category,
      bookingNumber,
      clientName,
      amount: parseFloat(amount),
      currency,
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="block font-medium">Рынок</label>
        <select className="border rounded p-2 w-full" value={market} onChange={e => setMarket(e.target.value)} required>
          <option value="">Выберите</option>
          <option value="UA">Украинский рынок</option>
          <option value="RO">Румынский рынок</option>
          <option value="UA_AGENT">Субагентская продажа (Украина)</option>
        </select>
      </div>
      <div>
        <label className="block font-medium">Категория</label>
        <input className="border rounded p-2 w-full" value={category} onChange={e => setCategory(e.target.value)} placeholder="Туры / Билеты / ..."/>
      </div>
      <div>
        <label className="block font-medium">Номер заявки</label>
        <input className="border rounded p-2 w-full" value={bookingNumber} onChange={e => setBookingNumber(e.target.value)} required/>
      </div>
      <div>
        <label className="block font-medium">Имя клиента</label>
        <input className="border rounded p-2 w-full" value={clientName} onChange={e => setClientName(e.target.value)} required/>
      </div>
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
      <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700" type="submit">Сохранить</button>
    </form>
  );
}