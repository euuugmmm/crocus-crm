// pages/olimpya/bookings.tsx
"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { format } from "date-fns";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import OlimpyaLayout from "@/components/layouts/OlimpyaLayout";
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
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

const STATUS_KEYS = [
  "all",
  "new",
  "awaiting_payment",
  "paid",
  "awaiting_confirm",
  "confirmed",
  "finished",
  "cancelled",
] as const;

const statusMap: Record<string, string> = {
  Новая: "new",
  "Ожидание оплаты": "awaiting_payment",
  "Оплачено туристом": "paid",
  "Ожидает confirm": "awaiting_confirm",
  Подтверждено: "confirmed",
  Завершено: "finished",
  Отменен: "cancelled",
};

const statusColors: Record<string, string> = {
  new: "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
  awaiting_payment: "bg-orange-50 text-orange-700 ring-orange-600/20",
  paid: "bg-blue-50 text-blue-700 ring-blue-700/10",
  awaiting_confirm: "bg-purple-50 text-purple-700 ring-purple-700/10",
  confirmed: "bg-green-50 text-green-700 ring-green-600/20",
  finished: "bg-green-700 text-white ring-green-800/30",
  cancelled: "bg-red-50 text-red-700 ring-red-600/10",
};

export default function OlimpyaBookingsPage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { user, isOlimpya } = useAuth();
  const tableRef = useRef<HTMLTableElement>(null);

  const [bookings, setBookings] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    number: "",
    operator: "",
    hotel: "",
    checkInFrom: "",
    checkInTo: "",
    checkOutFrom: "",
    checkOutTo: "",
    firstTourist: "",
    status: "all" as typeof STATUS_KEYS[number],
  });
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>({
    key: "createdAt",
    direction: "desc",
  });

  // Load olympya_base bookings for this agent
  useEffect(() => {
    if (!user || !isOlimpya) {
      router.replace("/login");
      return;
    }
    const q = query(
      collection(db, "bookings"),
      where("bookingType", "==", "olimpya_base"),
      where("agentId", "==", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setBookings(list);
    });
    return () => unsub();
  }, [user, isOlimpya, router]);

  // Helper: parse YYYY-MM-DD
  const parseDate = (s: string) => (s ? new Date(s + "T00:00:00") : null);

 // Apply filters
