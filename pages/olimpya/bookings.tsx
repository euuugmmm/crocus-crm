// pages/olimpya/bookings.tsx
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
import LanguageSwitcher from "@/components/LanguageSwitcher";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

// mapping human-readable status → internal code
const statusMap: Record<string,string> = {
  "Новая":             "new",
  "Ожидание оплаты":    "awaiting_payment",
  "Оплачено туристом":  "paid",
  "Ожидает подтверждения":"awaiting_confirm",
  "Подтверждено":       "confirmed",
  "Завершено":          "finished",
  "Отменена":           "cancelled",
};

// цветовая схема для бейджей
const statusColors: Record<string,string> = {
  new:              "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
  awaiting_payment: "bg-orange-50 text-orange-700 ring-orange-600/20",
  paid:             "bg-blue-50 text-blue-700 ring-blue-700/10",
  awaiting_confirm: "bg-purple-50 text-purple-700 ring-purple-700/10",
  confirmed:        "bg-green-50 text-green-700 ring-green-600/20",
  finished:         "bg-green-700 text-white ring-green-800/30",
  cancelled:        "bg-red-50 text-red-700 ring-red-600/10",
};

export default function OlimpyaBookingsPage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { user, userData, loading, isOlimpya, logout } = useAuth();

  const [bookings, setBookings] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    number: "",
    operator: "",
    hotel: "",
    status: "all",
  });
  const tableRef = useRef<HTMLTableElement|null>(null);

  // Загрузка только для пользователей Олимпия
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isOlimpya) {
      router.replace("/");
      return;
    }
    const q = query(
      collection(db, "bookings"),
      where("agentId", "==", user.uid)
    );
    const off = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      // сортируем по номеру заявки по убыванию
      list.sort((a,b) => {
        const nA = parseInt((a.bookingNumber||"").replace(/\D/g,""))||0;
        const nB = parseInt((b.bookingNumber||"").replace(/\D/g,""))||0;
        return nB - nA;
      });
      setBookings(list);
    });
    return () => off();
  }, [user, loading, isOlimpya, router]);

  // Применяем фильтры
  const filtered = bookings.filter((b) => {
    const code = statusMap[b.status] || b.status || "unknown";
    const okStatus = filters.status === "all" || code === filters.status;
    const okNumber = b.bookingNumber
      .toLowerCase()
      .includes(filters.number.toLowerCase());
    const okOp = b.operator
      .toLowerCase()
      .includes(filters.operator.toLowerCase());
    const okHotel = b.hotel
      .toLowerCase()
      .includes(filters.hotel.toLowerCase());
    return okStatus && okNumber && okOp && okHotel;
  });

  // итоги
  const totalBr = filtered.reduce((s,b) => s + (b.bruttoClient||0), 0);
  const totalCm = filtered.reduce((s,b) => s + (b.commission||0), 0);

  // Навигация внутри Олимпии
  const nav = [
    { href: "/olimpya/bookings", label: t("navBookings") },
    { href: "/olimpya/balance",  label: t("navBalance")  },
    { href: "/olimpya/history",  label: t("navHistory")  },
    { href: "/olimpya/profile",  label: t("profile")     },
  ];
  const isActive = (h: string) => router.pathname === h;
  const smallInp = "h-8 px-1 text-sm";

  if (loading) {
    return <p className="text-center mt-6">…</p>;
  }

  return (
    <>
      <LanguageSwitcher />

      {/* HEADER */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>
          <nav className="flex gap-4">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  isActive(n.href)
                    ? "border-indigo-600 text-black"
                    : "border-transparent text-gray-600 hover:text-black"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Button size="sm" variant="destructive" onClick={logout}>
            {t("logout")}
          </Button>
        </div>
      </header>

      {/* CONTENT */}
      <Card className="w-full mx-auto mt-6">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">{t("myBookings")}</h1>
            <Button
              onClick={() => router.push("/olimpya/new-booking")}
              className="bg-green-600 hover:bg-green-700"
            >
              + {t("newBooking")}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table ref={tableRef} className="min-w-[1400px] w-full border text-sm">
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
                  <th className="px-2 py-1">{t("comment")}</th>
                </tr>
                <tr className="bg-white border-b text-center">
                  <td>
                    <Input
                      className={smallInp}
                      placeholder="#"
                      value={filters.number}
                      onChange={(e) =>
                        setFilters({ ...filters, number: e.target.value })
                      }
                    />
                  </td>
                  <td></td>
                  <td>
                    <Input
                      className={smallInp}
                      placeholder={t("filter")}
                      value={filters.operator}
                      onChange={(e) =>
                        setFilters({ ...filters, operator: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <Input
                      className={smallInp}
                      placeholder={t("filter")}
                      value={filters.hotel}
                      onChange={(e) =>
                        setFilters({ ...filters, hotel: e.target.value })
                      }
                    />
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td>
                    <Select
                      value={filters.status}
                      onValueChange={(v) =>
                        setFilters({ ...filters, status: v })
                      }
                    >
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
                  const code = statusMap[b.status] || b.status || "unknown";
                  return (
                    <tr
                      key={b.id}
                      className="border-t hover:bg-gray-50 text-center"
                    >
                      <td className="px-2 py-1 font-medium">
                        {b.bookingNumber || "—"}
                      </td>
                      <td className="px-2 py-1">
                        {b.createdAt?.toDate
                          ? format(b.createdAt.toDate(), "dd.MM.yyyy")
                          : "—"}
                      </td>
                      <td className="px-2 py-1">{b.operator}</td>
                      <td className="px-2 py-1">{b.hotel}</td>
                      <td className="px-2 py-1">
                        {b.checkIn
                          ? format(new Date(b.checkIn), "dd.MM.yyyy")
                          : "—"}
                      </td>
                      <td className="px-2 py-1">
                        {b.checkOut
                          ? format(new Date(b.checkOut), "dd.MM.yyyy")
                          : "—"}
                      </td>
                      <td className="px-2 py-1">
                        {(b.bruttoClient || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1">
                        {(b.commission || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1">
                        <Badge
                          className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                            statusColors[code] || "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {t(`statuses.${code}`)}
                        </Badge>
                      </td>
                      <td className="px-2 py-1">
                        <button
                          title={t("comment")}
                          className="text-xl hover:scale-110 transition"
                          onClick={() =>
                            router.push(`/olimpya/${b.id}`)
                          }
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
                  <td colSpan={6} className="py-2 text-right">
                    {t("total")}:
                  </td>
                  <td className="py-2">{totalBr.toFixed(2)} €</td>
                  <td className="py-2">{totalCm.toFixed(2)} €</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}