// pages/agent/bookings.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../../context/AuthContext';

export default function AgentBookings() {
  const router = useRouter();
  const { user, userData, loading, isAgent, logout } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [filters, setFilters] = useState({
    operator: '',
    hotel: '',
    status: '',
  });

  useEffect(() => {
    if (!user || !isAgent) return;
    const q = query(collection(db, 'bookings'), where('agentId', '==', user.uid));
    const unsubscribe = onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBookings(data);
    });
    return () => unsubscribe();
  }, [user, isAgent]);

  if (loading) return <p className="p-4 text-center">Загрузка...</p>;

  const filteredBookings = bookings.filter(b =>
    b.operator.toLowerCase().includes(filters.operator.toLowerCase()) &&
    b.hotel.toLowerCase().includes(filters.hotel.toLowerCase()) &&
    b.status.toLowerCase().includes(filters.status.toLowerCase())
  );

  const totalBrutto = filteredBookings.reduce((sum, b) => sum + (b.bruttoClient || 0), 0);
  const totalCommission = filteredBookings.reduce((sum, b) => sum + (b.commission || 0), 0);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Мои заявки</h1>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/agent/new-booking')}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            + Новая заявка
          </button>
          <button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            Выйти
          </button>
        </div>
      </div>

      <table className="min-w-full border text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-1">№</th>
            <th className="px-2 py-1">Оператор</th>
            <th className="px-2 py-1">Отель</th>
            <th className="px-2 py-1">Заезд</th>
            <th className="px-2 py-1">Выезд</th>
            <th className="px-2 py-1">Клиент (€)</th>
            <th className="px-2 py-1">Комиссия (€)</th>
            <th className="px-2 py-1">Статус</th>
            <th className="px-2 py-1">Invoice</th>
            <th className="px-2 py-1">Комментарии</th>
          </tr>
          <tr className="bg-white border-b">
            <td></td>
            <td><input value={filters.operator} onChange={e => setFilters({ ...filters, operator: e.target.value })} className="w-full px-1 border rounded" placeholder="Фильтр" /></td>
            <td><input value={filters.hotel} onChange={e => setFilters({ ...filters, hotel: e.target.value })} className="w-full px-1 border rounded" placeholder="Фильтр" /></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td><input value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className="w-full px-1 border rounded" placeholder="Фильтр" /></td>
            <td></td>
            <td></td>
          </tr>
        </thead>
        <tbody>
          {filteredBookings.map(booking => (
            <tr key={booking.id} className="border-t hover:bg-gray-50">
              <td className="px-2 py-1">{booking.bookingNumber || booking.bookingCode}</td>
              <td className="px-2 py-1">{booking.operator}</td>
              <td className="px-2 py-1">{booking.hotel}</td>
              <td className="px-2 py-1">{booking.checkIn ? new Date(booking.checkIn).toLocaleDateString('ru-RU') : '-'}</td>
              <td className="px-2 py-1">{booking.checkOut ? new Date(booking.checkOut).toLocaleDateString('ru-RU') : '-'}</td>
              <td className="px-2 py-1">{booking.bruttoClient?.toFixed(2) || '—'}</td>
              <td className="px-2 py-1">{booking.commission?.toFixed(2) || '—'}</td>
              <td className="px-2 py-1">{booking.status || '—'}</td>
              <td className="px-2 py-1">
                {booking.invoiceLink ? (
                  <a href={booking.invoiceLink} target="_blank" rel="noreferrer" className="text-blue-500">Открыть</a>
                ) : '—'}
              </td>
              <td className="px-2 py-1">{booking.comment || '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-100 font-semibold">
          <tr>
            <td colSpan={5} className="px-2 py-2 text-right">Итого:</td>
            <td className="px-2 py-2">{totalBrutto.toFixed(2)} €</td>
            <td className="px-2 py-2">{totalCommission.toFixed(2)} €</td>
            <td colSpan={3}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}