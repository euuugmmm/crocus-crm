import { useState } from "react";
import axios from "axios";

export default function ImportBankStatement({ onImport }: { onImport: (txns: any[]) => void }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatus("Загрузка файла...");

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const txns = json.transactions?.booked ?? [];

      if (!Array.isArray(txns)) {
        setStatus("❌ Файл не содержит транзакции.");
        return;
      }

      const res = await axios.post("/api/finance/transactions", { transactions: txns });

      if (res.status === 200) {
        setStatus(`✅ Загружено ${txns.length} транзакций`);
        onImport(txns); // Обновляем таблицу
      } else {
        setStatus("❌ Ошибка при загрузке");
      }
    } catch (err) {
      setStatus("❌ Неверный формат или ошибка обработки файла.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-6 border p-4 rounded bg-gray-50">
      <label className="block font-medium mb-2">Импорт выписки (JSON)</label>
      <input
        type="file"
        accept=".json"
        onChange={handleFileUpload}
        className="block mb-2"
        disabled={loading}
      />
      <p className="text-sm text-gray-600">{status}</p>
    </div>
  );
}