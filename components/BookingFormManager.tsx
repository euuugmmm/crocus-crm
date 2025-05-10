/* components/BookingFormManager.tsx */
"use client";

import { useState, useEffect, ChangeEvent, FormEvent } from "react";

/* ---------- types ---------- */
export interface Tourist {
  name: string;
  dob: string;
}

export interface BookingDTO {
  /** Firestore id (не обязателен при создании) */
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
  bankFeeAmount?: number;

  commission?: number;
  comment?: string;
  invoiceLink?: string;
  /* если храните несколько файлов → замените на `voucherLinks?: string[]`  */
  status?: string;

  agentName?: string;
  agentAgency?: string;
  crocusProfit?: number;
  createdAt?: string; // ISO   – для Firestore Timestamp понадоб. кастом
  updatedAt?: string;
}

interface BookingFormManagerProps {
  /** Данные, пришедшие из Firestore (или `{}` при создании) */
  initialData?: Partial<BookingDTO>;
  onSubmit: (data: BookingDTO) => void;

  /* техники */
  agentName?: string;
  agentAgency?: string;
  bookingNumber?: string;
  isManager?: boolean;
}

/* ---------- справочники ---------- */
const OPERATORS = [
  { label: "TOCO TOUR RO", val: "TOCO TOUR RO", allowNet: true },
  { label: "TOCO TOUR MD", val: "TOCO TOUR MD", allowNet: true },
  { label: "KARPATEN",     val: "KARPATEN",     allowNet: false },
  { label: "DERTOUR",      val: "DERTOUR",      allowNet: false },
  { label: "CHRISTIAN",    val: "CHRISTIAN",    allowNet: false },
] as const;

