// pages/manager/[id].tsx
"use client";

import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { doc, getDoc, updateDoc, collection, query, orderBy, getDocs, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { format } from "date-fns";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import BookingFormManager from "@/components/BookingFormManager";
import UploadVouchers from "@/components/UploadVouchers";
import UploadScreenshots from "@/components/UploadScreenshots";
import { Button } from "@/components/ui/button";

type Comment = {
  id: string;
  text: string;
  authorName: string;
  createdAt: Date;
};

export default function EditBookingPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { user, loading, isManager, logout } = useAuth();

  const [booking, setBooking]         = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  const [comments, setComments]     = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending]       = useState(false);

  // Защита доступа
  useEffect(() => {
    if (loading) return;
    if (!user)          router.replace("/login");
    else if (!isManager) router.replace("/agent/bookings");
  }, [loading, user, isManager]);

  // Загрузка брони
  useEffect(() => {
    (async () => {
      if (!id || !isManager) return;
      const snap = await getDoc(doc(db, "bookings", id));
      if (snap.exists()) setBooking({ id: snap.id, ...snap.data() });
      setLoadingData(false);
    })();
  }, [id, isManager]);

  // Загрузка комментариев
  useEffect(() => {
    (async () => {
      if (!id) return;
      const q = query(
        collection(db, `bookings/${id}/comments`),
        orderBy("createdAt", "asc")
      );
      const snap = await getDocs(q);
      setComments(
        snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            text: data.text,
            authorName: data.authorName,
            createdAt: data.createdAt?.toDate
              ? data.createdAt.toDate()
              : new Date(),
          };
        })
      );
    })();
  }, [id]);

  // Сохранение изменений брони
  const saveBooking = async (data: any) => {
    if (!id) return;
    const ref     = doc(db, "bookings", id);
    const oldSnap = await getDoc(ref);
    const oldData = oldSnap.data() as any;

    await updateDoc(ref, {
      ...data,
      commissionPaid: data.commissionPaid ?? false,
      updatedAt: Timestamp.now(),
    });

    // уведомление агенту о смене статуса
    if (oldData?.status !== data.status) {
      await fetch("/api/telegram/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: oldData.agentId,
          type:    "statusChanged",
          data: {
            bookingNumber: oldData.bookingNumber,
            oldStatus:     oldData.status,
            newStatus:     data.status,
          },
        }),
      }).catch(console.error);
    }

    router.push("/manager/bookings");
  };

  // Отправка нового комментария
  const handleSend = async () => {
    if (!id || !newComment.trim()) return;
    setSending(true);

    // добавить комментарий
    await addDoc(collection(db, `bookings/${id}/comments`), {
      text: newComment.trim(),
      authorId:   user!.uid,
      authorName: user!.email || "Менеджер",
      createdAt:  serverTimestamp(),
    });

    // вернуть статус брони на "new"
    await updateDoc(doc(db, "bookings", id), { status: "new" });

    // уведомить агента
    await fetch("/api/telegram/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:    "newComment",
        agentId: booking.agentId,
        data: {
          bookingNumber: booking.bookingNumber,
          comment:       newComment.trim(),
          bookingId:     id,
        },
      }),
    }).catch(console.error);

    // перезагрузить комментарии
    const q = query(
      collection(db, `bookings/${id}/comments`),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    setComments(
      snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          text: data.text,
          authorName: data.authorName,
          createdAt: data.createdAt?.toDate
            ? data.createdAt.toDate()
            : new Date(),
        };
      })
    );

    setNewComment("");
    setSending(false);
  };

  if (loading || loadingData) {
    return <p className="text-center mt-6">Загрузка…</p>;
  }
  if (!booking) {
    return <p className="text-center mt-6 text-red-500">Заявка не найдена.</p>;
  }

  const nav = [
    { href: "/manager/bookings", label: "Заявки"  },
    { href: "/manager/balances", label: "Балансы" },
    { href: "/manager/payouts",  label: "Выплаты"  },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  return (
    <>
      <Head>
        <title>CROCUS CRM</title>
      </Head>

      {/* HEADER */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS CRM</span>
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

      {/* CONTENT */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">
          Редактировать заявку: {booking.bookingNumber}
        </h1>

        <BookingFormManager
          initialData={booking}
          onSubmit={saveBooking}
          isManager
          agentName={booking.agentName}
          agentAgency={booking.agentAgency}
        />

        <UploadVouchers
          bookingDocId={id as string}
          bookingNumber={booking.bookingNumber}
          links={booking.voucherLinks || []}
        />
        <UploadScreenshots
          bookingDocId={id as string}
          bookingNumber={booking.bookingNumber}
        />

        {/* COMMENTS */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Комментарии</h2>

          {comments.map(c => (
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
            onChange={e => setNewComment(e.target.value)}
          />

          <Button
            onClick={handleSend}
            variant="default"
            disabled={sending || !newComment.trim()}
          >
            {sending ? "Отправка…" : "Отправить"}
          </Button>
        </div>
      </div>
    </>
  );
}