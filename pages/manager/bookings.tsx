// pages/manager/bookings.tsx
"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import {
  collection,
  query,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { format, parse, isValid, parseISO } from "date-fns";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DownloadTableExcel } from "react-export-table-to-excel";
import type { Booking } from "@/lib/types";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

// ─── Расширяем перечень ключей статусов ───
const STATUS_KEYS = [
  "new",
  "created_dmc",
  "created_toco",
  "awaiting_payment",
  "paid",
  "awaiting_confirm",
  "confirmed_dmc",
  "confirmed_dmc_flight",
  "confirmed",
  "finished",
  "cancelled",
] as const;

// ─── Цвета под каждый ключ ───
const STATUS_COLORS: Record<typeof STATUS_KEYS[number], string> = {
  new: "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
  created_dmc: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  created_toco: "bg-blue-50 text-blue-700 ring-blue-600/20",
  awaiting_payment: "bg-orange-50 text-orange-700 ring-orange-600/20",
  paid: "bg-blue-100 text-blue-800 ring-blue-600/10",
  awaiting_confirm: "bg-purple-50 text-purple-700 ring-purple-600/20",
  confirmed_dmc: "bg-purple-100 text-purple-800 ring-purple-600/10",
  confirmed_dmc_flight: "bg-purple-100 text-purple-800 ring-purple-600/10",
  confirmed: "bg-green-50 text-green-700 ring-green-600/20",
  finished: "bg-green-700 text-white ring-green-800/30",
  cancelled: "bg-red-50 text-red-700 ring-red-600/10",
};

// ─── Опции для селекта статусов ───
const STATUS_OPTIONS = [
  { label: "Новая", val: "new" },
  { label: "Заведено DMC", val: "created_dmc" },
  { label: "Заведено Toco", val: "created_toco" },
  { label: "Ожидает оплату", val: "awaiting_payment" },
  { label: "Оплачено", val: "paid" },
  { label: "Ожидает подтверждения", val: "awaiting_confirm" },
  { label: "Подтверждено DMC", val: "confirmed_dmc" },
  { label: "Подтверждено DMC + Авиа", val: "confirmed_dmc_flight" },
  { label: "Подтверждено", val: "confirmed" },
  { label: "Завершено", val: "finished" },
  { label: "Отменено", val: "cancelled" },
];

// Mapping bookingType values to human-readable labels
const TYPE_LABELS: Record<string, string> = {
  olimpya_base: "Олимпия",
  subagent: "Субагенты",
  romania: "Румыния",
};

// parse a dd.MM.yyyy string into a JS Date, or null if invalid
function parseDateString(str?: string): Date | null {
  if (!str) return null;
  const dt = parse(str, "dd.MM.yyyy", new Date());
  return isValid(dt) ? dt : null;
}

