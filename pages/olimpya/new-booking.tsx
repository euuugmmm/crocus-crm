// pages/olimpya/new-booking.tsx
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
import BookingFormOlimpya from "@/components/BookingFormOlimpya";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: { ...(await serverSideTranslations(locale, ["common"])) },
  };
}

export default function OlimpyNewBooking() {
  const router                     = useRouter();
  const { user, userData, loading,
          isOlimpya, logout }      = useAuth();
  const { t }                      = useTranslation("common");
  const [bookingNumber,setNumber]  = useState("");

  /* ───────── guards & counter ───────── */
  useEffect(() => {
    if (loading)               return;
    if (!user)                 { router.replace("/login"); return; }
    if (!isOlimpya)            { router.replace("/");      return; }
    genNumber();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading,user,isOlimpya]);

  async function genNumber() {
    const ref  = doc(db,"counters","bookingNumber");
    const next = await runTransaction(db, async tr => {
      const cur = (await tr.get(ref)).data()?.value ?? 1000;
      tr.update(ref,{ value: increment(1) });
      return cur+1;
    });
    setNumber(`OLP-${String(next).padStart(5,"0")}`);
  }

  /* ───────── первичный расчёт дохода ─────────
     для стартовой записи считаем ТОЛЬКО доход Olimpya:
       olimpya_profit = bruttoClient - bruttoOperator
       crocus_profit  = 0
     ai/ue profits будут выставлены менеджером после ввода
     реального nettoOperator.                                         */
  function calcInitOlimpyaProfit(bruttoClient:number, bruttoOperator:number){
    return +(bruttoClient - bruttoOperator).toFixed(2);
  }

  /* ───────── submit ───────── */
  async function handleCreate(form:any){
    const olimpya_profit = calcInitOlimpyaProfit(
      form.bruttoClient || 0,
      form.bruttoOperator || 0
    );

    await setDoc(
      doc(db,"bookings",bookingNumber),
      {
        bookingNumber,
        ...form,                          // все поля из формы
        olimpya_profit,                   // ✨ пока только этот доход
        crocus_profit: 0,
        ai_profit      : 0,
        ue_profit      : 0,
        agentId        : user!.uid,
        agentName      : userData?.agentName ?? "",
        segment        : "olimpya",
        status         : "new",
        createdAt      : Timestamp.now(),
      },
      { merge:true }
    );

    /* Telegram для менеджеров */
    await fetch("/api/telegram/notify",{
      method : "POST",
      headers: { "Content-Type":"application/json" },
      body   : JSON.stringify({
        managers : true,
        type     : "newBooking",
        data     : {
          bookingNumber,
          hotel   : form.hotel    || "—",
          operator: form.operator || "—",
          segment : "Olimpya",
        }
      })
    }).catch(console.error);

    router.push("/olimpya/bookings");
  }

  if (loading || !bookingNumber) return <p className="text-center mt-6">…</p>;

  const nav = [
    { href:"/olimpya/bookings", label:t("navBookings") },
    { href:"/olimpya/balance",  label:t("navBalance")  },
    { href:"/olimpya/history",  label:t("navHistory")  },
  ];
  const isActive = (h:string)=>router.pathname.startsWith(h);

  return (
    <>
      <LanguageSwitcher/>
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>
          <nav className="flex gap-4">
            {nav.map(n=>(
              <Link key={n.href} href={n.href}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  isActive(n.href)
                    ? "border-indigo-600 text-black"
                    : "border-transparent text-gray-600 hover:text-black"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Button size="sm" variant="destructive" onClick={logout}>
            {t("logout")}
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">{t("newBookingHeader")}</h1>

        <BookingFormOlimpya
          onSubmit={handleCreate}
          bookingNumber={bookingNumber}
          agentName={userData?.agentName ?? ""}
        />
      </main>
    </>
  );
}