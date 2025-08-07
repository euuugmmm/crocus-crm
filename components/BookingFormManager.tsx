// components/BookingFormManager.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "next-i18next";
import { format, parse, isValid } from "date-fns";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import InputMask from "react-input-mask-next";
import { OPERATORS } from "@/lib/constants/operators";

import {
  INTERNAL_STATUS_KEYS, 
  AGENT_STATUS_KEYS,
  type StatusKey
} from "@/lib/constants/statuses";


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
  payer?: "tourist" | "agent";
  paymentMethod?: "card" | "iban" | "crypto";
  agentBankFee?: number;
  crocusBankFee?: number;
  commissionPaid?: boolean;
  commissionBase?: number;
  commission?: number;
  crocusFee?: number;
  crocusProfit?: number;
  netToPay?: number;
  comment?: string;
  invoiceLink?: string;
  status?: string;
  attachments?: File[];
  agentName?: string;
  agentAgency?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  agentStatus?: StatusKey;
  internalStatus?: StatusKey;

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

/* ───────── utils ───────── */
const parseDMY = (s: string) => {
  const p = parse(s, "dd.MM.yyyy", new Date());
  return isValid(p) ? p : new Date(s);
};
const fmt = (d?: string) =>
  !d ? "—" : isValid(parseDMY(d)) ? format(parseDMY(d), "dd.MM.yyyy") : "—";
const masked = (v: string, s: (v: string) => void, req = false) => (
  <InputMask
    mask="99.99.9999"
    value={v}
    onChange={(e) => s(e.target.value)}
    required={req}
    placeholder="DD.MM.YYYY"
    className="w-full border rounded p-2"
  />
);
const num = (v: string | number) => (typeof v === "string" ? parseFloat(v) || 0 : v);
const round2 = (x: number) => Math.round(x * 100) / 100;

/* ───────── константы комиссий ───────── */
const AGENT_CARD_PROC = 0.018;   // 1.8 %
const CROCUS_CARD_PROC = 0.015;  // 1.5 %
const TOCO_RO_FEE = 0.015;
const TOCO_MD_FEE = 0.02;
const OTHER_AGENT_PCT = 0.06;

