import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";

type AnyBooking = Record<string, any>;

const toNum = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (n?: number) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "—";

const ddmmyyyy = (s?: string) => {
  if (!s) return "—";
  // ожидаем "dd.MM.yyyy"; если другое — покажем как есть
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  } catch {
    return s;
  }
};

const dateFromCreatedAt = (createdAt: any): string => {
  if (!createdAt) return "—";
  // Firestore Timestamp
  if (typeof createdAt === "object" && "seconds" in createdAt) {
    const d = new Date(createdAt.seconds * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (createdAt instanceof Date && !isNaN(createdAt.getTime())) {
    const yyyy = createdAt.getFullYear();
    const mm = String(createdAt.getMonth() + 1).padStart(2, "0");
    const dd = String(createdAt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof createdAt === "string" && createdAt.length >= 10) {
    // возьмём первые 10 символов, чтобы получить YYYY-MM-DD
    return createdAt.slice(0, 10);
  }
  return "—";
};

const marketLabel = (bookingType?: string) => {
  switch (bookingType) {
    case "olimpya_base":
      return "Олимпия";
    case "romania":
      return "Румыния";
    case "subagent":
      return "Субагенты";
    default:
      return bookingType || "—";
  }
};

// ID у оператора — пробуем несколько возможных полей
const operatorIdValue = (b: AnyBooking) =>
  b.operatorBookingId ||
  b.operatorId ||
  b.supplierBookingId ||
  b.supplierRef ||
  b.extRef ||
  "—";

// Плательщик — если явно задан payer, берём его; иначе — по типу и методу оплаты
const payerLabel = (b: AnyBooking) => {
  if (b.payer) return String(b.payer);
  const base =
    b.bookingType === "subagent" ? "Субагент" : "Клиент";
  if (b.paymentMethod === "card") return `${base} (карта)`;
  if (b.paymentMethod === "iban") return `${base} (iban)`;
  return base;
};

// Первый турист (по ТЗ "только 1-й")
const firstTourist = (b: AnyBooking) => {
  if (Array.isArray(b.tourists) && b.tourists.length) {
    const n = b.tourists[0]?.name;
    return n || "—";
  }
  return "—";
};

export default function BookingsTable() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AnyBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = collection(db, "bookings");
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const computed = useMemo(() => {
    return rows.map((b) => {
      const operator = b.operator || "—";
      const operatorId = operatorIdValue(b);

      const created = dateFromCreatedAt(b.createdAt); // "Дата заявки" (обязательно)
      const checkIn = ddmmyyyy(b.checkIn);
      const checkOut = ddmmyyyy(b.checkOut);
      const hotel = b.hotel || "—";
      const tourist = firstTourist(b);
      const payer = payerLabel(b);

      const bruttoCrocus = toNum(b.bruttoClient); // Брутто Крокус
      const nettoOlimpya = toNum(b.nettoOlimpya);  // Нетто Олимпия
      const nettoCrocus  = toNum(b.internalNet);   // Нетто Крокус

      // Комиссия Крокус — по практике у тебя это разница Брутто - Нетто Крокус
      const commissionCrocus = bruttoCrocus - nettoCrocus;

      const over = toNum(b.overCommission);       // Овер
      const komIgor = toNum(b.commissionIgor);    // Комиссия И
      const komEvgeniy = toNum(b.commissionEvgeniy); // Комиссия Е

      return {
        id: b.id as string,
        operator,
        operatorId,
        created,
        checkIn,
        checkOut,
        hotel,
        tourist,
        payer,
        bruttoCrocus,
        nettoOlimpya,
        nettoCrocus,
        commissionCrocus,
        over,
        komIgor,
        komEvgeniy,
        accountingLoaded: !!b.accountingLoaded,
      };
    });
  }, [rows]);

  const toggleAccountingLoaded = async (id: string, next: boolean) => {
    try {
      await updateDoc(doc(db, "bookings", id), {
        accountingLoaded: next,
        accountingLoadedAt: serverTimestamp(),
        ...(user?.uid ? { accountingLoadedBy: user.uid } : {}),
      });
    } catch (e) {
      console.error("Failed to update accountingLoaded", e);
      // Можно всплывашку/тост
    }
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="overflow-x-auto bg-white p-4 shadow rounded">
      <table className="min-w-[1400px] w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-2 py-1 text-left">ОПЕРАТОР</th>
            <th className="border px-2 py-1 text-left">ID ОПЕРАТОР</th>
            <th className="border px-2 py-1 text-left">Маркет</th>
            <th className="border px-2 py-1 text-left">Дата заявки</th>
            <th className="border px-2 py-1 text-left">Ch-IN</th>
            <th className="border px-2 py-1 text-left">Ch-OUT</th>
            <th className="border px-2 py-1 text-left">ОТЕЛЬ</th>
            <th className="border px-2 py-1 text-left">ТУРИСТ</th>
            <th className="border px-2 py-1 text-left">ПЛАТЕЛЬЩИК</th>

            <th className="border px-2 py-1 text-right">Брутто Крокус</th>
            <th className="border px-2 py-1 text-right">Нетто Олимпия</th>
            <th className="border px-2 py-1 text-right">Нетто Крокус</th>
            <th className="border px-2 py-1 text-right">Комиссия Крокус</th>
            <th className="border px-2 py-1 text-right">Овер</th>
            <th className="border px-2 py-1 text-right">Комиссия И</th>
            <th className="border px-2 py-1 text-right">Комиссия Е</th>

            <th className="border px-2 py-1 text-center">в бух</th>
          </tr>
        </thead>
        <tbody>
          {computed.length === 0 && (
            <tr>
              <td colSpan={17} className="text-center py-6 text-gray-400">
                Нет данных
              </td>
            </tr>
          )}
          {computed.map((r) => (
            <tr key={r.id} className="border-t hover:bg-gray-50">
              <td className="border px-2 py-1">{r.operator}</td>
              <td className="border px-2 py-1">{r.operatorId}</td>
              <td className="border px-2 py-1">{/* Маркет по bookingType */}</td>
              <td className="border px-2 py-1">{r.created}</td>
              <td className="border px-2 py-1">{r.checkIn}</td>
              <td className="border px-2 py-1">{r.checkOut}</td>
              <td className="border px-2 py-1">{r.hotel}</td>
              <td className="border px-2 py-1">{r.tourist}</td>
              <td className="border px-2 py-1">{r.payer}</td>

              <td className="border px-2 py-1 text-right">{fmtMoney(r.bruttoCrocus)}</td>
              <td className="border px-2 py-1 text-right">{fmtMoney(r.nettoOlimpya)}</td>
              <td className="border px-2 py-1 text-right">{fmtMoney(r.nettoCrocus)}</td>
              <td className="border px-2 py-1 text-right">{fmtMoney(r.commissionCrocus)}</td>
              <td className="border px-2 py-1 text-right">{fmtMoney(r.over)}</td>
              <td className="border px-2 py-1 text-right">{fmtMoney(r.komIgor)}</td>
              <td className="border px-2 py-1 text-right">{fmtMoney(r.komEvgeniy)}</td>

              <td className="border px-2 py-1 text-center">
                <input
                  type="checkbox"
                  checked={r.accountingLoaded}
                  onChange={(e) => toggleAccountingLoaded(r.id, e.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}