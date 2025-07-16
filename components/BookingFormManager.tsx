"use client";

import { useState, useEffect, FormEvent } from "react";
import { useTranslation } from "next-i18next";
import { format } from "date-fns";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

/* ───────── типы ───────── */
export interface Tourist {
  name: string;
  dob: string;
  passportNumber: string;
  passportValidUntil: string;
  nationality: string;
  hasEUDoc: boolean;
  phone?: string;
}
export interface BookingDTO {
  id?: string;
  agentId?: string;
  bookingNumber?: string;
  operator?: string;
  region?: string;
  departureCity?: string;
  arrivalCity?: string;
  flightNumber?: string;
  hotel?: string;
  checkIn?: string;
  checkOut?: string;
  room?: string;
  mealPlan?: string;
  tourists?: Tourist[];
  bruttoClient?: number;
  bruttoOperator?: number;
  nettoOperator?: number;
  internalNet?: number;
  commission?: number;
  bankFeeAmount?: number;
  paymentMethod?: "card" | "iban";
  comment?: string;
  invoiceLink?: string;
  status?: string;
  attachments?: File[];
  agentName?: string;
  agentAgency?: string;
  email?: string;
  crocusProfit?: number;

  createdAt?: string;
  updatedAt?: string;
}

interface Props {
  initialData?: Partial<BookingDTO>;
  onSubmit: (d: BookingDTO) => void;
  agentName?: string;
  agentAgency?: string;
  email?: string;
  bookingNumber?: string;
  isManager?: boolean;
}

/* ───────── helpers ───────── */
const age = (dob: string) => {
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(b.setFullYear(b.getFullYear() + a))) a--;
  return a;
};
const fmt = (d?: string) => (d ? format(new Date(d), "dd.MM.yyyy") : "—");

/* ───────── операторы ───────── */
type OperatorInfo = { label: string; val: string; allowNet: boolean };
const OPERATORS: OperatorInfo[] = [
  { label: "TOCO TOUR RO", val: "TOCO TOUR RO", allowNet: true },
  { label: "TOCO TOUR MD", val: "TOCO TOUR MD", allowNet: true },
  { label: "KARPATEN", val: "KARPATEN", allowNet: false },
  { label: "DERTOUR", val: "DERTOUR", allowNet: false },
  { label: "CHRISTIAN", val: "CHRISTIAN", allowNet: false },
  { label: "CORAL TRAVEL RO", val: "CORAL TRAVEL RO", allowNet: false },
  { label: "JOIN UP RO", val: "JOIN UP RO", allowNet: false },
  { label: "ANEX TOUR RO", val: "ANEX TOUR RO", allowNet: false },
];
const SHARE_CARD = 0.8, SHARE_IBAN = 0.85, CARD_FEE = 0.015;

const STATUS_OPTIONS = [
  "new","awaiting_payment","paid",
  "awaiting_confirm","confirmed","finished","cancelled",
] as const;

