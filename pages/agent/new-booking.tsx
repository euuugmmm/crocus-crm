"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
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
import AgentLayout from "@/components/layouts/AgentLayout";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: { ...(await serverSideTranslations(locale, ["common"])) },
  };
}

export default function NewBooking() {
  const router = useRouter();
  const { user, userData, loading, isAgent } = useAuth();
  const { t } = useTranslation("common");
  const [bookingNumber, setBookingNumber] = useState<string>("");

  useEffect(() => {
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

  async function handleCreate(form: any) {
    await setDoc(
      doc(db, "bookings", bookingNumber),
      {
        bookingType: "subagent",
        bookingNumber,
        ...form,
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

    router.push("/agent/bookings");
  }

  if (loading || !bookingNumber) {
    return <p className="text-center mt-4">…</p>;
  }

  return (
    <AgentLayout>
      <Head>
        <title>{t("newBooking")} — CrocusCRM</title>
      </Head>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">{t("newBooking")}</h1>
        <BookingForm
          onSubmit={handleCreate}
          bookingNumber={bookingNumber}
          agentName={userData?.agentName ?? ""}
          agentAgency={userData?.agencyName ?? ""}
        />
      </div>
    </AgentLayout>
  );
}