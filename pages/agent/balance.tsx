// pages/agent/balance.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Head from "next/head";
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
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import AgentLayout from "@/components/layouts/AgentLayout";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

type Row =
  | {
      type: "commission";
      id: string;
      date: Date;
      amount: number;
      bookingNumber?: string;
    }
  | {
      type: "payout";
      id: string;
      date: Date;
      amount: number;            // к перечислению (факт)
      bookingNumbers: string[];  // номера броней, если есть
      annexLink?: string;
      comment?: string;
    };

export default function AgentBalancePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation("common");

  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);

      const [bal, comms, pays] = await Promise.all([
        getAgentBalance(user.uid),
        getAgentCommissions(user.uid),
        getAgentPayouts(user.uid),
      ]);

      // доступно к выплате = начисленные комиссии - выплаченные суммы (факт)
      const sumComms = comms.reduce((s: number, c: any) => s + (c.commission || 0), 0);
      const sumPays  = pays.reduce((s: number, p: any) => s + (p.amount || 0), 0);
      setAvailable(sumComms - sumPays);

      const ops: Row[] = [
        ...comms.map((c: any) => ({
          type: "commission" as const,
          id: c.id!,
          date: c.createdAt?.toDate?.() ?? new Date(0),
          amount: c.commission,
          bookingNumber: c.bookingNumber,
        })),
        ...pays.map((p: any) => ({
          type: "payout" as const,
          id: p.id!,
          date: p.createdAt?.toDate?.() ?? new Date(0),
          amount: p.amount,                         // именно факт
          bookingNumbers: Array.isArray(p.bookings) ? p.bookings : [],
          annexLink: p.annexLink,
          comment: p.comment,
        })),
      ]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 5);

      setRows(ops);
      setLoading(false);
    })();
  }, [user?.uid]);

  if (loading) {
    return (
      <AgentLayout>
        <div className="max-w-4xl mx-auto mt-10 space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      </AgentLayout>
    );
  }

  return (
    <AgentLayout>
      <Head>
        <title>{t("balanceAvailable")} — CrocusCRM</title>
      </Head>

      <Card className="max-w-4xl mx-auto mt-8">
        <CardContent className="p-6 flex flex-col gap-6">
          {/* ДОСТУПНО К ВЫПЛАТЕ */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-1">{t("balanceAvailable")}</h2>
              <p className="text-3xl font-bold">{available.toFixed(2)} €</p>
            </div>
            <Link href="/agent/history">
              <Button variant="outline">{t("operationHistory")}</Button>
            </Link>
          </div>

          {/* ИСТОРИЯ ОПЕРАЦИЙ (последние 5) */}
          <h3 className="text-lg font-semibold">{t("recentOperations")}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-2 py-1 border">{t("date")}</th>
                  <th className="px-2 py-1 border">№</th>
                  <th className="px-2 py-1 border">{t("type")}</th>
                  <th className="px-2 py-1 border">{t("amount")}</th>
                  <th className="px-2 py-1 border">{t("comment")}</th>
                  <th className="px-2 py-1 border">Anexa</th>
                  <th className="px-2 py-1 border">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1 border">
                      {format(r.date, "dd.MM.yyyy")}
                    </td>
                    <td className="px-2 py-1 border">
                      {r.type === "commission"
                        ? r.bookingNumber ?? "—"
                        : r.bookingNumbers?.length
                        ? r.bookingNumbers.join(", ")
                        : "—"}
                    </td>
                    <td className="px-2 py-1 border">
                      {r.type === "commission" ? t("commission") : t("payout")}
                    </td>
                    <td className="px-2 py-1 border">{r.amount.toFixed(2)}</td>
                    <td className="px-2 py-1 border">
                      {"comment" in r && r.type === "payout" ? (r.comment || "—") : "—"}
                    </td>
                    <td className="px-2 py-1 border">
                      {r.type === "payout" && (r as any).annexLink ? (
                        <a
                          href={(r as any).annexLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          Link
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1 border">
                      {r.type === "commission" ? (
                        <Badge className="bg-yellow-200 text-yellow-700">
                          {t("credited")}
                        </Badge>
                      ) : (
                        <Badge className="bg-green-200 text-green-700">
                          {t("paidOut")}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">
                      {t("noOperations")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </AgentLayout>
  );
}