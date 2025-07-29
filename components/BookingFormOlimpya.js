import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import InputMask from "react-input-mask-next";
import UploadScreenshots from "@/components/UploadScreenshots";

const OPERATORS = [
  { label: "TOCO TOUR RO", val: "TOCO TOUR RO", allowNet: true },
  { label: "TOCO TOUR MD", val: "TOCO TOUR MD", allowNet: true },
  { label: "KARPATEN", val: "KARPATEN", allowNet: false },
  { label: "DERTOUR", val: "DERTOUR", allowNet: false },
  { label: "CHRISTIAN", val: "CHRISTIAN", allowNet: false },
  { label: "CORAL TRAVEL RO", val: "CORAL TRAVEL RO", allowNet: false },
  { label: "JOIN UP RO", val: "JOIN UP RO", allowNet: false },
  { label: "ANEX TOUR RO", val: "ANEX TOUR RO", allowNet: false },
];

const BASES = [
  { label: "Игорь", val: "igor" },
  { label: "Евгений", val: "evgeniy" },
  { label: "Crocus", val: "crocus" },
];

const STATUS_OPTIONS = [
  { label: "Новая", val: "new" },
  { label: "Заведено DMC", val: "created_dmc" },
  { label: "Заведено Toco", val: "created_toco" },
  { label: "Подтверждено DMC + Авиа", val: "confirmed_dmc_flight" },
  { label: "Подтверждено", val: "confirmed" },
  { label: "Завершено", val: "finished" },
  { label: "Отменено", val: "cancelled" },
];

