/* pages/finance/index.tsx */
"use client";

import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { db } from "@/firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  CalendarDays,
  Wallet,
  Table2,
  Upload,
  BarChart3,
  PieChart,
  LineChart,
  Layers,
  Settings,
  Landmark,
} from "lucide-react";

/** ===== helpers ===== */
const toYMD = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10); // YYYY-MM-DD
};
const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  return toYMD(d);
};
const endOfMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return toYMD(d);
};
const todayYMD = () => toYMD(new Date());

type Tx = {
  id: string;
  date: string;           // YYYY-MM-DD
  side: "income" | "expense";
  baseAmount: number;     // уже в EUR
  status?: "planned" | "actual" | "reconciled";
};

type BookingLite = {
  id: string;
  clientPrice?: number;
  bruttoClient?: number;
  payments?: { amount?: number }[];
};

export default function FinanceIndex() {
  // KPI состояния
  const [monthTx, setMonthTx] = useState<Tx[]>([]);
  const [unpaid, setUnpaid] = useState<{ count: number; left: number }>({ count: 0, left: 0 });

  // загрузка транзакций за текущий месяц одним снапшотом
  useEffect(() => {
    const qMonth = query(
      collection(db, "finance_transactions"),
      where("date", ">=", startOfMonth()),
      where("date", "<=", endOfMonth())
    );
    const unsubMonth = onSnapshot(qMonth, (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Tx[];
      setMonthTx(list);
    });
    // лёгкий счётчик «неоплаченных» заявок (по сумме оплат < brutto)
    const unsubBookings = onSnapshot(collection(db, "bookings"), (s) => {
      let count = 0;
      let left = 0;
      s.docs.forEach((d) => {
        const b = { id: d.id, ...(d.data() as any) } as BookingLite;
        const total = Number(b.clientPrice ?? b.bruttoClient ?? 0);
        const paid =
          (Array.isArray(b.payments) ? b.payments : []).reduce(
            (acc, p) => acc + Number(p?.amount || 0),
            0
          ) || 0;
        const diff = Math.max(0, total - paid);
        if (diff > 0.001) {
          count += 1;
          left += diff;
        }
      });
      setUnpaid({ count, left: +left.toFixed(2) });
    });

    return () => {
      unsubMonth();
      unsubBookings();
    };
  }, []);

  // производные KPI
  const kpi = useMemo(() => {
    const today = todayYMD();
    let incM = 0, expM = 0, incT = 0, expT = 0;

    for (const t of monthTx) {
      if (t.status && t.status !== "actual") continue; // считаем только факт
      const v = Math.abs(Number(t.baseAmount || 0));   // гарантированно положительное
      const isToday = t.date === today;

      if (t.side === "income") {
        incM += v;
        if (isToday) incT += v;
      } else {
        expM += v;
        if (isToday) expT += v;
      }
    }
    return {
      month: {
        income: +incM.toFixed(2),
        expense: +expM.toFixed(2),
        net: +(incM - expM).toFixed(2),
      },
      today: {
        income: +incT.toFixed(2),
        expense: +expT.toFixed(2),
        net: +(incT - expT).toFixed(2),
      },
    };
  }, [monthTx]);

  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head>
        <title>Финансы компании</title>
      </Head>

      {/* HERO */}
      <div className="w-full py-6 px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Финансы компании</h1>
            <p className="text-gray-500">
              Контроль денежного потока, оперативные операции и аналитика.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/finance/transactions"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
            >
              <Table2 className="w-4 h-4" /> Открыть транзакции
            </Link>
            <Link
              href="/finance/import/mt940"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
            >
              <Upload className="w-4 h-4" /> Импорт MT940
            </Link>
          </div>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="w-full px-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Доходы (месяц)"
          value={`${kpi.month.income.toFixed(2)} €`}
          icon={<ArrowUpCircle className="w-5 h-5" />}
          tone="green"
          hint={`Сегодня: ${kpi.today.income.toFixed(2)} €`}
        />
        <KpiCard
          title="Расходы (месяц)"
          value={`${kpi.month.expense.toFixed(2)} €`}
          icon={<ArrowDownCircle className="w-5 h-5" />}
          tone="rose"
          hint={`Сегодня: ${kpi.today.expense.toFixed(2)} €`}
        />
        <KpiCard
          title="Чистый поток (месяц)"
          value={`${kpi.month.net.toFixed(2)} €`}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="indigo"
          hint={`Сегодня: ${kpi.today.net.toFixed(2)} €`}
        />
        <KpiCard
          title="Неоплаченные заявки"
          value={`${unpaid.count} шт.`}
          icon={<Wallet className="w-5 h-5" />}
          tone="amber"
          hint={`Осталось к поступлению: ${unpaid.left.toFixed(2)} €`}
        />
      </div>

      {/* NAV SECTIONS */}
      <div className="w-full px-4 mt-8 space-y-10">
        {/* Операции (часто используемые) */}
        <Section title="Операции">
          <NavTile
            href="/finance/transactions"
            title="Транзакции"
            subtitle="Учёт и распределение платежей"
            icon={<Table2 className="w-6 h-6" />}
            tone="blue"
          />
          <NavTile
            href="/finance/bookings-finance"
            title="Заявки / Бронирования"
            subtitle="План/факт/сверка, остатки по клиентам"
            icon={<Layers className="w-6 h-6" />}
            tone="violet"
          />
          <NavTile
            href="/finance/cashflow-calendar"
            title="Календарь ДДС"
            subtitle="Поступления и выплаты по датам"
            icon={<CalendarDays className="w-6 h-6" />}
            tone="yellow"
          />
          <NavTile
            href="/finance/import/mt940"
            title="Импорт выписок"
            subtitle="MT940 (BT EUR) — проверка и загрузка"
            icon={<Upload className="w-6 h-6" />}
            tone="indigo"
          />
        </Section>

        {/* Аналитика и отчёты */}
        <Section title="Аналитика и отчёты">
          <NavTile
            href="/finance/overview"
            title="Дашборды"
            subtitle="Сводные показатели и динамика"
            icon={<BarChart3 className="w-6 h-6" />}
            tone="emerald"
          />
          <NavTile
            href="/finance/pl"
            title="P&L"
            subtitle="Прибыли и убытки по периодам"
            icon={<PieChart className="w-6 h-6" />}
            tone="rose"
          />
          <NavTile
            href="/finance/planned"
            title="Плановые"
            subtitle="Будущие платежи и ожидания"
            icon={<LineChart className="w-6 h-6" />}
            tone="cyan"
          />
          <NavTile
            href="/finance/rates"
            title="Курсы"
            subtitle="FX-курсы для пересчётов"
            icon={<Landmark className="w-6 h-6" />}
            tone="slate"
          />
        </Section>

        {/* Справочники и настройки (реже) */}
        <Section title="Справочники и настройки">
          <NavTile
            href="/finance/categories"
            title="Категории"
            subtitle="Структура доходов и расходов"
            icon={<Layers className="w-6 h-6" />}
            tone="green"
          />
          {/* если используете контрагентов — можно добавить: /finance/counterparties */}
          <NavTile
            href="/finance/setup"
            title="Настройки"
            subtitle="Права, профили, алгоритмы"
            icon={<Settings className="w-6 h-6" />}
            tone="gray"
          />
        </Section>
      </div>

      <div className="px-4 mt-10 mb-6 text-gray-400 text-xs text-center">
        © {new Date().getFullYear()} Crocus Tour CRM — Финансовый модуль
      </div>
    </ManagerLayout>
  );
}

