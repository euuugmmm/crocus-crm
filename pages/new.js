// pages/new.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Timestamp, doc, runTransaction, collection, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { calculateCommission } from '../lib/calculations';

const OPERATORS = [
  { label: 'TOCO TOUR RO', val: 'TOCO TOUR RO', allowNet: true },
  { label: 'TOCO TOUR MD', val: 'TOCO TOUR MD', allowNet: true },
  { label: 'KARPATEN',     val: 'KARPATEN',     allowNet: false },
  { label: 'DERTOUR',      val: 'DERTOUR',      allowNet: false },
  { label: 'CHRISTIAN',    val: 'CHRISTIAN',    allowNet: false },
];

export default function NewBooking () {
  const router = useRouter();
  const { currentUser, role } = useAuth();

  const [operator, setOperator] = useState('');
  const [hotel, setHotel] = useState('');
  const [room, setRoom] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [tourists, setTourists] = useState([{ last:'', first:'', dob:'' }]);
  const [bruttoClient, setBruttoClient] = useState('');
  const [bruttoOperator, setBruttoOperator] = useState('');
  const [net, setNet] = useState('');
  const [commission, setCommission] = useState(0);
  const [comment, setComment] = useState('');

  useEffect(() => {
    const bc = +bruttoClient || 0;
    const bo = +bruttoOperator || 0;
    const n = +net || 0;
    setCommission(calculateCommission(operator, bc, bo, n));
  }, [operator, bruttoClient, bruttoOperator, net]);

  const addTourist = () => setTourists([...tourists, { last:'', first:'', dob:'' }]);
  const delTourist = idx => setTourists(tourists.filter((_,i)=>i!==idx));
  const updTourist = (idx, f, v) => {
    const copy = [...tourists];
    copy[idx][f] = v;
    setTourists(copy);
  };

  const submit = async e => {
    e.preventDefault();
    if (!currentUser) return;

    const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    await runTransaction(db, async tx => {
      const counterRef = doc(db,'counters','bookings');
      const counter = await tx.get(counterRef);
      const next = (counter.exists()? counter.data().last:1000) + 7;
      tx.set(counterRef,{last:next});

      const bookRef = doc(collection(db,'bookings'),'CRT'+next);
      tx.set(bookRef, {
        bookingNo: next,
        bookingCode: 'CRT'+next,
        agentId: currentUser.uid,
        agentEmail: currentUser.email,
        agentName: userData.name || '',
        agentAgency: userData.agency || '',
        operator,
        hotel,
        room,
        checkIn,
        checkOut,
        tourists: tourists.filter(t => t.last && t.first),
        bruttoClient: +bruttoClient || 0,
        bruttoOperator: +bruttoOperator || 0,
        net: +net || 0,
        commission,
        comment,
        status: 'Новый',
        createdAt: Timestamp.now(),
      });
    });

    router.push(role==='manager'?'/manager':'/my');
  };

  const opInfo = OPERATORS.find(o => o.val === operator);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Новая заявка</h1>

      <form onSubmit={submit} className="space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span>Оператор</span>
            <select required value={operator} onChange={e => setOperator(e.target.value)} className="mt-1 w-full border rounded p-2">
              <option value="">Выберите…</option>
              {OPERATORS.map(o => (
                <option key={o.val} value={o.val}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span>Отель</span>
            <input required value={hotel} onChange={e => setHotel(e.target.value)} className="mt-1 w-full border rounded p-2" />
          </label>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <label className="block">
            <span>Check-in</span>
            <input type="date" required value={checkIn} onChange={e => setCheckIn(e.target.value)} className="mt-1 w-full border rounded p-2" />
          </label>

          <label className="block">
            <span>Check-out</span>
            <input type="date" required value={checkOut} onChange={e => setCheckOut(e.target.value)} className="mt-1 w-full border rounded p-2" />
          </label>

          <label className="block">
            <span>Комната / тип</span>
            <input value={room} onChange={e => setRoom(e.target.value)} className="mt-1 w-full border rounded p-2" />
          </label>
        </div>

        <div>
          <span className="block mb-1">Туристы</span>
          {tourists.map((t, idx) => (
            <div key={idx} className="grid md:grid-cols-3 gap-2 mb-2">
              <input value={t.last} onChange={e => updTourist(idx, 'last', e.target.value)} placeholder="Фамилия" required className="border rounded p-2" />
              <input value={t.first} onChange={e => updTourist(idx, 'first', e.target.value)} placeholder="Имя" required className="border rounded p-2" />
              <input type="date" value={t.dob} onChange={e => updTourist(idx, 'dob', e.target.value)} required className="border rounded p-2" />
              <button type="button" onClick={() => delTourist(idx)} className="text-red-600 md:col-span-3 justify-self-end" title="Удалить">&times;</button>
            </div>
          ))}
          <button type="button" onClick={addTourist} className="text-green-600 mt-1">+ добавить туриста</button>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <label className="block">
            <span>Brutto клиента (€)</span>
            <input type="number" step="0.01" required value={bruttoClient} onChange={e => setBruttoClient(e.target.value)} className="mt-1 w-full border rounded p-2" />
          </label>

          <label className="block">
            <span>Brutto оператора (€)</span>
            <input type="number" step="0.01" disabled={opInfo?.allowNet} value={bruttoOperator} onChange={e => setBruttoOperator(e.target.value)} className={`mt-1 w-full border rounded p-2 ${opInfo?.allowNet && 'bg-gray-100 text-gray-500'}`} />
          </label>

          <label className="block">
            <span>Netto (€)</span>
            <input type="number" step="0.01" disabled={!opInfo?.allowNet} value={net} onChange={e => setNet(e.target.value)} className={`mt-1 w-full border rounded p-2 ${!opInfo?.allowNet && 'bg-gray-100 text-gray-500'}`} />
          </label>
        </div>

        <label className="block">
          <span>Комиссия (€)</span>
          <input readOnly value={commission} className="mt-1 w-full border rounded p-2 bg-gray-100" />
        </label>

        <label className="block">
          <span>Комментарий</span>
          <textarea rows="3" value={comment} onChange={e => setComment(e.target.value)} className="mt-1 w-full border rounded p-2" />
        </label>

        <button type="submit" className="bg-green-600 hover:bg-green-700 text-white py-2 px-6 rounded">Создать заявку</button>
      </form>
    </div>
  );
}
