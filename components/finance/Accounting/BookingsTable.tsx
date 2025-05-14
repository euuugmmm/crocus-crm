import { useEffect, useState } from "react";
import { BookingDTO } from "@/types/BookingDTO";

export default function BookingsTable() {
  const [bookings, setBookings] = useState<BookingDTO[]>([]);
  const [marketFilter, setMarketFilter] = useState("");

  useEffect(() => {
    fetch("/api/finance/bookings")
      .then((res) => res.json())
      .then((data) => setBookings(data));
  }, []);

  const markets = Array.from(new Set(bookings.map((b) => b.market).filter(Boolean)));

  const filtered = bookings.filter((b) => (marketFilter ? b.market === marketFilter : true));

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm font-medium">Фильтр по рынку:</label>
        <select
          value={marketFilter}
          onChange={(e) => setMarketFilter(e.target.value)}
          className="border rounded p-2"
        >
          <option value="">Все рынки</option>
          {markets.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Учёт заявок по направлениям, клиентам и агентам. Все заявки фиксируются по рынкам (Украина / Румыния / Субагентский канал).
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Номер</th>
              <th className="p-2 border">Дата</th>
              <th className="p-2 border">Рынок</th>
              <th className="p-2 border">Категория</th>
              <th className="p-2 border">Клиент</th>
              <th className="p-2 border">Сумма</th>
              <th className="p-2 border">Валюта</th>
              <th className="p-2 border">Прибыль</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id}>
                <td className="border px-2">{b.bookingNumber}</td>
                <td className="border px-2">
                  {typeof b.createdAt === "string"
                    ? b.createdAt.slice(0, 10)
                    : b.createdAt?.seconds
                    ? new Date(b.createdAt.seconds * 1000).toISOString().slice(0, 10)
                    : "—"}
                </td>
                <td className="border px-2">{b.market || "—"}</td>
                <td className="border px-2">{b.category || "—"}</td>
                <td className="border px-2">{b.clientName || "—"}</td>
                <td className="border px-2">{b.bruttoClient || "—"}</td>
                <td className="border px-2">{b.currency || "—"}</td>
                <td className="border px-2">{b.crocusProfit || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="py-10 text-center text-gray-400">Нет заявок по выбранному рынку.</div>
        )}
      </div>
    </div>
  );
}
