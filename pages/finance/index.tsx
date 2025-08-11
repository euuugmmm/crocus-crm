"use client";

import Link from "next/link";
import ManagerLayout from "@/components/layouts/ManagerLayout";

export default function FinanceIndex() {
  return (
    <ManagerLayout>
      <div className="max-w-5xl mx-auto py-10">
        <h1 className="text-3xl font-bold mb-8">Финансы компании</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <Link href="/finance/setup" className="p-6 rounded-xl bg-slate-50 hover:bg-slate-100 shadow">
            <h2 className="text-xl font-semibold mb-2">Настройка</h2>
            <p>Системные категории, дефолтный счёт.</p>
          </Link>
          <Link href="/finance/accounts" className="p-6 rounded-xl bg-blue-50 hover:bg-blue-100 shadow">
            <h2 className="text-xl font-semibold mb-2">Счета</h2>
            <p>BT EUR / RON / USD и другие.</p>
          </Link>
          <Link href="/finance/rates" className="p-6 rounded-xl bg-amber-50 hover:bg-amber-100 shadow">
            <h2 className="text-xl font-semibold mb-2">Курсы валют</h2>
            <p>К EUR по датам.</p>
          </Link>
          <Link href="/finance/transactions" className="p-6 rounded-xl bg-green-50 hover:bg-green-100 shadow">
            <h2 className="text-xl font-semibold mb-2">Транзакции</h2>
            <p>Учёт и анализ движений.</p>
          </Link>
          <Link href="/finance/categories" className="p-6 rounded-xl bg-purple-50 hover:bg-purple-100 shadow">
            <h2 className="text-xl font-semibold mb-2">Категории</h2>
            <p>Доходы, расходы, COGS.</p>
          </Link>
          <Link href="/finance/reports" className="p-6 rounded-xl bg-yellow-50 hover:bg-yellow-100 shadow">
            <h2 className="text-xl font-semibold mb-2">Отчёты и Дашборды</h2>
            <p>ДДС, P&L, маржа, налоги.</p>
          </Link>
        </div>
        <div className="text-gray-400 text-xs text-center">
          © {new Date().getFullYear()} Crocus Tour CRM — Финансовый модуль
        </div>
      </div>
    </ManagerLayout>
  );
}