export default function BookingFormOlimpya({
  onSubmit,
  bookingNumber = "",
  agentName = "",
  agentAgency = "",
}) {
  const router = useRouter();

  // поля формы
  const [base, setBase] = useState("igor");
  const [operator, setOperator] = useState("");
  const [region, setRegion] = useState("");
  const [departureCity, setDepartureCity] = useState("");
  const [arrivalCity, setArrivalCity] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [flightTime, setFlightTime] = useState("");
  const [hotel, setHotel] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [room, setRoom] = useState("");
  const [mealPlan, setMealPlan] = useState("");
  const [bruttoClient, setBruttoClient] = useState("");
  const [nettoOlimpya, setNettoOlimpya] = useState("");
  const [internalNet, setinternalNet] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [status, setStatus] = useState("created_dmc");
  const [comment, setComment] = useState("");

  const [tourists, setTourists] = useState([
    { name: "", dob: "", passportNumber: "", passportValidUntil: "", nationality: "", hasEUDoc: false },
  ]);

  // расчёт комиссий
  const [commissionO, setCommissionO] = useState(0);
  const [overCommission, setOverCommission] = useState(0);
  const [realCommission, setRealCommission] = useState(0);
  const [commissionIgor, setCommissionIgor] = useState(0);
  const [commissionEvgeniy, setCommissionEvgeniy] = useState(0);

  useEffect(() => {
    const bc = parseFloat(bruttoClient) || 0;
    const no = parseFloat(nettoOlimpya) || 0;
    const nf = parseFloat(internalNet) || 0;

    const O = bc - no; // основная комиссия
    const real = bc - nf; // реальная комиссия
    const over = no - nf; // оверкомиссия

    let ig = 0, ev = 0;
    if (base === "igor") {
      ig = O + Math.max(0, over) * 0.30;
      ev = Math.max(0, over) * 0.70;
    } else if (base === "evgeniy") {
      ev = O + Math.max(0, over) * 0.70;
      ig = Math.max(0, over) * 0.30;
    } else { // crocus
      ig = real * 0.50;
      ev = real * 0.50;
    }

    const rnd = x => Math.round(x * 100) / 100;
    setCommissionO(rnd(O));
    setOverCommission(rnd(over));
    setRealCommission(rnd(real));
    setCommissionIgor(rnd(ig));
    setCommissionEvgeniy(rnd(ev));
  }, [bruttoClient, nettoOlimpya, internalNet, base]);

  const opInfo = OPERATORS.find(o => o.val === operator);

  const renderMaskedInput = (value, setter) => (
    <InputMask
      mask="99.99.9999"
      value={value}
      onChange={e => setter(e.target.value)}
      className="w-full border rounded p-2"
      placeholder="дд.мм.гггг"
    />
  );

  // туристы
  const addTourist = () =>
    setTourists(prev => [...prev, { name: "", dob: "", passportNumber: "", passportValidUntil: "", nationality: "", hasEUDoc: false }]);
  const removeTourist = i =>
    setTourists(prev => prev.filter((_, idx) => idx !== i));
  const updateTourist = (i, field, val) =>
    setTourists(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));

  // отправка
  async function handleSubmit(e) {
    e.preventDefault();
    await onSubmit({
      bookingNumber,
      bookingType: "olimpya_base",
      baseType: base,
      operator,
      region,
      departureCity,
      arrivalCity,
      flightNumber,
      flightTime,
      hotel,
      checkIn,
      checkOut,
      room,
      mealPlan,
      tourists: tourists.filter(t => t.name.trim()),
      bruttoClient: parseFloat(bruttoClient) || 0,
      nettoOlimpya: parseFloat(nettoOlimpya) || 0,
      internalNet: parseFloat(internalNet) || 0,
      paymentMethod,
      status,
      commissionO,
      overCommission,
      realCommission,
      commissionIgor,
      commissionEvgeniy,
      comment,
    });
    router.push("/olimpya/bookings");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* шапка */}
      <div className="bg-gray-100 p-2 rounded text-sm">
        <p><strong>Имя агента:</strong> {agentName}</p>
        <p><strong>Агентство:</strong> {agentAgency}</p>
        <p><strong>Заявка №:</strong> {bookingNumber}</p>
      </div>

      {/* выбор базы */}
      <label className="block font-medium">База клиента</label>
      <select
        className="w-full border rounded p-2"
        value={base}
        onChange={e => setBase(e.target.value)}
        required
      >
        {BASES.map(b => (
          <option key={b.val} value={b.val}>{b.label}</option>
        ))}
      </select>

      {/* оператор */}
      <label className="block font-medium">Оператор</label>
      <select
        className="w-full border rounded p-2"
        value={operator}
        onChange={e => setOperator(e.target.value)}
        required
      >
        <option value="">-- выбрать оператор --</option>
        {OPERATORS.map(o => (
          <option key={o.val} value={o.val}>{o.label}</option>
        ))}
      </select>

      {/* текстовые поля */}
      {[
        ["Регион", region, setRegion],
        ["Город вылета", departureCity, setDepartureCity],
        ["Город прилета", arrivalCity, setArrivalCity],
        ["Номер рейса", flightNumber, setFlightNumber],
        ["Отель", hotel, setHotel],
        ["Тип комнаты", room, setRoom],
        ["План питания", mealPlan, setMealPlan],
      ].map(([label, val, setter]) => (
        <div key={label}>
          <label className="block font-medium">{label}</label>
          <input
            type="text"
            value={val}
            onChange={e => setter(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
      ))}

      {/* даты */}
      <div>
        <label className="block font-medium">Дата заезда</label>
        {renderMaskedInput(checkIn, setCheckIn)}
      </div>
      <div>
        <label className="block font-medium">Дата выезда</label>
        {renderMaskedInput(checkOut, setCheckOut)}
      </div>

      {/* туристы */}
      <h3 className="text-lg font-semibold">Туристы</h3>
      {tourists.map((t, i) => (
        <div key={i} className="relative border p-4 rounded mb-4">
          {tourists.length > 1 && (
            <button
              type="button"
              onClick={() => removeTourist(i)}
              className="absolute top-2 right-2 text-red-500"
            >🗑</button>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium">Имя</label>
              <input
                type="text"
                value={t.name}
                onChange={e => updateTourist(i, "name", e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block font-medium">ДР (дд.мм.гггг)</label>
              {renderMaskedInput(t.dob, v => updateTourist(i, "dob", v))}
            </div>
            <div>
              <label className="block font-medium">№ паспорта</label>
              <input
                type="text"
                value={t.passportNumber}
                onChange={e => updateTourist(i, "passportNumber", e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block font-medium">Действителен до</label>
              {renderMaskedInput(t.passportValidUntil, v => updateTourist(i, "passportValidUntil", v))}
            </div>
            <div>
              <label className="block font-medium">Гражданство</label>
              <input
                type="text"
                value={t.nationality}
                onChange={e => updateTourist(i, "nationality", e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>
            <div className="flex items-center mt-2">
              <input
                type="checkbox"
                checked={t.hasEUDoc}
                onChange={e => updateTourist(i, "hasEUDoc", e.target.checked)}
                className="mr-2"
              />
              <label>EU документ</label>
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">+ добавить туриста</button>

      {/* финансовые данные */}
      <h3 className="text-lg font-semibold mt-4">Финансовые данные</h3>
      <div>
        <label className="block font-medium">Brutto туриста</label>
        <input
          type="number"
          value={bruttoClient}
          onChange={e => setBruttoClient(e.target.value)}
          className="w-full border rounded p-2"
        />
      </div>
      <div>
        <label className="block font-medium">Netto Олимпия</label>
        <input
          type="number"
          value={nettoOlimpya}
          onChange={e => setNettoOlimpya(e.target.value)}
          className="w-full border rounded p-2"
        />
      </div>
      <div>
        <label className="block font-medium">Netto Fact</label>
        <input
          type="number"
          value={internalNet}
          onChange={e => setinternalNet(e.target.value)}
          className="w-full border rounded p-2"
        />
      </div>
     


      {/* расчёт комиссий */}
      <div className="p-3 bg-gray-50 border rounded text-sm space-y-1">
        <p><strong>Комиссия Олимпия (O):</strong> {commissionO} €</p>
        <p><strong>Оверкомиссия:</strong> {overCommission} €</p>
        <p><strong>Комиссия реальная:</strong> {realCommission} €</p>
        <p><strong>Игорю:</strong> {commissionIgor} €</p>
        <p><strong>Евгению:</strong> {commissionEvgeniy} €</p>
      </div>

      {/* комментарий */}
      <div>
        <label className="block font-medium">Комментарий</label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          className="w-full border rounded p-2"
        />
      </div>

      {/* загрузки */}
      <UploadScreenshots bookingDocId={bookingNumber} bookingNumber={bookingNumber} />

      {/* кнопки */}
      <div className="flex justify-between mt-4">
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          Создать заявку
        </button>
        <button type="button" onClick={() => router.back()} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
          Отмена
        </button>
      </div>
    </form>
  );
}