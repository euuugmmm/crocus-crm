// components/Finance/Accounting/ReportsDashboard.tsx

"use client";

import { useState, useEffect } from "react";

interface Summary {
  totalIncome: number;
  totalExpense: number;
  profit: number;
  byMarket: Record<string, { income: number; expense: number }>;
  byCategory: Record<string, { income: number; expense: number }>;
}

const API_URL = "/api/finance/reports";

export default function ReportsDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.append("from", from);
    if (to) params.append("to", to);
    const res = await fetch(`${API_URL}?${params.toString()}`);
    const data = await res.json();
    setSummary(data.summary);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <h2 className="text-xl font-semibold mb-4">Финансовая сводка</h2>
      <div className="flex space-x-4 mb-6">
        <div>
          <label className="block text-xs text-gray-600">C даты</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded p-2"/>
        </div>
        <div>
          <label className="block text-xs text-gray-600">По дату</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded p-2"/>
        </div>
        <button
          onClick={fetchData}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 self-end"
        >
          Применить фильтр
        </button>
      </div>
      {loading && <div className="py-10 text-center text-gray-500">Загрузка...</div>}

      {summary && (
        <>
          <div className="grid grid-cols-3 gap-8 mb-6">
            <div className="p-4 bg-blue-50 rounded shadow text-center">
              <div className="text-gray-500 text-xs mb-1">Доходы</div>
              <div className="text-2xl font-bold">{summary.totalIncome.toLocaleString()} €</div>
            </div>
            <div className="p-4 bg-red-50 rounded shadow text-center">
              <div className="text-gray-500 text-xs mb-1">Расходы</div>
              <div className="text-2xl font-bold">{summary.totalExpense.toLocaleString()} €</div>
            </div>
            <div className="p-4 bg-green-50 rounded shadow text-center">
              <div className="text-gray-500 text-xs mb-1">Прибыль</div>
              <div className="text-2xl font-bold">{summary.profit.toLocaleString()} €</div>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="font-semibold mb-2">По рынкам</h3>
            <table className="min-w-full text-sm border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border">Рынок</th>
                  <th className="p-2 border">Доходы</th>
                  <th className="p-2 border">Расходы</th>
                  <th className="p-2 border">Профит</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.byMarket).map(([market, stats]) => (
                  <tr key={market}>
                    <td className="border px-2">{market}</td>
                    <td className="border px-2">{stats.income.toLocaleString()}</td>
                    <td className="border px-2">{stats.expense.toLocaleString()}</td>
                    <td className="border px-2">{(stats.income - stats.expense).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="font-semibold mb-2">По категориям</h3>
            <table className="min-w-full text-sm border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border">Категория</th>
                  <th className="p-2 border">Доходы</th>
                  <th className="p-2 border">Расходы</th>
                  <th className="p-2 border">Профит</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.byCategory).map(([cat, stats]) => (
                  <tr key={cat}>
                    <td className="border px-2">{cat}</td>
                    <td className="border px-2">{stats.income.toLocaleString()}</td>
                    <td className="border px-2">{stats.expense.toLocaleString()}</td>
                    <td className="border px-2">{(stats.income - stats.expense).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}