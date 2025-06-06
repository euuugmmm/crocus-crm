// pages/agent/new-booking.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  doc,
  setDoc,
  Timestamp,
  runTransaction,
  increment,
} from "firebase/firestore";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import BookingForm from "@/components/BookingFormAgent";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: { ...(await serverSideTranslations(locale, ["common"])) },
  };
}

export default function NewBooking() {
  const router = useRouter();
  const { user, userData, loading, isAgent, logout } = useAuth();
  const { t } = useTranslation("common");
  const [bookingNumber, setBookingNumber] = useState<string>("");

  useEffect(() => {
    let active = true;
    if (!active) return;

    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isAgent) {
      router.replace("/manager/bookings");
      return;
    }
    generateBookingNumber();

    return () => {
      active = false;
    };
  }, [user, loading, isAgent, router]);

  async function generateBookingNumber() {
    const ref = doc(db, "counters", "bookingNumber");
    const next = await runTransaction(db, async (tr) => {
      const snap = await tr.get(ref);
      const cur = snap.data()?.value ?? 1000;
      tr.update(ref, { value: increment(1) });
      return cur + 1;
    });
    setBookingNumber(`CRT-${String(next * 7).padStart(5, "0")}`);
  }

  function calcCommission({
    operator,
    bruttoClient = 0,
    internalNet = 0,       // здесь попадёт form.nettoOperator
    bruttoOperator = 0,
    paymentMethod,
  }: {
    operator: string;
    bruttoClient: number;
    internalNet: number;
    bruttoOperator: number;
    paymentMethod: string;
  }) {
    const share = paymentMethod === "iban" ? 0.85 : 0.8;
    const bankFee = paymentMethod === "card" ? bruttoClient * 0.015 : 0;
    let commission = 0;

    if (["TOCO TOUR RO", "TOCO TOUR MD"].includes(operator)) {
      commission = (bruttoClient - internalNet) * share;
    } else {
      const markup = Math.max(0, bruttoClient - bruttoOperator);
      commission = bruttoOperator * 0.03 + markup * share;
    }

    return { agent: +commission.toFixed(2), bankFee: +bankFee.toFixed(2) };
  }

  async function handleCreate(form: any) {
    // передаём internalNet = form.nettoOperator
    const { agent, bankFee } = calcCommission({
      operator: form.operator,
      bruttoClient: form.bruttoClient,
      internalNet: form.nettoOperator,
      bruttoOperator: form.bruttoOperator,
      paymentMethod: form.paymentMethod,
    });

    // создаём документ сразу с commissionPaid: false
    await setDoc(
      doc(db, "bookings", bookingNumber),
      {
        bookingNumber,
        ...form,
        commission: agent,
        bankFee,
        agentId: user!.uid,
        agentName: userData?.agentName ?? "",
        agentAgency: userData?.agencyName ?? "",
        status: "new",
        createdAt: Timestamp.now(),

      },
      { merge: true }
    );

    // уведомляем через Telegram
    await fetch("/api/telegram/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: user!.uid,
        managers: true,
        type: "newBooking",
        data: {
          bookingNumber,
          hotel: form.hotel || "—",
          operator: form.operator || "—",
          agentName: userData?.agentName ?? "",
          agentAgency: userData?.agencyName ?? "",
        },
      }),
    }).catch(console.error);

    router.push("/agent/bookings");
  }

  if (loading || !bookingNumber) {
    return <p className="text-center mt-4">…</p>;
  }

  const nav = [
    { href: "/agent/bookings", label: t("navBookings") },
    { href: "/agent/balance", label: t("navBalance") },
    { href: "/agent/history", label: t("navHistory") },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  return (
    <>
      <LanguageSwitcher />
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">{t("brand")}</span>
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
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">{t("newBookingHeader")}</h1>
        <BookingForm
          onSubmit={handleCreate}
          bookingNumber={bookingNumber}
          agentName={userData?.agentName ?? ""}
          agentAgency={userData?.agencyName ?? ""}
        />
      </div>
    </>
  );
}
