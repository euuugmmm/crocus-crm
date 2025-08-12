"use client";

import Link from "next/link";
import Head from "next/head";
import ManagerLayout from "@/components/layouts/ManagerLayout";

export default function FinanceIndex() {
  return (
    <ManagerLayout>
      <Head><title>Финансы компании</title></Head>
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
          <Link href="/finance/bookings-finance">
            <div className="p-6 rounded-xl bg-yellow-50 hover:bg-yellow-100 shadow cursor-pointer">
              <h2 className="text-xl font-semibold mb-2">Заявки / Бронирования</h2>
              <p>(план/факт/сверка) с подсветкой овердью.</p>
            </div>
          </Link>

                    <Link href="/finance/cashflow-calendar">
            <div className="p-6 rounded-xl bg-yellow-50 hover:bg-yellow-100 shadow cursor-pointer">
              <h2 className="text-xl font-semibold mb-2">Календарь ДДС</h2>
              <p>Учёт всех заявок по направлениям и рынкам.</p>
            </div>
          </Link>

          <Link href="/finance/overview">
            <div className="p-6 rounded-xl bg-purple-50 hover:bg-purple-100 shadow cursor-pointer">
              <h2 className="text-xl font-semibold mb-2">Отчёты и Дашборды</h2>
              <p>Сводные данные по рынкам, направлениям, прибыли.</p>
            </div>
          </Link>
          {/* Новая плитка */}
          <Link href="/finance/import/mt940">
            <div className="p-6 rounded-xl bg-indigo-50 hover:bg-indigo-100 shadow cursor-pointer">
              <h2 className="text-xl font-semibold mb-2">Импорт выписок</h2>
              <p>MT940 (BT EUR) — предпросмотр и загрузка.</p>
            </div>
          </Link>

                    <Link href="/finance/pl">
            <div className="p-6 rounded-xl bg-indigo-50 hover:bg-indigo-500 shadow cursor-pointer">
              <h2 className="text-xl font-semibold mb-2">P&L</h2>
              <p>Прибыли / Убытки</p>
            </div>
          </Link>


                    <Link href="/finance/rates">
            <div className="p-6 rounded-xl bg-red-50 hover:bg-red-300 shadow cursor-pointer">
              <h2 className="text-xl font-semibold mb-2">Rates</h2>
              <p>Курсы</p>
            </div>
          </Link>
                    <Link href="/finance/planned">
            <div className="p-6 rounded-xl bg-red-50 hover:bg-red-300 shadow cursor-pointer">
              <h2 className="text-xl font-semibold mb-2">Plan</h2>
              <p>Плановые</p>
            </div>
          </Link>
                    <Link href="/finance/setup">
            <div className="p-6 rounded-xl bg-red-50 hover:bg-red-300 shadow cursor-pointer">
              <h2 className="text-xl font-semibold mb-2">Setup</h2>
              <p>Setup</p>
            </div>
          </Link>

        </div>
        <div className="text-gray-400 text-xs text-center">
          © {new Date().getFullYear()} Crocus Tour CRM — Финансовый модуль
        </div>
      </div>
    </ManagerLayout>
  );
}