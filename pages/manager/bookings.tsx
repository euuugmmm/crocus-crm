// pages/manager/bookings.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DownloadTableExcel } from "react-export-table-to-excel";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import {
  STATUS_KEYS,
  AGENT_STATUS_KEYS,
  STATUS_COLORS,
  StatusKey,
} from "@/lib/constants/statuses";
import { fmtDate, toDate } from "@/lib/utils/dates";
import { fixed2, toNumber } from "@/lib/utils/numbers";
import { collection, query as fsQuery, onSnapshot, deleteDoc, doc, where } from "firebase/firestore";

export async function getServerSideProps({ locale }: { locale: string }) {
  return { props: { ...(await serverSideTranslations(locale, ["common"])) } };
}

type Booking = {
  id?: string;
  agentId?: string;
  bookingType?: string;
  createdAt?: any;
  bookingNumber?: string;
  agentName?: string;
  agentAgency?: string;
  operator?: string;
  hotel?: string;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  bruttoClient?: number | string;
  internalNet?: number | string;

  /** статус, который ведём внутри (менеджерский) */
  status?: StatusKey | string;
  /** статус, отображаемый агенту */
  agentStatus?: StatusKey | string;

  invoiceLink?: string;
  voucherLinks?: string[];
};

const BOOKING_TYPE_LABELS: Record<string, string> = {
  olimpya_base: "Olimpya",
  subagent: "Субагент",
};

