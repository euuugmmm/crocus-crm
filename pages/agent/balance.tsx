"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import {
  getAgentBalance,
  getAgentCommissions,
  getAgentPayouts,
} from "@/lib/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "next-i18next";

import LanguageSwitcher from "@/components/LanguageSwitcher";

import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

type Row =
  | { type: "commission"; id: string; date: Date; amount: number; status: string; bookingNumber?: string }
  | { type: "payout"; id: string; date: Date; amount: number };

export default function AgentBalancePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { t } = useTranslation("common");
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [pendingSum, setPendingSum] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    async function load() {
      setLoading(true);
      const [bal, comms, payouts] = await Promise.all([
        getAgentBalance(user.uid),
        getAgentCommissions(user.uid),
        getAgentPayouts(user.uid),
      ]);

      setBalance(bal);

      setPendingSum(0);

      const ops: Row[] = [
        ...comms.map((c) => ({
          type: "commission" as const,
          id: c.id!,
          date: c.createdAt?.toDate?.() || new Date(0),
          amount: typeof c.commission === "number" ? c.commission : 0,
          status: "confirmed",
          bookingNumber: c.bookingNumber || "",
        })),
        ...payouts.map((p) => ({
          type: "payout" as const,
          id: p.id!,
          date: p.createdAt?.toDate?.() || new Date(0),
          amount: typeof p.amount === "number" ? p.amount : 0,
        })),
      ]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 5);

      setRows(ops);
      setLoading(false);
    }
    load();
  }, [user?.uid]);

  const nav = [
    { href: "/agent/bookings", label: t("navBookings") },
    { href: "/agent/balance", label: t("navBalance") },
    { href: "/agent/history", label: t("navHistory") },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  const opLabel: Record<Row["type"], string> = {
    commission: t("commission"),
    payout: t("payout"),
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto mt-10 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  return (
    <>
      <LanguageSwitcher />
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

      <Card className="max-w-4xl mx-auto mt-8">
        <CardContent className="p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-1">{t("balanceAvailable")}</h2>
              <p className="text-3xl font-bold">{balance.toFixed(2)} €</p>
            </div>
            {pendingSum > 0 && (
              <div>
                <p className="text-sm text-muted-foreground">{t("pending")}</p>
                <p className="text-lg">{pendingSum.toFixed(2)} €</p>
              </div>
            )}
          </div>

          <h3 className="text-lg font-semibold">{t("recentOperations")}</h3>
          <table className="min-w-full text-sm border">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-2 py-1 border">{t("date")}</th>
                <th className="px-2 py-1 border">{t("bookingNumber")}</th>
                <th className="px-2 py-1 border">{t("type")}</th>
                <th className="px-2 py-1 border">{t("amount")}</th>
                <th className="px-2 py-1 border">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1 border">{format(r.date, "dd.MM.yyyy")}</td>
                  <td className="px-2 py-1 border">
                    {"bookingNumber" in r && r.bookingNumber ? r.bookingNumber : "—"}
                  </td>
                  <td className="px-2 py-1 border">{opLabel[r.type]}</td>
                  <td className="px-2 py-1 border">{r.amount.toFixed(2)}</td>
                  <td className="px-2 py-1 border">
                    {r.type === "commission" ? (
                      <Badge className="bg-yellow-200 text-yellow-700">{t("credited")}</Badge>
                    ) : (
                      <Badge className="bg-green-200 text-green-700">{t("paidOut")}</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                    {t("noOperations")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
