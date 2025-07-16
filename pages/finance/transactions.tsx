// pages/finance/transactions.tsx

import ImportBankStatement from "@/components/finance/Accounting/ImportBankStatement";
import TransactionsTable from "@/components/finance/Accounting/TransactionsTable";
import { useTransactions } from "@/hooks/useTransactions";

export default function TransactionsPage() {
  const { data: transactions, loading, error } = useTransactions();

  return (
    <div className="max-w-6xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Банковские транзакции</h1>
      <p className="mb-6 text-gray-500">
        Здесь можно просматривать, фильтровать и импортировать банковские операции по всем счетам и валютам компании.
      </p>

      {/* Импорт */}
      <ImportBankStatement onImport={() => window.location.reload()} />

      {/* Ошибки */}
      {error && <p className="text-red-500">Ошибка: {String(error)}</p>}
      {loading && <p className="text-gray-400">Загрузка…</p>}
      {!loading && transactions.length === 0 && (
        <p className="text-gray-500">Нет транзакций за выбранный период.</p>
      )}

      {/* Таблица */}
      {!loading && transactions.length > 0 && (
      <TransactionsTable />
      )}
    </div>
  );
}