const filtered = bookings.filter((b) => {
  const norm = statusMap[b.status] || b.status;
  if (filters.status !== "all" && norm !== filters.status) return false;

  if (
    filters.number &&
    !b.bookingNumber
      ?.toLowerCase()
      .includes(filters.number.toLowerCase())
  )
    return false;

  if (
    filters.operator &&
    !b.operator
      ?.toLowerCase()
      .includes(filters.operator.toLowerCase())
  )
    return false;

  if (
    filters.hotel &&
    !b.hotel
      ?.toLowerCase()
      .includes(filters.hotel.toLowerCase())
  )
    return false;

  // date-created filter
  const created = b.createdAt?.toDate();
  if (
    filters.dateFrom &&
    (!created || created < parseDate(filters.dateFrom)!)
  )
    return false;
  if (
    filters.dateTo &&
    (!created || created > parseDate(filters.dateTo)!)
  )
    return false;

  // check-in date filter
  const ci = b.checkIn ? new Date(b.checkIn) : null;
  if (
    filters.checkInFrom &&
    (!ci || ci < parseDate(filters.checkInFrom)!)
  )
    return false;
  if (
    filters.checkInTo &&
    (!ci || ci > parseDate(filters.checkInTo)!)
  )
    return false;

  // check-out date filter
  const co = b.checkOut ? new Date(b.checkOut) : null;
  if (
    filters.checkOutFrom &&
    (!co || co < parseDate(filters.checkOutFrom)!)
  )
    return false;
  if (
    filters.checkOutTo &&
    (!co || co > parseDate(filters.checkOutTo)!)
  )
    return false;

  // == NEW: firstTourist name filter ==
  if (
    filters.firstTourist &&
    !b.tourists?.[0]?.name
      .toLowerCase()
      .includes(filters.firstTourist.toLowerCase())
  )
    return false;

  return true;
});
  // Sort
  const displayed = React.useMemo(() => {
    let arr = [...filtered];
    const { key, direction } = sortConfig!;
    arr.sort((a: any, b: any) => {
      let aV, bV;
      switch (key) {
        case "createdAt":
          aV = a.createdAt?.toDate().getTime() || 0;
          bV = b.createdAt?.toDate().getTime() || 0;
          break;
        case "bookingNumber":
          aV = parseInt(a.bookingNumber?.replace(/\D/g, "") || "0", 10);
          bV = parseInt(b.bookingNumber?.replace(/\D/g, "") || "0", 10);
          break;
        case "operator":
          aV = a.operator || "";
          bV = b.operator || "";
          break;
        case "hotel":
          aV = a.hotel || "";
          bV = b.hotel || "";
          break;
        case "checkIn":
          aV = a.checkIn ? new Date(a.checkIn).getTime() : 0;
          bV = b.checkIn ? new Date(b.checkIn).getTime() : 0;
          break;
        case "checkOut":
          aV = a.checkOut ? new Date(a.checkOut).getTime() : 0;
          bV = b.checkOut ? new Date(b.checkOut).getTime() : 0;
          break;
        case "firstTourist":
          aV = a.tourists?.[0]?.name || "";
          bV = b.tourists?.[0]?.name || "";
          break;
        case "bruttoClient":
          aV = a.bruttoClient || 0;
          bV = b.bruttoClient || 0;
          break;
        case "nettoFact":
          aV = a.nettoFact || 0;
          bV = b.nettoFact || 0;
          break;
        case "realCommission":
          aV = a.realCommission || 0;
          bV = b.realCommission || 0;
          break;
        case "status":
          aV = statusMap[a.status] || a.status;
          bV = statusMap[b.status] || b.status;
          break;
        default:
          aV = "";
          bV = "";
      }
      if (typeof aV === "string" && typeof bV === "string") {
        return direction === "asc"
          ? aV.localeCompare(bV)
          : bV.localeCompare(aV);
      } else {
        return direction === "asc" ? aV - bV : bV - aV;
      }
    });
    return arr;
  }, [filtered, sortConfig]);

  // Totals
  const totalBr = displayed.reduce((s, b) => s + (b.bruttoClient || 0), 0);
  const totalFact = displayed.reduce((s, b) => s + (b.nettoFact || 0), 0);
  const totalReal = displayed.reduce(
    (s, b) => s + (b.realCommission || 0),
    0
  );

  // Sort arrow indicator
  const SortArrow = ({ colKey }: { colKey: string }) =>
    sortConfig?.key === colKey
      ? sortConfig.direction === "asc"
        ? " ↑"
        : " ↓"
      : "";

  // Request sort
  function requestSort(key: string) {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig?.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  }

  const {
    dateFrom,
    dateTo,
    number,
    operator,
    hotel,
    checkInFrom,
    checkInTo,
    checkOutFrom,
    checkOutTo,
    firstTourist,
    status,
  } = filters;
  const smallInp = "h-8 px-1 text-sm";

  return (
    <OlimpyaLayout>
      <Card className="w-full mx-auto mt-6">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">{t("myBookings")}</h1>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => router.push("/olimpya/new-booking")}
            >
              + {t("newBooking")}
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table
              ref={tableRef}
              className="min-w-[1400px] w-full border table-auto text-sm"
            >
              <thead className="bg-gray-100 text-center">
                {/* Column headers */}
                <tr>
                  <th
                    className="px-2 py-1 border w-[100px] cursor-pointer"
                    onClick={() => requestSort("createdAt")}
                  >
                    {t("created")}
                    <SortArrow colKey="createdAt" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[80px] cursor-pointer"
                    onClick={() => requestSort("bookingNumber")}
                  >
                    №
                    <SortArrow colKey="bookingNumber" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[150px] cursor-pointer"
                    onClick={() => requestSort("operator")}
                  >
                    Оператор
                    <SortArrow colKey="operator" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[500px] cursor-pointer"
                    onClick={() => requestSort("hotel")}
                  >
                    Отель
                    <SortArrow colKey="hotel" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[100px] cursor-pointer"
                    onClick={() => requestSort("checkIn")}
                  >
                    Заезд
                    <SortArrow colKey="checkIn" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[100px] cursor-pointer"
                    onClick={() => requestSort("checkOut")}
                  >
                    Выезд
                    <SortArrow colKey="checkOut" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[200px] cursor-pointer"
                    onClick={() => requestSort("firstTourist")}
                  >
                    Имя туриста
                    <SortArrow colKey="firstTourist" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[100px] cursor-pointer text-right"
                    onClick={() => requestSort("bruttoClient")}
                  >
                    Клиент (€)
                    <SortArrow colKey="bruttoClient" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[100px] cursor-pointer text-right"
                    onClick={() => requestSort("nettoFact")}
                  >
                    Netto Fact (€)
                    <SortArrow colKey="nettoFact" />
                  </th>
                  <th
                    className="px-2 py-1 border w-[100px] cursor-pointer text-right"
                    onClick={() => requestSort("realCommission")}
                  >
                    Real комис. (€)
                    <SortArrow colKey="realCommission" />
                  </th>
                  <th className="px-2 py-1 border w-[120px]">Статус</th>
                  <th className="px-2 py-1 border w-[80px]">Действия</th>
                </tr>
                {/* Filters row */}
                <tr className="bg-white border-b text-center">
                  <th className="px-1 py-0.5 border w-[100px]">
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, dateFrom: e.target.value }))
                      }
                      className="mb-1 h-6 w-full text-xs"
                    />
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, dateTo: e.target.value }))
                      }
                      className="h-6 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border">
                    <Input
                      placeholder="#"
                      value={number}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, number: e.target.value }))
                      }
                      className={smallInp}
                    />
                  </th>
                  <th className="px-1 py-0.5 border">
                    <Input
                      placeholder="Оператор"
                      value={operator}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          operator: e.target.value,
                        }))
                      }
                      className={smallInp}
                    />
                  </th>
                  <th className="px-1 py-0.5 border">
                    <Input
                      placeholder="Отель"
                      value={hotel}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, hotel: e.target.value }))
                      }
                      className={smallInp}
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[100px]">
                    <Input
                      type="date"
                      value={checkInFrom}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          checkInFrom: e.target.value,
                        }))
                      }
                      className="mb-1 h-6 w-full text-xs"
                    />
                    <Input
                      type="date"
                      value={checkInTo}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          checkInTo: e.target.value,
                        }))
                      }
                      className="h-6 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[100px]">
                    <Input
                      type="date"
                      value={checkOutFrom}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          checkOutFrom: e.target.value,
                        }))
                      }
                      className="mb-1 h-6 w-full text-xs"
                    />
                    <Input
                      type="date"
                      value={checkOutTo}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          checkOutTo: e.target.value,
                        }))
                      }
                      className="h-6 w-full text-xs"
                    />
                  </th>
                  <th className="px-1 py-0.5 border w-[200px]">
                   <Input
                   className="h-8 px-1 text-sm"
                      placeholder="Имя"
                       value={filters.firstTourist}
                        onChange={(e) => setFilters(f => ({ ...f, firstTourist: e.target.value }))}
                    />
                  </th>
                  {/* No filters for tourist name */}
                
                  <th className="border" />
                  <th className="border" />
                  <th className="border" />
                  {/* Status dropdown */}
                  <th className="px-1 py-0.5 border">
                    <Select
                      value={status}
                      onValueChange={(v) =>
                        setFilters((f) => ({
                          ...f,
                          status: v as typeof f.status,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full h-8 text-xs">
                        <SelectValue placeholder="Все" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_KEYS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {k === "all" ? "Все" : t(`statuses.${k}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </th>
                  <th className="border" />
                </tr>
              </thead>

              <tbody>
                {displayed.map((b) => {
                  const norm = statusMap[b.status] || b.status;
                  return (
                    <tr
                      key={b.id}
                      className="border-t hover:bg-gray-50 text-center"
                    >
                      <td className="px-2 py-1 border">
                        {b.createdAt?.toDate
                          ? format(b.createdAt.toDate(), "dd.MM.yyyy")
                          : "-"}
                      </td>
                      <td className="px-2 py-1 border">{b.bookingNumber}</td>
                      <td className="px-2 py-1 border">{b.operator}</td>
                      <td className="px-2 py-1 border">{b.hotel}</td>
                      <td className="px-2 py-1 border">{b.checkIn}</td>
                      <td className="px-2 py-1 border">{b.checkOut}</td>
                      <td className="px-2 py-1 border">
                        {b.tourists?.[0]?.name || "—"}
                      </td>
                      <td className="px-2 py-1 border text-right">
                        {(b.bruttoClient || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 border text-right">
                        {(b.nettoFact || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 border text-right">
                        {(b.realCommission || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 border">
                        <Badge
                          className={`inline-flex px-2 py-1 text-xs rounded-sm ring-1 ring-inset ${
                            statusColors[norm] ||
                            "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {t(`statuses.${norm}`)}
                        </Badge>
                      </td>
                      <td className="px-2 py-1 border">
                        <button
                          onClick={() => router.push(`/olimpya/${b.id}`)}
                          title={t("edit")}
                          className="text-xl hover:scale-110 transition"
                        >
                          ✏️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot className="bg-gray-100 font-semibold text-center">
                <tr>
                                    <th className="border" />
                                    <th className="border" />
                   <td />
                  <td
                    colSpan={4}
                    className="px-2 py-2 text-right"
                  >
                    {t("total")}:
                  </td>
                  <td className="px-2 py-2">{totalBr.toFixed(2)}</td>
                  <td className="px-2 py-2">{totalFact.toFixed(2)}</td>
                  <td className="px-2 py-2">{totalReal.toFixed(2)} </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </OlimpyaLayout>
  );
}