/** ===== UI building blocks ===== */

function KpiCard({
  title,
  value,
  icon,
  tone = "indigo",
  hint,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone?: "green" | "rose" | "indigo" | "amber";
  hint?: string;
}) {
  const toneMap: Record<string, string> = {
    green: "bg-emerald-50 ring-emerald-100 text-emerald-900",
    rose: "bg-rose-50 ring-rose-100 text-rose-900",
    indigo: "bg-indigo-50 ring-indigo-100 text-indigo-900",
    amber: "bg-amber-50 ring-amber-100 text-amber-900",
  };
  return (
    <div
      className={`rounded-xl p-4 ring-1 ${toneMap[tone]} flex items-start justify-between min-h-[96px]`}
    >
      <div>
        <div className="text-xs uppercase tracking-wide opacity-70">{title}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {hint && <div className="mt-1 text-xs opacity-70">{hint}</div>}
      </div>
      <div className="opacity-60">{icon}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{children}</div>
    </section>
  );
}

function NavTile({
  href,
  title,
  subtitle,
  icon,
  tone = "blue",
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone?:
    | "blue"
    | "violet"
    | "yellow"
    | "indigo"
    | "emerald"
    | "rose"
    | "cyan"
    | "slate"
    | "green"
    | "gray";
}) {
  const toneMap: Record<string, string> = {
    blue: "bg-blue-50 hover:bg-blue-100",
    violet: "bg-violet-50 hover:bg-violet-100",
    yellow: "bg-yellow-50 hover:bg-yellow-100",
    indigo: "bg-indigo-50 hover:bg-indigo-100",
    emerald: "bg-emerald-50 hover:bg-emerald-100",
    rose: "bg-rose-50 hover:bg-rose-100",
    cyan: "bg-cyan-50 hover:bg-cyan-100",
    slate: "bg-slate-50 hover:bg-slate-100",
    green: "bg-green-50 hover:bg-green-100",
    gray: "bg-gray-50 hover:bg-gray-100",
  };

  return (
    <Link href={href}>
      <div
        className={`group cursor-pointer rounded-xl p-5 ring-1 ring-black/5 transition ${toneMap[tone]} shadow-sm hover:shadow`}
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="text-base font-semibold">{title}</div>
            <div className="text-sm text-gray-600 mt-1">{subtitle}</div>
          </div>
          <div className="opacity-60 group-hover:opacity-100">{icon}</div>
        </div>
      </div>
    </Link>
  );
}