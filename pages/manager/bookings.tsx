// pages/manager/bookings.tsx
"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  collection,
  query,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { format } from "date-fns";
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
import LinkTelegramButton from "@/components/LinkTelegramButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
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
  "new",
  "awaiting_payment",
  "paid",
  "awaiting_confirm",
  "confirmed",
  "finished",
  "cancelled",
] as const;

const STATUS_COLORS: Record<typeof STATUS_KEYS[number], string> = {
  new: "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
  awaiting_payment: "bg-orange-50 text-orange-700 ring-orange-600/20",
  paid: "bg-blue-50 text-blue-700 ring-blue-700/10",
  awaiting_confirm: "bg-purple-50 text-purple-700 ring-purple-700/10",
  confirmed: "bg-green-50 text-green-700 ring-green-600/20",
  finished: "bg-green-700 text-white ring-green-800/30",
  cancelled: "bg-red-50 text-red-700 ring-red-600/10",
};

export default function ManagerBookings() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { user, isManager, logout } = useAuth();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filters, setFilters] = useState({
    operator: "",
    hotel: "",
    status: "all",
  });
  const tableRef = useRef<HTMLTableElement | null>(null);

  // Build status options for filter dropdown
  const statusOptions = [
    { value: "all", label: t("statusFilter.all") },
    ...STATUS_KEYS.map((key) => ({
      value: key,
      label: t(`statuses.${key}`),
    })),
  ];

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (!isManager) {
      router.push("/agent/bookings");
      return;
    }

    const q = query(collection(db, "bookings"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Booking),
      }));
      arr.sort((a, b) =>
        (b.bookingNumber || "").localeCompare(a.bookingNumber || "")
      );
      setBookings(arr);
    });
    return () => unsubscribe();
  }, [user, isManager, router]);

