// pages/agent/bookings.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import AgentLayout from "@/components/layouts/AgentLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { STATUS_COLORS, AGENT_STATUS_KEYS as STATUS_KEYS, StatusKey } from "@/lib/constants/statuses";
import { fmtDate, toDate } from "@/lib/utils/dates";
import { fixed2, toNumber } from "@/lib/utils/numbers";

export async function getServerSideProps({ locale }: { locale: string }) {
  return { props: { ...(await serverSideTranslations(locale, ["common"])) } };
}

type Booking = {
  id?: string;
  bookingNumber?: string;
  operator?: string;
  hotel?: string;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  tourists?: Array<{ name?: string }>;
  bruttoClient?: number | string;
  commission?: number | string;
  status?: StatusKey | string;
  invoiceLink?: string;
  voucherLinks?: string[];
};

const LEGACY_STATUS: Record<string, StatusKey> = {
  "Новая": "new",
  "Ожидание оплаты": "awaiting_payment",
  "Оплачено туристом": "paid",
  "Ожидает confirm": "awaiting_confirm",
  "Подтверждено": "confirmed",
  "Завершено": "finished",
  "Отменен": "cancelled",
};

export default function AgentBookingsPage() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { user, isAgent } = useAuth();
  const tableRef = useRef<HTMLTableElement | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    bookingNumber: "",
    operator: "",
    hotel: "",
    checkInFrom: "",
    checkInTo: "",
    checkOutFrom: "",
    checkOutTo: "",
    firstTourist: "",
    bruttoClient: "",
    commission: "",
    status: "all",
  });
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "createdAt",
    direction: "desc",
  });

  useEffect(() => {
    if (!user || !isAgent) return;
    const q = query(collection(db, "bookings"), where("agentId", "==", user.uid));
    return onSnapshot(q, (snap) =>
      setBookings(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, [user, isAgent]);

  const displayed = useMemo(() => {
    const parseDate = (s: string) => (s ? new Date(s + "T00:00:00") : null);

    return bookings
      .filter((b) => {
        const created = toDate((b as any).createdAt);
        const df = filters.dateFrom ? parseDate(filters.dateFrom) : null;
        const dt = filters.dateTo   ? parseDate(filters.dateTo)   : null;
        if (df && (!created || created < df)) return false;
        if (dt && (!created || created > dt)) return false;

        if (filters.bookingNumber &&
            !b.bookingNumber?.toLowerCase().includes(filters.bookingNumber.toLowerCase()))
          return false;
        if (filters.operator &&
            !b.operator?.toLowerCase().includes(filters.operator.toLowerCase()))
          return false;
        if (filters.hotel &&
            !b.hotel?.toLowerCase().includes(filters.hotel.toLowerCase()))
          return false;

        const ci  = toDate(b.checkIn);
        const cif = filters.checkInFrom ? parseDate(filters.checkInFrom) : null;
        const cit = filters.checkInTo   ? parseDate(filters.checkInTo)   : null;
        if (cif && (!ci || ci < cif)) return false;
        if (cit && (!ci || ci > cit)) return false;

        const co  = toDate(b.checkOut);
        const cof = filters.checkOutFrom ? parseDate(filters.checkOutFrom) : null;
        const cot = filters.checkOutTo   ? parseDate(filters.checkOutTo)   : null;
        if (cof && (!co || co < cof)) return false;
        if (cot && (!co || co > cot)) return false;

        if (filters.firstTourist &&
            !b.tourists?.[0]?.name?.toLowerCase().includes(filters.firstTourist.toLowerCase()))
          return false;

        if (filters.bruttoClient &&
            fixed2(b.bruttoClient) !== fixed2(filters.bruttoClient))
          return false;
        if (filters.commission &&
            fixed2(b.commission) !== fixed2(filters.commission))
          return false;

        const sk: StatusKey = LEGACY_STATUS[b.status as string] || (b.status as StatusKey) || "new";
        if (filters.status !== "all" && sk !== (filters.status as StatusKey)) return false;

        return true;
      })
      .sort((a, b) => {
        const dir = sortConfig.direction === "asc" ? 1 : -1;
        let aV: any, bV: any;
        switch (sortConfig.key) {
          case "createdAt":
            aV = toDate((a as any).createdAt)?.getTime() || 0;
            bV = toDate((b as any).createdAt)?.getTime() || 0;
            break;
          case "bookingNumber":
            aV = parseInt(a.bookingNumber?.replace(/\D/g, "") || "0", 10);
            bV = parseInt(b.bookingNumber?.replace(/\D/g, "") || "0", 10);
            break;
          case "operator":
            aV = a.operator || ""; bV = b.operator || "";
            break;
          case "hotel":
            aV = a.hotel || ""; bV = b.hotel || "";
            break;
          case "checkIn":
            aV = toDate(a.checkIn)?.getTime() || 0;
            bV = toDate(b.checkIn)?.getTime() || 0;
            break;
          case "checkOut":
            aV = toDate(b.checkOut)?.getTime() || 0;
            bV = toDate(b.checkOut)?.getTime() || 0;
            break;
          case "firstTourist":
            aV = a.tourists?.[0]?.name || ""; bV = b.tourists?.[0]?.name || "";
            break;
          case "bruttoClient":
            aV = toNumber(a.bruttoClient); bV = toNumber(b.bruttoClient);
            break;
          case "commission":
            aV = toNumber(a.commission); bV = toNumber(b.commission);
            break;
          case "status":
            aV = (LEGACY_STATUS[a.status as string] || a.status as string) || "";
            bV = (LEGACY_STATUS[b.status as string] || b.status as string) || "";
            break;
          default:
            aV = ""; bV = "";
        }
        if (typeof aV === "string" && typeof bV === "string") {
          return dir * aV.localeCompare(bV);
        }
        return dir * (aV - bV);
      });
  }, [bookings, filters, sortConfig]);

  function requestSort(key: string) {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  const SortArrow = ({ colKey }: { colKey: string }) =>
    sortConfig.key === colKey ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : "";

  const totalBr  = displayed.reduce((s, b) => s + toNumber(b.bruttoClient), 0);
  const totalCom = displayed.reduce((s, b) => s + toNumber(b.commission),    0);
  const totalCnt = displayed.length;

  return (
    <>
      <Head>
        <title>{t("myBookings")} — CrocusCRM</title>
      </Head>
      <AgentLayout>
        <Card className="w-full mx-auto mt-6">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold">{t("myBookings")}</h1>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => router.push("/agent/new-booking")}
              >
                + {t("newBooking")}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table
                ref={tableRef}
                className="min-w-[1400px] w-full border table-auto text-sm"
              >
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="px-2 py-1 border w-[100px] cursor-pointer" onClick={() => requestSort("createdAt")}>
                      {t("created")}
                      <SortArrow colKey="createdAt" />
                    </th>
                    <th className="px-2 py-1 border w-[200px] cursor-pointer" onClick={() => requestSort("bookingNumber")}>
                      №
                      <SortArrow colKey="bookingNumber" />
                    </th>
                    <th className="px-2 py-1 border w-[220px] cursor-pointer" onClick={() => requestSort("operator")}>
                      {t("operator")}
                      <SortArrow colKey="operator" />
                    </th>
                    <th className="px-2 py-1 border w-[500px] cursor-pointer" onClick={() => requestSort("hotel")}>
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
                    <th className="px-2 py-1 border w-[200px] cursor-pointer" onClick={() => requestSort("firstTourist")}>
                      {t("touristName") || "Имя туриста"}
                      <SortArrow colKey="firstTourist" />
                    </th>
                    <th className="px-2 py-1 border w-[120px] cursor-pointer text-right" onClick={() => requestSort("bruttoClient")}>
                      {t("client")} (€)
                      <SortArrow colKey="bruttoClient" />
                    </th>
                    <th className="px-2 py-1 border w-[120px] cursor-pointer text-right" onClick={() => requestSort("commission")}>
                      {t("commission")} (€)
                      <SortArrow colKey="commission" />
                    </th>
                    <th className="px-2 py-1 border w-[120px]">{t("status")}</th>
                    <th className="px-2 py-1 border w-[100px]">{t("invoice")}</th>
                    <th className="px-2 py-1 border w-[120px]">{t("vouchers")}</th>
                    <th className="px-2 py-1 border w-[80px]">{t("actions")}</th>
                  </tr>
                  {/* фильтры */}
                  <tr className="bg-white border-b text-center">
                    <th className="px-1 py-0.5 border">
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
                    <th className="px-1 py-0.5 border">
                      <Input
                        placeholder="#"
                        value={filters.bookingNumber}
                        onChange={(e) => setFilters((f) => ({ ...f, bookingNumber: e.target.value }))}
                        className="h-8 w-full text-xs"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        placeholder={t("filter")}
                        value={filters.operator}
                        onChange={(e) => setFilters((f) => ({ ...f, operator: e.target.value }))}
                        className="h-8 w-full text-xs"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        placeholder={t("filter")}
                        value={filters.hotel}
                        onChange={(e) => setFilters((f) => ({ ...f, hotel: e.target.value }))}
                        className="h-8 w-full text-xs"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
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
                    <th className="px-1 py-0.5 border">
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
                    <th className="px-1 py-0.5 border">
                      <Input
                        placeholder={t("touristName") || "Имя"}
                        value={filters.firstTourist}
                        onChange={(e) => setFilters((f) => ({ ...f, firstTourist: e.target.value }))}
                        className="h-8 w-full text-xs"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        placeholder="0.00"
                        value={filters.bruttoClient}
                        onChange={(e) => setFilters((f) => ({ ...f, bruttoClient: e.target.value }))}
                        className="h-8 w-full text-xs text-right"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Input
                        placeholder="0.00"
                        value={filters.commission}
                        onChange={(e) => setFilters((f) => ({ ...f, commission: e.target.value }))}
                        className="h-8 w-full text-xs text-right"
                      />
                    </th>
                    <th className="px-1 py-0.5 border">
                      <Select
                        value={filters.status}
                        onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                      >
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder={t("statusFilter.all")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("statusFilter.all")}</SelectItem>
                          {STATUS_KEYS.map((key) => (
                            <SelectItem key={key} value={key}>
                              {t(`statuses.${key}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </th>
                    <th className="w-[100px]"></th>
                    <th className="w-[120px]"></th>
                    <th className="w-[80px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((b) => {
                    const statusKey: StatusKey =
                      LEGACY_STATUS[b.status as string] || (b.status as StatusKey) || "new";
                    return (
                      <tr key={b.id} className="border-t hover:bg-gray-50 text-center">
                        <td className="px-2 py-1 border">{fmtDate((b as any).createdAt)}</td>
                        <td className="px-2 py-1 border">{b.bookingNumber || "—"}</td>
                        <td className="px-2 py-1 border">{b.operator || "—"}</td>
                        <td className="px-2 py-1 border">{b.hotel || "—"}</td>
                        <td className="px-2 py-1 border">{fmtDate(b.checkIn)}</td>
                        <td className="px-2 py-1 border">{fmtDate(b.checkOut)}</td>
                        <td className="px-2 py-1 border">{b.tourists?.[0]?.name || "—"}</td>
                        <td className="px-2 py-1 border text-right">{fixed2(b.bruttoClient)}</td>
                        <td className="px-2 py-1 border text-right">{fixed2(b.commission)}</td>
                        <td className="px-2 py-1 border">
                          <Badge
                            className={`inline-flex px-2 py-1 text-xs rounded-sm ring-1 ring-inset ${
                              STATUS_COLORS[statusKey] || "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {t(`statuses.${statusKey}`)}
                          </Badge>
                        </td>
                        <td className="px-2 py-1 border">
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
                        <td className="px-2 py-1 border">
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
                        <td className="px-2 py-1 border">
                          <button
                            onClick={() => router.push(`/agent/${b.id}`)}
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
                    <td colSpan={7} className="px-2 py-2 text-right">
                      {t("total")}:
                    </td>
                    <td className="px-2 py-2 text-right">{totalBr.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{totalCom.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{totalCnt}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </AgentLayout>
    </>
  );
}