/* =================================================================== */
export default function BookingFormManager({
  initialData = {},
  onSubmit,
  agentName:  pAgent   = "",
  agentAgency:pAgency  = "",
  email:      pEmail   = "",
  bookingNumber: pBook = "",
}: Props) {
  const { t } = useTranslation("common");
  

  /* ───────── e-mail / agency из Firestore при необходимости ───────── */
  const [emailFS,setEmailFS]   = useState<string>();
  const [agencyFS,setAgencyFS] = useState<string>();

  useEffect(()=>{
    if ((pEmail && pAgency) || !initialData.agentId) return;
    getDoc(doc(db,"users",initialData.agentId))
      .then(s=>{
        const d=s.data()||{};
        if (!pEmail  && d.email)      setEmailFS(d.email);
        if (!pAgency && d.agencyName) setAgencyFS(d.agencyName);
      })
      .catch(()=>void 0);
  },[pEmail,pAgency,initialData.agentId]);

  const shownEmail   = pEmail  || initialData.email       || emailFS   || "—";
  const shownAgency  = pAgency || initialData.agentAgency || agencyFS  || "—";
  const shownBookNo  = pBook   || initialData.bookingNumber || initialData.id || "—";

  /* ───────── form state (всё, что нужно в JSX ниже) ───────── */
  const [operator,setOperator]         = useState(initialData.operator??"");
  const [region,setRegion]             = useState(initialData.region??"");
  const [departureCity,setDepartureCity]=useState(initialData.departureCity??"");
  const [arrivalCity,setArrivalCity]   = useState(initialData.arrivalCity??"");
  const [flightNumber,setFlightNumber] = useState(initialData.flightNumber??"");
  const [hotel,setHotel]               = useState(initialData.hotel??"");
  const [checkIn,setCheckIn]           = useState(initialData.checkIn??"");
  const [checkOut,setCheckOut]         = useState(initialData.checkOut??"");
  const [room,setRoom]                 = useState(initialData.room??"");
  const [mealPlan,setMealPlan]         = useState(initialData.mealPlan??"");

  const [paymentMethod,setPaymentMethod]=useState<"card"|"iban">(initialData.paymentMethod??"card");
  const [bruttoClient,setBruttoClient] = useState(String(initialData.bruttoClient??""));
  const [bruttoOperator,setBruttoOperator]=useState(String(initialData.bruttoOperator??""));
  const [nettoOperator,setNettoOperator]=useState(String(initialData.nettoOperator??""));
  const [internalNet,setInternalNet]   = useState(String(initialData.internalNet??""));
  const [bankFeeAmount,setBankFeeAmount]=useState(String(initialData.bankFeeAmount??""));
  const [commission,setCommission]     = useState<number>(initialData.commission??0);

  const [comment,setComment]           = useState(initialData.comment??"");
  const [invoiceLink,setInvoiceLink]   = useState(initialData.invoiceLink??"");
  const [status,setStatus]             = useState<string>((initialData.status as string)??"new");

  const [form, setForm] = useState<any>(initialData || {});

  const [attachments,setAttachments]   = useState<File[]>(initialData.attachments??[]);

  const [tourists,setTourists] = useState<Tourist[]>(
    initialData.tourists?.length
      ? initialData.tourists as Tourist[]
      : [{ name:"",dob:"",passportNumber:"",passportValidUntil:"",nationality:"",hasEUDoc:false,phone:"" }]
  );

  /* ───────── вычисления комиссии ───────── */
  const opInfo  = OPERATORS.find(o=>o.val===operator);
  const allowNet= opInfo?.allowNet ?? false;

  useEffect(()=>{
    const bc=parseFloat(bruttoClient)||0;
    const bo=parseFloat(bruttoOperator)||0;
    const net=parseFloat(nettoOperator)||0;
    const share=paymentMethod==="iban"?SHARE_IBAN:SHARE_CARD;

    const comm=allowNet?(bc-net)*share : bo*0.03+Math.max(0,bc-bo)*share;
    setCommission(Math.round(comm*100)/100);

    if(paymentMethod==="card"){
      if(!bankFeeAmount||bankFeeAmount==="0") setBankFeeAmount((bc*CARD_FEE).toFixed(2));
    } else setBankFeeAmount("0");
  },[bruttoClient,bruttoOperator,nettoOperator,paymentMethod,allowNet]);

  /* ───────── tourists helpers ───────── */
  const addTourist = () =>
    setTourists(t=>[...t,{ name:"",dob:"",passportNumber:"",passportValidUntil:"",nationality:"",hasEUDoc:false,phone:"" }]);
  const delTourist = (idx:number) =>
    setTourists(t=>t.filter((_,i)=>i!==idx));
  const chTourist  = (idx:number,f:keyof Tourist,v:any) =>
    setTourists(t=>t.map((tr,i)=>i===idx?{...tr,[f]:v}:tr));

  /* ───────── submit ───────── */
  const handleSubmit = (e:FormEvent) => {
    e.preventDefault();
    const bc=parseFloat(bruttoClient)||0;
    const net=parseFloat(internalNet)||0;
    const bank=parseFloat(bankFeeAmount)||0;
    const tax=Math.round((commission/0.9-commission)*100)/100;
    const crocusProfit=Math.round(((bc-net)-commission-tax-bank)*100)/100;

    onSubmit({
      ...initialData,
      bookingNumber: initialData.bookingNumber ?? pBook,
      operator,region,departureCity,arrivalCity,flightNumber,
      hotel,checkIn,checkOut,room,mealPlan,
      tourists: tourists.filter(t=>t.name),
      bruttoClient:bc,
      bruttoOperator:parseFloat(bruttoOperator)||0,
      nettoOperator:parseFloat(nettoOperator)||0,
      internalNet:net,
      paymentMethod,bankFeeAmount:bank,commission,
      comment,invoiceLink,status,attachments,
      agentName:pAgent,agentAgency:shownAgency,email:shownEmail,
      crocusProfit,
      updatedAt:new Date().toISOString(),
      createdAt:initialData.createdAt??new Date().toISOString(),
    });
  };

  /* ───────── цифры summary ───────── */
  const bcVal=parseFloat(bruttoClient)||0;
  const bankVal=parseFloat(bankFeeAmount)||0;
  const bankPct=bcVal?((bankVal/bcVal)*100).toFixed(2):"0.00";
  const taxVal=Math.round((commission/0.9-commission)*100)/100;
  const profit=Math.round(((bcVal-(parseFloat(internalNet)||0))-commission-taxVal-bankVal)*100)/100;

  /* ───────── UI ───────── */
  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
      {/* ───── Info block ───── */}
      <div className="p-4 bg-gray-100 rounded-lg border space-y-4">
        <h2 className="text-lg font-semibold">Информация о заявке</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <p><strong>Агент:</strong> {pAgent}</p>
          <p><strong>E-mail агента:</strong> {shownEmail}</p>
          <p><strong>Агентство:</strong> {shownAgency}</p>
          <p><strong>Номер заявки:</strong> {shownBookNo}</p>
          <p><strong>Оператор:</strong> {operator}</p>
          <p><strong>Направление:</strong> {region}</p>
          <p><strong>Город вылета:</strong> {departureCity}</p>
          <p><strong>Город прилёта:</strong> {arrivalCity}</p>
          <p><strong>Отель:</strong> {hotel}</p>
          <p><strong>Период:</strong> {fmt(checkIn)} → {fmt(checkOut)}</p>
          <p><strong>Комната:</strong> {room}</p>
          <p><strong>{allowNet?"Netto оператора":"Brutto оператора"}:</strong> {allowNet?Number(nettoOperator||0).toFixed(2):Number(bruttoOperator||0).toFixed(2)} €</p>
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
    <div>
      <p className="sr-only">Телефон</p>
      {tourists.map((t, i) => (
        <p key={i}>{i === 0 && t.phone ? t.phone : ""}</p>
      ))}
    </div>
  </div>
</div>
        </div>
      </div>


      {/* ------- оператор + направление ------- */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Оператор</label>
          <select
            value={operator}
            onChange={e => setOperator(e.target.value)}
            required
            className="w-full border rounded p-2"
          >
            <option value="">Выберите…</option>
            {OPERATORS.map(o => (
              <option key={o.val} value={o.val}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium">Направление</label>
          <input
            required
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
      </div>

      {/* ------- города и рейс ------- */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block font-medium">Город вылета</label>
          <input
            value={departureCity}
            onChange={e => setDepartureCity(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block font-medium">Город прилёта</label>
          <input
            value={arrivalCity}
            onChange={e => setArrivalCity(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block font-medium">Номер рейса</label>
          <div className="flex space-x-2">
            <input
              placeholder="№"
              value={flightNumber}
              onChange={e => setFlightNumber(e.target.value)}
              className="flex-1 border rounded p-2"
            />
          </div>
        </div>
      </div>

      {/* ------- отель и даты ------- */}
      <label className="block font-medium">Отель</label>
      <input
        required
        value={hotel}
        onChange={e => setHotel(e.target.value)}
        className="w-full border rounded p-2"
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Заезд</label>
          <input type="date" required value={checkIn} onChange={e => setCheckIn(e.target.value)} className="w-full border rounded p-2" />
        </div>
        <div>
          <label className="block font-medium">Выезд</label>
          <input type="date" required value={checkOut} onChange={e => setCheckOut(e.target.value)} className="w-full border rounded p-2" />
        </div>
      </div>

      {/* ------- комната и meal plan ------- */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Комната</label>
          <input value={room} onChange={e => setRoom(e.target.value)} className="w-full border rounded p-2" />
        </div>
        <div>
          <label className="block font-medium">Питание</label>
          <input value={mealPlan} onChange={e => setMealPlan(e.target.value)} className="w-full border rounded p-2" />
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
            <input
              type="date"
              required
              value={t.dob}
              onChange={e => chTourist(i, "dob", e.target.value)}
              className="border rounded p-2"
            />
            <input
              placeholder="Паспорт №"
              value={t.passportNumber}
              onChange={e => chTourist(i, "passportNumber", e.target.value)}
              className="border rounded p-2"
            />
            <input
              type="date"
              placeholder="Действителен до"
              value={t.passportValidUntil}
              onChange={e => chTourist(i, "passportValidUntil", e.target.value)}
              className="border rounded p-2"
            />
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

      {/* ------- финансовые поля ------- */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Brutto клиента (€)</label>
          <input
            type="number"
            step="0.01"
            required
            value={bruttoClient}
            onChange={e => setBruttoClient(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block font-medium">Brutto оператора (€)</label>
          <input
            type="number"
            step="0.01"
            disabled={opInfo?.allowNet}
            required={!opInfo?.allowNet}
            value={bruttoOperator}
            onChange={e => setBruttoOperator(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
      </div>

      {opInfo?.allowNet && (
        <div>
          <label className="block font-medium">Netto оператора (€)</label>
          <input
            type="number"
            step="0.01"
            required
            value={nettoOperator}
            onChange={e => setNettoOperator(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
      )}

      <div>
        <label className="block font-medium">Internal Net (€)</label>
        <input
          type="number"
          step="0.01"
          value={internalNet}
          onChange={e => setInternalNet(e.target.value)}
          className="w-full border rounded p-2"
        />
      </div>

      {/* ------- способ оплаты ------- */}
      <div>
        <label className="block font-medium">Способ оплаты</label>
        <select
          value={paymentMethod}
          onChange={e => setPaymentMethod(e.target.value as "card" | "iban")}
          className="w-full border rounded p-2"
        >
          <option value="card">Картой (1.5 % процессинг)</option>
          <option value="iban">IBAN / банковский перевод</option>
        </select>
      </div>

      {/* банковская комиссия (editable при card) */}
      {paymentMethod === "card" && (
        <div>
          <label className="block font-medium">Комиссия банка (€)</label>
          <input
            type="number"
            step="0.01"
            value={bankFeeAmount}
            onChange={e => setBankFeeAmount(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
      )}


      {/* ------- комментарий, invoice, статус ------- */}
      <label className="block font-medium">Комментарий</label>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        className="w-full border rounded p-2"
      />

      <label className="block font-medium">Ссылка на инвойс</label>
      <input
        type="url"
        value={invoiceLink}
        onChange={e => setInvoiceLink(e.target.value)}
        className="w-full border rounded p-2"
      />

      <label className="block font-medium">Статус</label>
        <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="w-full border rounded p-2"
      >
        {STATUS_OPTIONS.map((key) => (
          <option key={key} value={key}>
            {t(`statuses.${key}`)}
          </option>
        ))}
      </select>
        <label className="flex items-center gap-2">
      <input
    type="checkbox"
    checked={form.commissionPaid || false}
    onChange={(e) => setForm({ ...form, commissionPaid: e.target.checked })}
       />
      Комиссия агенту выплачена
    </label>
      {/* ------- summary ------- */}
      <div className="p-3 bg-gray-50 border rounded text-sm space-y-1">
        <p><strong>Комиссия агента:</strong> {commission.toFixed(2)} €</p>
        <p><strong>Налог (10 %):</strong> {taxVal.toFixed(2)} €</p>
        <p><strong>Комиссия банка ({bankPct}%):</strong> {bankVal.toFixed(2)} €</p>
        <p><strong>Доход Crocus Tour:</strong> {profit.toFixed(2)} €</p>
      </div>

      <button
        type="submit"
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
      >
        Сохранить заявку
      </button>
    </form>
  );
}
