// pages/manager/[id].tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import BookingFormManager from "@/components/BookingFormManager";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/* -------------------------------------------------- */

export default function EditBookingPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading, isManager, logout } = useAuth();

  const [bookingData, setBookingData] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace("/login");
      } else if (!isManager) {
        router.replace("/agent/bookings");
      }
    }
  }, [user, loading, isManager]);

  useEffect(() => {
    const fetchBooking = async () => {
      if (id && isManager) {
        try {
          const docRef = doc(db, "bookings", id as string);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setBookingData({ id: docSnap.id, ...docSnap.data() });
          }
        } catch (err) {
          console.error("Ошибка при загрузке заявки:", err);
        } finally {
          setLoadingData(false);
        }
      }
    };
    fetchBooking();
  }, [id, isManager]);

  const handleUpdate = async (updatedData: any) => {
    try {
      updatedData.updatedAt = Timestamp.now();
      const docRef = doc(db, "bookings", id as string);
      await updateDoc(docRef, updatedData);
      router.push("/manager/bookings");
    } catch (err) {
      console.error("Ошибка при сохранении:", err);
    }
  };

  const nav = [
    { href: "/manager/bookings", label: "Заявки" },
    { href: "/manager/balances", label: "Балансы" },
    { href: "/manager/payouts", label: "Выплаты" },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  if (loading || loadingData) {
    return <p className="text-center mt-6">Загрузка...</p>;
  }

  if (!bookingData) {
    return (
      <p className="text-center mt-6 text-red-500">Заявка не найдена.</p>
    );
  }

  return (
    <>
      {/* ------ Шапка ------ */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>
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
            Выйти
          </Button>
        </div>
      </header>

      {/* ------ Контент ------ */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">
          Редактировать заявку: {bookingData.bookingCode || bookingData.bookingNumber || "—"}
        </h1>

        <BookingFormManager
          initialData={bookingData}
          onSubmit={handleUpdate}
          isManager={true}
          agentName={bookingData.agentName}
          agentAgency={bookingData.agentAgency}
        />
      </div>
    </>
  );
}