// pages/finance/bookings.tsx

import { useBookings } from "@/hooks/useBookings";
import BookingsTable from "@/components/finance/Accounting/BookingsTable";

export default function BookingsPage() {
  const { data: bookings, loading, error } = useBookings();

  return (
    <div className="max-w-6xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Заявки и бронирования</h1>
      <p className="mb-6 text-gray-500">
        Учёт заявок по направлениям, клиентам и агентам. Все заявки фиксируются по рынкам (Украина / Румыния / Субагентский канал).
      </p>

      {error && <p className="text-red-500">Ошибка: {String(error)}</p>}
      {loading && <p className="text-gray-400">Загрузка...</p>}
      {!loading && bookings.length === 0 && (
        <p className="text-gray-500">Заявки не найдены.</p>
      )}

      <BookingsTable bookings={bookings} />
    </div>
  );
}
