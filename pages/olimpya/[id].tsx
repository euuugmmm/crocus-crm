// pages/agent/[id].tsx
"use client";

import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy,
  query,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { format } from "date-fns";
import Link from "next/link";
import { useTranslation } from "next-i18next";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

type BookingData = {
  bookingNumber: string;
  operator: string;
  region: string;
  departureCity: string;
  arrivalCity: string;
  hotel: string;
  checkIn: string;
  checkOut: string;
  room: string;
  mealPlan: string;
  bruttoClient: number;
  status: string;
  tourists: Array<{
    name: string;
    dob: string;
    nationality: string;
    passportNumber: string;
    passportValidUntil: string;
  }>;
};

type Comment = {
  id: string;
  text: string;
  authorName: string;
  createdAt: Date;
};

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

export default function BookingCommentsPage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { user, userData, logout } = useAuth();

  const [booking, setBooking]     = useState<BookingData | null>(null);
  const [comments, setComments]   = useState<Comment[]>([]);
  const [newText, setNewText]     = useState("");
  const [loading, setLoading]     = useState(false);

  // 1️⃣ Подгружаем данные брони
  useEffect(() => {
    if (!id) return;
    (async () => {
      const snap = await getDoc(doc(db, "bookings", id));
      if (snap.exists()) {
        const d = snap.data() as any;
        setBooking({
          bookingNumber: d.bookingNumber,
          operator: d.operator,
          region: d.region,
          departureCity: d.departureCity,
          arrivalCity: d.arrivalCity,
          hotel: d.hotel,
          checkIn: d.checkIn,
          checkOut: d.checkOut,
          room: d.room,
          mealPlan: d.mealPlan,
          bruttoClient: d.bruttoClient,
          status: d.status,
          tourists: Array.isArray(d.tourists)
            ? d.tourists.map((t: any) => ({
                name: t.name,
                dob: t.dob,
                nationality: t.nationality,
                passportNumber: t.passportNumber,
                passportValidUntil: t.passportValidUntil,
              }))
            : [],
        });
      }
    })();
  }, [id]);

  // 2️⃣ Подгружаем комментарии
  useEffect(() => {
    if (!id) return;
    (async () => {
      const q = query(
        collection(db, `bookings/${id}/comments`),
        orderBy("createdAt", "asc")
      );
      const snap = await getDocs(q);
      setComments(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            text: data.text,
            authorName: data.authorName,
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
          };
        })
      );
    })();
  }, [id]);

  // 3️⃣ Отправляем новый комментарий
  async function handleSend() {
    if (!id || !newText.trim()) return;
    setLoading(true);

    // добавляем comment
    await addDoc(collection(db, `bookings/${id}/comments`), {
      text: newText.trim(),
      authorId: user!.uid,
      authorName: userData?.agentName || user!.email || "—",
      createdAt: serverTimestamp(),
    });

    // меняем статус брони на "new"
    await updateDoc(doc(db, "bookings", id), { status: "new" });

    // уведомляем менеджера через Telegram
    await fetch("/api/telegram/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "newComment",
        agentId: user!.uid,
        managers: true,
        data: {
          bookingNumber: booking?.bookingNumber,
          comment: newText.trim(),
          bookingId: id,
        },
      }),
    }).catch(console.error);

    setNewText("");
    // перечитываем комментарии
    const snap = await getDocs(
      query(collection(db, `bookings/${id}/comments`), orderBy("createdAt", "asc"))
    );
    setComments(
      snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          text: data.text,
          authorName: data.authorName,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
        };
      })
    );
    setLoading(false);
  }

  if (!booking) {
    return <p className="text-center mt-6">{t("loadingBooking")}</p>;
  }

  return (
    <>
      <Head>
        <title>{t("title")}</title>
      </Head>
      <LanguageSwitcher />

      {/* — HEADER — */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">{t("title")}</span>
          <nav className="flex gap-4">
            <Link href="/agent/bookings" className="px-3 py-2 text-sm font-medium border-b-2 border-transparent hover:text-black">
              {t("navBookings")}
            </Link>
            <Link href="/agent/balance" className="px-3 py-2 text-sm font-medium border-b-2 border-transparent hover:text-black">
              {t("navBalance")}
            </Link>
            <Link href="/agent/history" className="px-3 py-2 text-sm font-medium border-b-2 border-transparent hover:text-black">
              {t("navHistory")}
            </Link>
          </nav>
          <Button size="sm" variant="destructive" onClick={logout}>
            {t("logout")}
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        <Button variant="outline" onClick={() => router.back()}>
          ← {t("back")}
        </Button>

        {/* — Booking Info — */}
        <Card>
          <CardContent className="space-y-2">
            <h2 className="text-xl font-semibold">{t("bookingInfo")}</h2>
            <p><strong>{t("labelBookingNo")}:</strong> {booking.bookingNumber}</p>
            <p><strong>{t("labelOperator")}:</strong> {booking.operator}</p>
            <p><strong>{t("labelRegion")}:</strong> {booking.region}</p>
            <p><strong>{t("labelDeparture")}:</strong> {booking.departureCity}</p>
            <p><strong>{t("labelArrival")}:</strong> {booking.arrivalCity}</p>
            <p><strong>{t("labelHotel")}:</strong> {booking.hotel}</p>
            <p>
              <strong>{t("labelPeriod")}:</strong>{" "}
              {format(new Date(booking.checkIn), "dd.MM.yyyy")} →{" "}
              {format(new Date(booking.checkOut), "dd.MM.yyyy")}
            </p>
            <p><strong>{t("labelRoom")}:</strong> {booking.room}</p>
            <p><strong>{t("labelBrutto")}:</strong> {booking.bruttoClient.toFixed(2)} €</p>
            <p><strong>{t("labelMeal")}:</strong> {booking.mealPlan}</p>
            <p><strong>{t("labelStatus")}:</strong> {booking.status}</p>

            <h3 className="mt-4 font-semibold">{t("tourists")}</h3>
            {booking.tourists.map((tst, i) => (
              <div key={i} className="pl-4">
                <p><strong>{t("labelName")}:</strong> {tst.name}</p>
                <p><strong>{t("labelAge")}:</strong>{" "}
                  {Math.floor((Date.now() - new Date(tst.dob).getTime())/(1000*60*60*24*365))}
                </p>
                <p><strong>{t("labelDOB")}:</strong> {format(new Date(tst.dob),"dd.MM.yyyy")}</p>
                <p><strong>{t("labelNationality")}:</strong> {tst.nationality}</p>
                <p><strong>{t("labelPassportNo")}:</strong> {tst.passportNumber||"—"}</p>
                <p><strong>{t("labelPassportValid")}:</strong>{" "}
                  {tst.passportValidUntil 
                    ? format(new Date(tst.passportValidUntil),"dd.MM.yyyy")
                    : "—"}
                </p>
                <hr className="my-2"/>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* — Comments — */}
        <div className="space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="p-3 border rounded">
              <p className="text-sm text-gray-600">
                <strong>{c.authorName}</strong>{" "}
                <span className="text-gray-500">
                  {format(c.createdAt, "dd.MM.yyyy HH:mm")}
                </span>
              </p>
              <p className="mt-1">{c.text}</p>
            </div>
          ))}
        </div>

        {/* — New Comment — */}
        <div className="space-y-2">
          <textarea
            className="w-full border rounded p-2"
            rows={4}
            placeholder={t("placeholderComment")}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <button
            onClick={handleSend}
            disabled={loading || !newText.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? t("sending") : t("send")}
          </button>
        </div>
      </main>
    </>
  );
}