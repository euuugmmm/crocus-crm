// pages/agent/payout/[id].tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { format } from "date-fns";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import AgentLayout from "@/components/layouts/AgentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

type PayoutItem = {
  bookingId: string;
  amountGross: number;   // брутто по позиции
  amountNet?: number;    // может отсутствовать, посчитаем
  closeFully?: boolean;
};

type BookingMeta = {
  id?: string;           // делаем опциональным
  bookingNumber?: string;
  hotel?: string;
  checkIn?: string;
  checkOut?: string;
};

type PayoutDoc = {
  id: string;
  agentId: string;
  createdAt?: any;
  totalGross?: number;
  totalNet?: number;
  amount?: number;       // к перечислению (totalNet - transferFee)
  transferFee?: number;
  comment?: string;
  withholdPct?: number;
  annexLink?: string;
  items?: PayoutItem[];
  bookings?: string[];
};

export default function AgentPayoutDetailsPage() {
  const router = useRouter();
  const { t } = useTranslation("common");
  const { id } = router.query as { id?: string };

  const [loading, setLoading] = useState(true);
  const [payout, setPayout] = useState<PayoutDoc | null>(null);
  const [items, setItems] = useState<(PayoutItem & Partial<BookingMeta>)[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);

      const snap = await getDoc(doc(db, "payouts", id));
      if (!snap.exists()) {
        setPayout(null);
        setLoading(false);
        return;
      }
      const data = { id: snap.id, ...(snap.data() as any) } as PayoutDoc;
      setPayout(data);

      const baseItems: PayoutItem[] = Array.isArray(data.items)
        ? data.items
        : (data.bookings || []).map(bid => ({ bookingId: bid, amountGross: 0 }));

      const ids = Array.from(new Set(baseItems.map(i => i.bookingId)));
      const metaById: Record<string, BookingMeta> = {};

      await Promise.all(
        ids.map(async (bid) => {
          const bs = await getDoc(doc(db, "bookings", bid));
          if (bs.exists()) {
            const b = bs.data() as any;
            metaById[bid] = {
              id: bid,
              bookingNumber: b.bookingNumber || bid,
              hotel: b.hotel || "—",
              checkIn: b.checkIn || "—",
              checkOut: b.checkOut || "—",
            };
          } else {
            metaById[bid] = {
              id: bid,
              bookingNumber: bid,
              hotel: "—",
              checkIn: "—",
              checkOut: "—",
            };
          }
        })
      );

      setItems(
        baseItems.map(it => ({
          ...it,
          ...(metaById[it.bookingId] ?? {
            id: it.bookingId,
            bookingNumber: it.bookingId,
            hotel: "—",
            checkIn: "—",
            checkOut: "—",
          }),
        }))
      );

      setLoading(false);
    })();
  }, [id]);

  const pct = payout?.withholdPct ?? 0.12;
  const toNet = (g: number) => Math.max(0, Math.round(g * (1 - pct) * 100) / 100);

  const totals = useMemo(() => {
    const gross = Math.round(items.reduce((s, it) => s + (Number(it.amountGross) || 0), 0) * 100) / 100;
    const net   = typeof payout?.totalNet === "number" ? payout!.totalNet! : toNet(gross);
    const fee   = payout?.transferFee ?? 0;
    const fact  = typeof payout?.amount === "number" ? payout!.amount! : Math.max(0, net - fee);
    return { gross, net, fee, fact };
  }, [items, payout]);

  if (loading) {
    return (
      <AgentLayout>
        <div className="max-w-4xl mx-auto mt-10">{t("loading")}</div>
      </AgentLayout>
    );
  }

  if (!payout) {
    return (
      <AgentLayout>
        <div className="max-w-4xl mx-auto mt-10">{t("payoutNotFound")}</div>
      </AgentLayout>
    );
  }

  return (
    <AgentLayout>
      <Head>
        <title>{t("payoutDetails")} — CrocusCRM</title>
      </Head>

      <Card className="max-w-4xl mx-auto mt-8">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">
              {t("payoutFrom")}{" "}
              {payout.createdAt?.toDate ? format(payout.createdAt.toDate(), "dd.MM.yyyy") : "—"}
            </h1>
            <div className="text-sm text-neutral-600">
              {t("withhold")}: {Math.round(pct * 100)}%
            </div>
          </div>

          {/* Итоги */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-neutral-500">{t("totalGross")}</div>
              <div className="text-lg font-semibold">{(payout.totalGross ?? totals.gross).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-neutral-500">{t("totalNet")}</div>
              <div className="text-lg font-semibold">{(payout.totalNet ?? totals.net).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-neutral-500">{t("transferFee")}</div>
              <div className="text-lg font-semibold">{totals.fee.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-neutral-500">{t("toWire")}</div>
              <div className="text-lg font-semibold">{totals.fact.toFixed(2)}</div>
            </div>
          </div>

          {/* Комментарий и Anexa */}
          <div className="text-sm">
            <div className="mb-1 text-neutral-500">{t("comment")}</div>
            <div>{payout.comment || "—"}</div>
          </div>
          <div className="text-sm">
            <div className="mb-1 text-neutral-500">Anexa</div>
            {payout.annexLink ? (
              <a className="text-indigo-600 underline" href={payout.annexLink} target="_blank" rel="noreferrer">
                {t("download")}
              </a>
            ) : (
              "—"
            )}
          </div>

          {/* Позиции по броням */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 border">{t("bookingNo")}</th>
                  <th className="px-2 py-1 border">{t("hotel")}</th>
                  <th className="px-2 py-1 border">{t("checkIn")}</th>
                  <th className="px-2 py-1 border">{t("checkOut")}</th>
                  <th className="px-2 py-1 border text-right">{t("gross")}, €</th>
                  <th className="px-2 py-1 border text-right">{t("net")}, €</th>
                  <th className="px-2 py-1 border">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const g = Number(it.amountGross) || 0;
                  const n = typeof it.amountNet === "number" ? it.amountNet : toNet(g);
                  return (
                    <tr key={it.bookingId} className="border-t">
                      <td className="px-2 py-1 border">{it.bookingNumber || it.bookingId}</td>
                      <td className="px-2 py-1 border">{it.hotel || "—"}</td>
                      <td className="px-2 py-1 border">{it.checkIn || "—"}</td>
                      <td className="px-2 py-1 border">{it.checkOut || "—"}</td>
                      <td className="px-2 py-1 border text-right">{g.toFixed(2)}</td>
                      <td className="px-2 py-1 border text-right">{n.toFixed(2)}</td>
                      <td className="px-2 py-1 border">
                        {it.closeFully ? t("closed") : t("partial")}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                      {t("noPositions")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-neutral-500">
            {t("noteOnSums")}
          </div>

          <div className="pt-2">
            <Button variant="outline" onClick={() => router.back()}>{t("back")}</Button>
          </div>
        </CardContent>
      </Card>
    </AgentLayout>
  );
}