export default function ManagerBookings() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { user, loading, isManager, isSuperManager, isAdmin } = useAuth();
  const tableRef = useRef<HTMLTableElement | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
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
    commission: "",
    crocusProfit: "",
    status: "all",
  });
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    if (loading) return;
    if (!user || (!isManager && !isSuperManager && !isAdmin)) {
      router.replace("/login");
      return;
    }
    const q = query(collection(db, "bookings"));
    const unsub = onSnapshot(q, (snap) => {
      setBookings(
        snap.docs.map((d) => ({
          id: d.id,
          bookingType: d.data().bookingType,
          ...(d.data() as Booking),
        }))
      );
    });
    return () => unsub();
  }, [loading, user, isManager, isSuperManager, isAdmin, router]);

  const displayed = React.useMemo(() => {
    const createdFrom  = filters.dateFrom   ? parseISO(filters.dateFrom)   : null;
    const createdTo    = filters.dateTo     ? parseISO(filters.dateTo)     : null;
    const checkInFrom  = filters.checkInFrom  ? parseISO(filters.checkInFrom)  : null;
    const checkInTo    = filters.checkInTo    ? parseISO(filters.checkInTo)    : null;
    const checkOutFrom = filters.checkOutFrom ? parseISO(filters.checkOutFrom) : null;
    const checkOutTo   = filters.checkOutTo   ? parseISO(filters.checkOutTo)   : null;

    return bookings
      .filter((b) => {
        // createdAt filter
        const created = b.createdAt?.toDate() ?? null;
        if (createdFrom && (!created || created < createdFrom)) return false;
        if (createdTo   && (!created || created > createdTo))   return false;

        // checkIn filter
        const ci = parseDateString(b.checkIn);
        if (checkInFrom && (!ci || ci < checkInFrom)) return false;
        if (checkInTo   && (!ci || ci > checkInTo))   return false;

        // checkOut filter
        const co = parseDateString(b.checkOut);
        if (checkOutFrom && (!co || co < checkOutFrom)) return false;
        if (checkOutTo   && (!co || co > checkOutTo))   return false;

        // text filters
        if (!b.bookingNumber?.toLowerCase().includes(filters.bookingNumber.toLowerCase())) return false;
        if (!b.agentName     .toLowerCase().includes(filters.agentName    .toLowerCase()))    return false;
        if (!b.operator      .toLowerCase().includes(filters.operator     .toLowerCase()))     return false;
        if (!b.hotel         .toLowerCase().includes(filters.hotel        .toLowerCase()))        return false;

        // numeric filters
        if (filters.bruttoClient && (b.bruttoClient || 0).toFixed(2) !== filters.bruttoClient) return false;
        if (filters.commission   && (b.commission   || 0).toFixed(2) !== filters.commission)   return false;
        if (filters.crocusProfit) {
          const profit = (b.bruttoClient || 0) - (b.internalNet || 0);
          if (profit.toFixed(2) !== filters.crocusProfit) return false;
        }

        // status & type filters
        if (filters.status !== "all" && b.status !== filters.status) return false;
        if (
          filters.bookingType &&
          !TYPE_LABELS[b.bookingType]?.toLowerCase().includes(filters.bookingType.toLowerCase())
        ) return false;

        return true;
      })
      .sort((a, b) => {
        if (!sortConfig) {
          const aT = a.createdAt?.toDate().getTime() || 0;
          const bT = b.createdAt?.toDate().getTime() || 0;
          return bT - aT;
        }
        const getValue = (obj: Booking) => {
          switch (sortConfig.key) {
            case "date":
              return obj.createdAt?.toDate().getTime() || 0;
            case "checkIn": {
              const d = parseDateString(obj.checkIn);
              return d ? d.getTime() : 0;
            }
            case "checkOut": {
              const d = parseDateString(obj.checkOut);
              return d ? d.getTime() : 0;
            }
            case "crocusProfit":
              return (obj.bruttoClient || 0) - (obj.internalNet || 0);
            default:
              const v = (obj as any)[sortConfig.key];
              return typeof v === "number" ? v : String(v).localeCompare("");
          }
        };
        const aVal = getValue(a),
              bVal = getValue(b);
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
  }, [bookings, filters, sortConfig]);

  function requestSort(key: string) {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig?.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  }

  const statusOptions = [
    { value: "all", label: t("statusFilter.all") },
    ...STATUS_KEYS.map((key) => ({ value: key, label: t(`statuses.${key}`) })),
  ];

  const SortArrow = ({ colKey }: { colKey: string }) =>
    sortConfig?.key === colKey
      ? sortConfig.direction === "asc"
        ? " ↑"
        : " ↓"
      : "";

  const delBooking = async (id: string, num: string) => {
    if (!confirm(`${t("confirmDelete")} ${num}?`)) return;
    await deleteDoc(doc(db, "bookings", id));
  };

  // Итоги
  const sumBrutto   = displayed.reduce((s, b) => s + (b.bruttoClient || 0), 0).toFixed(2);
  const sumInternal = displayed.reduce((s, b) => s + (b.internalNet   || 0), 0).toFixed(2);
  const sumCrocus   = (parseFloat(sumBrutto) - parseFloat(sumInternal)).toFixed(2);

  return (
    <ManagerLayout>
      <Card className="w-full mx-auto mt-6">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">{t("manager.title")}</h1>
            <DownloadTableExcel
              filename="manager_bookings"
              sheet={t("manager.sheetName")}
              currentTableRef={tableRef.current}
            >
              <Button className="bg-green-600 hover:bg-green-700 text-white">
                {t("exportExcel")}
              </Button>
            </DownloadTableExcel>
          </div>
          <div className="overflow-x-auto">
            <table ref={tableRef} className="min-w-[1500px] w-full border text-sm">
              <thead className="bg-gray-100 text-center">
                <tr>
                  <th className="px-2 py-1 border w-[120px]">Тип заявки</th>
                  <th className="px-2 py-1 border w-[100px] cursor-pointer" onClick={() => requestSort("date")}>
                    {t("date")}
                    <SortArrow colKey="date" />
                  </th>
                  <th className="px-2 py-1 border w-[80px] cursor-pointer" onClick={() => requestSort("bookingNumber")}>
                    {t("№")}
                    <SortArrow colKey="bookingNumber" />
                  </th>
                  <th className="px-2 py-1 border w-[200px] cursor-pointer" onClick={() => requestSort("agentName")}>
                    {t("agent")}
                    <SortArrow colKey="agentName" />
                  </th>
                  <th className="px-2 py-1 border w-[150px] cursor-pointer" onClick={() => requestSort("operator")}>
                    {t("operator")}
                    <SortArrow colKey="operator" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[400px] cursor-pointer text-center"
                    onClick={() => requestSort("hotel")}
                  >
                    {t("hotel")}
                    <SortArrow colKey="hotel" />
                  </th>
                  <th className="px-2 py-1 border w-[120px] cursor-pointer" onClick={() => requestSort("checkIn")}>
                    {t("checkIn")}
                    <SortArrow colKey="checkIn" />
                  </th>
                  <th className="px-2 py-1 border w-[120px] cursor-pointer" onClick={() => requestSort("checkOut")}>
                    {t("checkOut")}
                    <SortArrow colKey="checkOut" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[100px] cursor-pointer text-center"
                    onClick={() => requestSort("bruttoClient")}
                  >
                    {t("Брутто Клиент")}
                    <SortArrow colKey="bruttoClient" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[100px] cursor-pointer text-center"
                    onClick={() => requestSort("commission")}
                  >
                    {t("Нетто Реал")}
                    <SortArrow colKey="commission" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[100px] cursor-pointer text-center"
                    onClick={() => requestSort("crocusProfit")}
                  >
                    {t("Комиссия Crocus")}
                    <SortArrow colKey="crocusProfit" />
                  </th>
                  <th className="px-2 py-1 border w-[120px] cursor-pointer" onClick={() => requestSort("status")}>
                    {t("status")}
                    <SortArrow colKey="status" />
                  </th>
                  <th className="px-2 py-1 border w-[100px]">{t("invoice")}</th>
                  <th className="px-2 py-1 border w-[120px]">{t("vouchers")}</th>
                  <th className="px-2 py-1 border w-[100px]">{t("actions")}</th>
                </tr>
                <tr className="bg-white text-center">
                  
                  <th className="px-1 py-0.5 border w-[80px]">
                    <Input
                      value={filters.bookingType}
                      onChange={(e) => setFilters((f) => ({ ...f, bookingType: e.target.value }))}
                      placeholder="Тип"
                      className="h-8 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[100px]">
                    <Input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                      className="mb-1 h-6 w-full text-xs"
                    />
                    <Input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                      className="h-6 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[80px]">
                    <Input
                      value={filters.bookingNumber}
                      onChange={(e) => setFilters((f) => ({ ...f, bookingNumber: e.target.value }))}
                      placeholder="#"
                      className="h-8 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[200px]">
                    <Input
                      value={filters.agentName}
                      onChange={(e) => setFilters((f) => ({ ...f, agentName: e.target.value }))}
                      placeholder={t("filter")}
                      className="h-8 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[150px]">
                    <Input
                      value={filters.operator}
                      onChange={(e) => setFilters((f) => ({ ...f, operator: e.target.value }))}
                      placeholder={t("filter")}
                      className="h-8 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[400px]">
                    <Input
                      value={filters.hotel}
                      onChange={(e) => setFilters((f) => ({ ...f, hotel: e.target.value }))}
                      placeholder={t("filter")}
                      className="h-8 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[120px]">
                    <Input
                      type="date"
                      value={filters.checkInFrom}
                      onChange={(e) => setFilters((f) => ({ ...f, checkInFrom: e.target.value }))}
                      className="mb-1 h-6 w-full text-xs"
                    />
                    <Input
                      type="date"
                      value={filters.checkInTo}
                      onChange={(e) => setFilters((f) => ({ ...f, checkInTo: e.target.value }))}
                      className="h-6 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[120px]">
                    <Input
                      type="date"
                      value={filters.checkOutFrom}
                      onChange={(e) => setFilters((f) => ({ ...f, checkOutFrom: e.target.value }))}
                      className="mb-1 h-6 w-full text-xs"
                    />
                    <Input
                      type="date"
                      value={filters.checkOutTo}
                      onChange={(e) => setFilters((f) => ({ ...f, checkOutTo: e.target.value }))}
                      className="h-6 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[100px]">
                    <Input
                      value={filters.bruttoClient}
                      onChange={(e) => setFilters((f) => ({ ...f, bruttoClient: e.target.value }))}
                      placeholder="0.00"
                      className="h-8 w-full text-xs text-right"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[100px]">
                    <Input
                      value={filters.commission}
                      onChange={(e) => setFilters((f) => ({ ...f, commission: e.target.value }))}
                      placeholder="0.00"
                      className="h-8 w-full text-xs text-right"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[100px]">
                    <Input
                      value={filters.crocusProfit}
                      onChange={(e) => setFilters((f) => ({ ...f, crocusProfit: e.target.value }))}
                      placeholder="0.00"
                      className="h-8 w-full text-xs text-right"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[120px]">
                    <Select
                      value={filters.status}
                      onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                    >
                      <SelectTrigger className="w-full h-8 text-xs">
                        <SelectValue placeholder={t("statusFilter.all")} />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </th>
                  <th className="w-[100px]" />
                  <th className="w-[120px]" />
                  <th className="w-[100px]" />
                </tr>
               </thead>
              <tbody>
                {displayed.map((b) => {
                  const createdStr = format(b.createdAt!.toDate(), "dd.MM.yyyy");
                  const checkInDate  = parseDateString(b.checkIn);
                  const checkOutDate = parseDateString(b.checkOut);
                  const profit = ((b.bruttoClient || 0) - (b.internalNet || 0)).toFixed(2);
                  const typeLabel = TYPE_LABELS[b.bookingType || ""] || b.bookingType;

                  return (
                    <tr key={b.id} className="border-t hover:bg-gray-50 text-center">
                      <td className="px-2 py-1 border w-[120px]">{typeLabel}</td>
                      <td className="px-2 py-1 border w-[100px] whitespace-nowrap">{createdStr}</td>
                      <td className="px-2 py-1 border w-[80px] whitespace-nowrap">{b.bookingNumber || "—"}</td>
                      <td className="px-2 py-1 border w-[200px] truncate">
                        {b.agentName} ({b.agentAgency})
                      </td>
                      <td className="px-2 py-1 border w-[150px] truncate">{b.operator}</td>
                      <td className="px-2 py-1 border w-[400px] truncate text-center">{b.hotel}</td>
                      <td className="px-2 py-1 border w-[120px] whitespace-nowrap">
                        {checkInDate  ? format(checkInDate, "dd.MM.yyyy") : "-"}
                      </td>
                      <td className="px-2 py-1 border w-[120px] whitespace-nowrap">
                        {checkOutDate ? format(checkOutDate, "dd.MM.yyyy") : "-"}
                      </td>
                      <td className="px-2 py-1 border w-[100px] text-right">{(b.bruttoClient || 0).toFixed(2)}</td>
                      <td className="px-2 py-1 border w-[100px] text-right">{(b.internalNet   || 0).toFixed(2)}</td>
                      <td className="px-2 py-1 border w-[100px] text-right">{profit}</td>
                      <td className="px-2 py-1 border w-[120px]">
                        <Badge
                          className={`inline-flex px-2 py-1 text-xs rounded-sm ring-1 ring-inset ${
                            STATUS_COLORS[b.status as any]
                          }`}
                        >
                          {t(`statuses.${b.status}`)}
                        </Badge>

                      </td>
                      <td className="px-2 py-1 border w-[100px]">
                        {b.invoiceLink ? (
                          <a
                            href={b.invoiceLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:underline"
                          >
                            {t("Open")}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1 border w-[120px]">
                        {Array.isArray(b.voucherLinks) && b.voucherLinks.length
                          ? b.voucherLinks.map((l, i) => (
                              <div key={i}>
                                <a
                                  href={l}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sky-600 hover:underline"
                                >
                                  {t("Voucher")} {i + 1}
                                </a>
                              </div>
                            ))
                          : "—"}
                      </td>
                      <td className="px-2 py-1 border w-[100px]">
                        <div className="flex gap-2 justify-center">
                          <button
                            title={t("edit")}
                            className="text-xl hover:scale-110 transition"
                            onClick={() => {
                              const path =
                                b.bookingType === "olimpya_base"
                                  ? `/olimpya/${b.id}`
                                  : `/manager/${b.id}`;
                              router.push(path);
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            title={t("delete")}
                            className="text-xl hover:scale-110 transition"
                            onClick={() => delBooking(b.id!, b.bookingNumber || "—")}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td colSpan={8} className="px-2 py-2 text-right">
                    {t("total")}
                  </td>
                  <td className="px-2 py-2 text-right">{sumBrutto}</td>
                  <td className="px-2 py-2 text-right">{sumInternal}</td>
                  <td className="px-2 py-2 text-right">{sumCrocus}</td>
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </ManagerLayout>
  );
}