// components/finance/Accounting/Settings.tsx
import { useState } from "react";

export default function AccountingSettings() {
  const [defaultCurrency, setDefaultCurrency] = useState("EUR");
  const [bankIntegration, setBankIntegration] = useState("nordigen");

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow space-y-6">
      <h2 className="text-2xl font-bold mb-4">Настройки финансового учёта</h2>
      <div>
        <label className="block font-medium mb-1">Валюта по умолчанию</label>
        <select
          value={defaultCurrency}
          onChange={e => setDefaultCurrency(e.target.value)}
          className="w-full border rounded p-2"
        >
          <option value="EUR">EUR</option>
          <option value="RON">RON</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div>
        <label className="block font-medium mb-1">Интеграция банка</label>
        <select
          value={bankIntegration}
          onChange={e => setBankIntegration(e.target.value)}
          className="w-full border rounded p-2"
        >
          <option value="nordigen">Nordigen</option>
          <option value="gocardless">GoCardless</option>
        </select>
      </div>
      <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
        Сохранить настройки
      </button>
    </div>
  );
}