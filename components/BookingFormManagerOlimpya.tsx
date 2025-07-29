"use client";

import { useState, useEffect, FormEvent } from "react";
import { useTranslation } from "next-i18next";
import InputMask from "react-input-mask-next";
import { format, parse, isValid } from "date-fns";      // ⬅️ parse + isValid


export interface Tourist {
  name: string;
  dob: string;
  passportNumber: string;
  passportValidUntil: string;
  nationality: string;
  hasEUDoc: boolean;
}

export interface OlimpyaBookingValues {
  bookingNumber?: string;
  bookingType?: string;
  baseType?: "igor" | "evgeniy" | "crocus";
  operator?: string;
  region?: string;
  departureCity?: string;
  arrivalCity?: string;
  flightNumber?: string;
  flightTime?: string;
  hotel?: string;
  checkIn?: string;
  checkOut?: string;
  room?: string;
  mealPlan?: string;
  tourists?: Tourist[];
  bruttoClient?: number;
  nettoOlimpya?: number;
  internalNet?: number;
  paymentMethod?: string;
  status?: string;
  commissionO?: number;
  overCommission?: number;
  realCommission?: number;
  commissionIgor?: number;
  commissionEvgeniy?: number;
  comment?: string;
  agentName?: string;
  agentAgency?: string;
}

interface Props {
  initialValues?: OlimpyaBookingValues;
  onSubmit: (values: OlimpyaBookingValues) => void;
  bookingNumber?: string;
  agentName?: string;
  agentAgency?: string;
}

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
  { label: "Подтверждено DMC", val: "confirmed_dmc" },
  { label: "Подтверждено DMC + Авиа", val: "confirmed_dmc_flight" },
  { label: "Подтверждено", val: "confirmed" },
  { label: "Завершено", val: "finished" },
  { label: "Отменено", val: "cancelled" },
];

