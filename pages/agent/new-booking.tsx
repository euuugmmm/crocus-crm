/* pages/agent/new-booking.tsx
   ─────────────────────────────────────────────────────────── */
"use client";

import { useEffect, useState } from "react";
import Link            from "next/link";
import { useRouter }   from "next/router";
import { collection, addDoc, Timestamp, getDocs } from "firebase/firestore";

import { db }          from "@/firebaseConfig";
import { useAuth }     from "@/context/AuthContext";
import BookingForm     from "@/components/BookingFormAgent";
import { Button }      from "@/components/ui/button";
import { runTransaction, doc, increment } from "firebase/firestore";

/* ─────────────────────────────────────────────────────────── */

export default function NewBooking() {
  const router = useRouter();
  const { user, userData, loading, isAgent, logout } = useAuth();

  const [bookingNumber, setBookingNumber] = useState("");

  /* ---------- guards ---------- */
  useEffect(() => {
    if (!loading) {
      if (!user)       router.replace("/login");
      else if (!isAgent) router.replace("/manager/bookings");
      else generateBookingNumber();
    }
  }, [user, loading, isAgent, router]);

  /* ---------- generate № ---------- */
  async function generateBookingNumber() {
  const ref = doc(db, "counters", "bookingNumber");
  const newVal = await runTransaction(db, async t => {
    const snap = await t.get(ref);
    const cur  = snap.data()?.value ?? 1000;
    t.update(ref, { value: increment(1) });
    return cur + 1;
  });
  setBookingNumber(`CRT-${String(newVal * 7).padStart(5, "0")}`);
}

  /* ---------- commission helper ---------- */
  const calcCommission = ({
    operator, bruttoClient, internalNet, bruttoOperator
  }: any) => {
    let c = 0;
    if (["TOCO TOUR RO","TOCO TOUR MD"].includes(operator)) {
      c = (bruttoClient - internalNet) * 0.8;
    } else if (["KARPATEN","DERTOUR","CHRISTIAN"].includes(operator)) {
      c = bruttoOperator * 0.03 +
          Math.max(0, bruttoClient - bruttoOperator) * 0.8;
    }
    return Number(c.toFixed(2));
  };

  /* ---------- create ---------- */
  const handleCreate = async (formData: any) => {
    try {
      const commission = calcCommission(formData);

      const bookingData = {
        bookingNumber,
        ...formData,
        commission,

        /* кто создал */
        agentId   : user!.uid,
          agentName   : userData?.agentName || userData?.name || "Агент",
          agentAgency : userData?.agency || userData?.agencyName || "Агентство",

        status    : "Новая",
        createdAt : Timestamp.now(),
      };

      /* 1. сохраняем в Firestore */
      const docRef = await addDoc(collection(db, "bookings"), bookingData);

     /* 2. шлем уведомление агенту (если чат привязан) */
await fetch("/api/telegram/notify", {
  method : "POST",
  headers: { "Content-Type": "application/json" },
  body   : JSON.stringify({
    agentId: user!.uid,
    type   : "newBooking",
    data   : {
      bookingNumber: bookingData.bookingNumber,
      hotel       : bookingData.hotel,
      operator    : bookingData.operator,
      checkIn     : bookingData.checkIn,
      checkOut    : bookingData.checkOut,
      status      : bookingData.status,
    }
  })
}).catch(err => console.error("[tg notify → агент] ", err));

/* 3. шлем уведомление менеджерам */
await fetch("/api/telegram/notify", {
  method : "POST",
  headers: { "Content-Type": "application/json" },
  body   : JSON.stringify({
    managers: true,
    type    : "newBooking",
    data    : {
      bookingNumber: bookingData.bookingNumber,
      agentName   : bookingData.agentName,
      agentAgency : bookingData.agentAgency,
      hotel       : bookingData.hotel,
      operator    : bookingData.operator,
    }
  })
}).catch(err => console.error("[tg notify → менеджеры] ", err));

      /* 3. уходим в список */
      router.push("/agent/bookings");

    } catch (err) {
      console.error("Ошибка при создании заявки:", err);
    }
  };

  /* ---------- nav helpers ---------- */
  const nav = [
    { href:"/agent/bookings", label:"Мои заявки" },
    { href:"/agent/balance",  label:"Баланс"      },
    { href:"/agent/history",  label:"История"     },
  ];
  const isActive = (h:string)=>router.pathname.startsWith(h);

  if (loading) return <p className="text-center mt-4">Загрузка...</p>;

  /* ===================== JSX ===================== */
  return (
    <>
      {/* ---------- header ---------- */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>
          <nav className="flex gap-4">
            {nav.map(n=>(
              <Link key={n.href} href={n.href}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  isActive(n.href) ? "border-indigo-600 text-black"
                                   : "border-transparent text-gray-600 hover:text-black"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Button size="sm" variant="destructive" onClick={logout}>
            Выйти
          </Button>
        </div>
      </header>

      {/* ---------- form ---------- */}
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Новая заявка</h1>
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