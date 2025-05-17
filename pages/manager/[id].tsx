// pages/manager/[id].tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter }           from "next/router";
import Link                    from "next/link";
import { Button }              from "@/components/ui/button";

import { useAuth }             from "@/context/AuthContext";
import { db }                  from "@/firebaseConfig";
import {
  doc,
  getDoc,
  updateDoc,
  Timestamp,
}                              from "firebase/firestore";

import BookingFormManager      from "@/components/BookingFormManager";
import UploadVouchers          from "@/components/UploadVouchers";

/* ---------------------------- компонент ----------------------------- */
export default function EditBookingPage() {
  /* ---------- auth / роутинг ---------- */
  const router                       = useRouter();
  const { id }                       = router.query;          // Firestore id заявки
  const { user, loading, isManager,
          logout }                   = useAuth();

  /* ---------- state ---------- */
  const [booking, setBooking]        = useState<any>(null);
  const [loadingData, setLoadingData]= useState(true);

  /* ---------- guards ---------- */
  useEffect(() => {
    if (loading) return;
    if (!user)         router.replace("/login");
    else if (!isManager) router.replace("/agent/bookings");
  }, [loading, user, isManager]);

  /* ---------- fetch booking once ---------- */
  useEffect(() => {
    (async () => {
      if (!id || !isManager) return;

      try {
        const snap = await getDoc(doc(db, "bookings", id as string));
        if (snap.exists()) setBooking({ id: snap.id, ...snap.data() });
      } catch (e) {
        console.error("Booking load error:", e);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [id, isManager]);

  /* ---------- update booking (данные из формы) ---------- */
  const saveBooking = async (data: any) => {
    if (!id) return;

    const ref     = doc(db, "bookings", id as string);
    const oldSnap = await getDoc(ref);
    const oldData = oldSnap.data() as any;

    // Обновляем документ в Firestore
    await updateDoc(ref, {
      ...data,
      updatedAt: Timestamp.now(),
    });

    // Если статус изменился — отправляем уведомление агенту
    if (oldData?.status !== data.status) {
      await fetch("/api/telegram/notify", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          agentId: oldData.agentId,
          type   : "statusChanged",
          data   : {
            bookingNumber: oldData.bookingNumber,
            oldStatus    : oldData.status,
            newStatus    : data.status,
          }
        }),
      }).catch(err => console.error("[tg notify] ", err));
    }

    router.push("/manager/bookings");
  };

  /* ---------- навигация наверху ---------- */
  const nav = [
    { href: "/manager/bookings", label: "Заявки"  },
    { href: "/manager/balances", label: "Балансы" },
    { href: "/manager/payouts",  label: "Выплаты" },
  ];
  const isActive = (href: string) => router.pathname.startsWith(href);

  /* ---------- UI ---------- */
  if (loading || loadingData)
    return <p className="text-center mt-6">Загрузка…</p>;

  if (!booking)
    return <p className="text-center mt-6 text-red-500">Заявка не найдена.</p>;

  return (
    <>
      {/* ===== HEADER ===== */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>

          <nav className="flex gap-4">
            {nav.map(n => (
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
            Выйти
          </Button>
        </div>
      </header>

      {/* ===== CONTENT ===== */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">
          Редактировать заявку:&nbsp;
          {booking.bookingNumber || booking.bookingCode || "—"}
        </h1>

        {/* --- форма брони --- */}
        <BookingFormManager
          initialData={booking}
          onSubmit={saveBooking}
          isManager
          agentName={booking.agentName}
          agentAgency={booking.agentAgency}
        />

        {/* --- загрузка / просмотр ваучеров --- */}
        <UploadVouchers
          bookingDocId={id as string}
          bookingNumber={booking.bookingNumber || ""}
          links={booking.voucherLinks || []}
        />
      </div>
    </>
  );
}