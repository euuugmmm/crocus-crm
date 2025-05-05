// pages/my.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';

export default function MyBookings() {
  const router = useRouter();
  const { currentUser, role, loading } = useAuth();
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    if (!loading) {
      if (!currentUser) {
        router.replace('/login');
      } else if (role !== 'agent') {
        router.replace('/manager');
      }
    }
  }, [currentUser, role, loading, router]);

  useEffect(() => {
    if (currentUser && role === 'agent') {
      const q = query(
        collection(db, 'bookings'),
        where('agentId', '==', currentUser.uid)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        try {
          let items = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              touristsFormatted: Array.isArray(data.tourists)
                ? data.tourists.map((t, i) => `${i+1}. ${t.last || ''} ${t.first || ''} (${t.dob ? new Date(t.dob).toLocaleDateString('ru-RU') : ''})`).join('\n')
                : '—'
            };
          });

          items.sort((a, b) => {
            if (!a.bookingNo || !b.bookingNo) return 0;
            return b.bookingNo - a.bookingNo;
          });

          setBookings(items);
        } catch (e) {
          console.error('Ошибка при обработке заявок:', e);
        }
      });
      return () => unsubscribe();
    }
  }, [currentUser, role]);

  if (!currentUser || role !== 'agent') return null;

  return (
    <div className="p-4 overflow-x-auto">
      <h1 className="text-2xl font-semibold mb-4">Мои заявки</h1>
      <table className="min-w-full border text-sm bg-white">
        <thead className="bg-gray-200">
          <tr>
            <th className="px-2 py-1 border">Код</th>
            <th className="px-2 py-1 border">Дата</th>
            <th className="px-2 py-1 border">Оператор</th>
            <th className="px-2 py-1 border">Отель</th>
            <th className="px-2 py-1 border">Check-in</th>
            <th className="px-2 py-1 border">Check-out</th>
            <th className="px-2 py-1 border">Комната</th>
            <th className="px-2 py-1 border w-64">Туристы</th>
            <th className="px-2 py-1 border text-right">Brutto клиента (€)</th>
            <th className="px-2 py-1 border text-right">Brutto оператора (€)</th>
            <th className="px-2 py-1 border text-right">Netto (€)</th>
            <th className="px-2 py-1 border text-right">Комиссия (€)</th>
            <th className="px-2 py-1 border">Статус</th>
            <th className="px-2 py-1 border">Ссылка</th>
            <th className="px-2 py-1 border">Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map(b => (
            <tr key={b.id} className="border-t hover:bg-gray-50">
              <td className="px-2 py-1 border">{b.bookingCode}</td>
              <td className="px-2 py-1 border">{b.createdAt?.toDate().toLocaleDateString('ru-RU')}</td>
              <td className="px-2 py-1 border">{b.operator}</td>
              <td className="px-2 py-1 border">{b.hotel}</td>
              <td className="px-2 py-1 border">{b.checkIn ? new Date(b.checkIn).toLocaleDateString('ru-RU') : '—'}</td>
              <td className="px-2 py-1 border">{b.checkOut ? new Date(b.checkOut).toLocaleDateString('ru-RU') : '—'}</td>
              <td className="px-2 py-1 border">{b.room}</td>
              <td className="px-2 py-1 border whitespace-pre-line text-xs">{b.touristsFormatted}</td>
              <td className="px-2 py-1 border text-right">{Number(b.bruttoClient || 0).toFixed(2)}</td>
              <td className="px-2 py-1 border text-right">{Number(b.bruttoOperator || 0).toFixed(2)}</td>
              <td className="px-2 py-1 border text-right">{Number(b.net || 0).toFixed(2)}</td>
              <td className="px-2 py-1 border text-right">{Number(b.commission || 0).toFixed(2)}</td>
              <td className="px-2 py-1 border">{b.status}</td>
              <td className="px-2 py-1 border text-blue-600">{b.invoiceLink ? <a href={b.invoiceLink} target="_blank" rel="noopener noreferrer">Открыть</a> : '—'}</td>
              <td className="px-2 py-1 border">{b.comment || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
