// pages/finance/index.tsx

import Link from "next/link";

export default function FinanceIndex() {
  return (
    <div className="max-w-4xl mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Финансы компании</h1>
      <div className="grid grid-cols-2 gap-8 mb-12">
        <Link href="/finance/transactions">
          <div className="p-6 rounded-xl bg-blue-50 hover:bg-blue-100 shadow cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">Транзакции</h2>
            <p>Учёт и анализ всех движений средств.</p>
          </div>
        </Link>
        <Link href="/finance/categories">
          <div className="p-6 rounded-xl bg-green-50 hover:bg-green-100 shadow cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">Категории</h2>
            <p>Доходы, расходы, структура учёта.</p>
          </div>
        </Link>
        <Link href="/finance/bookings">
          <div className="p-6 rounded-xl bg-yellow-50 hover:bg-yellow-100 shadow cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">Заявки / Бронирования</h2>
            <p>Учёт всех заявок по направлениям и рынкам.</p>
          </div>
        </Link>
        <Link href="/finance/reports">
          <div className="p-6 rounded-xl bg-purple-50 hover:bg-purple-100 shadow cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">Отчёты и Дашборды</h2>
            <p>Сводные данные по рынкам, направлениям, прибыли.</p>
          </div>
        </Link>
      </div>
      <div className="text-gray-400 text-xs">
        © {new Date().getFullYear()} Crocus Tour CRM — Финансовый модуль
      </div>
    </div>
  );
}