// pages/agent/history.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { getAgentCommissions, getAgentPayouts } from "@/lib/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function AgentHistoryPage() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
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

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto mt-8 space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <AgentLayout>
      <Card className="max-w-5xl mx-auto mt-8">
        <CardContent className="p-6">
          <h1 className="text-2xl font-bold mb-4">{t("operationHistory")}</h1>

          <Tabs defaultValue="comm" value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="comm">{t("commission")}</TabsTrigger>
              <TabsTrigger value="pay">{t("payout")}</TabsTrigger>
            </TabsList>

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
                  {commissions.map((c) => {
                    const paid = Boolean(c.commissionPaid);
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="px-2 py-1 border">
                          {c.createdAt?.toDate ? format(c.createdAt.toDate(), "dd.MM.yyyy") : "—"}
                        </td>
                        <td className="px-2 py-1 border">{c.bookingNumber || "—"}</td>
                        <td className="px-2 py-1 border">
                          {typeof c.commission === "number" ? c.commission.toFixed(2) : "—"}
                        </td>
                        <td className="px-2 py-1 border">
                          <Badge
                            className={
                              paid
                                ? "bg-green-200 text-green-700"
                                : "bg-yellow-200 text-yellow-700"
                            }
                          >
                            {paid ? t("confirmed") : t("pending")}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
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

            <TabsContent value="pay">
              <table className="min-w-full text-sm border">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-2 py-1 border">{t("date")}</th>
                    <th className="px-2 py-1 border">{t("amount")}</th>
                    <th className="px-2 py-1 border">{t("comment")}</th>
                    <th className="px-2 py-1 border">{t("status")}</th>
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
                      <td className="px-2 py-1 border">
                        <Badge className="bg-green-200 text-green-700">{t("paidOut")}</Badge>
                      </td>
                    </tr>
                  ))}
                  {payouts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
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
    </AgentLayout>
  );
}