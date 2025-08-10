"use client";

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { format } from "date-fns";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import { getAgentCommissions, getAgentPayouts } from "@/lib/finance";
import AgentLayout from "@/components/layouts/AgentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/firebaseConfig";
import { doc as fdoc, getDoc } from "firebase/firestore";
import { AGENT_WITHHOLD_PCT } from "@/lib/constants/fees"; // напр., 0.12
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import ProgressBar from "@/components/Progress";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

type BookingRow = {
  id: string;
  createdAt?: any;
  bookingNumber?: string;
  hotel?: string;
  checkIn?: string;
  checkOut?: string;
  commission?: number; // начислено брутто
  commissionPaidGrossAmount?: number; // уже выплачено (брутто, по брони)
  commissionPaidNetAmount?: number;   // уже выплачено (нетто, по брони)
};

type PayoutRow = {
  id: string;
  createdAt?: any;
  date: Date;
  amount: number;     // факт (к перечислению) = totalNet - transferFee
  comment?: string;
  annexLink?: string;
  withholdPct?: number;
  totalGross?: number;
  totalNet?: number;
  transferFee?: number;
  items?: Array<{ bookingId: string; amountGross?: number; amountNet?: number; closeFully?: boolean }>;
  bookings?: string[];
};

type BookingAgg = {
  grossTotal: number;          // всего начислено (брутто)
  paidGrossViaBookings: number;// выплачено по полю брони (брутто)
  paidNetViaBookings: number;  // выплачено по полю брони (нетто)
  paidGrossViaPayouts: number; // выплачено по выплатам (брутто по позициям)
  paidNetCredited: number;     // зачислено (нетто по позициям)
  allocatedFees: number;       // распределённая комиссия перевода (из выплат)
  netReceived: number;         // фактически получено (нетто - доля fee)
};

