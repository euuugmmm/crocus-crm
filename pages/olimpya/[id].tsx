// pages/olimpya/[id].tsx
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
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
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return { props: { ...(await serverSideTranslations(locale, ["common"])) } };
}

type Comment = {
  id: string;
  text: string;
  authorName: string;
  createdAt: Date;
};

export default function EditOlimpyaBookingPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { user, loading, isOlimpya, isManager, isSuperManager, isAdmin } = useAuth();

  // ВАЖНО: чтобы не было mismatch между сервером и клиентом,
  // на сервере и в первый клиентский рендер используем один и тот же Layout.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isPrivileged = !!(isManager || isSuperManager || isAdmin);
  const EffectiveLayout = useMemo(
    () => (mounted && isPrivileged ? ManagerLayout : OlimpyaLayout),
    [mounted, isPrivileged]
  );

  const [booking, setBooking] = useState<
    (OlimpyaBookingValues & { agentName?: string; agentAgency?: string }) | null
  >(null);
  const [loadingData, setLoadingData] = useState(true);

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);

  // Доступ
  useEffect(() => {
    if (loading) return;
    if (!user || (!isOlimpya && !isPrivileged)) {
      router.replace("/login");
    }
  }, [loading, user, isOlimpya, isPrivileged, router]);

  // Загрузка брони
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
          commission: d.commission,
          supplierBookingNumber: d.supplierBookingNumber,
          payerName: d.payerName,
          comment: d.comment,
          agentName: d.agentName,
          agentAgency: d.agentAgency,
        });
      }
      setLoadingData(false);
    })();
  }, [id]);

  // Загрузка комментариев
  useEffect(() => {
    if (!id) return;
    (async () => {
      const q = query(collection(db, `bookings/${id}/comments`), orderBy("createdAt", "asc"));
      const snap = await getDocs(q);
      setComments(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            text: data.text,
            authorName: data.authorName,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          };
        })
      );
    })();
  }, [id]);

  // Сохранение
  const saveBooking = async (values: OlimpyaBookingValues) => {
    if (!id) return;
    const ref = doc(db, "bookings", id);
    const oldSnap = await getDoc(ref);
    const old = oldSnap.data() as any;

    await updateDoc(ref, {
      ...values,
      updatedAt: Timestamp.now(),
    });

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

  // Отправка комментария
  const handleSend = async () => {
    if (!id || !newComment.trim()) return;
    setSending(true);

    await addDoc(collection(db, `bookings/${id}/comments`), {
      text: newComment.trim(),
      authorName: user?.email || "—",
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "bookings", id), { status: "new" });

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

    const q = query(collection(db, `bookings/${id}/comments`), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    setComments(
      snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          text: data.text,
          authorName: data.authorName,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        };
      })
    );

    setNewComment("");
    setSending(false);
  };

  return (
    // Подавляем возможные расхождения текста внутри лейаута (бренд/хедер),
    // пока не смонтируемся и не определим точный Layout.
    <div suppressHydrationWarning>
      <Head>
        <title>{booking ? `Редактировать №${booking.bookingNumber}` : "Загрузка…"}</title>
      </Head>

      <EffectiveLayout>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {loading || loadingData ? (
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

              <UploadScreenshots bookingDocId={(id as string) || ""} bookingNumber={booking.bookingNumber!} />

              <div className="space-y-4 mt-6">
                <h2 className="text-lg font-semibold">Чат комментариев</h2>
                {comments.map((c) => (
                  <div key={c.id} className="p-3 border rounded">
                    <p className="text-sm text-gray-600">
                      <strong>{c.authorName}</strong>{" "}
                      <span className="text-gray-500">{format(c.createdAt, "dd.MM.yyyy HH:mm")}</span>
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
                <Button onClick={handleSend} variant="default" disabled={sending || !newComment.trim()}>
                  {sending ? "Отправка…" : "Отправить"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-center mt-6 text-red-500">Заявка не найдена.</p>
          )}
        </div>
      </EffectiveLayout>
    </div>
  );
}