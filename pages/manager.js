// pages/manager.js
import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import { calculateCommission } from '../lib/calculations';

const STATUSES = [
  'Новый',
  'В процессе',
  'Ожидание оплаты',
  'Подтверждено',
  'Вернулись',
  'Готов к выплате',
  'Выплачен',
  'Отменено'
];

export default function Manager() {
  const { currentUser, role } = useAuth();

  const [rows, setRows] = useState([]);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [f, setF] = useState({ code:'', date:'', operator:'', hotel:'', agent:'', status:'' });

  useEffect(() => {
    if (role !== 'manager') return;
    const q = query(collection(db,'bookings'), orderBy('createdAt','desc'));
    return onSnapshot(q, snap =>
      setRows(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    );
  }, [role]);

  const filtered = useMemo(() => rows.filter(r => (
    (r.bookingCode || '').toLowerCase().includes(f.code.toLowerCase()) &&
    (r.createdAt?.toDate().toLocaleDateString('ru-RU') || '').includes(f.date) &&
    (r.operator    || '').toLowerCase().includes(f.operator.toLowerCase()) &&
    (r.hotel       || '').toLowerCase().includes(f.hotel.toLowerCase()) &&
    ((r.agentName + ' ' + (r.agentAgency || '')) || r.agentEmail || '').toLowerCase().includes(f.agent.toLowerCase()) &&
    (f.status ? r.status === f.status : true)
  )), [rows, f]);

  const startEdit = row => {
    setEditId(row.id);
    setDraft({ ...row });
  };
  const cancel = () => {
    setEditId(null);
    setDraft({});
  };
  const save = async () => {
    const updatedCommission = calculateCommission(draft.operator, draft.bruttoClient, draft.bruttoOperator, draft.net);
    await updateDoc(doc(db, 'bookings', editId), { ...draft, commission: updatedCommission });
    cancel();
  };
  const remove = async id => {
    if (confirm('Удалить заявку?')) await deleteDoc(doc(db,'bookings', id));
  };

  if (role !== 'manager') return <p className="p-6">Нет доступа</p>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Все заявки</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm bg-white">
          <thead className="bg-gray-200">
            <tr>
              <th className="px-2 py-1 border"><input placeholder="Код" value={f.code} onChange={e=>setF({...f,code:e.target.value})} className="w-full border p-1 rounded" /></th>
              <th className="px-2 py-1 border"><input placeholder="Дата" value={f.date} onChange={e=>setF({...f,date:e.target.value})} className="w-full border p-1 rounded" /></th>
              <th className="px-2 py-1 border"><input placeholder="Оператор" value={f.operator} onChange={e=>setF({...f,operator:e.target.value})} className="w-full border p-1 rounded" /></th>
              <th className="px-2 py-1 border"><input placeholder="Агент" value={f.agent} onChange={e=>setF({...f,agent:e.target.value})} className="w-full border p-1 rounded" /></th>
              <th className="px-2 py-1 border"><input placeholder="Отель" value={f.hotel} onChange={e=>setF({...f,hotel:e.target.value})} className="w-full border p-1 rounded" /></th>
              <th className="px-2 py-1 border">Check-in</th>
              <th className="px-2 py-1 border">Check-out</th>
              <th className="px-2 py-1 border">Комната</th>
              <th className="px-2 py-1 border w-64">Туристы</th>
              <th className="px-2 py-1 border text-right">Netto €</th>
              <th className="px-2 py-1 border text-right">Brutto клиента €</th>
              <th className="px-2 py-1 border text-right">Brutto оператора €</th>
              <th className="px-2 py-1 border text-right">Комиссия</th>
              <th className="px-2 py-1 border">
                <select value={f.status} onChange={e=>setF({...f,status:e.target.value})} className="w-full border p-1 rounded">
                  <option value="">Все</option>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </th>
              <th className="px-2 py-1 border">Ссылка</th>
              <th className="px-2 py-1 border">Комментарий</th>
              <th className="px-2 py-1 border">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-2 py-1 border">{r.bookingCode}</td>
                <td className="px-2 py-1 border">{r.createdAt?.toDate().toLocaleDateString('ru-RU')}</td>
                <td className="px-2 py-1 border">{editId===r.id ? <input value={draft.operator} onChange={e=>setDraft({...draft,operator:e.target.value})} className="border p-1 w-full"/> : r.operator}</td>
                <td className="px-2 py-1 border">{r.agentAgency ? `${r.agentAgency} – ${r.agentName}` : r.agentName || r.agentEmail || '—'}</td>
                <td className="px-2 py-1 border">{editId===r.id ? <input value={draft.hotel} onChange={e=>setDraft({...draft,hotel:e.target.value})} className="border p-1 w-full"/> : r.hotel}</td>
                <td className="px-2 py-1 border">{editId===r.id ? <input type="date" value={draft.checkIn} onChange={e=>setDraft({...draft,checkIn:e.target.value})} className="border p-1 w-full"/> : (r.checkIn ? new Date(r.checkIn).toLocaleDateString('ru-RU') : '—')}</td>
                <td className="px-2 py-1 border">{editId===r.id ? <input type="date" value={draft.checkOut} onChange={e=>setDraft({...draft,checkOut:e.target.value})} className="border p-1 w-full"/> : (r.checkOut ? new Date(r.checkOut).toLocaleDateString('ru-RU') : '—')}</td>
                <td className="px-2 py-1 border">{editId===r.id ? <input value={draft.room} onChange={e=>setDraft({...draft,room:e.target.value})} className="border p-1 w-full"/> : r.room}</td>
                <td className="px-2 py-1 border whitespace-pre-line text-xs">
                  {Array.isArray(r.tourists)
                    ? r.tourists.map((t, i) => `${i+1}. ${t.last || ''} ${t.first || ''} (${t.dob ? new Date(t.dob).toLocaleDateString('ru-RU') : ''})`).join('\n')
                    : '—'}
                </td>
                <td className="px-2 py-1 border text-right">{Number(r.net).toFixed(2)}</td>
                <td className="px-2 py-1 border text-right">{editId===r.id ? <input type="number" step="0.01" value={draft.bruttoClient} onChange={e=>setDraft({...draft,bruttoClient:+e.target.value})} className="border p-1 w-full text-right"/> : Number(r.bruttoClient).toFixed(2)}</td>
                <td className="px-2 py-1 border text-right">{editId===r.id ? <input type="number" step="0.01" value={draft.bruttoOperator} onChange={e=>setDraft({...draft,bruttoOperator:+e.target.value})} className="border p-1 w-full text-right"/> : Number(r.bruttoOperator).toFixed(2)}</td>
                <td className="px-2 py-1 border text-right">{Number(r.commission).toFixed(2)}</td>
                <td className="px-2 py-1 border">{editId===r.id ? <select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})} className="border p-1 w-full">{STATUSES.map(s=><option key={s}>{s}</option>)}</select> : <StatusBadge status={r.status}/>}</td>
                <td className="px-2 py-1 border">{editId===r.id ? <input value={draft.invoiceLink} onChange={e=>setDraft({...draft,invoiceLink:e.target.value})} className="border p-1 w-full"/> : (r.invoiceLink ? <a href={r.invoiceLink} target="_blank" rel="noopener noreferrer" className="text-blue-600">Открыть</a> : '—')}</td>
                <td className="px-2 py-1 border">{editId===r.id ? <input value={draft.comment} onChange={e=>setDraft({...draft,comment:e.target.value})} className="border p-1 w-full"/> : (r.comment || '—')}</td>
                <td className="px-2 py-1 border">
                  {editId===r.id ? (
                    <>
                      <button onClick={save} className="text-green-600 mr-2">💾</button>
                      <button onClick={cancel} className="text-gray-600">✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={()=>startEdit(r)} className="text-blue-600 mr-2">✏️</button>
                      <button onClick={()=>remove(r.id)} className="text-red-600">🗑️</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
