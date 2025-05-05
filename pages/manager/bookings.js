import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { collection, query, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { DownloadTableExcel } from 'react-export-table-to-excel';

export default function ManagerBookings() {
  const router = useRouter();
  const { user, userData, loading, isManager, logout } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [filters, setFilters] = useState({ operator: '', hotel: '', status: '' });
  const tableRef = useRef(null);

  useEffect(() => {
    if (!user || !isManager) return;
    const q = query(collection(db, 'bookings'));
    const unsubscribe = onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
        const d1 = a.createdAt?.seconds || 0;
        const d2 = b.createdAt?.seconds || 0;
        return d2 - d1;
      });
      setBookings(data);
    });
    return () => unsubscribe();
  }, [user, isManager]);

  const handleDelete = async (id, bookingNumber) => {
    const confirm = window.confirm(`Удалить заявку ${bookingNumber}?`);
    if (!confirm) return;
    try {
      await deleteDoc(doc(db, 'bookings', id));
    } catch (err) {
      alert('Ошибка при удалении');
      console.error(err);
    }
  };

  const filteredBookings = bookings.filter(b =>
    b.operator?.toLowerCase().includes(filters.operator.toLowerCase()) &&
    b.hotel?.toLowerCase().includes(filters.hotel.toLowerCase()) &&
    b.status?.toLowerCase().includes(filters.status.toLowerCase())
  );

  const totalBrutto = filteredBookings.reduce((sum, b) => sum + (b.bruttoClient || 0), 0);
  const totalCommission = filteredBookings.reduce((sum, b) => sum + (b.commission || 0), 0);
  const totalCrocus = filteredBookings.reduce((sum, b) => sum + (((b.bruttoClient || 0) - (b.internalNet || 0) - (b.commission || 0) - ((b.commission || 0) / 0.9 - (b.commission || 0)) - (b.bankFeeAmount || 0))), 0);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Заявки менеджера</h1>
        <div className="flex gap-2">
          <DownloadTableExcel
            filename="manager_bookings"
            sheet="Заявки"
            currentTableRef={tableRef.current}
          >
            <button className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded">
              Экспорт в Excel
            </button>
          </DownloadTableExcel>
          <button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            Выйти
          </button>
        </div>
      </div>

      <table ref={tableRef} className="min-w-full border text-sm table-fixed">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-1 border">Дата</th>
            <th className="px-2 py-1 border">№</th>
            <th className="px-2 py-1 border">Агент</th>
            <th className="px-2 py-1 border">Оператор</th>
            <th className="px-2 py-1 border">Отель</th>
            <th className="px-2 py-1 border">Заезд</th>
            <th className="px-2 py-1 border">Выезд</th>
            <th className="px-2 py-1 border">Клиент (€)</th>
            <th className="px-2 py-1 border">Комиссия (€)</th>
            <th className="px-2 py-1 border">Крокус (€)</th>
            <th className="px-2 py-1 border">Статус</th>
            <th className="px-2 py-1 border">Инвойс</th>
            <th className="px-2 py-1 border">Комментарий</th>
            <th className="px-2 py-1 border">Действия</th>
          </tr>
          <tr className="bg-white border-b">
            <td></td>
            <td></td>
            <td></td>
            <td>
              <input
                value={filters.operator}
                onChange={e => setFilters({ ...filters, operator: e.target.value })}
                className="w-full px-1 border rounded"
                placeholder="Фильтр"
              />
            </td>
            <td>
              <input
                value={filters.hotel}
                onChange={e => setFilters({ ...filters, hotel: e.target.value })}
                className="w-full px-1 border rounded"
                placeholder="Фильтр"
              />
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td>
              <select
                value={filters.status}
                onChange={e => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-1 border rounded"
              >
                <option value="">Все</option>
                <option value="Новая">Новая</option>
                <option value="Готова к оплате">Готова к оплате</option>
                <option value="Оплачено">Оплачено</option>
                <option value="Ожидает подтверждения">Ожидает подтверждения</option>
                <option value="Подтверждено">Подтверждено</option>
                <option value="Документы загружены">Документы загружены</option>
                <option value="Завершено">Завершено</option>
              </select>
            </td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </thead>
        <tbody>
          {filteredBookings.map(b => {
            const created = b.createdAt?.toDate
              ? b.createdAt.toDate().toLocaleDateString('ru-RU')
              : (typeof b.createdAt === 'string' ? b.createdAt.split('T')[0].split('-').reverse().join('.') : '-');

            const crocusProfit = ((b.bruttoClient || 0) - (b.internalNet || 0) - (b.commission || 0) - ((b.commission || 0) / 0.9 - (b.commission || 0)) - (b.bankFeeAmount || 0)).toFixed(2);

            return (
              <tr key={b.id} className="border-t hover:bg-gray-50">
                <td className="px-2 py-1 border whitespace-nowrap">{created}</td>
                <td className="px-2 py-1 border whitespace-nowrap">{b.bookingNumber || '—'}</td>
                <td className="px-2 py-1 border truncate max-w-[160px]">{b.agentName || '—'} ({b.agentAgency || '—'})</td>
                <td className="px-2 py-1 border truncate max-w-[120px]">{b.operator}</td>
                <td className="px-2 py-1 border truncate max-w-[160px]">{b.hotel}</td>
                <td className="px-2 py-1 border whitespace-nowrap">{b.checkIn ? new Date(b.checkIn).toLocaleDateString('ru-RU') : '-'}</td>
                <td className="px-2 py-1 border whitespace-nowrap">{b.checkOut ? new Date(b.checkOut).toLocaleDateString('ru-RU') : '-'}</td>
                <td className="px-2 py-1 border text-right">{b.bruttoClient?.toFixed(2) || '—'}</td>
                <td className="px-2 py-1 border text-right">{b.commission?.toFixed(2) || '—'}</td>
                <td className="px-2 py-1 border text-right">{crocusProfit}</td>
                <td className="px-2 py-1 border">{b.status || '—'}</td>
                <td className="px-2 py-1 border">
                  {b.invoiceLink ? <a href={b.invoiceLink} target="_blank" className="text-blue-500" rel="noreferrer">Открыть</a> : '—'}
                </td>
                <td className="px-2 py-1 border truncate max-w-[160px]">{b.comment || '—'}</td>
                <td className="px-2 py-1 border">
                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/manager/${b.id}`)}
                      className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600"
                    >Редактировать</button>
                    <button
                      onClick={() => handleDelete(b.id, b.bookingNumber || '—')}
                      className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600"
                    >Удалить</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-100 font-semibold">
          <tr>
            <td colSpan={7} className="px-2 py-2 text-right">Итого:</td>
            <td className="px-2 py-2 text-right">{totalBrutto.toFixed(2)} €</td>
            <td className="px-2 py-2 text-right">{totalCommission.toFixed(2)} €</td>
            <td className="px-2 py-2 text-right">{totalCrocus.toFixed(2)} €</td>
            <td colSpan={4}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
