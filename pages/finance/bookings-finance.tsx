// pages/reports/bookings-finance.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  collection,
  onSnapshot,
  query as fsQuery,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DownloadTableExcel } from "react-export-table-to-excel";
import { loadOwners, splitAmount } from "@/lib/finance/owners";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { Edit3 } from "lucide-react";

// утилиты, как у менеджера
import { fmtDate as fmtDateUtil, toDate } from "@/lib/utils/dates";
import { fixed2, toNumber } from "@/lib/utils/numbers";

// ───────── helpers ─────────
const n = (v: any) => Number(v ?? 0) || 0;
const fmt2 = (v: any) => n(v).toFixed(2);
const fmtDate = (v: any) => fmtDateUtil(v);
const padISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const todayISO = () => padISO(new Date());

// данные заявки
type Booking = {
  id?: string;
  bookingType?: string; // "olimpya_base" | "subagent" ...
  createdAt?: any;
  bookingNumber?: string;
  agentName?: string;
  operator?: string;
  hotel?: string;
  destination?: string;
  tourists?: Array<{ name?: string }>;
  payerName?: string;
  checkIn?: any;
  checkOut?: any;

  bruttoClient?: number; // €
  internalNet?: number; // €
  nettoOlimpya?: number; // €
  bankFee?: number; // €
  commission?: number; // расчётная комиссия
  realCommission?: number; // фактическая комиссия
  overCommission?: number;

  commissionIgor?: number;
  commissionEvgeniy?: number;

  owners?: Array<{ ownerId?: string; name?: string; share?: number }>;

  backofficeEntered?: boolean;
  backofficePosted?: boolean; // добавили для единого флага
};

// транзакции (лайт для сверки)
type TxLite = {
  id: string;
  bookingId?: string;
  type?: "in" | "out" | "transfer";
  status?: "planned" | "actual" | "reconciled";
  baseAmount?: number; // в EUR
};

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "ru", ["common"])),
    },
  };
}

