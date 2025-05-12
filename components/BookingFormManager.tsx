/* components/BookingFormManager.tsx
   ———————————————————————————————————————————————————————— */
"use client";

import { useState, useEffect, FormEvent, ChangeEvent } from "react";

/* ---------- типы ---------- */
export interface Tourist {
  name: string;
  dob:  string;
}
export interface BookingDTO {
  id?: string;
  bookingNumber?: string;
  operator?: string;
  region?: string;
  hotel?: string;
  checkIn?: string;
  checkOut?: string;
  room?: string;
  tourists?: Tourist[];

  bruttoClient?: number;
  bruttoOperator?: number;
  nettoOperator?: number;
  internalNet?: number;

  commission?: number;          // комиссия агента
  bankFeeAmount?: number;       // евро — комиссия эквайринга
  paymentMethod?: "card" | "iban";

  comment?: string;
  invoiceLink?: string;
  status?: string;

  agentName?: string;
  agentAgency?: string;
  crocusProfit?: number;

  createdAt?: string;
  updatedAt?: string;
}

interface Props {
  initialData?: Partial<BookingDTO>;
  onSubmit:     (data: BookingDTO)=>void;
  agentName?:   string;
  agentAgency?: string;
  bookingNumber?: string;
}

/* ---------- справочники ---------- */
const OPERATORS = [
  { label:"TOCO TOUR RO",  val:"TOCO TOUR RO",  allowNet:true  },
  { label:"TOCO TOUR MD",  val:"TOCO TOUR MD",  allowNet:true  },
  { label:"KARPATEN",      val:"KARPATEN",      allowNet:false },
  { label:"DERTOUR",       val:"DERTOUR",       allowNet:false },
  { label:"CHRISTIAN",     val:"CHRISTIAN",     allowNet:false },
  { label:"CORAL TRAVEL RO",val:"CORAL TRAVEL RO",allowNet:false},
  { label:"JOIN UP RO",    val:"JOIN UP RO",    allowNet:false },
] as const;

const SHARE_CARD = 0.80;   // доля агента при оплате картой
const SHARE_IBAN = 0.85;   // доля агента при IBAN-платеже
const CARD_FEE   = 0.015;  // 1.5 % комиссия эквайринга