const num = (v: any, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export default function AgentHistoryPage() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [expandedPayout, setExpandedPayout] = useState<Record<string, boolean>>({});
  const [payoutDetails, setPayoutDetails] = useState<Record<string, { rows: any[] }>>({});
  const [openByBooking, setOpenByBooking] = useState<Record<string, boolean>>({});
  const toggleBookingOpen = (id: string) =>
  
    setOpenByBooking(s => ({ ...s, [id]: !s[id] }));
  const pct = AGENT_WITHHOLD_PCT ?? 0.12;
  const toNet = (g: number, p = pct) => r2(Math.max(0, g * (1 - p)));

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);

      // 1) Брони-начисления агента (обычно finished)
      const comms: any[] = await getAgentCommissions(user.uid);
      const commRows: BookingRow[] = comms
        .map((c: any) => ({
          id: c.id!,
          createdAt: c.createdAt,
          bookingNumber: c.bookingNumber,
          hotel: c.hotel,
          checkIn: c.checkIn,
          checkOut: c.checkOut,
          commission: num(c.commission, 0),
          commissionPaidGrossAmount: num(c.commissionPaidGrossAmount, 0),
          commissionPaidNetAmount: num(c.commissionPaidNetAmount ?? c.commissionPaidAmount, 0),
        }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setBookings(commRows);

      // 2) Выплаты агента
      const paysRaw: any[] = await getAgentPayouts(user.uid);
      const pays: PayoutRow[] = paysRaw
        .map((p) => ({
          id: p.id!,
          createdAt: p.createdAt,
          date: p.createdAt?.toDate?.() ?? new Date(0),
          amount: num(p.amount, 0),
          comment: p.comment,
          annexLink: p.annexLink,
          withholdPct: num(p.withholdPct, pct),
          totalGross: num(p.totalGross, 0),
          totalNet: num(p.totalNet, 0),
          transferFee: num(p.transferFee, 0),
          items: Array.isArray(p.items) ? p.items : undefined,
          bookings: Array.isArray(p.bookings) ? p.bookings : undefined,
        }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());
      setPayouts(pays);

      setLoading(false);
    })();
  }, [user?.uid]);

  // агрегируем «сколько реально зачислено/выплачено» по бронированиям из выплат
  const byBookingFromPayouts = useMemo<Record<string, BookingAgg>>(() => {
    const agg: Record<string, BookingAgg> = {};
    const ensure = (id: string) =>
      (agg[id] ||= {
        grossTotal: 0,
        paidGrossViaBookings: 0,
        paidNetViaBookings: 0,
        paidGrossViaPayouts: 0,
        paidNetCredited: 0,
        allocatedFees: 0,
        netReceived: 0,
      });

    // init gross from bookings
    for (const b of bookings) {
      const a = ensure(b.id);
      a.grossTotal += num(b.commission, 0);
      a.paidGrossViaBookings += num(b.commissionPaidGrossAmount, 0);
      a.paidNetViaBookings += num(b.commissionPaidNetAmount, 0);
    }

    // iterate payouts with items and distribute transferFee
    for (const p of payouts) {
      const pPct = num(p.withholdPct, pct);
      const totalNet = num(p.totalNet, 0) || 0;

      if (!p.items || !p.items.length) continue;

      for (const it of p.items) {
        const bid = String(it.bookingId);
        const a = ensure(bid);

        const gross = r2(num(it.amountGross, 0)); // позиция БРУТТО
        // если в документе уже есть amountNet — доверяем ему; иначе считаем по pPct
        const net = r2(
          num(it.amountNet, Number.isFinite(pPct) ? toNet(gross, pPct) : toNet(gross, pct))
        );

        // доля комиссии перевода по нетто
        const feeShare =
          totalNet > 0 ? r2(num(p.transferFee, 0) * (net / totalNet)) : 0;

        a.paidGrossViaPayouts += gross;
        a.paidNetCredited += net;
        a.allocatedFees += feeShare;
        a.netReceived += r2(net - feeShare);
      }
    }

    return agg;
  }, [bookings, payouts, pct]);

  // сводные итоги по всем броням
  const totals = useMemo(() => {
    let gross = 0;
    let paidGrossB = 0;
    let paidNetB = 0;
    let paidGrossP = 0;
    let netCredited = 0;
    let fees = 0;
    let netReceived = 0;

    for (const b of bookings) {
      const a = byBookingFromPayouts[b.id] || ({} as BookingAgg);
      gross += num(b.commission, 0);
      paidGrossB += num(b.commissionPaidGrossAmount, 0);
      paidNetB += num(b.commissionPaidNetAmount, 0);
      paidGrossP += num(a.paidGrossViaPayouts, 0);
      netCredited += num(a.paidNetCredited, 0);
      fees += num(a.allocatedFees, 0);
      netReceived += num(a.netReceived, 0);
    }

    const remainingGross = Math.max(0, gross - Math.max(paidGrossB, paidGrossP));
    const estRemainingNet = toNet(remainingGross); // оценка без учёта будущей комиссии перевода

    return {
      gross: r2(gross),
      taxOnGross: r2(gross * pct),
      paidGross: r2(Math.max(paidGrossB, paidGrossP)), // ориентируемся на фактические выплаты
      netCredited: r2(netCredited),
      fees: r2(fees),
      netReceived: r2(netReceived),
      remainingGross: r2(remainingGross),
      estRemainingNet: r2(estRemainingNet),
    };
  }, [bookings, byBookingFromPayouts, pct]);

  // загрузка деталей выплат (метаданные броней) при разворачивании
  const togglePayout = async (p: PayoutRow) => {
    const opened = !!expandedPayout[p.id];
    setExpandedPayout((m) => ({ ...m, [p.id]: !opened }));
    if (opened || payoutDetails[p.id] || !p.items?.length) return;

    const ids = p.items.map((i) => i.bookingId).filter(Boolean) as string[];
    const snaps = await Promise.all(ids.map((id) => getDoc(fdoc(db, "bookings", id))));
    const meta: Record<string, any> = {};
    snaps.forEach((s) => {
      if (!s.exists()) return;
      const b = s.data() as any;
      meta[s.id] = {
        bookingNumber: b.bookingNumber || s.id,
        hotel: b.hotel || "—",
        checkIn: b.checkIn || "—",
        checkOut: b.checkOut || "—",
      };
    });

    const rows = (p.items || []).map((it) => {
      const m = meta[it.bookingId] || {};
      return {
        bookingId: it.bookingId,
        bookingNumber: m.bookingNumber || it.bookingId,
        hotel: m.hotel || "—",
        checkIn: m.checkIn || "—",
        checkOut: m.checkOut || "—",
        amountGross: r2(num(it.amountGross, 0)),
        amountNet: r2(num(it.amountNet, toNet(num(it.amountGross, 0), num(p.withholdPct, pct)))),
        closeFully: !!it.closeFully,
      };
    });

    setPayoutDetails((d) => ({ ...d, [p.id]: { rows } }));
  };

  if (loading) {
    return (
      <AgentLayout>
        <div className="max-w-5xl mx-auto mt-8 space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </AgentLayout>
    );
  }

  return (
    <AgentLayout>
      <Head>
        <title>{t("operationHistory", "История операций")} — CrocusCRM</title>
      </Head>

      <div className="max-w-6xl mx-auto mt-8 space-y-8">
        {/* ======= Блок 1. Брони и начисления (прозрачная разбивка) ======= */}
        <Card>
          <CardContent className="p-6 space-y-5">
            <h1 className="text-2xl font-bold">
              {t("bookingsAndAccruals", "Брони и начисления")}
            </h1>

            {/* Сводка по всем броням */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-neutral-500">{t("totalCommission", "Всего начислено (брутто)")}</div>
                <div className="text-xl font-semibold">{totals.gross.toFixed(2)} €</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-neutral-500">
                  {t("taxReserve", "Налог (удержание")} {Math.round(pct * 100)}%)
                </div>
                <div className="text-xl font-semibold">{totals.taxOnGross.toFixed(2)} €</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-neutral-500">{t("netReceived", "Получено на счёт")}</div>
                <div className="text-xl font-semibold">{totals.netReceived.toFixed(2)} €</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-neutral-500">
                  {t("leftToPay", "Осталось (оценка нетто)")}
                </div>
                <div className="text-xl font-semibold">{totals.estRemainingNet.toFixed(2)} €</div>
              </div>
            </div>

            {/* Таблица по заявкам: начислено/налог/прочие вычеты/выплачено/остаток */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-2 py-1 border">{t("date", "Дата")}</th>
                    <th className="px-2 py-1 border">{t("bookingNumber", "№ заявки")}</th>
                    <th className="px-2 py-1 border">{t("hotel", "Отель")}</th>
                    <th className="px-2 py-1 border">{t("checkIn", "Check-in")}</th>
                    <th className="px-2 py-1 border">{t("checkOut", "Check-out")}</th>
                    <th className="px-2 py-1 border text-right">{t("commission", "Комиссия")} (gross)</th>
                    <th className="px-2 py-1 border text-right">{t("tax", "Налог")}</th>
                    <th className="px-2 py-1 border text-right">{t("otherFees", "Прочие вычеты")}</th>
                    <th className="px-2 py-1 border text-right">{t("credited", "Зачислено (net)")}</th>
                    <th className="px-2 py-1 border text-right">{t("received", "Получено")}</th>
                    <th className="px-2 py-1 border text-right">{t("remaining", "Остаток (gross)")}</th>
                    <th className="px-2 py-1 border">{t("status", "Статус")}</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const dt = b.createdAt?.toDate ? b.createdAt.toDate() : null;
                    const a = byBookingFromPayouts[b.id] || ({} as BookingAgg);

                    const gross = r2(num(b.commission, 0));
                    const taxOnGross = r2(gross * pct);

                    // что уже выплачено (ориентируемся на выплаты)
                    const paidGross = r2(Math.max(num(b.commissionPaidGrossAmount, 0), num(a.paidGrossViaPayouts, 0)));
                    const credited = r2(Math.max(num(b.commissionPaidNetAmount, 0), num(a.paidNetCredited, 0)));
                    const fees = r2(num(a.allocatedFees, 0));
                    const received = r2(Math.max(0, num(a.netReceived, 0)));
                    const remainingGross = r2(Math.max(0, gross - paidGross));

                    const status =
                      remainingGross <= 0
                        ? t("closed", "Закрыто")
                        : paidGross > 0
                        ? t("partial", "Частично")
                        : t("pending", "В ожидании");

                    return (
                      <tr key={b.id} className="border-t">
                        <td className="px-2 py-1 border">{dt ? format(dt, "dd.MM.yyyy") : "—"}</td>
                        <td className="px-2 py-1 border">{b.bookingNumber || "—"}</td>
                        <td className="px-2 py-1 border">{b.hotel || "—"}</td>
                        <td className="px-2 py-1 border">{b.checkIn || "—"}</td>
                        <td className="px-2 py-1 border">{b.checkOut || "—"}</td>
                        <td className="px-2 py-1 border text-right">{gross.toFixed(2)}</td>
                        <td className="px-2 py-1 border text-right">{taxOnGross.toFixed(2)}</td>
                        <td className="px-2 py-1 border text-right">{fees.toFixed(2)}</td>
                        <td className="px-2 py-1 border text-right">{credited.toFixed(2)}</td>
                        <td className="px-2 py-1 border text-right">{received.toFixed(2)}</td>
                        <td className="px-2 py-1 border text-right">{remainingGross.toFixed(2)}</td>
                        <td className="px-2 py-1 border">
                          <Badge
                            className={
                              remainingGross <= 0
                                ? "bg-green-200 text-green-700"
                                : paidGross > 0
                                ? "bg-blue-200 text-blue-700"
                                : "bg-yellow-200 text-yellow-700"
                            }
                          >
                            {status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {bookings.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-6 text-center text-muted-foreground">
                        {t("noCommissions", "Комиссий пока нет")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-neutral-500">
              {t(
                "hintApproxNet",
                "Примечание: 'Осталось (оценка нетто)' считается без учёта будущей комиссии перевода банка."
              )}
            </p>
          </CardContent>
        </Card>

        {/* ======= Блок 2. Выплаты (каждая отдельной карточкой, с деталями) ======= */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xl font-bold">{t("payouts", "Выплаты")}</h2>

            {payouts.length === 0 && (
              <div className="text-sm text-neutral-600">{t("noPayouts", "Выплат пока нет")}</div>
            )}

            {payouts.map((p) => {
              const open = !!expandedPayout[p.id];
              const det = payoutDetails[p.id];

              return (
                <div key={p.id} className="border rounded-lg p-4 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="space-y-1">
                      <div className="text-sm text-neutral-500">
                        {t("date", "Дата")}: {format(p.date, "dd.MM.yyyy")}
                      </div>
                      <div className="text-lg font-semibold">
                        {t("amount", "К перечислению")}: {p.amount.toFixed(2)} €
                      </div>
                      <div className="text-sm">
                        {t("comment", "Комментарий")}: {p.comment || "—"}
                      </div>
                      <div className="text-sm">
                        {t("annex", "Анекса")}:{" "}
                        {p.annexLink ? (
                          <a
                            href={p.annexLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:underline"
                          >
                            Link
                          </a>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {t("gross", "Брутто")}: {r2(num(p.totalGross, 0)).toFixed(2)} € ·{" "}
                        {t("net", "Нетто")}: {r2(num(p.totalNet, 0)).toFixed(2)} € ·{" "}
                        {t("bankFee", "Комиссия перевода")}: {r2(num(p.transferFee, 0)).toFixed(2)} €
                      </div>
                    </div>

                    {p.items?.length ? (
                      <button
                        className="self-start sm:self-auto underline text-sky-600"
                        onClick={() => togglePayout(p)}
                      >
                        {open ? t("hide", "Скрыть детали") : t("details", "Детали")}
                      </button>
                    ) : null}
                  </div>

                  {open && p.items?.length ? (
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-xs border">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-1 border">{t("bookingNumber", "№ заявки")}</th>
                            <th className="px-2 py-1 border">{t("hotel", "Отель")}</th>
                            <th className="px-2 py-1 border">{t("checkIn", "Check-in")}</th>
                            <th className="px-2 py-1 border">{t("checkOut", "Check-out")}</th>
                            <th className="px-2 py-1 border text-right">{t("gross", "Брутто")}, €</th>
                            <th className="px-2 py-1 border text-right">{t("net", "Нетто")}, €</th>
                            <th className="px-2 py-1 border">{t("status", "Статус")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {det?.rows?.map((it) => (
                            <tr key={it.bookingId} className="border-t">
                              <td className="px-2 py-1 border">{it.bookingNumber || it.bookingId}</td>
                              <td className="px-2 py-1 border">{it.hotel || "—"}</td>
                              <td className="px-2 py-1 border">{it.checkIn || "—"}</td>
                              <td className="px-2 py-1 border">{it.checkOut || "—"}</td>
                              <td className="px-2 py-1 border text-right">
                                {typeof it.amountGross === "number" ? it.amountGross.toFixed(2) : "—"}
                              </td>
                              <td className="px-2 py-1 border text-right">
                                {typeof it.amountNet === "number" ? it.amountNet.toFixed(2) : "—"}
                              </td>
                              <td className="px-2 py-1 border">
                                <Badge className={it.closeFully ? "bg-green-200 text-green-700" : "bg-blue-200 text-blue-700"}>
                                  {it.closeFully ? t("closed", "Закрыто") : t("partial", "Частично")}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AgentLayout>
  );
}