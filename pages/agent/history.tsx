// pages/agent/history.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { getAgentCommissions, getAgentPayouts } from "@/lib/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

// helper to map status → label/variant using i18n
const buildStatusMap = (t: (k: string) => string) => ({
  pending:   { label: t("pending"),   variant: "default" },
  confirmed: { label: t("confirmed"), variant: "secondary" },
  cancelled: { label: t("cancelled"), variant: "destructive" },
});

export default function AgentHistoryPage() {
  const { t } = useTranslation("common");
  const { user, logout } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"comm" | "pay">("comm");
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);
      const [c, p] = await Promise.all([
        getAgentCommissions(user.uid),
        getAgentPayouts(user.uid),
      ]);
      setCommissions(c.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setPayouts(p.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoading(false);
    })();
  }, [user?.uid]);

  const nav = [
    { href: "/agent/bookings", label: t("navBookings") },
    { href: "/agent/balance", label: t("navBalance") },
    { href: "/agent/history", label: t("navHistory") },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  const statusLabel = buildStatusMap(t);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto mt-8 space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <>
      <LanguageSwitcher />
      {/* ---------- header ---------- */}
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

      {/* ---------- content ---------- */}
      <Card className="max-w-5xl mx-auto mt-8">
        <CardContent className="p-6">
          <h1 className="text-2xl font-bold mb-4">{t("operationHistory")}</h1>

          <Tabs defaultValue="comm" value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="comm">{t("commission")}</TabsTrigger>
              <TabsTrigger value="pay">{t("payout")}</TabsTrigger>
            </TabsList>

            {/* ---------- COMMISSIONS ---------- */}
            <TabsContent value="comm">
              <table className="min-w-full text-sm border">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-2 py-1 border">{t("date")}</th>
                    <th className="px-2 py-1 border">{t("bookingNumber")}</th>
                    <th className="px-2 py-1 border">{t("amount")}</th>
                    <th className="px-2 py-1 border">{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-2 py-1 border">
                        {c.createdAt?.toDate ? format(c.createdAt.toDate(), "dd.MM.yyyy") : "—"}
                      </td>
                      <td className="px-2 py-1 border">{c.bookingNumber || c.bookingId || "—"}</td>
                      <td className="px-2 py-1 border">
                        {typeof c.commission === "number" ? c.commission.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1 border">
                        <Badge variant={statusLabel[c.status]?.variant || "outline"}>
                          {statusLabel[c.status]?.label || t("unknown")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {commissions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        {t("noCommissions")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TabsContent>

            {/* ---------- PAYOUTS ---------- */}
            <TabsContent value="pay">
              <table className="min-w-full text-sm border">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-2 py-1 border">{t("date")}</th>
                    <th className="px-2 py-1 border">{t("amount")}</th>
                    <th className="px-2 py-1 border">{t("comment")}</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-2 py-1 border">
                        {p.createdAt?.toDate ? format(p.createdAt.toDate(), "dd.MM.yyyy") : "—"}
                      </td>
                      <td className="px-2 py-1 border">
                        {typeof p.amount === "number" ? p.amount.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1 border">{p.comment || "—"}</td>
                    </tr>
                  ))}
                  {payouts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted-foreground">
                        {t("noPayouts")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
