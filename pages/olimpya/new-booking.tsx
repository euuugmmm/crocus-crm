"use client";

import { useEffect, useState } from "react";
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
import BookingForm from "@/components/BookingFormOlimpya";
import OlimpyaLayout from "@/components/layouts/OlimpyaLayout";

import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: { ...(await serverSideTranslations(locale, ["common"])) },
  };
}

export default function NewBooking() {
  const router = useRouter();
  const { user, userData, loading, isOlimpya } = useAuth();
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
    if (!isOlimpya) {
      router.replace("/olimpya/bookings"); // ← фикс опечатки
      return;
    }
    generateBookingNumber();

    return () => {
      active = false;
    };
  }, [user, loading, isOlimpya, router]);

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
    internalNet = 0,
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
    const { agent, bankFee } = calcCommission({
      operator: form.operator,
      bruttoClient: form.bruttoClient,
      internalNet: form.internalNet,        // ← фикс: было form.nettoOperator
      bruttoOperator: form.bruttoOperator,
      paymentMethod: form.paymentMethod,
    });

    await setDoc(
      doc(db, "bookings", bookingNumber),
      {
        bookingNumber,
        ...form,
        bookingType: "olimpya_base",
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

    router.push("/olimpya/bookings");
  }

  if (loading || !bookingNumber) {
    return <p className="text-center mt-4">…</p>;
  }

  return (
    <OlimpyaLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">{t("newBookingHeader")}</h1>
        <BookingForm
          onSubmit={handleCreate}
          bookingNumber={bookingNumber}
          agentName={userData?.agentName ?? ""}
          agentAgency={userData?.agencyName ?? ""}
        />
      </div>
    </OlimpyaLayout>
  );
}