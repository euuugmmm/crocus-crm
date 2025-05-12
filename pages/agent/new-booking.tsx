/* pages/agent/new-booking.tsx
   ─────────────────────────────────────────────────────────── */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  collection,
  addDoc,
  Timestamp,
  runTransaction,
  doc,
  increment,
} from "firebase/firestore";

import { db }            from "@/firebaseConfig";
import { useAuth }       from "@/context/AuthContext";
import BookingForm       from "@/components/BookingFormAgent";
import { Button }        from "@/components/ui/button";
import LanguageSwitcher  from "@/components/LanguageSwitcher";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

/* ─────────────────────────────────────────────────────────── */
export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}
/* ─────────────────────────────────────────────────────────── */

export default function NewBooking() {
  const router = useRouter();
  const { user, userData, loading, isAgent, logout } = useAuth();
  const { t } = useTranslation("common");

  const [bookingNumber, setBookingNumber] = useState<string>("");

  /* guards */
  useEffect(() => {
    if (loading) return;
    if (!user)            { router.replace("/login"); return; }
    if (!isAgent)         { router.replace("/manager/bookings"); return; }
    generateBookingNumber();
  }, [user, loading, isAgent]);

  /* номер */
  async function generateBookingNumber() {
    const ref = doc(db, "counters", "bookingNumber");
    const next = await runTransaction(db, async (tr) => {
      const snap = await tr.get(ref);
      const cur  = snap.data()?.value ?? 1000;
      tr.update(ref, { value: increment(1) });
      return cur + 1;
    });
    setBookingNumber(`CRT-${String(next * 7).padStart(5, "0")}`);
  }

  /* комиссия */
  function calcCommission({
    operator, bruttoClient, internalNet,
    bruttoOperator, paymentMethod,
  }: any) {
    const share   = paymentMethod === "iban" ? 0.85 : 0.8;
    const bankFee = paymentMethod === "card" ? bruttoClient * 0.015 : 0;

    let commission = 0;
    if (["TOCO TOUR RO","TOCO TOUR MD"].includes(operator)) {
      commission = (bruttoClient - internalNet) * share;
    } else {
      const markup = Math.max(0, bruttoClient - bruttoOperator);
      commission = bruttoOperator * 0.03 + markup * share;
    }
    return { agent: +commission.toFixed(2), bankFee: +bankFee.toFixed(2) };
  }

  /* create */
  async function handleCreate(formData: any) {
    const { agent, bankFee } = calcCommission(formData);

    const bookingData = {
      bookingNumber,
      ...formData,
      commission : agent,
      bankFee,
      agentId    : user!.uid,
      agentName  : userData?.agentName  ?? userData?.name  ?? "",
      agentAgency: userData?.agencyName ?? userData?.agency ?? "",
      status     : "new",
      createdAt  : Timestamp.now(),
    };

    await addDoc(collection(db, "bookings"), bookingData);
    router.push("/agent/bookings");
  }

  /* nav */
  const nav = [
    { href: "/agent/bookings", label: t("navBookings") },
    { href: "/agent/balance",  label: t("navBalance")  },
    { href: "/agent/history",  label: t("navHistory")  },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  if (loading) return <p className="text-center mt-4">...</p>;

  /* render */
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
          isManager={false}
          agentName={userData?.agentName  ?? ""}
          agentAgency={userData?.agencyName ?? ""}
          bookingNumber={bookingNumber}
        />
      </div>
    </>
  );
}
