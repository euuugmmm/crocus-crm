// components/BookingFormAgent.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const OPERATORS = [
  { label: "TOCO TOUR RO", val: "TOCO TOUR RO", allowNet: true },
  { label: "TOCO TOUR MD", val: "TOCO TOUR MD", allowNet: true },
  { label: "KARPATEN", val: "KARPATEN", allowNet: false },
  { label: "DERTOUR", val: "DERTOUR", allowNet: false },
  { label: "CHRISTIAN", val: "CHRISTIAN", allowNet: false },
];

export default function BookingFormAgent({
  onSubmit,
  bookingNumber = "",
  agentName = "",
  agentAgency = ""
}) {
  const router = useRouter();

  const [operator, setOperator] = useState("");
  const [region, setRegion] = useState("");
  const [hotel, setHotel] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [room, setRoom] = useState("");
  const [bruttoClient, setBruttoClient] = useState("");
  const [bruttoOperator, setBruttoOperator] = useState("");
  const [nettoOperator, setNettoOperator] = useState("");
  const [commission, setCommission] = useState(0);
  const [comment, setComment] = useState("");
  const [tourists, setTourists] = useState([{ name: "", dob: "" }]);

  const opInfo = OPERATORS.find(o => o.val === operator);

  useEffect(() => {
    const bc = parseFloat(bruttoClient) || 0;
    const bo = parseFloat(bruttoOperator) || 0;
    const n = parseFloat(nettoOperator) || 0;
    let comm = 0;

    if (opInfo?.allowNet) {
      comm = (bc - n) * 0.8;
    } else {
      const markup = bc - bo;
      comm = bo * 0.03 + (markup > 0 ? markup * 0.8 : 0);
    }

    setCommission(Math.round(comm * 100) / 100);
  }, [bruttoClient, bruttoOperator, nettoOperator, operator]);

  const addTourist = () => setTourists([...tourists, { name: "", dob: "" }]);
  const updateTourist = (index, field, value) => {
    setTourists(tourists.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanedTourists = tourists.filter(t => t.name || t.dob);
    const data = {
      bookingNumber,
      operator,
      region,
      hotel,
      checkIn,
      checkOut,
      room,
      tourists: cleanedTourists,
      bruttoClient: parseFloat(bruttoClient) || 0,
      bruttoOperator: parseFloat(bruttoOperator) || 0,
      nettoOperator: parseFloat(nettoOperator) || 0,
      commission,
      comment,
      status: "Новая"
    };
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-100 p-2 rounded text-sm text-gray-700">
        <p><strong>Имя агента:</strong> {agentName}</p>
        <p><strong>Агентство:</strong> {agentAgency}</p>
      </div>

      <label className="block font-medium">Оператор</label>
      <select required value={operator} onChange={e => setOperator(e.target.value)} className="w-full border rounded p-2">
        <option value="">Выберите…</option>
        {OPERATORS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
      </select>

      <label className="block font-medium">Направление</label>
      <input type="text" value={region} onChange={e => setRegion(e.target.value)} className="w-full border rounded p-2" required />

      <label className="block font-medium">Отель</label>
      <input type="text" value={hotel} onChange={e => setHotel(e.target.value)} className="w-full border rounded p-2" required />

      <div className="flex space-x-4">
        <div className="flex-1">
          <label className="block font-medium">Заезд</label>
          <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} className="w-full border rounded p-2" required />
        </div>
        <div className="flex-1">
          <label className="block font-medium">Выезд</label>
          <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} className="w-full border rounded p-2" required />
        </div>
      </div>

      <label className="block font-medium">Комната</label>
      <input type="text" value={room} onChange={e => setRoom(e.target.value)} className="w-full border rounded p-2" />

      <label className="block font-medium">Туристы</label>
      {tourists.map((t, i) => (
        <div key={i} className="flex space-x-2 mb-2">
          <input type="text" placeholder="Фамилия Имя" value={t.name} onChange={e => updateTourist(i, "name", e.target.value)} className="flex-1 border rounded p-2" required />
          <input type="date" placeholder="Дата рождения" value={t.dob} onChange={e => updateTourist(i, "dob", e.target.value)} className="flex-1 border rounded p-2" required />
        </div>
      ))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">+ Добавить туриста</button>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Brutto клиента (€)</label>
          <input type="number" step="0.01" value={bruttoClient} onChange={e => setBruttoClient(e.target.value)} className="w-full border rounded p-2" required />
        </div>
        <div>
          <label className="block font-medium">Brutto оператора (€)</label>
          <input type="number" step="0.01" disabled={opInfo?.allowNet} value={bruttoOperator} onChange={e => setBruttoOperator(e.target.value)} className="w-full border rounded p-2" required={!opInfo?.allowNet} />
        </div>
      </div>

      {opInfo?.allowNet && (
        <div>
          <label className="block font-medium">Netto оператора (€)</label>
          <input type="number" step="0.01" value={nettoOperator} onChange={e => setNettoOperator(e.target.value)} className="w-full border rounded p-2" required />
        </div>
      )}

      <div>
        <label className="block font-medium">Комментарий</label>
        <textarea value={comment} onChange={e => setComment(e.target.value)} className="w-full border rounded p-2" />
      </div>

      <div className="p-3 bg-gray-50 border rounded text-sm">
        <p><strong>Рассчитанная комиссия агента:</strong> {commission.toFixed(2)} €</p>
      </div>

      <div className="flex justify-between">
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          Создать заявку
        </button>
        <button type="button" onClick={() => router.push("/agent/bookings")} className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-600">
          Отмена
        </button>
      </div>
    </form>
  );
}