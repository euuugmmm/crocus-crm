// components/finance/Accounting/TransactionsTable.tsx

"use client";

import { useEffect, useState } from "react";

interface Transaction {
  id: string;
  bookingDate: string;
  valueDate: string;
  transactionAmount: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  category?: string;
  bookingId?: string;
  remittanceInformationUnstructured?: string;
}

const API_URL = "/api/finance/transactions";
const CATEGORIES_URL = "/api/finance/categories";

export default function TransactionsTable() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<string>("");

  // Загрузка транзакций
  const loadTransactions = async () => {
    setLoading(true);
    let query = [];
    if (currency) query.push(`currency=${currency}`);
    if (category) query.push(`category=${category}`);
    const res = await fetch(`${API_URL}?${query.join("&")}`);
    const data = await res.json();
    setTransactions(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line
  }, [currency, category]);

  // Импорт выписки
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const transactions = json.transactions?.booked ?? json.transactions ?? [];
      if (!Array.isArray(transactions)) throw new Error("Некорректный формат файла");
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      });
      if (!res.ok) throw new Error("Ошибка загрузки транзакций");
      await loadTransactions();
      alert("Транзакции успешно импортированы");
    } catch (e: any) {
      setImportError(e.message || "Ошибка импорта файла");
    }
  };

  const handleCategorySave = async (id: string) => {
    const txn = transactions.find(t => t.id === id);
    if (!txn) return;
    const updated = { ...txn, category: newCategory };
    await fetch(`${API_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: [updated] }),
    });
    setEditingCategoryId(null);
    await loadTransactions();
  };

  // 🧠 Уникальные значения для фильтра
  const txns = Array.isArray(transactions) ? transactions : [];
  const uniqueCurrencies = Array.from(new Set(txns.map(t => t.transactionAmount.currency)));
  const uniqueCategories = Array.from(new Set(txns.map(t => t.category).filter(Boolean)));

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div>
          <label className="block text-sm">Валюта</label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="border rounded p-2"
          >
            <option value="">Все</option>
            {uniqueCurrencies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm">Категория</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="border rounded p-2"
          >
            <option value="">Все</option>
            {uniqueCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Импортировать выписку (.json)</label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            className="block"
          />
          {importError && <div className="text-red-500 text-sm">{importError}</div>}
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-gray-500">Загрузка...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border">Дата</th>
                <th className="p-2 border">Сумма</th>
                <th className="p-2 border">Валюта</th>
                <th className="p-2 border">Кредитор</th>
                <th className="p-2 border">Дебитор</th>
                <th className="p-2 border">Категория</th>
                <th className="p-2 border">Описание</th>
                <th className="p-2 border">BookingID</th>
              </tr>
            </thead>
            <tbody>
              {txns.map(t => (
                <tr key={t.id} className={parseFloat(t.transactionAmount.amount) < 0 ? "bg-red-50" : "bg-green-50"}>
                  <td className="border px-2">{t.bookingDate}</td>
                  <td className="border px-2">{t.transactionAmount.amount}</td>
                  <td className="border px-2">{t.transactionAmount.currency}</td>
                  <td className="border px-2">{t.creditorName}</td>
                  <td className="border px-2">{t.debtorName}</td>
                  <td className="border px-2">
                    {editingCategoryId === t.id ? (
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          className="border px-2 py-1 rounded"
                        />
                        <button
                          onClick={() => handleCategorySave(t.id)}
                          className="bg-blue-500 text-white px-3 py-1 rounded"
                        >✔</button>
                      </div>
                    ) : (
                      <span
                        onClick={() => {
                          setEditingCategoryId(t.id);
                          setNewCategory(t.category || "");
                        }}
                        className="cursor-pointer underline text-blue-600"
                      >
                        {t.category || <span className="text-gray-400">—</span>}
                      </span>
                    )}
                  </td>
                  <td className="border px-2">
                    <span title={t.remittanceInformationUnstructured || ""}>
                      {t.remittanceInformationUnstructured?.slice(0, 36)}
                      {t.remittanceInformationUnstructured && t.remittanceInformationUnstructured.length > 36 ? "…" : ""}
                    </span>
                  </td>
                  <td className="border px-2">{t.bookingId || <span className="text-gray-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!txns.length && (
            <div className="py-10 text-center text-gray-400">Нет транзакций за выбранный период/фильтр.</div>
          )}
        </div>
      )}
    </div>
  );
}