export default function BookingFormManagerOlimpya({
  initialValues,
  onSubmit,
  bookingNumber = "",
  agentName = "",
  agentAgency = "",
}: Props) {
  const { t } = useTranslation("common");

  // form state
  const [base, setBase] = useState<"igor"|"evgeniy"|"crocus">("igor");
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

  const [tourists, setTourists] = useState<Tourist[]>([
    { name: "", dob: "", passportNumber: "", passportValidUntil: "", nationality: "", hasEUDoc: false },
  ]);

  // commission fields
  const [commissionO, setCommissionO] = useState(0);
  const [overCommission, setOverCommission] = useState(0);
  const [realCommission, setRealCommission] = useState(0);
  const [commissionIgor, setCommissionIgor] = useState(0);
  const [commissionEvgeniy, setCommissionEvgeniy] = useState(0);

  // init
  useEffect(() => {
    if (!initialValues) return;
    setBase(initialValues.baseType || "igor");
    setOperator(initialValues.operator || "");
    setRegion(initialValues.region || "");
    setDepartureCity(initialValues.departureCity || "");
    setArrivalCity(initialValues.arrivalCity || "");
    setFlightNumber(initialValues.flightNumber || "");
    setFlightTime(initialValues.flightTime || "");
    setHotel(initialValues.hotel || "");
    setCheckIn(initialValues.checkIn || "");
    setCheckOut(initialValues.checkOut || "");
    setRoom(initialValues.room || "");
    setMealPlan(initialValues.mealPlan || "");
    setBruttoClient(String(initialValues.bruttoClient ?? ""));
    setNettoOlimpya(String(initialValues.nettoOlimpya ?? ""));
    setinternalNet(String(initialValues.internalNet ?? ""));
    setPaymentMethod(initialValues.paymentMethod || "card");
    setStatus(initialValues.status || "created_dmc");
    setComment(initialValues.comment || "");
    setTourists(
      Array.isArray(initialValues.tourists) && initialValues.tourists.length
        ? initialValues.tourists
        : [{ name: "", dob: "", passportNumber: "", passportValidUntil: "", nationality: "", hasEUDoc: false }]
    );
  }, [initialValues]);

  // recalc commissions
  useEffect(() => {
    const bc = parseFloat(bruttoClient) || 0;
    const no = parseFloat(nettoOlimpya) || 0;
    const nf = parseFloat(internalNet) || 0;
    const O = bc - no;
    const real = bc - nf;
    const over = no - nf;
    let ig = 0, ev = 0;
    if (base === "igor") {
      ig = O + Math.max(0, over) * 0.30;
      ev = Math.max(0, over) * 0.70;
    } else if (base === "evgeniy") {
      ev = O + Math.max(0, over) * 0.70;
      ig = Math.max(0, over) * 0.30;
    } else {
      ig = real * 0.5;
      ev = real * 0.5;
    }
    const rnd = (x: number) => Math.round(x * 100) / 100;
    setCommissionO(rnd(O));
    setOverCommission(rnd(over));
    setRealCommission(rnd(real));
    setCommissionIgor(rnd(ig));
    setCommissionEvgeniy(rnd(ev));
  }, [bruttoClient, nettoOlimpya, internalNet, base]);


  /* ───────── helpers ───────── */
  const parseDMY = (s: string) => {
    /** пытаемся DD.MM.YYYY, иначе отдаём native */
    const p = parse(s, "dd.MM.yyyy", new Date());
    return isValid(p) ? p : new Date(s);
  };
  const age = (dob: string) => {
    const b = parseDMY(dob), n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n < new Date(b.setFullYear(b.getFullYear() + a))) a--;
    return a;
  };
  const fmt = (d?: string) => {
    if (!d) return "—";
    const parsed = parseDMY(d);
    return isValid(parsed) ? format(parsed, "dd.MM.yyyy") : "—";
  };
  

  const renderMaskedInput = (value: string, setter: (v: string) => void) => (
    <InputMask
      mask="99.99.9999"
      value={value}
      onChange={e => setter(e.target.value)}
      className="w-full border rounded p-2"
      placeholder="дд.мм.гггг"
    />
  );

  const addTourist = () =>
    setTourists(t=>[...t,{ name:"",dob:"",passportNumber:"",passportValidUntil:"",nationality:"",hasEUDoc:false,phone:"" }]);
  const delTourist = (idx:number) => setTourists(t=>t.filter((_,i)=>i!==idx));
  const chTourist  = (idx:number,f:keyof Tourist,v:any) =>
    setTourists(t=>t.map((tr,i)=>i===idx?{ ...tr,[f]:v }:tr));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      bookingNumber,
      bookingType: initialValues?.bookingType,
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
      tourists,
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
      agentName,
      agentAgency,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
      {/* ───── Info block ───── */}
      <div className="p-4 bg-gray-100 rounded-lg border space-y-4">
        <h2 className="text-lg font-semibold">Информация о заявке</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <p><strong>Агент:</strong> {agentName}</p>
          <p><strong>Агентство:</strong> {agentAgency}</p>
          <p><strong>Номер заявки:</strong> {bookingNumber}</p>
          <p><strong>Оператор:</strong> {operator}</p>
          <p><strong>Направление:</strong> {region}</p>
          <p><strong>Город вылета:</strong> {departureCity}</p>
          <p><strong>Город прилёта:</strong> {arrivalCity}</p>
          <p><strong>Отель:</strong> {hotel}</p>
          <p><strong>Период:</strong> {checkIn} → {checkOut}</p>
          <p><strong>Комната:</strong> {room}</p>
          <p><strong>Brutto клиента:</strong> {bruttoClient} €</p>
          <p><strong>Netto Олимпия:</strong> {nettoOlimpya} €</p>
          <p><strong>Netto Fact:</strong> {internalNet} €</p>
          <p><strong>Питание:</strong> {mealPlan}</p>
          <div className="col-span-full overflow-x-auto">
  <strong>Туристы:</strong>
  <div
    className="
      mt-2 grid gap-4 whitespace-nowrap
      grid-cols-[minmax(250px,_auto)_max-content_max-content_max-content_max-content_max-content_max-content]
    "
  >
    {/* ФИО */}
    <div>
      <p className="sr-only">ФИО</p>
      {tourists.map((t, i) => (
        <p key={i}>{t.name}</p>
      ))}
    </div>
    {/* Возраст */}
    <div>
      <p className="sr-only">Возраст</p>
      {tourists.map((t, i) => (
        <p key={i}>{age(t.dob)}</p>
      ))}
    </div>
    {/* Дата рождения */}
    <div>
      <p className="sr-only">Дата рождения</p>
      {tourists.map((t, i) => (
        <p key={i}>{fmt(t.dob)}</p>
      ))}
    </div>
    {/* Гражданство */}
    <div>
      <p className="sr-only">Гражданство</p>
      {tourists.map((t, i) => (
        <p key={i}>{t.nationality}</p>
      ))}
    </div>
    {/* Паспорт № */}
    <div>
      <p className="sr-only">Паспорт №</p>
      {tourists.map((t, i) => (
        <p key={i}>{t.passportNumber}</p>
      ))}
    </div>
    {/* Действителен до */}
    <div>
      <p className="sr-only">Действителен до</p>
      {tourists.map((t, i) => (
        <p key={i}>{fmt(t.passportValidUntil)}</p>
      ))}
    </div>
    {/* Телефон (только первый) */}
    
  </div>
