import { useEffect, useState } from "react";
import { Booking } from "@/types/BookingDTO";
import { calculateProfit } from "@/utils/calculateProfit";

export default function BookingsTable() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await fetch("/api/finance/bookings");
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="overflow-x-auto bg-white p-4 shadow rounded">
      <table className="min-w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-2 py-1">Номер</th>
            <th className="border px-2 py-1">Дата</th>
            <th className="border px-2 py-1">Маркет</th>
            <th className="border px-2 py-1">Категория</th>
            <th className="border px-2 py-1">Клиент</th>
            <th className="border px-2 py-1">Брутто</th>
            <th className="border px-2 py-1">Нетто</th>
            <th className="border px-2 py-1">Комиссия агента</th>
            <th className="border px-2 py-1">Банк. сборы</th>
            <th className="border px-2 py-1">Чистая прибыль</th>
            <th className="border px-2 py-1">Е</th>
            <th className="border px-2 py-1">И</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => {
            const createdAt = b.createdAt && typeof b.createdAt === "object" && "seconds" in b.createdAt
              ? new Date(b.createdAt.seconds * 1000).toISOString().slice(0, 10)
              : typeof b.createdAt === "string"
              ? b.createdAt.slice(0, 10)
              : "—";

            const shares = calculateProfit(b) || {
              crocusProfit: 0,
              evgeniyShare: 0,
              igorShare: 0,
            };

            return (
              <tr key={b.bookingNumber} className="border-t hover:bg-gray-50">
                <td className="border px-2 py-1">{b.bookingNumber}</td>
                <td className="border px-2 py-1">{createdAt}</td>
                <td className="border px-2 py-1">{b.market || "—"}</td>
                <td className="border px-2 py-1">{b.category || "—"}</td>
                <td className="border px-2 py-1">{b.clientName || "—"}</td>
                <td className="border px-2 py-1">{b.bruttoClient ?? "—"}</td>
                <td className="border px-2 py-1">{b.supplierCost ?? b.nettoOperator ?? "—"}</td>
                <td className="border px-2 py-1">{b.agentCommission ?? "—"}</td>
                <td className="border px-2 py-1">{b.bankFees ?? "—"}</td>
                <td className="border px-2 py-1 font-semibold">{shares?.crocusProfit?.toFixed(2) ?? "—"}</td>
                <td className="border px-2 py-1 text-blue-600">{shares?.evgeniyShare?.toFixed(2) ?? "—"}</td>
                <td className="border px-2 py-1 text-green-600">{shares?.igorShare?.toFixed(2) ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!bookings.length && (
        <div className="text-center text-gray-400 py-6">Нет данных</div>
      )}
    </div>
  );
}