export default function BookingsFinanceReport() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canView = isManager || isSuperManager || isAdmin;

  const [rows, setRows] = useState<Booking[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string; share: number }[]>([]);
  const [txs, setTxs] = useState<TxLite[]>([]);
  const tableRef = useRef<HTMLTableElement | null>(null);

  // быстрые пресеты дат
  const [datePresets] = useState([
    {
      label: "Этот месяц",
      get: () => {
        const d = new Date();
        const from = new Date(d.getFullYear(), d.getMonth(), 1);
        const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        return { from: padISO(from), to: padISO(to) };
      },
    },
    {
      label: "Прошлый месяц",
      get: () => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        const from = new Date(d.getFullYear(), d.getMonth(), 1);
        const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        return { from: padISO(from), to: padISO(to) };
      },
    },
    {
      label: "Последние 30 дней",
      get: () => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 29);
        return { from: padISO(from), to: padISO(to) };
      },
    },
    {
      label: "Эта неделя",
      get: () => {
        const d = new Date();
        const day = (d.getDay() + 6) % 7;
        const from = new Date(d);
        from.setDate(d.getDate() - day);
        from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setDate(from.getDate() + 6);
        to.setHours(23, 59, 59, 999);
        return { from: padISO(from), to: padISO(to) };
      },
    },
  ]);

  // ФИЛЬТРЫ — возвращаем к предыдущей версии (вид + логика)
  const [filters, setFilters] = useState({
    bookingType: "",
    dateFrom: "",
    dateTo: "",
    bookingNumber: "",
    agentName: "",
    operator: "",
    hotel: "",
    checkInFrom: "",
    checkInTo: "",
    checkOutFrom: "",
    checkOutTo: "",
    bruttoClient: "",
    internalNet: "",
    crocusAmount: "", // «Комиссия Crocus» (Olimpya=комиссия, Subagent=брутто-нетто)
    search: "",
    backoffice: "all" as "all" | "yes" | "no",
  });

  // сортировка — как у менеджера
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  function requestSort(key: string) {
    setSortConfig((prev) => {
      if (prev?.key === key) return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      return { key, direction: "asc" };
    });
  }

  useEffect(() => {
    if (!user || !canView) {
      router.replace("/login");
      return;
    }

    const unsubBookings = onSnapshot(fsQuery(collection(db, "bookings")), (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    const unsubTx = onSnapshot(fsQuery(collection(db, "finance_transactions")), (snap) => {
      const list = snap.docs.map((d) => {
        const v: any = d.data();
        return {
          id: d.id,
          bookingId: v.bookingId || undefined,
          type: v.type,
          status: v.status,
          baseAmount: Number(v.baseAmount || 0),
        } as TxLite;
      });
      setTxs(list);
    });

    loadOwners().then(setOwners).catch(console.error);

    return () => {
      unsubBookings();
      unsubTx();
    };
  }, [user, canView, router]);

  // агрегат оплат по bookingId (факт: actual|reconciled)
  const factByBooking = useMemo(() => {
    const map = new Map<string, { inEUR: number; outEUR: number }>();
    for (const t of txs) {
      if (!t.bookingId) continue;
      if (t.status !== "actual" && t.status !== "reconciled") continue;
      const prev = map.get(t.bookingId) || { inEUR: 0, outEUR: 0 };
      if (t.type === "in") prev.inEUR += Number(t.baseAmount || 0);
      else if (t.type === "out") prev.outEUR += Number(t.baseAmount || 0);
      map.set(t.bookingId, prev);
    }
    return map;
  }, [txs]);

  // фильтрация — оригинальная логика из предыдущей версии
  const filtered = useMemo(() => {
    const createdFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const createdTo = filters.dateTo ? new Date(filters.dateTo) : null;
    const checkInFrom = filters.checkInFrom ? new Date(filters.checkInFrom) : null;
    const checkInTo = filters.checkInTo ? new Date(filters.checkInTo) : null;
    const checkOutFrom = filters.checkOutFrom ? new Date(filters.checkOutFrom) : null;
    const checkOutTo = filters.checkOutTo ? new Date(filters.checkOutTo) : null;

    return rows
      .filter((b) => {
        // created
        const created = toDate(b.createdAt);
        if (createdFrom && (!created || created < createdFrom)) return false;
        if (createdTo && (!created || created > createdTo)) return false;

        // check-in/out
        const ci = toDate(b.checkIn);
        if (checkInFrom && (!ci || ci < checkInFrom)) return false;
        if (checkInTo && (!ci || ci > checkInTo)) return false;

        const co = toDate(b.checkOut);
        if (checkOutFrom && (!co || co < checkOutFrom)) return false;
        if (checkOutTo && (!co || co > checkOutTo)) return false;

        // текстовые
        if (!((b.bookingNumber || "").toLowerCase().includes(filters.bookingNumber.toLowerCase()))) return false;
        if (!((b.agentName || "").toLowerCase().includes(filters.agentName.toLowerCase()))) return false;
        if (!((b.operator || "").toLowerCase().includes(filters.operator.toLowerCase()))) return false;
        if (!((b.hotel || "").toLowerCase().includes(filters.hotel.toLowerCase()))) return false;

        // суммы (точное совпадение, как раньше)
        if (filters.bruttoClient && fixed2(b.bruttoClient) !== fixed2(filters.bruttoClient)) return false;
        if (filters.internalNet && fixed2(b.internalNet) !== fixed2(filters.internalNet)) return false;

        // универсальная «Комиссия Crocus»
        if (filters.crocusAmount) {
          const brutto = toNumber(b.bruttoClient);
          const netCrocus = toNumber(b.internalNet);
          const komis = toNumber((b as any).realCommission) || toNumber((b as any).commission) || (brutto - netCrocus);
          const crocusAmount = b.bookingType === "olimpya_base" ? komis : (brutto - netCrocus);
          if (fixed2(crocusAmount) !== fixed2(filters.crocusAmount)) return false;
        }

        // тип
        if (filters.bookingType && !(b.bookingType || "").toLowerCase().includes(filters.bookingType.toLowerCase()))
          return false;

        // бэкофис (единый флаг)
        const backoffice = !!(b.backofficePosted ?? b.backofficeEntered);
        if (filters.backoffice === "yes" && !backoffice) return false;
        if (filters.backoffice === "no" && backoffice) return false;

        // общий поиск
        const q = filters.search.trim().toLowerCase();
        if (q) {
          const s = [
            b.bookingNumber,
            b.operator,
            b.hotel,
            b.destination,
            b.tourists?.map((t) => t.name).join(" "),
            b.payerName,
          ]
            .join(" ")
            .toLowerCase();
          if (!s.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (!sortConfig) {
          const aT = toDate(a.createdAt)?.getTime() || 0;
          const bT = toDate(b.createdAt)?.getTime() || 0;
          return bT - aT;
        }
        const key = sortConfig.key;
        const dir = sortConfig.direction === "asc" ? 1 : -1;

        const num = (v: any) => toNumber(v);
        const str = (v: any) => String(v || "").toLowerCase();

        switch (key) {
          case "date":
            return ((toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0)) * dir;
          case "bookingNumber": {
            const aa = parseInt((a.bookingNumber || "").replace(/\D/g, "") || "0", 10);
            const bb = parseInt((b.bookingNumber || "").replace(/\D/g, "") || "0", 10);
            return (aa - bb) * dir;
          }
          case "agent":
            return str(a.agentName).localeCompare(str(b.agentName)) * dir;
          case "operator":
            return str(a.operator).localeCompare(str(b.operator)) * dir;
          case "hotel":
            return str(a.hotel).localeCompare(str(b.hotel)) * dir;
          case "checkIn":
            return ((toDate(a.checkIn)?.getTime() || 0) - (toDate(b.checkIn)?.getTime() || 0)) * dir;
          case "checkOut":
            return ((toDate(a.checkOut)?.getTime() || 0) - (toDate(b.checkOut)?.getTime() || 0)) * dir;
          case "bruttoClient":
            return (num(a.bruttoClient) - num(b.bruttoClient)) * dir;
          case "internalNet":
            return (num(a.internalNet) - num(b.internalNet)) * dir;
          case "crocusAmount": {
            const bruttoA = num(a.bruttoClient);
            const netA = num(a.internalNet);
            const komisA = num((a as any).realCommission) || num((a as any).commission) || (bruttoA - netA);
            const ca = a.bookingType === "olimpya_base" ? komisA : (bruttoA - netA);

            const bruttoB = num(b.bruttoClient);
            const netB = num(b.internalNet);
            const komisB = num((b as any).realCommission) || num((b as any).commission) || (bruttoB - netB);
            const cb = b.bookingType === "olimpya_base" ? komisB : (bruttoB - netB);

            return (ca - cb) * dir;
          }
          default:
            return 0;
        }
      });
  }, [rows, filters, sortConfig]);

  // расчёты + разбиение по учредителям + факты
  const data = useMemo(() => {
    return filtered.map((b) => {
      const brutto = n(b.bruttoClient);
      const netCrocus = n(b.internalNet);
      const netOlimp = n(b.nettoOlimpya) || netCrocus;

      const baseCommission = n((b as any).realCommission) || n((b as any).commission) || (brutto - netCrocus);
      const crocusAmount = b.bookingType === "olimpya_base" ? baseCommission : (brutto - netCrocus);

      const over = n(b.overCommission) || (brutto - netOlimp);

      const presetSplit: Array<{ name: string; amount: number }> = [];
      if (n((b as any).commissionIgor)) presetSplit.push({ name: "Igor", amount: +n((b as any).commissionIgor).toFixed(2) });
      if (n((b as any).commissionEvgeniy)) presetSplit.push({ name: "Evgeniy", amount: +n((b as any).commissionEvgeniy).toFixed(2) });

      const parts =
        b.bookingType === "olimpya_base"
          ? presetSplit.length
            ? presetSplit
            : splitAmount(baseCommission, owners, b.owners)
          : splitAmount(brutto - netCrocus, owners);

      let Igor = 0;
      let Evgeniy = 0;
      parts.forEach((p) => {
        if (p.name === "Igor") Igor += p.amount;
        if (p.name === "Evgeniy") Evgeniy += p.amount;
      });

      const facts = b.id ? factByBooking.get(b.id) : undefined;
      const inFact = facts?.inEUR || 0;
      const outFact = facts?.outEUR || 0;

      const inPct = brutto > 0 ? Math.max(0, Math.min(1, inFact / brutto)) : 0;
      const outPct = netCrocus > 0 ? Math.max(0, Math.min(1, outFact / netCrocus)) : 0;

      return {
        ...b,
        brutto,
        netCrocus,
        netOlimp,
        over,
        crocusAmount: +crocusAmount.toFixed(2),
        Igor: +Igor.toFixed(2),
        Evgeniy: +Evgeniy.toFixed(2),
        inFact,
        outFact,
        inPct,
        outPct,
      };
    });
  }, [filtered, owners, factByBooking]);

  // итоги
  const totals = useMemo(() => {
    const sum = (arr: any[], key: string) => +arr.reduce((s, r) => s + n((r as any)[key]), 0).toFixed(2);
    return {
      brutto: sum(data, "brutto"),
      netCrocus: sum(data, "netCrocus"),
      crocusAmount: sum(data, "crocusAmount"),
      netOlimp: sum(data, "netOlimp"),
      over: sum(data, "over"),
      Igor: sum(data, "Igor"),
      Evgeniy: sum(data, "Evgeniy"),
      count: data.length,
      marginPct: (() => {
        const sales = sum(data, "brutto");
        const company = sum(data, "crocusAmount");
        return sales > 0 ? (company / sales) * 100 : 0;
      })(),
    };
  }, [data]);

  // подсветка ячеек по факту оплаты
  const payClass = (paid: number, target: number) => {
    if (target <= 0) return "";
    if (paid <= 0.01) return "bg-rose-50 text-rose-800";
    if (paid + 0.01 >= target) return "bg-emerald-50 text-emerald-800";
    return "bg-amber-50 text-amber-800";
  };

  // бэкофис toggle — обновляем ОДНОВРЕМЕННО оба поля
  const toggleBackoffice = async (row: Booking) => {
    if (!row.id) return;
    const current = !!(row.backofficePosted ?? row.backofficeEntered);
    const v = !current;
    await updateDoc(doc(db, "bookings", row.id), {
      backofficePosted: v,
      backofficeEntered: v,
    });
  };

  const editHref = (b: Booking) => `/finance/booking/${b.id}`;

  // экспорт — имя файла с периодом
  const exportName = `bookings_finance_${filters.dateFrom || "all"}_${filters.dateTo || todayISO()}`;

  // сброс фильтров
  const resetFilters = () =>
    setFilters({
      bookingType: "",
      dateFrom: "",
      dateTo: "",
      bookingNumber: "",
      agentName: "",
      operator: "",
      hotel: "",
      checkInFrom: "",
      checkInTo: "",
      checkOutFrom: "",
      checkOutTo: "",
      bruttoClient: "",
      internalNet: "",
      crocusAmount: "",
      search: "",
      backoffice: "all",
    });

  return (
    <>
      <Head>
        <title>Финансы по заявкам</title>
      </Head>
      <ManagerLayout fullWidthHeader fullWidthMain>
        {/* KPI-панель */}
        <div className="w-full px-4 pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs text-gray-600">Заявок</div>
            <div className="text-2xl font-semibold mt-1">{totals.count}</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs text-gray-600">Продажи (брутто)</div>
            <div className="text-2xl font-semibold mt-1">{fmt2(totals.brutto)} €</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs text-gray-600">Комиссия Crocus</div>
            <div className="text-2xl font-semibold mt-1">{fmt2(totals.crocusAmount)} €</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs text-gray-600">Маржа / Продажи</div>
            <div className="text-2xl font-semibold mt-1">{totals.marginPct.toFixed(1)}%</div>
          </div>
        </div>

        {/* Панель действий */}
        <div className="w-full px-4 mt-4 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {datePresets.map((p) => (
              <button
                key={p.label}
                className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                onClick={() => {
                  const r = p.get();
                  setFilters((f) => ({ ...f, dateFrom: r.from, dateTo: r.to }));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <DownloadTableExcel filename={exportName} sheet="report" currentTableRef={tableRef.current}>
              <Button className="bg-green-600 hover:bg-green-700 text-white">Экспорт в Excel</Button>
            </DownloadTableExcel>
            <Button variant="outline" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          </div>
        </div>

        <Card className="w-full mx-auto mt-4">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table ref={tableRef} className="min-w-[1850px] w-full border text-sm">
                <thead className="bg-gray-100 text-center sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1 border w-[120px] cursor-pointer" onClick={() => requestSort("type")}>
                      Тип
                    </th>
                    <th className="px-2 py-1 border w=[100px] cursor-pointer" onClick={() => requestSort("date")}>
                      Дата
                    </th>
                    <th className="px-2 py-1 border w-[80px] cursor-pointer" onClick={() => requestSort("bookingNumber")}>
                      №
                    </th>
                    <th className="px-2 py-1 border w-[200px] cursor-pointer" onClick={() => requestSort("agent")}>
                      Агент
                    </th>
                    <th className="px-2 py-1 border w-[150px] cursor-pointer" onClick={() => requestSort("operator")}>
                      Оператор
                    </th>

                    <th className="px-2 py-1 border w-[300px] cursor-pointer" onClick={() => requestSort("hotel")}>
                      Отель
                    </th>
                    <th className="px-2 py-1 border w-[120px] cursor-pointer" onClick={() => requestSort("checkIn")}>
                      Check-in
                    </th>
                    <th className="px-2 py-1 border w-[120px] cursor-pointer" onClick={() => requestSort("checkOut")}>
                      Check-out
                    </th>
                    <th className="px-2 py-1 border w-[220px]">Плательщик</th>

                    <th className="px-2 py-1 border w-[110px] cursor-pointer" onClick={() => requestSort("bruttoClient")}>
                      Брутто (€)
                    </th>
                    <th className="px-2 py-1 border w-[140px] cursor-pointer" onClick={() => requestSort("internalNet")}>
                      Netto Crocus (€)
                    </th>
                    <th className="px-2 py-1 border w-[140px]">Netto Olimpya (€)</th>
                    <th className="px-2 py-1 border w-[110px]">Овер (€)</th>
                    <th className="px-2 py-1 border w-[160px] cursor-pointer" onClick={() => requestSort("crocusAmount")}>
                      Комиссия Crocus (€)
                    </th>

                    <th className="px-2 py-1 border w-[110px]">Igor</th>
                    <th className="px-2 py-1 border w-[110px]">Evgeniy</th>

                    <th className="px-2 py-1 border w-[140px]">Бэкофис</th>
                    <th className="px-2 py-1 border w-[90px]">Действие</th>
                  </tr>

                  {/* СТРОКА ФИЛЬТРОВ — ВИД КАК В ПРЕДЫДУЩЕЙ ВЕРСИИ */}
                  <tr className="bg-white text-center text-xs">
                    <th className="px-1 py-0.5 border">
                      <Input
                        value={filters.bookingType}
                        onChange={(e) => setFilters((f) => ({ ...f, bookingType: e.target.value }))}
                        placeholder="Тип"
                        className="h-8 w-full"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                        className="mb-1 h-6 w-full"
                      />
                      <Input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                        className="h-6 w-full"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        value={filters.bookingNumber}
                        onChange={(e) => setFilters((f) => ({ ...f, bookingNumber: e.target.value }))}
                        placeholder="#"
                        className="h-8 w-full"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        value={filters.agentName}
                        onChange={(e) => setFilters((f) => ({ ...f, agentName: e.target.value }))}
                        placeholder="ФИО агента"
                        className="h-8 w-full"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        value={filters.operator}
                        onChange={(e) => setFilters((f) => ({ ...f, operator: e.target.value }))}
                        placeholder="оператор"
                        className="h-8 w-full"
                      />
                    </th>

                    <th className="px-1 py-0.5 border">
                      <Input
                        value={filters.hotel}
                        onChange={(e) => setFilters((f) => ({ ...f, hotel: e.target.value }))}
                        placeholder="отель"
                        className="h-8 w-full"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        type="date"
                        value={filters.checkInFrom}
                        onChange={(e) => setFilters((f) => ({ ...f, checkInFrom: e.target.value }))}
                        className="mb-1 h-6 w-full"
                      />
                      <Input
                        type="date"
                        value={filters.checkInTo}
                        onChange={(e) => setFilters((f) => ({ ...f, checkInTo: e.target.value }))}
                        className="h-6 w-full"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        type="date"
                        value={filters.checkOutFrom}
                        onChange={(e) => setFilters((f) => ({ ...f, checkOutFrom: e.target.value }))}
                        className="mb-1 h-6 w-full"
                      />
                      <Input
                        type="date"
                        value={filters.checkOutTo}
                        onChange={(e) => setFilters((f) => ({ ...f, checkOutTo: e.target.value }))}
                        className="h-6 w-full"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        value={filters.search}
                        onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                        placeholder="плательщик/турист"
                        className="h-8 w-full"
                      />
                    </th>

                    <th className="px-1 py-0.5 border">
                      <Input
                        value={filters.bruttoClient}
                        onChange={(e) => setFilters((f) => ({ ...f, bruttoClient: e.target.value }))}
                        placeholder="0.00"
                        className="h-8 w-full text-right"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        value={filters.internalNet}
                        onChange={(e) => setFilters((f) => ({ ...f, internalNet: e.target.value }))}
                        placeholder="0.00"
                        className="h-8 w-full text-right"
                      />
                    </th>
                    <th className="px-1 py-0.5 border" />
                    <th className="px-1 py-0.5 border" />
                    <th className="px-1 py-0.5 border">
                      <Input
                        value={filters.crocusAmount}
                        onChange={(e) => setFilters((f) => ({ ...f, crocusAmount: e.target.value }))}
                        placeholder="0.00"
                        className="h-8 w-full text-right"
                      />
                    </th>

                    <th className="px-1 py-0.5 border" />
                    <th className="px-1 py-0.5 border" />

                    <th className="px-1 py-0.5 border">
                      <select
                        className="border rounded px-2 py-1 w-full h-8 text-xs"
                        value={filters.backoffice}
                        onChange={(e) => setFilters((f) => ({ ...f, backoffice: e.target.value as "all" | "yes" | "no" }))}
                      >
                        <option value="all">Все</option>
                        <option value="yes">Да</option>
                        <option value="no">Нет</option>
                      </select>
                    </th>
                    <th className="px-1 py-0.5 border" />
                  </tr>
                </thead>

                <tbody>
                  {data.map((b) => {
                    const firstTourist = b.tourists?.[0]?.name || "—";
                    const payer = b.payerName || firstTourist || "—";

                    const bruttoCls = payClass(b.inFact, b.brutto);
                    const netCls = payClass(b.outFact, b.netCrocus);
                    const backoffice = !!(b.backofficePosted ?? b.backofficeEntered);

                    const inPct = Math.round((b.inPct || 0) * 100);
                    const outPct = Math.round((b.outPct || 0) * 100);

                    const bar = (pct: number, okColor: string) => (
                      <div className="w-full h-2 bg-gray-200 rounded overflow-hidden mt-1">
                        <div
                          className={`h-full ${pct >= 100 ? okColor : "bg-amber-500"}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                          title={`${pct}%`}
                        />
                      </div>
                    );

                    return (
                      <tr key={b.id} className="border-t hover:bg-gray-50 text-center">
                        <td className="px-2 py-2 border">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              b.bookingType === "olimpya_base" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                            }`}
                          >
                            {b.bookingType === "olimpya_base" ? "Olimpya" : "Субагент"}
                          </span>
                        </td>
                        <td className="px-2 py-2 border whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                        <td className="px-2 py-2 border whitespace-nowrap">{b.bookingNumber || "—"}</td>
                        <td className="px-2 py-2 border truncate">{b.agentName || "—"}</td>
                        <td className="px-2 py-2 border truncate">{b.operator || "—"}</td>

                        <td className="px-2 py-2 border truncate">{b.hotel || "—"}</td>
                        <td className="px-2 py-2 border whitespace-nowrap">{fmtDate(b.checkIn)}</td>
                        <td className="px-2 py-2 border whitespace-nowrap">{fmtDate(b.checkOut)}</td>
                        <td className="px-2 py-2 border">{payer}</td>

                        {/* Брутто (получили) */}
                        <td className={`px-2 py-2 border text-right ${bruttoCls}`}>
                          <div className="whitespace-nowrap">{fmt2(b.brutto)}</div>
                          <div className="text-[10px] text-gray-500">факт: {fmt2(b.inFact)}</div>
                          {bar(inPct, "bg-emerald-500")}
                        </td>

                        {/* Нетто Крокус (оплата оператору) */}
                        <td className={`px-2 py-2 border text-right ${netCls}`}>
                          <div className="whitespace-nowrap">{fmt2(b.netCrocus)}</div>
                          <div className="text-[10px] text-gray-500">факт: {fmt2(b.outFact)}</div>
                          {bar(outPct, "bg-sky-500")}
                        </td>

                        <td className="px-2 py-2 border text-right">{fmt2(b.netOlimp)}</td>
                        <td className="px-2 py-2 border text-right">{fmt2(b.over)}</td>
                        <td className="px-2 py-2 border text-right">{fmt2(b.crocusAmount)}</td>

                        <td className="px-2 py-2 border text-right">{fmt2((b as any).Igor)}</td>
                        <td className="px-2 py-2 border text-right">{fmt2((b as any).Evgeniy)}</td>

                        <td className="px-2 py-2 border">
                          <button
                            onClick={() => toggleBackoffice(b)}
                            className={`h-8 px-3 rounded text-xs ${
                              backoffice ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"
                            }`}
                            title="Переключить Да/Нет"
                          >
                            {backoffice ? "Да" : "Нет"}
                          </button>
                        </td>

                        <td className="px-2 py-2 border">
  <Button
  className="h-8 px-3 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:opacity-90 hover:shadow-md"
  onClick={() => router.push(editHref(b))}
>
  <Edit3 className="h-4 w-4 mr-1.5" />
  
</Button>
                        </td>
                      </tr>
                    );
                  })}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={18} className="border px-2 py-6 text-center text-gray-500">
                        Нет данных
                      </td>
                    </tr>
                  )}
                </tbody>

                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td colSpan={9} className="px-2 py-3 text-right">
                      Итого:
                    </td>
                    <td className="px-2 py-3 text-right">{totals.brutto.toFixed(2)}</td>
                    <td className="px-2 py-3 text-right">{totals.netCrocus.toFixed(2)}</td>
                    <td className="px-2 py-3 text-right">{totals.netOlimp.toFixed(2)}</td>
                    <td className="px-2 py-3 text-right">{totals.over.toFixed(2)}</td>
                    <td className="px-2 py-3 text-right">{totals.crocusAmount.toFixed(2)}</td>
                    <td className="px-2 py-3 text-right">{totals.Igor.toFixed(2)}</td>
                    <td className="px-2 py-3 text-right">{totals.Evgeniy.toFixed(2)}</td>
                    <td className="px-2 py-3" />
                    <td className="px-2 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </ManagerLayout>
    </>
  );
}