</div>
        </div>
      </div>

      {/* ───── База и оператор ───── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">База клиента</label>
          <select
            className="w-full border rounded p-2"
            value={base}
            onChange={e => setBase(e.target.value as any)}
            required
          >
            {BASES.map(b => (
              <option key={b.val} value={b.val}>{b.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium">Оператор</label>
          <select
            className="w-full border rounded p-2"
            value={operator}
            onChange={e => setOperator(e.target.value)}
            required
          >
            <option value="">— выберите —</option>
            {OPERATORS.map(o => (
              <option key={o.val} value={o.val}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ───── Маршрут и отель ───── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Направление</label>
          <input
            className="w-full border rounded p-2"
            value={region}
            onChange={e => setRegion(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block font-medium">Отель</label>
          <input
            className="w-full border rounded p-2"
            value={hotel}
            onChange={e => setHotel(e.target.value)}
            required
          />
        </div>
      </div>

      {/* ───── Города и рейс ───── */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block font-medium">Город вылета</label>
          <input
            className="w-full border rounded p-2"
            value={departureCity}
            onChange={e => setDepartureCity(e.target.value)}
          />
        </div>
        <div>
          <label className="block font-medium">Город прилёта</label>
          <input
            className="w-full border rounded p-2"
            value={arrivalCity}
            onChange={e => setArrivalCity(e.target.value)}
          />
        </div>
        <div>
          <label className="block font-medium">Номер рейса</label>
          <input
            className="w-full border rounded p-2"
            value={flightNumber}
            onChange={e => setFlightNumber(e.target.value)}
          />
        </div>
      </div>

      {/* ───── Даты ───── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Заезд</label>
          {renderMaskedInput(checkIn, setCheckIn)}
        </div>
        <div>
          <label className="block font-medium">Выезд</label>
          {renderMaskedInput(checkOut, setCheckOut)}
        </div>
      </div>

      {/* ------- туристы ------- */}
      <h3 className="text-lg font-semibold">Туристы</h3>
      {tourists.map((t, i) => (
        <div key={i} className="relative border p-4 rounded-lg bg-white mb-4 shadow-sm">
          {tourists.length > 1 && (
            <button type="button" onClick={() => delTourist(i)} className="absolute top-2 right-2 text-red-500">🗑</button>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              placeholder="ФИО"
              required
              value={t.name}
              onChange={e => chTourist(i, "name", e.target.value)}
              className="border rounded p-2"
            />
            {renderMaskedInput(t.dob, v => chTourist(i,"dob",v), )}
            <input
              placeholder="Паспорт №"
              value={t.passportNumber}
              onChange={e => chTourist(i, "passportNumber", e.target.value)}
              className="border rounded p-2"
            />
            {renderMaskedInput(t.passportValidUntil, v => chTourist(i,"passportValidUntil",v))}
            <input
              placeholder="Гражданство"
              value={t.nationality}
              onChange={e => chTourist(i, "nationality", e.target.value)}
              className="border rounded p-2"
            />
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={t.hasEUDoc}
                onChange={e => chTourist(i, "hasEUDoc", e.target.checked)}
              />
              <span>EU-документ</span>
            </label>
          </div>
        </div>
      ))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">+ Добавить туриста</button>

      {/* ───── Финансовые данные ───── */}
      <h3 className="text-lg font-semibold mt-4">Финансовые данные</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Brutto клиента (€)</label>
          <input
            type="number"
            step="0.01"
            className="w-full border rounded p-2"
            value={bruttoClient}
            onChange={e => setBruttoClient(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block font-medium">Netto Олимпия (€)</label>
          <input
            type="number"
            step="0.01"
            className="w-full border rounded p-2"
            value={nettoOlimpya}
            onChange={e => setNettoOlimpya(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="block font-medium">Netto Fact (€)</label>
        <input
          type="number"
          step="0.01"
          className="w-full border rounded p-2"
          value={internalNet}
          onChange={e => setinternalNet(e.target.value)}
        />
      </div>
      

      {/* ───── Статус ───── */}
      <div>
        <label className="block font-medium">Статус заявки</label>
        <select
          className="w-full border rounded p-2"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s.val} value={s.val}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* ───── Комиссии ───── */}
      <div className="p-3 bg-gray-50 border rounded text-sm space-y-1">
        <p><strong>Комиссия Олимпия (O):</strong> {commissionO} €</p>
        <p><strong>Оверкомиссия:</strong> {overCommission} €</p>
        <p><strong>Комиссия реальная:</strong> {realCommission} €</p>
        <p><strong>Игорю:</strong> {commissionIgor} €</p>
        <p><strong>Евгению:</strong> {commissionEvgeniy} €</p>
      </div>

      {/* ───── Комментарий ───── */}
      <div>
        <label className="block font-medium">Комментарий при создании</label>
        <textarea
          className="w-full border rounded p-2"
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
      </div>

      {/* ───── Кнопки ───── */}
      <div className="flex justify-between mt-4">
        <button type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          {initialValues ? "Сохранить" : "Создать"}
        </button>
        
        <button
          type="button"
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          onClick={() => window.history.back()}
        >
          Отмена
        </button>

      </div>
    </form>
  );
}