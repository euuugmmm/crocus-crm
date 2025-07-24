// pages/olimpya/[id].tsx
"use client";

import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { format } from "date-fns";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import BookingFormManagerOlimpya, {
  OlimpyaBookingValues,
} from "@/components/BookingFormManagerOlimpya";
import UploadScreenshots from "@/components/UploadScreenshots";
import { Button } from "@/components/ui/button";

import OlimpyaLayout from "@/components/layouts/OlimpyaLayout";
import ManagerLayout from "@/components/layouts/ManagerLayout";

type Comment = {
  id: string;
  text: string;
  authorName: string;
  createdAt: Date;
};

export default function EditOlimpyaBookingPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const {
    user,
    loading,
    isOlimpya,
    isManager,
    isSuperManager,
    isAdmin,
  } = useAuth();

  // определяем, кто привилегирован (не олимпиа)
  const isPrivileged = isManager || isSuperManager || isAdmin;
  const Layout = isPrivileged ? ManagerLayout : OlimpyaLayout;

  // состояние бронирования
  const [booking, setBooking] = useState<
    (OlimpyaBookingValues & { agentName?: string; agentAgency?: string }) | null
  >(null);
  const [loadingData, setLoadingData] = useState(true);

  // комментарии
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);

  // защита доступа: либо агент Олимпиа, либо привилегированный
  useEffect(() => {
    if (loading) return;
    if (!user || (!isOlimpya && !isPrivileged)) {
      router.replace("/login");
    }
  }, [loading, user, isOlimpya, isPrivileged, router]);

  // загрузка заявки
  useEffect(() => {
    if (!id) return;
    (async () => {
      const snap = await getDoc(doc(db, "bookings", id));
      if (snap.exists()) {
        const d = snap.data() as any;
        setBooking({
          bookingNumber: d.bookingNumber,
          bookingType: d.bookingType,
          baseType: d.baseType,
          operator: d.operator,
          region: d.region,
          departureCity: d.departureCity,
          arrivalCity: d.arrivalCity,
          flightNumber: d.flightNumber,
          flightTime: d.flightTime,
          hotel: d.hotel,
          checkIn: d.checkIn,
          checkOut: d.checkOut,
          room: d.room,
          mealPlan: d.mealPlan,
          tourists: d.tourists,
          bruttoClient: d.bruttoClient,
          nettoOlimpya: d.nettoOlimpya,
          internalNet: d.internalNet,
          paymentMethod: d.paymentMethod,
          status: d.status,
          commissionO: d.commissionO,
          overCommission: d.overCommission,
          realCommission: d.realCommission,
          commissionIgor: d.commissionIgor,
          commissionEvgeniy: d.commissionEvgeniy,
          comment: d.comment,
          agentName: d.agentName,
          agentAgency: d.agentAgency,
        });
      }
      setLoadingData(false);
    })();
  }, [id]);

  // загрузка комментариев
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
            createdAt: data.createdAt.toDate(),
          };
        })
      );
    })();
  }, [id]);

  // сохранение изменений заявки
  const saveBooking = async (values: OlimpyaBookingValues) => {
    if (!id) return;
    const ref = doc(db, "bookings", id);
    const oldSnap = await getDoc(ref);
    const old = oldSnap.data() as any;

    await updateDoc(ref, {
      ...values,
      updatedAt: Timestamp.now(),
    });

    // уведомление в Telegram при смене статуса
    if (old?.status !== values.status) {
      await fetch("/api/telegram/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: old.agentId,
          type: "statusChanged",
          data: {
            bookingNumber: old.bookingNumber,
            oldStatus: old.status,
            newStatus: values.status,
          },
        }),
      }).catch(console.error);
    }

    router.push("/olimpya/bookings");
  };

  // отправка нового комментария
  const handleSend = async () => {
    if (!id || !newComment.trim()) return;
    setSending(true);

    // сохраняем комментарий
    await addDoc(collection(db, `bookings/${id}/comments`), {
      text: newComment.trim(),
      authorName: user?.email || "—",
      createdAt: serverTimestamp(),
    });

    // сбрасываем статус заявки
    await updateDoc(doc(db, "bookings", id), { status: "new" });

    // уведомление менеджерам
    await fetch("/api/telegram/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "newComment",
        managers: true,
        data: {
          bookingNumber: booking?.bookingNumber,
          comment: newComment.trim(),
          bookingId: id,
        },
      }),
    }).catch(console.error);

    // перезагрузка комментариев
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
          createdAt: data.createdAt.toDate(),
        };
      })
    );

    setNewComment("");
    setSending(false);
  };

  return (
    <Layout>
      <Head>
        <title>
          {booking
            ? `Редактировать №${booking.bookingNumber}`
            : "Загрузка…"}
        </title>
      </Head>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {(loading || loadingData) ? (
          <p className="text-center mt-6">Загрузка…</p>
        ) : booking ? (
          <>
            <h1 className="text-2xl font-bold mb-4">
              Редактировать заявку №{booking.bookingNumber}
            </h1>

            <BookingFormManagerOlimpya
              initialValues={booking}
              onSubmit={saveBooking}
              bookingNumber={booking.bookingNumber}
              agentName={booking.agentName}
              agentAgency={booking.agentAgency}
            />

            <UploadScreenshots
              bookingDocId={id}
              bookingNumber={booking.bookingNumber!}
            />

            {/* COMMENTS */}
            <div className="space-y-4 mt-6">
              <h2 className="text-lg font-semibold">Чат комментариев</h2>
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
              <textarea
                className="w-full border rounded p-2"
                rows={3}
                placeholder="Ваш комментарий…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <Button
                onClick={handleSend}
                variant="default"
                disabled={sending || !newComment.trim()}
              >
                {sending ? "Отправка…" : "Отправить"}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-center mt-6 text-red-500">Заявка не найдена.</p>
        )}
      </div>
    </Layout>
  );
}