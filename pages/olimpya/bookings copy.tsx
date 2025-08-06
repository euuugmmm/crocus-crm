// pages/agent/bookings.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { format } from "date-fns";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import AgentLayout from "@/components/layouts/AgentLayout";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

const statusMap: Record<string, string> = {
  "Новая": "new",
  "Ожидание оплаты": "awaiting_payment",
  "Оплачено туристом": "paid",
  "Ожидает confirm": "awaiting_confirm",
  "Подтверждено": "confirmed",
  "Завершено": "finished",
  "Отменен": "cancelled",
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

export default function AgentBookingsPage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { user, isAgent } = useAuth();

  const [bookings, setBookings] = useState<any[]>([]);
  const [filters, setFilters] = useState({ number: "", operator: "", hotel: "", status: "all" });

  useEffect(() => {
    if (!user || !isAgent) return;
    const q = query(collection(db, "bookings"), where("agentId", "==", user.uid));
    const off = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => {
        const nA = parseInt((a.bookingNumber || "").replace(/\D/g, ""), 10) || 0;
        const nB = parseInt((b.bookingNumber || "").replace(/\D/g, ""), 10) || 0;
        return nB - nA;
      });
      setBookings(list);
    });
    return () => off();
  }, [user, isAgent]);

  const filtered = bookings.filter((b) => {
    const normalizedStatus = statusMap[b.status] || b.status || "unknown";
    const st = filters.status === "all" || normalizedStatus === filters.status;
    const num = (b.bookingNumber || "").toLowerCase().includes(filters.number.toLowerCase());
    const op = (b.operator || "").toLowerCase().includes(filters.operator.toLowerCase());
    const hot = (b.hotel || "").toLowerCase().includes(filters.hotel.toLowerCase());
    return st && num && op && hot;
  });

  const totalBr = filtered.reduce((s, b) => s + (b.bruttoClient || 0), 0);
  const totalCm = filtered.reduce((s, b) => s + (b.commission || 0), 0);
  const smallInp = "h-8 px-1 text-sm";

  return (
    <AgentLayout>
      <div className="w-full px-4 mt-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">{t("myBookings")}</h1>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={() => router.push("/agent/new-booking")}
          >
            + {t("newBooking")}
          </Button>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm border table-auto">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="px-2 py-1 w-28">{t("number")}</th>
                <th className="px-2 py-1 w-32">{t("created")}</th>
                <th className="px-2 py-1">{t("operator")}</th>
                <th className="px-2 py-1">{t("hotel")}</th>
                <th className="px-2 py-1">{t("checkIn")}</th>
                <th className="px-2 py-1">{t("checkOut")}</th>
                <th className="px-2 py-1 w-40">{t("client")} (€)</th>
                <th className="px-2 py-1 w-40">{t("commission")} (€)</th>
                <th className="px-2 py-1">{t("status")}</th>
                <th className="px-2 py-1">{t("invoice")}</th>
                <th className="px-2 py-1">{t("vouchers")}</th>
                <th className="px-2 py-1">{t("comment")}</th>
              </tr>
              <tr className="bg-white border-b text-center">
                <td>
                  <Input className={smallInp} placeholder="#" value={filters.number} onChange={(e) => setFilters({ ...filters, number: e.target.value })} />
                </td>
                <td></td>
                <td>
                  <Input className={smallInp} placeholder={t("filter")} value={filters.operator} onChange={(e) => setFilters({ ...filters, operator: e.target.value })} />
                </td>
                <td>
                  <Input className={smallInp} placeholder={t("filter")} value={filters.hotel} onChange={(e) => setFilters({ ...filters, hotel: e.target.value })} />
                </td>
                <td></td><td></td><td></td><td></td>
                <td>
                  <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("all")}</SelectItem>
                      {Object.keys(statusColors).map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`statuses.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const normalizedStatus = statusMap[b.status] || b.status || "unknown";
                return (
                  <tr key={b.id} className="border-t text-center hover:bg-gray-50">
                    <td className="px-2 py-1 font-medium whitespace-nowrap">{b.bookingNumber || b.bookingCode || "—"}</td>
                    <td className="px-2 py-1">{b.createdAt?.toDate ? format(b.createdAt.toDate(), "dd.MM.yyyy") : "-"}</td>
                    <td className="px-2 py-1">{b.operator}</td>
                    <td className="px-2 py-1">{b.hotel}</td>
                    <td className="px-2 py-1">{b.checkIn && !isNaN(new Date(b.checkIn).getTime())
                        ? format(new Date(b.checkIn), "dd.MM.yyyy")
                             : "-"}
                    </td>
                      <td className="px-2 py-1">
                        {b.checkOut && !isNaN(new Date(b.checkOut).getTime())
                         ? format(new Date(b.checkOut), "dd.MM.yyyy")
                        : "-"}
                        </td>
                    <td className="px-2 py-1 text-center">{(b.bruttoClient || 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-center">{(b.commission || 0).toFixed(2)}</td>
                    <td className="px-2 py-1">
                      <Badge className={`inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium ring-1 ring-inset rounded-sm ${statusColors[normalizedStatus] || "bg-gray-100 text-gray-800"}`}>
                        {t(`statuses.${normalizedStatus}`)}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">
                      {b.invoiceLink ? (
                        <a href={b.invoiceLink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Open</a>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-1 min-w-[110px]">
                      {Array.isArray(b.voucherLinks) && b.voucherLinks.length
                        ? b.voucherLinks.map((l, i) => (
                            <div key={i}>
                              <a href={l} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
                                Voucher {i + 1}
                              </a>
                            </div>
                          ))
                        : "—"}
                    </td>
                    <td className="px-2 py-1">
                      <button title={t("edit")} className="text-xl hover:scale-110 transition" onClick={() => router.push(`/agent/${b.id}`)}>✏️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold text-center">
              <tr>
                <td colSpan={6} className="px-2 py-2 text-right">{t("total")}:</td>
                <td className="px-2 py-2 text-center">{totalBr.toFixed(2)} €</td>
                <td className="px-2 py-2 text-center">{totalCm.toFixed(2)} €</td>
                <td colSpan={5}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </AgentLayout>
  );
}