"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import { collection, addDoc, Timestamp, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import BookingForm from "../../components/BookingFormAgent";
import { Button } from "@/components/ui/button";

export default function NewBooking() {
  const { user, userData, loading, isAgent, logout } = useAuth();
  const router = useRouter();
  const [bookingNumber, setBookingNumber] = useState("");

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (!isAgent) router.replace("/manager/bookings");
    }
  }, [user, loading, isAgent, router]);

  useEffect(() => {
    generateBookingNumber();
  }, []);

  const generateBookingNumber = async () => {
    const bookingsSnap = await getDocs(collection(db, "bookings"));
    const nextNumber = 1000 + bookingsSnap.size * 7;
    setBookingNumber(`CRT-${nextNumber.toString().padStart(5, "0")}`);
  };

  const calculateCommission = ({ operator, bruttoClient, internalNet, bruttoOperator }) => {
    let commission = 0;

    if (operator === "TOCO TOUR RO" || operator === "TOCO TOUR MD") {
      commission = (bruttoClient - internalNet) * 0.8;
    } else if (["KARPATEN", "DERTOUR", "CHRISTIAN"].includes(operator)) {
      const baseCommission = bruttoOperator * 0.03;
      const extraCommission = bruttoClient - bruttoOperator;
      commission = baseCommission + (extraCommission > 0 ? extraCommission * 0.8 : 0);
    }

    return parseFloat(commission.toFixed(2));
  };

  const handleCreate = async (formData) => {
    try {
      const commission = calculateCommission(formData);

      const bookingData = {
        bookingNumber,
        ...formData,
        commission,
        agentId: user.uid,
        agentName: userData?.agentName || "Имя агента не указано",
        agentAgency: userData?.agencyName || "Агентство не указано",
        status: "Новая",
        createdAt: Timestamp.now(),
      };
      
      console.log("bookingData", bookingData);

      await addDoc(collection(db, "bookings"), bookingData);
      router.push("/agent/bookings");
    } catch (err) {
      console.error("Ошибка при создании заявки:", err);
    }
  };

  const nav = [
    { href: "/agent/bookings", label: "Мои заявки" },
    { href: "/agent/balance", label: "Баланс" },
    { href: "/agent/history", label: "История" },
  ];
  const isActive = (h) => router.pathname.startsWith(h);

  if (loading) return <p className="text-center mt-4">Загрузка...</p>;

  return (
    <>
      {/* ---------- header ---------- */}
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

      {/* ---------- form ---------- */}
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Новая заявка</h1>
        <BookingForm
          onSubmit={handleCreate}
          isManager={false}
          agentName={userData?.agentName || ""}
          agentAgency={userData?.agencyName || ""}
          bookingNumber={bookingNumber}
        />
      </div>
    </>
  );
}