/* =================================================================== */
export default function BookingFormManager({
  initialData = {},
  onSubmit,
  agentName = "",
  agentAgency = "",
  bookingNumber = "",
}: Props) {
  /* ---------- form state ---------- */
  const [operator,       setOperator]       = useState(initialData.operator       ?? "");
  const [region,         setRegion]         = useState(initialData.region         ?? "");
  const [hotel,          setHotel]          = useState(initialData.hotel          ?? "");
  const [checkIn,        setCheckIn]        = useState(initialData.checkIn        ?? "");
  const [checkOut,       setCheckOut]       = useState(initialData.checkOut       ?? "");
  const [room,           setRoom]           = useState(initialData.room           ?? "");
  const [tourists,       setTourists]       = useState<Tourist[]>(initialData.tourists?.length ? initialData.tourists : [{ name:"", dob:"" }]);

  const [paymentMethod,  setPaymentMethod]  = useState<"card"|"iban">(initialData.paymentMethod ?? "card");

  const [bruttoClient,   setBruttoClient]   = useState(String(initialData.bruttoClient   ?? ""));
  const [bruttoOperator, setBruttoOperator] = useState(String(initialData.bruttoOperator ?? ""));
  const [nettoOperator,  setNettoOperator]  = useState(String(initialData.nettoOperator  ?? ""));
  const [internalNet,    setInternalNet]    = useState(String(initialData.internalNet    ?? ""));

  const [bankFeeAmount,  setBankFeeAmount]  = useState(String(initialData.bankFeeAmount ?? ""));
  const [commission,     setCommission]     = useState<number>(initialData.commission ?? 0);

  const [comment,        setComment]        = useState(initialData.comment      ?? "");
  const [invoiceLink,    setInvoiceLink]    = useState(initialData.invoiceLink  ?? "");
  const [status,         setStatus]         = useState(initialData.status       ?? "Новая");

  /* ---------- вычисления комиссии & банковской комиссии ---------- */
  const opInfo = OPERATORS.find(o=>o.val===operator);

  /* пересчёт при изменениях */
  useEffect(() => {
    const bc = parseFloat(bruttoClient)   || 0;
    const bo = parseFloat(bruttoOperator) || 0;
    const net= parseFloat(nettoOperator)  || 0;

    /* доля агента */
    const share = paymentMethod==="iban" ? SHARE_IBAN : SHARE_CARD;

    /* расчёт комиссии */
    let comm = 0;
    if (opInfo?.allowNet) {
      comm = (bc - net) * share;
    } else {
      const markup = bc - bo;
      comm = bo * 0.03 + (markup>0 ? markup*share : 0);
    }
    setCommission(Math.round(comm*100)/100);

    /* дефолтная банковская комиссия */
    if (paymentMethod==="card") {
      const autoBank = bc * CARD_FEE;
      if (bankFeeAmount==="" || bankFeeAmount==="0") setBankFeeAmount(autoBank.toFixed(2));
    } else {
      /* IBAN → комиссия = 0 */
      setBankFeeAmount("0");
    }
  }, [bruttoClient, bruttoOperator, nettoOperator, operator, paymentMethod]);

  /* ---------- туристы ---------- */
  const addTourist = () => setTourists([...tourists, { name:"", dob:"" }]);
  const delTourist = (idx:number) => setTourists(tourists.filter((_,i)=>i!==idx));
  const chTourist  = (idx:number, field: keyof Tourist, val:string) =>
    setTourists(tourists.map((t,i)=> i===idx? { ...t, [field]:val } : t));

  /* ---------- submit ---------- */
  const handleSubmit = (e:FormEvent) => {
    e.preventDefault();

    const bc   = parseFloat(bruttoClient)   || 0;
    const net  = parseFloat(internalNet)    || 0;
    const tax  = Math.round((commission/0.9 - commission)*100)/100;

    const bank = parseFloat(bankFeeAmount) || 0;

    const crocusProfit = Math.round(((bc - net) - commission - tax - bank)*100)/100;

    const payload: BookingDTO = {
      ...initialData,
      bookingNumber : initialData.bookingNumber ?? bookingNumber,
      operator, region, hotel, checkIn, checkOut, room,
      tourists      : tourists.filter(t=>t.name||t.dob),
      bruttoClient  : bc,
      bruttoOperator: parseFloat(bruttoOperator)||0,
      nettoOperator : parseFloat(nettoOperator) ||0,
      internalNet   : net,
      paymentMethod,
      bankFeeAmount : bank,
      commission,
      comment,
      invoiceLink,
      status,
      agentName,
      agentAgency,
      crocusProfit,
      updatedAt     : new Date().toISOString(),
      createdAt     : initialData.createdAt ?? new Date().toISOString(),
    };

    onSubmit(payload);
  };

  /* ---------- вспомогательные цифры ---------- */
  const bc          = parseFloat(bruttoClient)||0;
  const bank        = parseFloat(bankFeeAmount)||0;
  const bankPercent = bc ? ((bank/bc)*100).toFixed(2) : "0.00";
  const tax         = Math.round((commission/0.9 - commission)*100)/100;
  const crocusProfit= Math.round(((bc-(parseFloat(internalNet)||0))-commission-tax-bank)*100)/100;

  /* ================================================================= */
  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">

      {/* ------- инфо об агенте ------- */}
      <div className="bg-gray-100 p-3 rounded text-sm text-gray-700">
        <p><strong>Агент:</strong>  {agentName}</p>
        <p><strong>Агентство:</strong> {agentAgency}</p>
        <p><strong>Заявка №:</strong> {bookingNumber}</p>
      </div>

      {/* ------- оператор + направление ------- */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Оператор</label>
          <select
            value={operator}
            onChange={e=>setOperator(e.target.value)}
            required
            className="w-full border rounded p-2"
          >
            <option value="">Выберите…</option>
            {OPERATORS.map(o=>(
              <option key={o.val} value={o.val}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium">Направление</label>
          <input
            required
            value={region}
            onChange={e=>setRegion(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>
      </div>

      {/* ------- отель и даты ------- */}
      <label className="block font-medium">Отель</label>
      <input required value={hotel} onChange={e=>setHotel(e.target.value)} className="w-full border rounded p-2"/>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Заезд</label>
          <input type="date" required value={checkIn} onChange={e=>setCheckIn(e.target.value)} className="w-full border rounded p-2"/>
        </div>
        <div>
          <label className="block font-medium">Выезд</label>
          <input type="date" required value={checkOut} onChange={e=>setCheckOut(e.target.value)} className="w-full border rounded p-2"/>
        </div>
      </div>

      {/* ------- комната ------- */}
      <label className="block font-medium">Комната</label>
      <input value={room} onChange={e=>setRoom(e.target.value)} className="w-full border rounded p-2"/>

      {/* ------- туристы ------- */}
      <label className="block font-medium">Туристы</label>
      {tourists.map((t,i)=>(
        <div key={i} className="flex space-x-2 mb-2">
          <input
            placeholder="Фамилия Имя"
            required
            value={t.name}
            onChange={e=>chTourist(i,"name",e.target.value)}
            className="flex-1 border rounded p-2"
          />
          <input
            type="date"
            required
            value={t.dob}
            onChange={e=>chTourist(i,"dob",e.target.value)}
            className="flex-1 border rounded p-2"
          />
          {tourists.length>1 && (
            <button type="button" className="px-2 text-red-600" onClick={()=>delTourist(i)}>🗑</button>
          )}
        </div>
      ))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">+ Добавить туриста</button>

      {/* ------- финансовые поля ------- */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Brutto клиента (€)</label>
          <input type="number" step="0.01" required value={bruttoClient} onChange={e=>setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
        </div>
        <div>
          <label className="block font-medium">Brutto оператора (€)</label>
          <input type="number" step="0.01" disabled={opInfo?.allowNet} required={!opInfo?.allowNet} value={bruttoOperator} onChange={e=>setBruttoOperator(e.target.value)} className="w-full border rounded p-2"/>
        </div>
      </div>

      {opInfo?.allowNet && (
        <div>
          <label className="block font-medium">Netto оператора (€)</label>
          <input type="number" step="0.01" required value={nettoOperator} onChange={e=>setNettoOperator(e.target.value)} className="w-full border rounded p-2"/>
        </div>
      )}

      <div>
        <label className="block font-medium">Internal Net (€)</label>
        <input type="number" step="0.01" value={internalNet} onChange={e=>setInternalNet(e.target.value)} className="w-full border rounded p-2"/>
      </div>

      {/* ------- способ оплаты ------- */}
      <div>
        <label className="block font-medium">Способ оплаты</label>
        <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as "card"|"iban")} className="w-full border rounded p-2">
          <option value="card">Картой (1.5 % процессинг)</option>
          <option value="iban">IBAN / банковский перевод</option>
        </select>
      </div>

      {/* банковская комиссия (editable при card) */}
      {paymentMethod==="card" && (
        <div>
          <label className="block font-medium">Комиссия банка (€)</label>
          <input type="number" step="0.01" value={bankFeeAmount} onChange={e=>setBankFeeAmount(e.target.value)} className="w-full border rounded p-2"/>
        </div>
      )}

      {/* ------- комментарий , invoice , статус ------- */}
      <label className="block font-medium">Комментарий</label>
      <textarea value={comment} onChange={e=>setComment(e.target.value)} className="w-full border rounded p-2"/>

      <label className="block font-medium">Ссылка на инвойс</label>
      <input type="url" value={invoiceLink} onChange={e=>setInvoiceLink(e.target.value)} className="w-full border rounded p-2"/>

      <label className="block font-medium">Статус</label>
      <select value={status} onChange={e=>setStatus(e.target.value)} className="w-full border rounded p-2">
        <option value="Новая">Новая</option>
        <option value="Ожидание оплаты">Ожидание оплаты</option>
        <option value="Оплачено туристом">Оплачено туристом</option>
        <option value="Ожидает confirm">Ожидает confirm</option>
        <option value="Подтверждено">Подтверждено</option>
        <option value="Завершено">Завершено</option>
        <option value="Отменен">Отменен</option>
      </select>

      {/* ------- summary ------- */}
      <div className="p-3 bg-gray-50 border rounded text-sm space-y-1">
        <p><strong>Комиссия агента:</strong> {commission.toFixed(2)} €</p>
        <p><strong>Налог (10 %):</strong> {tax.toFixed(2)} €</p>
        <p><strong>Комиссия банка ({bankPercent}%):</strong> {bank.toFixed(2)} €</p>
        <p><strong>Доход Crocus Tour:</strong> {crocusProfit.toFixed(2)} €</p>
      </div>

      <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
        Сохранить заявку
      </button>
    </form>
  );
}