// Apply filters ─ безопасно обрабатываем undefined
const filtered = bookings.filter((b) => {
  const matchesOperator = (b.operator || "")
    .toLowerCase()
    .includes((filters.operator || "").toLowerCase());

  const matchesHotel = (b.hotel || "")
    .toLowerCase()
    .includes((filters.hotel || "").toLowerCase());

  const matchesStatus =
    filters.status === "all" || b.status === filters.status;

  return matchesOperator && matchesHotel && matchesStatus;
});

  // Totals
  const totalBrutto = filtered.reduce(
    (sum, b) => sum + (b.bruttoClient || 0),
    0
  );
  const totalCommission = filtered.reduce(
    (sum, b) => sum + (b.commission || 0),
    0
  );
  const totalCrocus = filtered.reduce((sum, b) => {
    const profit =
      (b.bruttoClient || 0) -
      (b.internalNet || 0) -
      (b.commission || 0) -
      ((b.commission || 0) / 0.9 - (b.commission || 0)) -
      (b.bankFeeAmount || 0);
    return sum + profit;
  }, 0);

  const delBooking = async (id: string, num: string) => {
    if (!confirm(`${t("confirmDelete")} ${num}?`)) return;
    await deleteDoc(doc(db, "bookings", id));
  };

  const smallInp = "h-8 px-1 text-sm";
  const nav = [
    { href: "/manager/bookings", label: t("navBookings") },
    { href: "/manager/balances", label: t("navBalance") },
    { href: "/manager/payouts", label: t("navPayouts") },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  return (
    <>
      {/* HEADER */}
<LanguageSwitcher />
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS CRM</span>
          <nav className="flex gap-4">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  isActive(n.href) ? "border-indigo-600 text-black" : "border-transparent text-gray-600 hover:text-black"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <LinkTelegramButton />
            <Button size="sm" variant="destructive" onClick={logout}>
              {t("logout")}
            </Button>
          </div>
        </div>
      </header>

      {/* CONTENT */}
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
            <table
              ref={tableRef}
              className="min-w-[1400px] w-full border text-sm"
            >
              <thead className="bg-gray-100 text-center">
                <tr>
                  <th className="px-2 py-1 border">{t("date")}</th>
                  <th className="px-2 py-1 border">№</th>
                  <th className="px-2 py-1 border">{t("agent")}</th>
                  <th className="px-2 py-1 border">{t("operator")}</th>
                  <th className="px-2 py-1 border">{t("hotel")}</th>
                  <th className="px-2 py-1 border">{t("checkIn")}</th>
                  <th className="px-2 py-1 border">{t("checkOut")}</th>
                  <th className="px-2 py-1 border w-40">{t("client")} (€)</th>
                  <th className="px-2 py-1 border w-40">
                    {t("commission")} (€)
                  </th>
                  <th className="px-2 py-1 border w-40">
                    {t("crocusProfit")} (€)
                  </th>
                  <th className="px-2 py-1 border">{t("status")}</th>
                  <th className="px-2 py-1 border">{t("invoice")}</th>
                  <th className="px-2 py-1 border">{t("vouchers")}</th>
                  <th className="px-2 py-1 border">{t("actions")}</th>
                </tr>
                <tr className="bg-white border-b text-center">
                  <td />
                  <td />
                  <td />
                  <td>
                    <Input
                      className={smallInp}
                      value={filters.operator}
                      onChange={(e) =>
                        setFilters({ ...filters, operator: e.target.value })
                      }
                      placeholder={t("filter")}
                    />
                  </td>
                  <td>
                    <Input
                      className={smallInp}
                      value={filters.hotel}
                      onChange={(e) =>
                        setFilters({ ...filters, hotel: e.target.value })
                      }
                      placeholder={t("filter")}
                    />
                  </td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td>
                    <Select
                      value={filters.status}
                      onValueChange={(v) =>
                        setFilters({ ...filters, status: v })
                      }
                    >
                      <SelectTrigger className="w-32 h-8">
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
                  </td>
                  <td />
                  <td />
                  <td />
                </tr>
              </thead>

              <tbody>
                {filtered.map((b) => {
                  const created = b.createdAt?.toDate
                    ? format(b.createdAt.toDate(), "dd.MM.yyyy")
                    : "-";
                  const crocusProfit = (
                    (b.bruttoClient || 0) -
                    (b.internalNet || 0) -
                    (b.commission || 0) -
                    ((b.commission || 0) / 0.9 - (b.commission || 0)) -
                    (b.bankFeeAmount || 0)
                  ).toFixed(2);

                  return (
                    <tr
                      key={b.id}
                      className="border-t hover:bg-gray-50 text-center"
                    >
                      <td className="px-2 py-1 border whitespace-nowrap">
                        {created}
                      </td>
                      <td className="px-2 py-1 border whitespace-nowrap">
                        {b.bookingNumber || "—"}
                      </td>
                      <td className="px-2 py-1 border truncate max-w-[160px]">
                        {b.agentName || "—"} ({b.agentAgency || "—"})
                      </td>
                      <td className="px-2 py-1 border truncate max-w-[120px]">
                        {b.operator}
                      </td>
                      <td className="px-2 py-1 border truncate max-w-[160px]">
                        {b.hotel}
                      </td>
                      <td className="px-2 py-1 border whitespace-nowrap">
                        {b.checkIn
                          ? format(new Date(b.checkIn), "dd.MM.yyyy")
                          : "-"}
                      </td>
                      <td className="px-2 py-1 border whitespace-nowrap">
                        {b.checkOut
                          ? format(new Date(b.checkOut), "dd.MM.yyyy")
                          : "-"}
                      </td>
                      <td className="px-2 py-1 border w-40 text-right">
                        {(b.bruttoClient || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 border w-40 text-right">
                        {(b.commission || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 border w-40 text-right">
                        {crocusProfit}
                      </td>
                      <td className="px-2 py-1 border">
                        <Badge
                          className={`inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium ring-1 ring-inset ring-current rounded-sm ${STATUS_COLORS[b.status as typeof STATUS_KEYS[number]]}`}
                        >
                          {t(`statuses.${b.status as string}`)}
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
                      <td className="px-2 py-1 border min-w-[120px]">
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
                        <div className="flex gap-2 justify-center">
                          <button
                            title={t("edit")}
                            className="text-xl hover:scale-110 transition"
                            onClick={() => router.push(`/manager/${b.id}`)}
                          >
                            ✏️
                          </button>
                          <button
                            title={t("delete")}
                            className="text-xl hover:scale-110 transition"
                            onClick={() =>
                              delBooking(b.id, b.bookingNumber || "—")
                            }
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
                  <td colSpan={7} className="px-2 py-2 text-right">
                    {t("total")}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {totalBrutto.toFixed(2)} €
                  </td>
                  <td className="px-2 py-2 text-right">
                    {totalCommission.toFixed(2)} €
                  </td>
                  <td className="px-2 py-2 text-right">
                    {totalCrocus.toFixed(2)} €
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}