/* ====================================================================== */
export default function BookingFormManager({
  initialData = {},
  onSubmit,
  agentName = "",
  agentAgency = "",
  bookingNumber = "",
}: BookingFormManagerProps) {
  /* ---------- состояние формы ---------- */
  const [operator,        setOperator]        = useState(initialData.operator        ?? "");
  const [region,          setRegion]          = useState(initialData.region          ?? "");
  const [hotel,           setHotel]           = useState(initialData.hotel           ?? "");
  const [checkIn,         setCheckIn]         = useState(initialData.checkIn         ?? "");
  const [checkOut,        setCheckOut]        = useState(initialData.checkOut        ?? "");
  const [room,            setRoom]            = useState(initialData.room            ?? "");
  const [bruttoClient,    setBruttoClient]    = useState(String(initialData.bruttoClient    ?? ""));
  const [bruttoOperator,  setBruttoOperator]  = useState(String(initialData.bruttoOperator  ?? ""));
  const [nettoOperator,   setNettoOperator]   = useState(String(initialData.nettoOperator   ?? ""));
  const [internalNet,     setInternalNet]     = useState(String(initialData.internalNet     ?? ""));
  const [bankFeeAmount,   setBankFeeAmount]   = useState(String(initialData.bankFeeAmount  ?? ""));
  const [commission,      setCommission]      = useState<number>(initialData.commission ?? 0);
  const [comment,         setComment]         = useState(initialData.comment ?? "");
  const [invoiceLink,     setInvoiceLink]     = useState(initialData.invoiceLink ?? "");
  const [status,          setStatus]          = useState(initialData.status ?? "Новая");
  const [tourists,        setTourists]        = useState<Tourist[]>(initialData.tourists?.length ? initialData.tourists : [{ name: "", dob: "" }]);

  /* ---------- вычисления комиссии ---------- */
  const opInfo = OPERATORS.find(o => o.val === operator);

  useEffect(() => {
    const bc = parseFloat(bruttoClient)    || 0;
    const bo = parseFloat(bruttoOperator)  || 0;
    const n  = parseFloat(nettoOperator)   || 0;

    let comm = 0;
    if (opInfo?.allowNet) {
      comm = (bc - n) * 0.8;
    } else {
      const markup = bc - bo;
      comm = bo * 0.03 + (markup > 0 ? markup * 0.8 : 0);
    }
    setCommission(Math.round(comm * 100) / 100);
  }, [bruttoClient, bruttoOperator, nettoOperator, operator]);

  /* ---------- helpers ---------- */
  const addTourist   = () => setTourists([...tourists, { name: "", dob: "" }]);
  const delTourist   = (i: number) => setTourists(tourists.filter((_, idx) => idx !== i));
  const chTourist    = (i: number, field: keyof Tourist, val: string) =>
    setTourists(tourists.map((t, idx) => idx === i ? { ...t, [field]: val } : t));

  /* ---------- отправка формы ---------- */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const bc         = parseFloat(bruttoClient)   || 0;
    const net        = parseFloat(internalNet)    || 0;
    const tax        = Math.round((commission / 0.9 - commission) * 100) / 100;
    const bankRaw    = bankFeeAmount === "" ? (bc * 0.015) : parseFloat(bankFeeAmount);
    const bankValid  = Number.isFinite(bankRaw) ? bankRaw : 0;
    const croProfit  = Math.round(((bc - net) - commission - tax - bankValid) * 100) / 100;

    const cleanedTourists = tourists.filter(t => t.name || t.dob);

    const payload: BookingDTO = {
      ...initialData, // на случай partial-обновления
      bookingNumber: initialData.bookingNumber ?? bookingNumber,
      operator, region, hotel, checkIn, checkOut, room,
      tourists: cleanedTourists,
      bruttoClient:   bc,
      bruttoOperator: parseFloat(bruttoOperator) || 0,
      nettoOperator:  parseFloat(nettoOperator)  || 0,
      internalNet:    net,
      bankFeeAmount:  bankValid,
      commission,
      comment,
      invoiceLink,
      status,
      agentName,
      agentAgency,
      crocusProfit: croProfit,
      updatedAt: new Date().toISOString(),
      createdAt: initialData.createdAt ?? new Date().toISOString(),
    };

    onSubmit(payload);
  };

  /* ---------- расчёт вспомогательных цифр ---------- */
  const bc            = parseFloat(bruttoClient) || 0;
  const bankRaw       = bankFeeAmount === "" ? (bc * 0.015) : parseFloat(bankFeeAmount);
  const bankValidNum  = Number.isFinite(bankRaw) ? bankRaw : 0;
  const bankPercent   = bc ? ((bankValidNum / bc) * 100).toFixed(2) : "0.00";
  const tax           = Math.round((commission / 0.9 - commission) * 100) / 100;
  const crocusProfit  = Math.round(((bc - (parseFloat(internalNet)||0)) - commission - tax - bankValidNum) * 100) / 100;

  /* ================================================================== */
  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
      {/* -------- агент -------- */}
      <div className="bg-gray-100 p-3 rounded text-sm text-gray-700">
        <p><strong>Имя агента:</strong> {agentName}</p>
        <p><strong>Агентство:</strong> {agentAgency}</p>
      </div>

      {/* -------- поля брони -------- */}
      {/* оператор + направление */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Оператор</label>
          <select
            required
            className="w-full border rounded p-2"
            value={operator}
            onChange={e => setOperator(e.target.value)}
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
            className="w-full border rounded p-2"
            value={region}
            onChange={e => setRegion(e.target.value)}
          />
        </div>
      </div>

      {/* отель */}
      <label className="block font-medium">Отель</label>
      <input
        required
        className="w-full border rounded p-2"
        value={hotel}
        onChange={e => setHotel(e.target.value)}
      />

      {/* даты */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Заезд</label>
          <input type="date" required className="w-full border rounded p-2" value={checkIn}  onChange={e => setCheckIn(e.target.value)} />
        </div>
        <div>
          <label className="block font-medium">Выезд</label>
          <input type="date" required className="w-full border rounded p-2" value={checkOut} onChange={e => setCheckOut(e.target.value)} />
        </div>
      </div>

      {/* room */}
      <label className="block font-medium">Комната</label>
      <input className="w-full border rounded p-2" value={room} onChange={e => setRoom(e.target.value)} />

      {/* -------- туристы -------- */}
      <label className="block font-medium">Туристы</label>
      {tourists.map((t, i) => (
        <div key={i} className="flex space-x-2 mb-2">
          <input
            required
            className="flex-1 border rounded p-2"
            placeholder="Фамилия Имя"
            value={t.name}
            onChange={e => chTourist(i, "name", e.target.value)}
          />
          <input
            required
            type="date"
            className="flex-1 border rounded p-2"
            value={t.dob}
            onChange={e => chTourist(i, "dob", e.target.value)}
          />
          {tourists.length > 1 && (
            <button
              type="button"
              className="px-3 text-red-600"
              onClick={() => delTourist(i)}
            >🗑</button>
          )}
        </div>
      ))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">
        + Добавить туриста
      </button>

      {/* -------- фин. поля -------- */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Brutto клиента (€)</label>
          <input
            required
            type="number"
            step="0.01"
            className="w-full border rounded p-2"
            value={bruttoClient}
            onChange={e => setBruttoClient(e.target.value)}
          />
        </div>
        <div>
          <label className="block font-medium">Brutto оператора (€)</label>
          <input
            required={!opInfo?.allowNet}
            disabled={opInfo?.allowNet}
            type="number"
            step="0.01"
            className="w-full border rounded p-2"
            value={bruttoOperator}
            onChange={e => setBruttoOperator(e.target.value)}
          />
        </div>
      </div>

      {opInfo?.allowNet && (
        <div>
          <label className="block font-medium">Netto оператора (€)</label>
          <input
            required
            type="number"
            step="0.01"
            className="w-full border rounded p-2"
            value={nettoOperator}
            onChange={e => setNettoOperator(e.target.value)}
          />
        </div>
      )}

      <div>
        <label className="block font-medium">Net (внутр. учёт)</label>
        <input
          type="number"
          step="0.01"
          className="w-full border rounded p-2"
          value={internalNet}
          onChange={e => setInternalNet(e.target.value)}
        />
      </div>

      {/* ------------ прочее ------------ */}
      <div>
        <label className="block font-medium">Комментарий</label>
        <textarea className="w-full border rounded p-2" value={comment} onChange={e => setComment(e.target.value)} />
      </div>

      <div>
        <label className="block font-medium">Ссылка на инвойс</label>
        <input className="w-full border rounded p-2" type="url" value={invoiceLink} onChange={e => setInvoiceLink(e.target.value)} />
      </div>

      <div>
        <label className="block font-medium">Статус</label>
        <select className="w-full border rounded p-2" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="Новая">Новая</option>
          <option value="Готова к оплате туристом">Готова к оплате</option>
          <option value="Оплачено туристом">Оплачено туристом</option>
          <option value="Ожидает confirm">Ожидает confirm</option>
          <option value="Подтверждено">Подтверждено</option>
          <option value="Завершено">Завершено</option>
          <option value="Отменен">Отменен</option>
        </select>
      </div>

      <div>
        <label className="block font-medium">Банковская комиссия (€)</label>
        <input
          type="number"
          step="0.01"
          className="w-full border rounded p-2"
          placeholder={`По умолчанию 1.5% = ${(bc * 0.015).toFixed(2)} €`}
          value={bankFeeAmount}
          onChange={e => setBankFeeAmount(e.target.value)}
        />
      </div>

      {/* --------- итоги --------- */}
      <div className="p-3 bg-gray-50 border rounded text-sm space-y-1">
        <p><strong>Комиссия агента:</strong> {commission.toFixed(2)} €</p>
        <p><strong>Налог (10 %):</strong> {tax.toFixed(2)} €</p>
        <p>
          <strong>Комиссия банка ({bankPercent}%):</strong> {bankValidNum.toFixed(2)} €
        </p>
        <p><strong>Доход Crocus Tour:</strong> {crocusProfit.toFixed(2)} €</p>
      </div>

      <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
        Сохранить заявку
      </button>
    </form>
  );
}