/* pages/finance/sales-details.tsx */
"use client";

import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { db } from "@/firebaseConfig";
import { collection, onSnapshot } from "firebase/firestore";
import Link from "next/link";

type BookingDoc = {
  id: string;
  bookingNumber?: string;
  operator?: string;
  region?: string;
  hotel?: string;
  createdAt?: any;
  checkIn?: any;
  clientPrice?: number;
  bruttoClient?: number;
  commissionIgor?: number;
  commissionEvgeniy?: number;
  crocusProfit?: number;
  status?: string;
};

type DateBasis = "createdAt" | "checkIn";

const money = (n: number) =>
  `${(Number(n) || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const gross = (b: BookingDoc) => toNum(b.clientPrice ?? b.bruttoClient ?? 0);

const toLocalISODate = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const parseMaybeTimestamp = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) { try { return v.toDate(); } catch {} }
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return isNaN(+dt) ? null : dt;
    }
    const dt = new Date(v);
    return isNaN(+dt) ? null : dt;
  }
  return null;
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const formatDMY = (d?: Date | null) => {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

export default function SalesDetails() {
  const router = useRouter();
  const { operator = "", from, to, basis = "createdAt" } = router.query as {
    operator?: string;
    from?: string;
    to?: string;
    basis?: DateBasis;
  };

  const [all, setAll] = useState<BookingDoc[]>([]);
  const [dateFrom, setDateFrom] = useState<Date>(() => (from ? new Date(from) : startOfDay(new Date())));
  const [dateTo, setDateTo] = useState<Date>(() => (to ? new Date(to) : endOfDay(new Date())));
  const [dateBasis, setDateBasis] = useState<DateBasis>((basis as DateBasis) || "createdAt");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (s) => {
      setAll(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as BookingDoc[]);
    });
    return () => unsub();
  }, []);

  // синхронизация стейтов с query при первом заходе
  useEffect(() => {
    if (from) setDateFrom(startOfDay(new Date(from)));
    if (to) setDateTo(endOfDay(new Date(to)));
    if (basis) setDateBasis((basis as DateBasis) || "createdAt");
  }, [from, to, basis]);

  const filtered = useMemo(() => {
    const f = dateFrom.getTime();
    const t = dateTo.getTime();
    return all
      .filter((b) => !operator || (b.operator || "—") === operator)
      .map((b) => {
        const d = dateBasis === "createdAt" ? parseMaybeTimestamp(b.createdAt) : parseMaybeTimestamp(b.checkIn);
        return { ...b, __date: d || null } as BookingDoc & { __date: Date | null };
      })
      .filter((b) => b.__date && b.__date.getTime() >= f && b.__date.getTime() <= t)
      .sort((a, b) => (a.__date! > b.__date! ? 1 : -1));
  }, [all, operator, dateFrom, dateTo, dateBasis]);

  const totals = useMemo(() => {
    const sum = filtered.reduce((s, b) => s + gross(b), 0);
    const igor = filtered.reduce((s, b) => s + toNum((b as any).commissionIgor), 0);
    const evg = filtered.reduce((s, b) => s + toNum((b as any).commissionEvgeniy), 0);
    const comp = filtered.reduce((s, b) => s + toNum((b as any).crocusProfit), 0);
    return { sum: +sum.toFixed(2), igor: +igor.toFixed(2), evg: +evg.toFixed(2), comp: +comp.toFixed(2) };
  }, [filtered]);

  // обновление query без перезагрузки
  const pushQuery = () => {
    router.replace({
      pathname: "/finance/sales-details",
      query: {
        operator,
        from: toLocalISODate(dateFrom),
        to: toLocalISODate(dateTo),
        basis: dateBasis,
      },
    }, undefined, { shallow: true });
  };

  useEffect(() => { pushQuery(); /* eslint-disable-next-line */ }, [dateFrom, dateTo, dateBasis]);

  return (
    <ManagerLayout fullWidthHeader fullWidthMain>
      <Head><title>Детализация продаж — {operator || "Все операторы"}</title></Head>

      <div className="w-full py-6 px-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Детализация продаж</h1>
            <div className="text-gray-500 text-sm">
              Оператор: <b>{operator || "Все"}</b> · Диапазон: <b>{formatDMY(dateFrom)}</b> — <b>{formatDMY(dateTo)}</b> · Основа: <b>{dateBasis === "createdAt" ? "создание" : "check-in"}</b>
            </div>
          </div>
          <Link href="/finance/sales-dashboard" className="text-blue-600 hover:underline">← к дашборду</Link>
        </div>

        {/* Фильтры */}
        <div className="p-3 border rounded-lg grid grid-cols-1 sm:grid-cols-5 gap-2 text-sm bg-white">
          <div className="sm:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Оператор</div>
            <input className="w-full border rounded px-2 py-1" value={operator || ""} readOnly />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">С</div>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={toLocalISODate(dateFrom)}
              onChange={(e) => setDateFrom(startOfDay(new Date(e.target.value)))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">По</div>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={toLocalISODate(dateTo)}
              onChange={(e) => setDateTo(endOfDay(new Date(e.target.value)))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Основа даты</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={dateBasis}
              onChange={(e) => setDateBasis(e.target.value as DateBasis)}
            >
              <option value="createdAt">Создание</option>
              <option value="checkIn">Check-in</option>
            </select>
          </div>
        </div>

        {/* Итоги */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Card title="Продажи (брутто)">{money(totals.sum)}</Card>
          <Card title="Игорь">{money(totals.igor)}</Card>
          <Card title="Евгений">{money(totals.evg)}</Card>
          <Card title="Компания (Crocus Profit)">{money(totals.comp)}</Card>
        </div>

        {/* Таблица заявок */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border text-sm bg-white">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border px-2 py-1">Дата</th>
                <th className="border px-2 py-1">Заявка</th>
                <th className="border px-2 py-1">Оператор</th>
                <th className="border px-2 py-1">Направление/Отель</th>
                <th className="border px-2 py-1">Период</th>
                <th className="border px-2 py-1">Брутто</th>
                <th className="border px-2 py-1">Игорь</th>
                <th className="border px-2 py-1">Евгений</th>
                <th className="border px-2 py-1">Crocus Profit</th>
                <th className="border px-2 py-1">Статус</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const d = (b as any).__date as Date | null;
                return (
                  <tr key={b.id} className="text-center hover:bg-gray-50">
                    <td className="border px-2 py-1 whitespace-nowrap">{formatDMY(d)}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">{b.bookingNumber || b.id}</td>
                    <td className="border px-2 py-1">{b.operator || "—"}</td>
                    <td className="border px-2 py-1 text-left">{[b.region, b.hotel].filter(Boolean).join(" • ") || "—"}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">
                      {formatDMY(parseMaybeTimestamp(b.checkIn))} → {formatDMY(parseMaybeTimestamp(b.checkIn) ? null : null) /* just spacer */}
                    </td>
                    <td className="border px-2 py-1 text-right whitespace-nowrap">{money(gross(b))}</td>
                    <td className="border px-2 py-1 text-right whitespace-nowrap">{money(toNum((b as any).commissionIgor))}</td>
                    <td className="border px-2 py-1 text-right whitespace-nowrap">{money(toNum((b as any).commissionEvgeniy))}</td>
                    <td className="border px-2 py-1 text-right whitespace-nowrap">{money(toNum((b as any).crocusProfit))}</td>
                    <td className="border px-2 py-1">{b.status || "—"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="border px-2 py-6 text-center text-gray-500">Нет заявок</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={5}>Итого:</td>
                <td className="border px-2 py-1 text-right">{money(totals.sum)}</td>
                <td className="border px-2 py-1 text-right">{money(totals.igor)}</td>
                <td className="border px-2 py-1 text-right">{money(totals.evg)}</td>
                <td className="border px-2 py-1 text-right">{money(totals.comp)}</td>
                <td className="border px-2 py-1" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ManagerLayout>
  );
}

function Card({ title, children }: { title: string; children: any }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-gray-600">{title}</div>
      <div className="text-xl font-semibold mt-1">{children}</div>
    </div>
  );
}