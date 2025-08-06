// pages/batch/[id].js
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext.js';

/**
 * Страница просмотра payout‑batch.
 * Позволяет менеджеру убедиться в суммах и пометить batch как «paid».
 */
export default function BatchPage() {
  const router = useRouter();
  const { id } = router.query; // batch id
  const { user, loading } = useAuth();
  const [batch, setBatch] = useState(null); // {total, items, status, ...}
  const [bookings, setBookings] = useState([]); // list of booking docs

  // load batch + bookings
  useEffect(() => {
    if (!id || loading) return;
    (async () => {
      // batch doc
      const bRef = doc(db, 'payoutBatches', id);
      const bSnap = await getDoc(bRef);
      if (!bSnap.exists()) return;
      const data = { id, ...bSnap.data() };
      setBatch(data);

      // bookings list
      if (Array.isArray(data.items) && data.items.length) {
        const col = collection(db, 'bookings');
        const snaps = await Promise.all(data.items.map((bid) => getDoc(doc(col, bid))));
        setBookings(snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() })));
      }
    })();
  }, [id, loading]);

  const markPaid = async () => {
    if (!batch) return;
    await updateDoc(doc(db, 'payoutBatches', id), {
      status: 'paid',
      paidAt: new Date().toISOString(),
    });
    setBatch((prev) => ({ ...prev, status: 'paid', paidAt: new Date().toISOString() }));
  };

  if (loading || !batch) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Batch #{id}</h1>
        {batch.status === 'pending' && (
          <button onClick={markPaid} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">
            Отметить как paid
          </button>
        )}
      </div>

      <p className="mb-2"><b>Агент:</b> {batch.agentName} ({batch.agentId})</p>
      <p className="mb-2"><b>Сумма к выплате:</b> €{batch.total.toFixed(2)}</p>
      <p className="mb-4"><b>Статус:</b> {batch.status === 'paid' ? 'Paid' : 'Pending'}</p>

      <table className="min-w-full border text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-1">Booking</th>
            <th className="px-2 py-1">Дата</th>
            <th className="px-2 py-1">Brutto</th>
            <th className="px-2 py-1">Доход агента €</th>
            <th className="px-2 py-1">Статус</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-t hover:bg-gray-50">
              <td className="px-2 py-1 whitespace-nowrap">{b.bookingNumber}</td>
              <td className="px-2 py-1 whitespace-nowrap">
                {b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1e3).toLocaleDateString('ru-RU') : '—'}
              </td>
              <td className="px-2 py-1 text-right">{b.priceBrutto}</td>
              <td className="px-2 py-1 text-right">{b.agentProfit}</td>
              <td className="px-2 py-1">{b.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