const humanizeBookingType = (v?: string) => {
  if (!v) return "—";
  return BOOKING_TYPE_LABELS[v] ?? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function ManagerBookings() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { user, loading, isManager, isSuperManager, isAdmin } = useAuth();
  const tableRef = useRef<HTMLTableElement | null>(null);

  const agentIdParam = typeof router.query.agentId === "string" ? router.query.agentId : undefined;

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
    internalNet: "",
    crocusProfit: "",
    status: "all",       // менеджерский статус
    agentStatus: "all",  // агентский статус
  });
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  // одна подписка на Firestore, учитываем agentId из URL
  useEffect(() => {
    if (!router.isReady) return;
    if (loading) return;
    if (!user || (!isManager && !isSuperManager && !isAdmin)) {
      router.replace("/login");
      return;
    }

    const base = collection(db, "bookings");
    const q = agentIdParam ? fsQuery(base, where("agentId", "==", agentIdParam)) : fsQuery(base);

    const unsub = onSnapshot(q, (snap) => {
      setBookings(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [router.isReady, loading, user, isManager, isSuperManager, isAdmin, agentIdParam]);

  const displayed = useMemo(() => {
    const createdFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const createdTo = filters.dateTo ? new Date(filters.dateTo) : null;
    const checkInFrom = filters.checkInFrom ? new Date(filters.checkInFrom) : null;
    const checkInTo = filters.checkInTo ? new Date(filters.checkInTo) : null;
    const checkOutFrom = filters.checkOutFrom ? new Date(filters.checkOutFrom) : null;
    const checkOutTo = filters.checkOutTo ? new Date(filters.checkOutTo) : null;

    return bookings
      .filter((b) => {
        if (agentIdParam && b.agentId !== agentIdParam) return false;

        const created = toDate(b.createdAt);
        if (createdFrom && (!created || created < createdFrom)) return false;
        if (createdTo && (!created || created > createdTo)) return false;

        const ci = toDate(b.checkIn);
        if (checkInFrom && (!ci || ci < checkInFrom)) return false;
        if (checkInTo && (!ci || ci > checkInTo)) return false;

        const co = toDate(b.checkOut);
        if (checkOutFrom && (!co || co < checkOutFrom)) return false;
        if (checkOutTo && (!co || co > checkOutTo)) return false;

        if (!((b.bookingNumber || "").toLowerCase().includes(filters.bookingNumber.toLowerCase()))) return false;
        if (!((b.agentName || "").toLowerCase().includes(filters.agentName.toLowerCase()))) return false;
        if (!((b.operator || "").toLowerCase().includes(filters.operator.toLowerCase()))) return false;
        if (!((b.hotel || "").toLowerCase().includes(filters.hotel.toLowerCase()))) return false;

        if (filters.bruttoClient && fixed2(b.bruttoClient) !== fixed2(filters.bruttoClient)) return false;
        if (filters.internalNet && fixed2(b.internalNet) !== fixed2(filters.internalNet)) return false;

        if (filters.crocusProfit) {
          const profit = toNumber(b.bruttoClient) - toNumber(b.internalNet);
          if (fixed2(profit) !== fixed2(filters.crocusProfit)) return false;
        }

        if (filters.status !== "all" && b.status !== filters.status) return false;
        if (filters.agentStatus !== "all" && b.agentStatus !== filters.agentStatus) return false;

        if (filters.bookingType && !(b.bookingType || "").toLowerCase().includes(filters.bookingType.toLowerCase()))
          return false;

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
          case "crocusProfit": {
            const pa = num(a.bruttoClient) - num(a.internalNet);
            const pb = num(b.bruttoClient) - num(b.internalNet);
            return (pa - pb) * dir;
          }
          case "status":
            return str(a.status).localeCompare(str(b.status)) * dir;
          case "agentStatus":
            return str(a.agentStatus).localeCompare(str(b.agentStatus)) * dir;
          default:
            return 0;
        }
      });
  }, [bookings, filters, sortConfig, agentIdParam]);

  function requestSort(key: string) {
    setSortConfig((prev) => {
      if (prev?.key === key) return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      return { key, direction: "asc" };
    });
  }

  async function delBooking(id: string, num: string) {
    if (!confirm(`${t("confirmDelete")} ${num}?`)) return;
    await deleteDoc(doc(db, "bookings", id));
  }

  const sumBrutto = displayed.reduce((s, b) => s + toNumber(b.bruttoClient), 0).toFixed(2);
  const sumInternal = displayed.reduce((s, b) => s + toNumber(b.internalNet), 0).toFixed(2);
  const sumCrocus = (parseFloat(sumBrutto) - parseFloat(sumInternal)).toFixed(2);

  const StatusBadge = ({ k }: { k?: string }) => {
    const key = (k as StatusKey) || "new";
    return (
      <span
        className={`inline-flex px-2 py-1 text-xs rounded-sm ring-1 ring-inset ${
          STATUS_COLORS[key] || "bg-gray-100 text-gray-800"
        }`}
      >
        {t(`statuses.${key}`)}
      </span>
    );
  };

  return (
    <>
      <Head><title>Заявки — CrocusCRM</title></Head>
      <ManagerLayout>
        <Card className="w-full mx-auto mt-6">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-bold">{t("manager.title")}</h1>
              <DownloadTableExcel filename="manager_bookings" sheet={t("manager.sheetName")} currentTableRef={tableRef.current}>
                <Button className="bg-green-600 hover:bg-green-700 text-white">{t("exportExcel")}</Button>
              </DownloadTableExcel>
            </div>

            <div className="overflow-x-auto">
              <table ref={tableRef} className="min-w-[1650px] w-full border text-sm">
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="px-2 py-1 border w-[120px]">Тип заявки</th>
                    <th className="px-2 py-1 border w-[100px] cursor-pointer" onClick={() => requestSort("date")}>{t("date")}</th>
                    <th className="px-2 py-1 border w-[80px] cursor-pointer" onClick={() => requestSort("bookingNumber")}>{t("№")}</th>
                    <th className="px-2 py-1 border w-[200px] cursor-pointer" onClick={() => requestSort("agent")}>{t("agent")}</th>
                    <th className="px-2 py-1 border w-[150px] cursor-pointer" onClick={() => requestSort("operator")}>{t("operator")}</th>
                    <th className="px-2 py-1 border w-[400px] cursor-pointer text-center" onClick={() => requestSort("hotel")}>{t("hotel")}</th>
                    <th className="px-2 py-1 border w-[120px] cursor-pointer" onClick={() => requestSort("checkIn")}>{t("checkIn")}</th>
                    <th className="px-2 py-1 border w-[120px] cursor-pointer" onClick={() => requestSort("checkOut")}>{t("checkOut")}</th>
                    <th className="px-2 py-1 border w-[100px] cursor-pointer text-center" onClick={() => requestSort("bruttoClient")}>Брутто Клиент (€)</th>
                    <th className="px-2 py-1 border w-[100px] cursor-pointer text-center" onClick={() => requestSort("internalNet")}>Netto Fact (€)</th>
                    <th className="px-2 py-1 border w-[120px] cursor-pointer text-center" onClick={() => requestSort("crocusProfit")}>Комиссия Crocus (€)</th>

                    {/* два соседних столбца статусов */}
                    <th className="px-2 py-1 border w-[140px] cursor-pointer" onClick={() => requestSort("status")}>Статус (менеджер)</th>
                    <th className="px-2 py-1 border w-[140px] cursor-pointer" onClick={() => requestSort("agentStatus")}>Статус агента</th>

                    <th className="px-2 py-1 border w-[100px]">{t("invoice")}</th>
                    <th className="px-2 py-1 border w-[120px]">{t("vouchers")}</th>
                    <th className="px-2 py-1 border w-[100px]">{t("actions")}</th>
                  </tr>

                  {/* строка фильтров */}
                  <tr className="bg-white text-center">
                    <th className="px-1 py-0.5 border w-[120px]">
                      <Input value={filters.bookingType} onChange={(e) => setFilters((f) => ({ ...f, bookingType: e.target.value }))} placeholder="Тип" className="h-8 w-full text-xs" />
                    </th>
                    <th className="px-1 py-0.5 border w-[100px]">
                      <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="mb-1 h-6 w-full text-xs" />
                      <Input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className="h-6 w-full text-xs" />
                    </th>
                    <th className="px-1 py-0.5 border w-[80px]">
                      <Input value={filters.bookingNumber} onChange={(e) => setFilters((f) => ({ ...f, bookingNumber: e.target.value }))} placeholder="#" className="h-8 w-full text-xs" />
                    </th>
                    <th className="px-1 py-0.5 border w-[200px]">
                      <Input value={filters.agentName} onChange={(e) => setFilters((f) => ({ ...f, agentName: e.target.value }))} placeholder={t("filter")} className="h-8 w-full text-xs" />
                    </th>
                    <th className="px-1 py-0.5 border w-[150px]">
                      <Input value={filters.operator} onChange={(e) => setFilters((f) => ({ ...f, operator: e.target.value }))} placeholder={t("filter")} className="h-8 w-full text-xs" />
                    </th>
                    <th className="px-1 py-0.5 border w-[400px]">
                      <Input value={filters.hotel} onChange={(e) => setFilters((f) => ({ ...f, hotel: e.target.value }))} placeholder={t("filter")} className="h-8 w-full text-xs" />
                    </th>
                    <th className="px-1 py-0.5 border w-[120px]">
                      <Input type="date" value={filters.checkInFrom} onChange={(e) => setFilters((f) => ({ ...f, checkInFrom: e.target.value }))} className="mb-1 h-6 w-full text-xs" />
                      <Input type="date" value={filters.checkInTo} onChange={(e) => setFilters((f) => ({ ...f, checkInTo: e.target.value }))} className="h-6 w-full text-xs" />
                    </th>
                    <th className="px-1 py-0.5 border w-[120px]">
                      <Input type="date" value={filters.checkOutFrom} onChange={(e) => setFilters((f) => ({ ...f, checkOutFrom: e.target.value }))} className="mb-1 h-6 w-full text-xs" />
                      <Input type="date" value={filters.checkOutTo} onChange={(e) => setFilters((f) => ({ ...f, checkOutTo: e.target.value }))} className="h-6 w-full text-xs" />
                    </th>
                    <th className="px-1 py-0.5 border w-[100px]">
                      <Input value={filters.bruttoClient} onChange={(e) => setFilters((f) => ({ ...f, bruttoClient: e.target.value }))} placeholder="0.00" className="h-8 w-full text-xs text-right" />
                    </th>
                    <th className="px-1 py-0.5 border w-[100px]">
                      <Input value={filters.internalNet} onChange={(e) => setFilters((f) => ({ ...f, internalNet: e.target.value }))} placeholder="0.00" className="h-8 w-full text-xs text-right" />
                    </th>
                    <th className="px-1 py-0.5 border w-[120px]">
                      <Input value={filters.crocusProfit} onChange={(e) => setFilters((f) => ({ ...f, crocusProfit: e.target.value }))} placeholder="0.00" className="h-8 w-full text-xs text-right" />
                    </th>

                    {/* фильтр по менеджерскому статусу */}
                    <th className="px-1 py-0.5 border w-[140px]">
                      <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="Все" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все</SelectItem>
                          {STATUS_KEYS.map((key) => (
                            <SelectItem key={key} value={key}>{t(`statuses.${key}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </th>

                    {/* фильтр по агентскому статусу */}
                    <th className="px-1 py-0.5 border w-[140px]">
                      <Select value={filters.agentStatus} onValueChange={(v) => setFilters((f) => ({ ...f, agentStatus: v }))}>
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="Все" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все</SelectItem>
                          {AGENT_STATUS_KEYS.map((key) => (
                            <SelectItem key={key} value={key}>{t(`statuses.${key}`)}</SelectItem>
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
                    const profit = (toNumber(b.bruttoClient) - toNumber(b.internalNet)).toFixed(2);
                    return (
                      <tr key={b.id} className="border-t hover:bg-gray-50 text-center">
                        <td className="px-2 py-1 border w-[120px]">{humanizeBookingType(b.bookingType)}</td>
                        <td className="px-2 py-1 border w-[100px] whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                        <td className="px-2 py-1 border w-[80px] whitespace-nowrap">{b.bookingNumber || "—"}</td>
                        <td className="px-2 py-1 border w-[200px] truncate">
                          {(b.agentName || "") + (b.agentAgency ? ` (${b.agentAgency})` : "")}
                        </td>
                        <td className="px-2 py-1 border w-[150px] truncate">{b.operator || "—"}</td>
                        <td className="px-2 py-1 border w-[400px] truncate text-center">{b.hotel || "—"}</td>
                        <td className="px-2 py-1 border w-[120px] whitespace-nowrap">{fmtDate(b.checkIn)}</td>
                        <td className="px-2 py-1 border w-[120px] whitespace-nowrap">{fmtDate(b.checkOut)}</td>
                        <td className="px-2 py-1 border w-[100px] text-right">{fixed2(b.bruttoClient)}</td>
                        <td className="px-2 py-1 border w-[100px] text-right">{fixed2(b.internalNet)}</td>
                        <td className="px-2 py-1 border w-[120px] text-right">{profit}</td>

                        {/* менеджерский статус */}
                        <td className="px-2 py-1 border w-[140px]">
                          <StatusBadge k={b.status as string} />
                        </td>

                        {/* статус, который видит агент */}
                        <td className="px-2 py-1 border w-[140px]">
                          {b.agentStatus ? <StatusBadge k={b.agentStatus as string} /> : "—"}
                        </td>

                        <td className="px-2 py-1 border w-[100px]">
                          {b.invoiceLink ? (
                            <a href={b.invoiceLink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                              {t("Open")}
                            </a>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-1 border w-[120px]">
                          {Array.isArray(b.voucherLinks) && b.voucherLinks.length
                            ? b.voucherLinks.map((l, i) => (
                                <div key={i}>
                                  <a href={l} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
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
                              onClick={(e) => {
                                e.preventDefault();
                                const path = b.bookingType === "olimpya_base" ? `/olimpya/${b.id}` : `/manager/${b.id}`;
                                window.open(path, "_blank", "noopener,noreferrer");
                              }}
                            >
                              ✏️
                            </button>
                            <button
                              title={t("delete")}
                              className="text-xl hover:scale-110 transition"
                              onClick={() => b.id && delBooking(b.id, b.bookingNumber || "—")}
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
                    <td colSpan={8} className="px-2 py-2 text-right">{t("total")}</td>
                    <td className="px-2 py-2 text-right">{sumBrutto}</td>
                    <td className="px-2 py-2 text-right">{sumInternal}</td>
                    <td className="px-2 py-2 text-right">{sumCrocus}</td>
                    {/* менеджерский статус: количество строк */}
                    <td className="px-2 py-2 text-center">{displayed.length}</td>
                    {/* агентский статус */}
                    <td />
                    {/* Invoice / Vouchers / Actions */}
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
    </>
  );
}