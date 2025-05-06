import { useState, useEffect } from "react";

const OPERATORS = [
  { label: "TOCO TOUR RO", val: "TOCO TOUR RO", allowNet: true },
  { label: "TOCO TOUR MD", val: "TOCO TOUR MD", allowNet: true },
  { label: "KARPATEN", val: "KARPATEN", allowNet: false },
  { label: "DERTOUR", val: "DERTOUR", allowNet: false },
  { label: "CHRISTIAN", val: "CHRISTIAN", allowNet: false },
];

export default function BookingFormManager({
  initialData = {},
  onSubmit,
  agentName = "",
  agentAgency = "",
  bookingNumber = "",
  isManager = false
}) {
  const [operator, setOperator] = useState(initialData.operator || "");
  const [region, setRegion] = useState(initialData.region || "");
  const [hotel, setHotel] = useState(initialData.hotel || "");
  const [checkIn, setCheckIn] = useState(initialData.checkIn || "");
  const [checkOut, setCheckOut] = useState(initialData.checkOut || "");
  const [room, setRoom] = useState(initialData.room || "");
  const [bruttoClient, setBruttoClient] = useState(initialData.bruttoClient || "");
  const [bruttoOperator, setBruttoOperator] = useState(initialData.bruttoOperator || "");
  const [nettoOperator, setNettoOperator] = useState(initialData.nettoOperator || "");
  const [internalNet, setInternalNet] = useState(initialData.internalNet || "");
  const [bankFeeAmount, setBankFeeAmount] = useState(
    initialData.bankFeeAmount !== undefined ? initialData.bankFeeAmount : ""
  );
  const [commission, setCommission] = useState(initialData.commission || 0);
  const [comment, setComment] = useState(initialData.comment || "");
  const [invoiceLink, setInvoiceLink] = useState(initialData.invoiceLink || "");
  const [status, setStatus] = useState(initialData.status || "Новая");
  const [tourists, setTourists] = useState(initialData.tourists || [{ name: "", dob: "" }]);

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

    const bc = parseFloat(bruttoClient) || 0;
    const net = parseFloat(internalNet) || 0;
    const tax = Math.round((commission / 0.9 - commission) * 100) / 100;
    const bankFeeRaw = bankFeeAmount === "" ? (bc * 0.015) : parseFloat(bankFeeAmount);
    const bankFeeValid = !isNaN(bankFeeRaw) ? bankFeeRaw : 0;
    const croProfit = Math.round(((bc - net) - commission - tax - bankFeeValid) * 100) / 100;

    const data = {
      bookingNumber: initialData.bookingNumber || bookingNumber,
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
      internalNet: parseFloat(internalNet) || 0,
      bankFeeAmount: bankFeeValid,
      commission,
      comment,
      invoiceLink,
      status,
      agentName,
      agentAgency,
      crocusProfit: croProfit,
      createdAt: initialData.createdAt || new Date().toISOString(),
    };
    onSubmit(data);
  };

  const bc = parseFloat(bruttoClient) || 0;
  const net = parseFloat(internalNet) || 0;
  const tax = Math.round((commission / 0.9 - commission) * 100) / 100;
  const bankFeeRaw = bankFeeAmount === "" ? (bc * 0.015) : parseFloat(bankFeeAmount);
  const bankFeeValid = !isNaN(bankFeeRaw) ? bankFeeRaw : 0;
  const actualBankPercent = bc ? ((bankFeeValid / bc) * 100).toFixed(2) : "0.00";
  const croProfit = Math.round(((bc - net) - commission - tax - bankFeeValid) * 100) / 100;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
      <div className="bg-gray-100 p-3 rounded text-sm text-gray-700">
        <p><strong>Имя агента:</strong> {agentName}</p>
        <p><strong>Агентство:</strong> {agentAgency}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Оператор</label>
          <select required value={operator} onChange={e => setOperator(e.target.value)} className="w-full border rounded p-2">
            <option value="">Выберите…</option>
            {OPERATORS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block font-medium">Направление</label>
          <input type="text" value={region} onChange={e => setRegion(e.target.value)} className="w-full border rounded p-2" required />
        </div>
      </div>

      <label className="block font-medium">Отель</label>
      <input type="text" value={hotel} onChange={e => setHotel(e.target.value)} className="w-full border rounded p-2" required />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Заезд</label>
          <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} className="w-full border rounded p-2" required />
        </div>
        <div>
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
          <input type="number" step="0.01" value={bruttoOperator} onChange={e => setBruttoOperator(e.target.value)} className="w-full border rounded p-2" required={!opInfo?.allowNet} disabled={opInfo?.allowNet} />
        </div>
      </div>

      {opInfo?.allowNet && (
        <div>
          <label className="block font-medium">Netto оператора (€)</label>
          <input type="number" step="0.01" value={nettoOperator} onChange={e => setNettoOperator(e.target.value)} className="w-full border rounded p-2" required />
        </div>
      )}

      <div>
        <label className="block font-medium">Net (внутренний учёт)</label>
        <input type="number" step="0.01" value={internalNet} onChange={e => setInternalNet(e.target.value)} className="w-full border rounded p-2" />
      </div>

      <div>
        <label className="block font-medium">Комментарий</label>
        <textarea value={comment} onChange={e => setComment(e.target.value)} className="w-full border rounded p-2" />
      </div>

      <div>
        <label className="block font-medium">Ссылка на инвойс</label>
        <input type="url" value={invoiceLink} onChange={e => setInvoiceLink(e.target.value)} className="w-full border rounded p-2" />
      </div>

      <div>
        <label className="block font-medium">Статус</label>
        <select value={status} onChange={e => setStatus(e.target.value)} className="w-full border rounded p-2">
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
          value={bankFeeAmount}
          onChange={e => setBankFeeAmount(e.target.value)}
          placeholder={`По умолчанию 1.5% = ${(bc * 0.015).toFixed(2)} €`}
          className="w-full border rounded p-2"
        />
      </div>

      <div className="p-3 bg-gray-50 border rounded text-sm">
        <p><strong>Рассчитанная комиссия агента:</strong> {commission.toFixed(2)} €</p>
        <p><strong>Налог (10%):</strong> {tax.toFixed(2)} €</p>
        <p><strong>Комиссия банка ({actualBankPercent}%):</strong> {bankFeeValid.toFixed(2)} €</p>
        <p><strong>Доход Crocus Tour (после всех расходов):</strong> {croProfit.toFixed(2)} €</p>
      </div>

      <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
        Сохранить заявку
      </button>
    </form>
  );
}