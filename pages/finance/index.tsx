/* pages/finance/index.tsx */
"use client";

import Link from "next/link";
import Head from "next/head";
import { ArrowRight, BarChart3, CreditCard, CalendarDays, FileText, Layers, LineChart, PieChart, UploadCloud, Settings, Wallet } from "lucide-react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { Briefcase, Users2 } from "lucide-react";
export default function FinanceIndex() {
  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head><title>Финансы компании</title></Head>

      {/* Hero */}
      <section className="w-full">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 text-white shadow">
          <div className="px-6 py-8 md:px-10 md:py-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                  Финансы компании
                </h1>
                <p className="mt-2 text-indigo-100 max-w-2xl">
                  Центр управления денежными потоками, продажами и отчётами. Быстрый доступ к учёту, аналитике и импортам.
                </p>
              </div>

              {/* Быстрые действия */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/finance/sales-dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/95 text-indigo-700 hover:bg-white px-4 py-2 font-semibold shadow-sm"
                >
                  <BarChart3 className="w-4 h-4" />
                  Дашборд продаж
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/finance/transactions"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-black/10 hover:bg-black/20 px-4 py-2 font-semibold"
                >
                  <CreditCard className="w-4 h-4" />
                  Транзакции
                </Link>
                                <Link
                  href="/finance/bookings-finance"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-black/10 hover:bg-black/20 px-4 py-2 font-semibold"
                >
                  <Wallet className="w-4 h-4" />
                  Заявки
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Основные модули (важные) */}
      <section className="mt-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <Tile
            href="/finance/sales-dashboard"
            icon={<BarChart3 className="w-5 h-5" />}
            title="Дашборд продаж"
            desc="Динамика, когорты и разрезы по периодам."
            tone="primary"
          />
          <Tile
            href="/finance/transactions"
            icon={<CreditCard className="w-5 h-5" />}
            title="Транзакции"
            desc="Учёт и распределение поступлений/выплат по заявкам."
            tone="emerald"
          />
          <Tile
            href="/finance/cashflow-calendar"
            icon={<CalendarDays className="w-5 h-5" />}
            title="Календарь ДДС"
            desc="Сроки платежей, планирование и контроль разрывов."
            tone="blue"
          />
          <Tile
            href="/finance/bookings-finance"
            icon={<Wallet className="w-5 h-5" />}
            title="Заявки / Бронирования"
            desc="План/факт/сверка, остатки по оплатам, статусы."
            tone="amber"
          />

          <Tile
            href="/finance/overview"
            icon={<LineChart className="w-5 h-5" />}
            title="Финансовый обзор"
            desc="Сводные показатели по рынкам, направлениям, прибыли."
            tone="violet"
          />
          <Tile
            href="/finance/pl"
            icon={<BarChart3 className="w-5 h-5" />}
            title="P&L (прибыль/убыток)"
            desc="Предпросмотр, маппинг и загрузка банковских операций."
            tone="indigo"
          />
        </div>
      </section>

      {/* Справочники и настройки (второстепенное) */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-gray-600 mb-3">Справочники и настройки</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TinyTile href="/finance/categories" icon={<Layers className="w-4 h-4" />} title="Категории" />
          <TinyTile href="/finance/counterparties" icon={<FileText className="w-4 h-4" />} title="Контрагенты" />
          <TinyTile href="/finance/accounts" icon={<Wallet className="w-4 h-4" />} title="Счета компании" />
          <TinyTile href="/finance/rates" icon={<PieChart className="w-4 h-4" />} title="Курсы валют(FX)" />
          <TinyTile href="/finance/founders-report" icon={<Users2 className="w-4 h-4" />} title="Отчёт по учредителям" />
          <TinyTile href="/finance/planned" icon={<FileText className="w-4 h-4" />} title="Плановые операции" />
          <TinyTile href="/finance/import/mt940" icon={<UploadCloud className="w-4 h-4" />} title="Импорт выписок (MT940)" />
          <TinyTile href="/finance/setup" icon={<Settings className="w-4 h-4" />} title="Настройки модуля" />

        </div>
      </section>

      {/* Подвал */}
      <footer className="mt-12 text-gray-400 text-xs text-center">
        © {new Date().getFullYear()} Crocus Tour CRM — Финансовый модуль
      </footer>
    </ManagerLayout>
  );
}

/* ——— Вспомогательные компоненты плиток ——— */

function Tile({
  href,
  icon,
  title,
  desc,
  tone = "indigo",
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone?:
    | "primary"
    | "indigo"
    | "emerald"
    | "amber"
    | "blue"
    | "violet";
}) {
  const tones: Record<string, string> = {
    primary:
      "bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 text-white hover:brightness-105",
    indigo:
      "bg-indigo-50 hover:bg-indigo-100 text-indigo-900 ring-1 ring-inset ring-indigo-100",
    emerald:
      "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-100",
    amber:
      "bg-amber-50 hover:bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-100",
    blue:
      "bg-blue-50 hover:bg-blue-100 text-blue-900 ring-1 ring-inset ring-blue-100",
    violet:
      "bg-violet-50 hover:bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-100",
  };

  const isPrimary = tone === "primary";

  return (
    <Link href={href} className={`group rounded-2xl p-5 shadow-sm transition ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 rounded-xl p-2 ${
            isPrimary ? "bg-white/15 text-white" : "bg-white text-gray-700 shadow-sm"
          }`}
        >
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-semibold ${isPrimary ? "text-white" : "text-gray-900"}`}>
              {title}
            </h3>
            <ArrowRight
              className={`w-4 h-4 transition ${
                isPrimary ? "text-white/80 group-hover:translate-x-0.5" : "text-gray-400 group-hover:translate-x-0.5"
              }`}
            />
          </div>
          <p className={`mt-1 text-sm ${isPrimary ? "text-indigo-100" : "text-gray-600"}`}>{desc}</p>
        </div>
      </div>
    </Link>
  );
}

function TinyTile({
  href,
  icon,
  title,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl p-4 bg-white shadow-sm ring-1 ring-inset ring-gray-100 hover:shadow transition"
    >
      <div className="rounded-lg bg-gray-50 p-2 text-gray-700">{icon}</div>
      <div className="text-sm font-medium text-gray-800">{title}</div>
    </Link>
  );
}