/* =================================================================== */
export default function BookingFormManager({
  initialData = {},
  onSubmit,
  agentName: pAgent = "",
  agentAgency: pAgency = "",
  email: pEmail = "",
  bookingNumber: pBook = "",
  isManager = false,
}: Props) {
  const { t } = useTranslation("common");

  /* ───── загрузка недостающих данных агента ───── */
  const [emailFS, setEmailFS] = useState<string>();
  const [agencyFS, setAgencyFS] = useState<string>();
  useEffect(() => {
    if ((pEmail && pAgency) || !initialData.agentId) return;
    getDoc(doc(db, "users", initialData.agentId))
      .then(s => {
        const d = s.data() || {};
        if (!pEmail && d.email) setEmailFS(d.email);
        if (!pAgency && d.agencyName) setAgencyFS(d.agencyName);
      })
      .catch(() => {});
  }, [initialData.agentId, pEmail, pAgency]);

  const shownEmail  = pEmail  || initialData.email       || emailFS   || "—";
  const shownAgency = pAgency || initialData.agentAgency || agencyFS  || "—";
  const shownBookNo = pBook   || initialData.bookingNumber || initialData.id || "—";

  /* ───── основные стейты формы ───── */
  const [operator, setOperator] = useState(initialData.operator ?? "");
  const [region, setRegion] = useState(initialData.region ?? "");
  const [departureCity, setDepartureCity] = useState(initialData.departureCity ?? "");
  const [arrivalCity, setArrivalCity] = useState(initialData.arrivalCity ?? "");
  const [flightNumber, setFlightNumber] = useState(initialData.flightNumber ?? "");
  const [hotel, setHotel] = useState(initialData.hotel ?? "");
  const [checkIn, setCheckIn] = useState(initialData.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(initialData.checkOut ?? "");
  const [room, setRoom] = useState(initialData.room ?? "");
  const [mealPlan, setMealPlan] = useState(initialData.mealPlan ?? "");
const [agentStatus,    setAgentStatus]    = useState<StatusKey>(
  (initialData.agentStatus as StatusKey) ?? AGENT_STATUS_KEYS[0]
);
const [internalStatus, setInternalStatus] = useState<StatusKey>(
  (initialData.internalStatus as StatusKey) ?? INTERNAL_STATUS_KEYS[0]
);  const [payer, setPayer] = useState<"tourist" | "agent">(initialData.payer ?? "tourist");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "iban" | "crypto">(initialData.paymentMethod ?? "card");

  const [bruttoClient,   setBruttoClient]   = useState(String(initialData.bruttoClient   ?? ""));
  const [bruttoOperator, setBruttoOperator] = useState(String(initialData.bruttoOperator ?? ""));
  const [nettoOperator,  setNettoOperator]  = useState(String(initialData.nettoOperator  ?? ""));
  const [internalNet,    setInternalNet]    = useState(String(initialData.internalNet    ?? ""));

  const [comment,     setComment]     = useState(initialData.comment ?? "");
  const [invoiceLink, setInvoiceLink] = useState(initialData.invoiceLink ?? "");
  const [tourists,    setTourists]    = useState<Tourist[]>(
    initialData.tourists?.length
      ? (initialData.tourists as Tourist[])
      : [{ name:"", dob:"", passportNumber:"", passportValidUntil:"", nationality:"", hasEUDoc:false }]
  );
  const [form, setForm] = useState<Partial<BookingDTO>>(initialData);

  /* ───── вычисляемые стейты ───── */
  const [commission,     setCommission]    = useState<number>(initialData.commission ?? 0);
  const [commissionInput,setCommissionInput]=useState<string>("");               // ручная правка
  const [commissionBase, setCommissionBase] = useState<number>(0);
  const [crocusFee,      setCrocusFee]     = useState<number>(0);
  const [agentBankFee,   setAgentBankFee]  = useState<number>(initialData.agentBankFee  ?? 0);
  const [crocusBankFee,  setCrocusBankFee] = useState<number>(
    initialData.crocusBankFee ?? 0
  );
  const [netToPay,       setNetToPay]      = useState<number>(0);
 
  const allowNet = OPERATORS.find(o => o.val === operator)?.allowNet ?? false;

  /* ───── расчёты ───── */
  useEffect(() => {
    if (!operator) {
      setCommission(0); setCommissionBase(0); setCrocusFee(0);
      setAgentBankFee(0); setCrocusBankFee(0); setNetToPay(0);
      return;
    }
    const bc  = num(bruttoClient);
    const bo  = num(bruttoOperator);
    const net = num(nettoOperator);
    const allowNet = OPERATORS.find(o => o.val === operator)?.allowNet ?? false;

    let _base = 0, _crocus = 0, _agFee = 0, _comm = 0, _netPay = 0;

    const card = paymentMethod === "card";

    if (allowNet) {                       // TOCO
      const feePct = operator === "TOCO TOUR MD" ? TOCO_MD_FEE : TOCO_RO_FEE;
      _crocus = net * feePct;

      if (payer === "tourist") {
        _base = Math.max(0, bc - net);
        _agFee = card ? bc * AGENT_CARD_PROC : 0;
        _comm = Math.max(0, _base - _crocus - _agFee);
      } else {            /* payer = agent */
        const basePay = net + _crocus;                     // что должен заплатить агент без эквайринга
        _netPay = card ? basePay * (1 + AGENT_CARD_PROC) : basePay;
        _base   = bc > 0 ? Math.max(0, bc - net) : 0;      // если агент указал bruttoClient
        _agFee  = card ? _netPay - basePay : 0;            // 1.8 %
        _comm   = Math.max(0, _base - _crocus - _agFee);
      }
    } else {                            // остальные операторы
      if (payer === "tourist") {
        const markup = Math.max(0, bc - bo);
        _base   = markup + bo * OTHER_AGENT_PCT;
        _agFee  = card ? bc * AGENT_CARD_PROC : 0;
        _comm   = Math.max(0, _base - _agFee);
      } else {
        const basePay = bo * (1 - OTHER_AGENT_PCT);        // 94 % от Brutto OP
        _netPay = card ? basePay * (1 + AGENT_CARD_PROC) : basePay;
        const markup = bc > 0 ? Math.max(0, bc - bo) : 0;
        _base   = bc > 0 ? markup + bo * OTHER_AGENT_PCT : 0;
        _agFee  = card ? _netPay - basePay : 0;
        _comm   = Math.max(0, _base - _agFee);
      }
    }

    setCommissionBase(round2(_base));
    setCrocusFee(round2(_crocus));
    setAgentBankFee(round2(_agFee));
    setNetToPay(round2(_netPay));

    const autoComm = round2(_comm);
    const finalComm = commissionInput !== "" ? num(commissionInput) : autoComm;
    setCommission(finalComm);

    /* crocus-банк-fee по умолчанию (редактируемый) */
    if (card && commissionInput === "" && initialData.crocusBankFee == null) {
      setCrocusBankFee(round2(bc * CROCUS_CARD_PROC));
    }
    if (!card) {
      setCrocusBankFee(0);
    }
  }, [operator, payer, paymentMethod, bruttoClient, bruttoOperator, nettoOperator, commissionInput]);

  /* ───── итоговые значения ───── */
  const taxVal   = round2(commission * 0.10);  // только показываем
  const profit   = round2(num(bruttoClient) - num(internalNet) - commission - crocusBankFee);
  
  /* ---------- работа с туристами ---------- */
  const addTourist = () =>
    setTourists(t => [...t, { name:"", dob:"", passportNumber:"", passportValidUntil:"", nationality:"", hasEUDoc:false, phone:"" }]);
  const delTourist = (idx:number) => setTourists(t => t.filter((_,i) => i !== idx));
  const chTourist  = (idx:number, f:keyof Tourist, v:any) =>
    setTourists(t => t.map((tr,i) => i === idx ? { ...tr, [f]:v } : tr));

  /* ───── submit ───── */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...initialData,
      bookingNumber: initialData.bookingNumber ?? pBook,
      operator, region, departureCity, arrivalCity, flightNumber,
      hotel, checkIn, checkOut, room, mealPlan,
      payer, paymentMethod,
      bruttoClient: num(bruttoClient),
      bruttoOperator: num(bruttoOperator),
      nettoOperator: num(nettoOperator),
      internalNet:   num(internalNet),
      commission, commissionBase, crocusFee,
      agentBankFee, crocusBankFee, netToPay,
      crocusProfit:  profit,
      commissionPaid: !!form.commissionPaid,
      tourists: tourists.filter(t=>t.name),
      comment, invoiceLink, status,
      agentName: pAgent, agentAgency: pAgency, email: pEmail,
      updatedAt: new Date().toISOString(),
      createdAt: initialData.createdAt ?? new Date().toISOString(),
      agentStatus,
      internalStatus,

    });
  };

  /* ───────── UI ───────── */


  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">

      {/* Info */}
      <div className="p-4 bg-gray-100 rounded-lg border space-y-4">
        <h2 className="text-lg font-semibold">Информация о заявке</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <p><strong>Агент:</strong> {pAgent}</p>
          <p><strong>E-mail:</strong> {shownEmail}</p>
          <p><strong>Агентство:</strong> {shownAgency}</p>
          <p><strong>Заявка #:</strong> {shownBookNo}</p>
          <p><strong>Оператор:</strong> {operator}</p>
          <p><strong>Направление:</strong> {region}</p>
          <p><strong>Вылет из:</strong> {departureCity}</p>
          <p><strong>Прилет в:</strong> {arrivalCity}</p>
          <p><strong>Отель:</strong> {hotel}</p>
          <p><strong>Период:</strong> {fmt(checkIn)} → {fmt(checkOut)}</p>
          <p><strong>Комната:</strong> {room}</p>
          <p>
            <strong>
              {allowNet ? "Netto оператора" : "Brutto оператора"}:
            </strong>{" "}
            {allowNet
              ? Number(nettoOperator || 0).toFixed(2)
              : Number(bruttoOperator || 0).toFixed(2)}{" "}
            €
          </p>
          <p><strong>Питание:</strong> {mealPlan}</p>
          <div className="col-span-full overflow-x-auto">
            <strong>Туристы:</strong>
            <div className="mt-2 grid gap-4 whitespace-nowrap grid-cols-[minmax(200px,_auto)_max-content_max-content_max-content_max-content_max-content_max-content]">
              <div>
                <p className="sr-only">ФИО</p>
                {tourists.map((t, i) => <p key={i}>{t.name}</p>)}
              </div>
              <div>
                <p className="sr-only">Возраст</p>
                {tourists.map((t, i) => <p key={i}>{Math.max(0, new Date().getFullYear() - parseDMY(t.dob).getFullYear())}</p>)}
              </div>
              <div>
                <p className="sr-only">ДР</p>
                {tourists.map((t, i) => <p key={i}>{fmt(t.dob)}</p>)}
              </div>
              <div>
                <p className="sr-only">Гражданство</p>
                {tourists.map((t, i) => <p key={i}>{t.nationality}</p>)}
              </div>
              <div>
                <p className="sr-only">Паспорт №</p>
                {tourists.map((t, i) => <p key={i}>{t.passportNumber}</p>)}
              </div>
              <div>
                <p className="sr-only">Действителен до</p>
                {tourists.map((t, i) => <p key={i}>{fmt(t.passportValidUntil)}</p>)}
              </div>
              <div>
                <p className="sr-only">Телефон</p>
                {tourists.map((t, i) => <p key={i}>{i===0?t.phone||"":""}</p>)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Оператор и направление */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Оператор</label>
          <select
            required
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="w-full border rounded p-2"
          >
            <option value="">— выберите —</option>
            {OPERATORS.map((o) => (
              <option key={o.val} value={o.val}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium">Направление</label>
          <input
            required
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
      </div>

      {/* Города и рейс */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block font-medium">Город вылета</label>
          <input
            value={departureCity}
            onChange={(e) => setDepartureCity(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block font-medium">Город прилёта</label>
          <input
            value={arrivalCity}
            onChange={(e) => setArrivalCity(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block font-medium">Рейс №</label>
          <input
            value={flightNumber}
            onChange={(e) => setFlightNumber(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
      </div>

      {/* Отель и даты */}
      <label className="block font-medium">Отель</label>
      <input
        required
        value={hotel}
        onChange={(e) => setHotel(e.target.value)}
        className="w-full border rounded p-2"
      />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Заезд</label>
          {masked(checkIn, setCheckIn, true)}
        </div>
        <div>
          <label className="block font-medium">Выезд</label>
          {masked(checkOut, setCheckOut, true)}
        </div>
      </div>

      {/* Комната и питание */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Комната</label>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block font-medium">Питание</label>
          <input
            value={mealPlan}
            onChange={(e) => setMealPlan(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
      </div>

      {/* Туристы */}
      <h3 className="text-lg font-semibold">Туристы</h3>
      {tourists.map((t, i) => (
        <div key={i} className="relative border p-4 rounded shadow mb-4">
          {tourists.length > 1 && (
            <button
              type="button"
              onClick={() => delTourist(i)}
              className="absolute top-2 right-2 text-red-500"
            >🗑</button>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              required
              placeholder="ФИО"
              value={t.name}
              onChange={(e) => chTourist(i, "name", e.target.value)}
              className="border rounded p-2"
            />
            {masked(t.dob, (v) => chTourist(i, "dob", v), true)}
            <input
              placeholder="№ паспорта"
              value={t.passportNumber}
              onChange={(e) => chTourist(i, "passportNumber", e.target.value)}
              className="border rounded p-2"
            />
            {masked(t.passportValidUntil, (v) => chTourist(i, "passportValidUntil", v))}
            <input
              placeholder="Гражданство"
              value={t.nationality}
              onChange={(e) => chTourist(i, "nationality", e.target.value)}
              className="border rounded p-2"
            />
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={t.hasEUDoc}
                onChange={(e) => chTourist(i, "hasEUDoc", e.target.checked)}
              />
              <span>EU-документ</span>
            </label>
          </div>
        </div>
      ))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">
        + добавить туриста
      </button>

      {/* ───────── блок Цены ───────── */}
      <h3 className="text-lg font-semibold mt-4">{t("pricing")}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t("payerWhopays")}</label>
          <select value={payer} onChange={e=>setPayer(e.target.value as "tourist"|"agent")} className="w-full border rounded p-2">
            <option value="tourist">{t("payerTourist")}</option>
            <option value="agent">{t("payerAgent")}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t("paymentMethod")}</label>
          <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)} className="w-full border rounded p-2">
            <option value="card">{t("paymentCard")}</option>
            <option value="iban">{t("paymentIban")}</option>
            <option value="crypto">{t("paymentCrypto")}</option>
          </select>
        </div>
      </div>

      {/* ---- входные суммы (зависят от оператора и payer) ---- */}
      {OPERATORS.find(o=>o.val===operator)?.allowNet ? (
        <>
          {payer==="tourist" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")}</label>
              <input type="number" value={bruttoClient} onChange={e=>setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
            </>
          )}
          {payer==="agent" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")} ({t("optional")})</label>
              <input type="number" value={bruttoClient} onChange={e=>setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
            </>
          )}
          <label className="block text-sm font-medium mb-1">{t("nettoOperator")}</label>
          <input type="number" value={nettoOperator} onChange={e=>setNettoOperator(e.target.value)} className="w-full border rounded p-2"/>
          {payer==="agent" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("netToPay")}</label>
              <input type="number" value={netToPay.toFixed(2)} readOnly className="w-full border rounded p-2 bg-gray-50"/>
            </>
          )}
        </>
      ) : (
        <>
          {payer==="tourist" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")}</label>
              <input type="number" value={bruttoClient} onChange={e=>setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
              <label className="block text-sm font-medium mb-1">{t("bruttoOperator")}</label>
              <input type="number" value={bruttoOperator} onChange={e=>setBruttoOperator(e.target.value)} className="w-full border rounded p-2"/>
            </>
          )}
          {payer==="agent" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")} ({t("optional")})</label>
              <input type="number" value={bruttoClient} onChange={e=>setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
              <label className="block text-sm font-medium mb-1">{t("bruttoOperator")}</label>
              <input type="number" value={bruttoOperator} onChange={e=>setBruttoOperator(e.target.value)} className="w-full border rounded p-2"/>
              <label className="block text-sm font-medium mb-1">{t("netToPay")}</label>
              <input type="number" value={netToPay.toFixed(2)} readOnly className="w-full border rounded p-2 bg-gray-50"/>
            </>
          )}
        </>
      )}

      {/* ---- Internal Net для Crocus ---- */}
      <label className="block font-medium mt-4">Internal Net (€)</label>
      <input type="number" value={internalNet} onChange={e=>setInternalNet(e.target.value)} className="w-full border rounded p-2"/>

      {/* ---- ручная корректировка комиссии ---- */}
      <label className="block font-medium mt-4">Комиссия агента (€) — можно править</label>
      <input
        type="number"
        step="0.01"
        value={commissionInput!=="" ? commissionInput : commission.toFixed(2)}
        onChange={e=>setCommissionInput(e.target.value)}
        className="w-full border rounded p-2"
      />

      {/* Комментарий, invoice, статус */}
      <div>
        <label className="block font-medium">Комментарий</label>
        <textarea value={comment} onChange={e=>setComment(e.target.value)} className="w-full border rounded p-2"/>
      </div>
      <div>
        <label className="block font-medium">Ссылка на инвойс</label>
        <input type="url" value={invoiceLink} onChange={e=>setInvoiceLink(e.target.value)} className="w-full border rounded p-2"/>
      </div>
      <div>

{/* Статус, видимый агенту */}
<label className="block font-medium">Статус (для агента)</label>
<select
  value={agentStatus}
  onChange={e => setAgentStatus(e.target.value as StatusKey)}
  className="w-full border rounded p-2 mb-4"
>
  {AGENT_STATUS_KEYS.map(s => (
    <option key={s} value={s}>
      {t(`statuses.${s}`)}
    </option>
  ))}
</select>

{/* Внутренний статус для менеджера */}
<label className="block font-medium">Внутренний статус</label>
<select
  value={internalStatus}
  onChange={e => setInternalStatus(e.target.value as StatusKey)}
  className="w-full border rounded p-2 mb-4"
>
  {INTERNAL_STATUS_KEYS.map(s => (
    <option key={s} value={s}>
      {t(`statuses.${s}`)}
    </option>
  ))}
</select>  

</div>

      {/* Комиссия выплачена */}
      <div className="flex items-center space-x-2">
        <input type="checkbox" checked={!!form.commissionPaid}
          onChange={e=>setForm(f=>({...f, commissionPaid: e.target.checked}))}
        />
        <label>Комиссия агенту выплачена</label>
      </div>


      {/* ---- Summary ---- */}
      <div className="p-3 bg-gray-50 border rounded text-sm space-y-1 mt-4">
        <p><strong>Базовая комиссия:</strong> {commissionBase.toFixed(2)} €</p>
        {crocusFee>0 && <p><strong>Сбор Crocus (TOCO):</strong> –{crocusFee.toFixed(2)} €</p>}
        {paymentMethod==="card" && (
          <>
            <p><strong>Банк. комиссия агента (1.8 %):</strong> –{agentBankFee.toFixed(2)} €</p>
            <p>
              <strong>Банк. комиссия Crocus (1.5 %):</strong>{" "}
              <input
                type="number"
                step="0.01"
                value={crocusBankFee.toFixed(2)}
                onChange={e=>setCrocusBankFee(num(e.target.value))}
                className="w-24 inline-block border rounded p-1 ml-1"
              /> €
            </p>
          </>
        )}
        <p><strong>Комиссия агента (фактическая):</strong> {commission.toFixed(2)} €</p>
        <p><strong>Налог 10 % (не вычитаем):</strong> {taxVal.toFixed(2)} €</p>
        <p><strong>Прибыль Crocus Tour:</strong> {profit.toFixed(2)} €</p>
      </div>


      <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
        Сохранить заявку
      </button>
    </form>
  );
}