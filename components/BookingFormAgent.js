// components/BookingFormAgent.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";

const OPERATORS = [
  { label: "TOCO TOUR RO", val: "TOCO TOUR RO", allowNet: true },
  { label: "TOCO TOUR MD", val: "TOCO TOUR MD", allowNet: true },
  { label: "KARPATEN", val: "KARPATEN", allowNet: false },
  { label: "DERTOUR", val: "DERTOUR", allowNet: false },
  { label: "CHRISTIAN", val: "CHRISTIAN", allowNet: false },
  { label: "CORAL TRAVEL RO", val: "CORAL TRAVEL RO", allowNet: false },
  { label: "JOIN UP RO", val: "JOIN UP RO", allowNet: false },
];

const SHARE_CARD = 0.80;
const SHARE_IBAN = 0.85;
const CARD_FEE = 0.015;

export default function BookingFormAgent({
  onSubmit,
  bookingNumber = "",
  agentName = "",
  agentAgency = "",
  isManager = false,
}) {
  const router = useRouter();
const { t } = useTranslation("common");

  const [operator, setOperator] = useState("");
  const [region, setRegion] = useState("");
  const [hotel, setHotel] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [room, setRoom] = useState("");
  const [bruttoClient, setBruttoClient] = useState("");
  const [bruttoOperator, setBruttoOperator] = useState("");
  const [nettoOperator, setNettoOperator] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [commission, setCommission] = useState(0);
  const [comment, setComment] = useState("");
  const [tourists, setTourists] = useState([{ name: "", dob: "" }]);

  const opInfo = OPERATORS.find(o => o.val === operator);

  useEffect(() => {
    const bc = parseFloat(bruttoClient) || 0;
    const bo = parseFloat(bruttoOperator) || 0;
    const net = parseFloat(nettoOperator) || 0;
    const share = paymentMethod === "iban" ? SHARE_IBAN : SHARE_CARD;

    let comm = 0;
    if (opInfo?.allowNet) {
      comm = (bc - net) * share;
    } else {
      const markup = bc - bo;
      comm = bo * 0.03 + (markup > 0 ? markup * share : 0);
    }
    setCommission(Math.round(comm * 100) / 100);
  }, [bruttoClient, bruttoOperator, nettoOperator, operator, paymentMethod]);

  const addTourist = () => setTourists([...tourists, { name: "", dob: "" }]);
  const updateTourist = (i, field, value) => setTourists(tourists.map((t, idx) => idx === i ? { ...t, [field]: value } : t));

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanedTourists = tourists.filter(t => t.name || t.dob);
    onSubmit({
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
      paymentMethod,
      commission,
      comment,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-100 p-2 rounded text-sm text-gray-700">
        <p><strong>{t("agentName")}:</strong> {agentName}</p>
        <p><strong>{t("agencyName")}:</strong> {agentAgency}</p>
        <p><strong>{t("bookingNumber")}:</strong> {bookingNumber}</p>
      </div>

      <label className="block font-medium">{t("operator")}</label>
      <select value={operator} onChange={e => setOperator(e.target.value)} required className="w-full border rounded p-2">
        <option value="">{t("choose")}</option>
        {OPERATORS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
      </select>

      <label className="block font-medium">{t("region")}</label>
      <input type="text" value={region} onChange={e => setRegion(e.target.value)} required className="w-full border rounded p-2" />

      <label className="block font-medium">{t("hotel")}</label>
      <input type="text" value={hotel} onChange={e => setHotel(e.target.value)} required className="w-full border rounded p-2" />

      <div className="flex space-x-4">
        <div className="flex-1">
          <label className="block font-medium">{t("checkIn")}</label>
          <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} required className="w-full border rounded p-2" />
        </div>
        <div className="flex-1">
          <label className="block font-medium">{t("checkOut")}</label>
          <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} required className="w-full border rounded p-2" />
        </div>
      </div>

      <label className="block font-medium">{t("room")}</label>
      <input type="text" value={room} onChange={e => setRoom(e.target.value)} className="w-full border rounded p-2" />

      <label className="block font-medium">{t("tourists")}</label>
{tourists.map((tourist, i) => (
  <div key={i} className="flex space-x-2 mb-2">
    <input
      type="text"
      value={tourist.name}
      onChange={e => updateTourist(i, "name", e.target.value)}
      placeholder={t("name")}
      required
      className="flex-1 border rounded p-2"
    />
    <input
      type="date"
      value={tourist.dob}
      onChange={e => updateTourist(i, "dob", e.target.value)}
      required
      className="flex-1 border rounded p-2"
    />
  </div>
))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">+ {t("addTourist")}</button>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">{t("bruttoClient")}</label>
          <input type="number" step="0.01" value={bruttoClient} onChange={e => setBruttoClient(e.target.value)} required className="w-full border rounded p-2" />
        </div>
        <div>
          <label className="block font-medium">{t("bruttoOperator")}</label>
          <input type="number" step="0.01" value={bruttoOperator} onChange={e => setBruttoOperator(e.target.value)} disabled={opInfo?.allowNet} required={!opInfo?.allowNet} className="w-full border rounded p-2" />
        </div>
      </div>

      {opInfo?.allowNet && (
        <div>
          <label className="block font-medium">{t("nettoOperator")}</label>
          <input type="number" step="0.01" value={nettoOperator} onChange={e => setNettoOperator(e.target.value)} required className="w-full border rounded p-2" />
        </div>
      )}

      <label className="block font-medium mt-3">{t("paymentMethod")}</label>
      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border rounded p-2">
        <option value="card">{t("paymentCard")}</option>
        <option value="iban">{t("paymentIban")}</option>
      </select>

      <label className="block font-medium">{t("comment")}</label>
      <textarea value={comment} onChange={e => setComment(e.target.value)} className="w-full border rounded p-2" />

      <div className="p-3 bg-gray-50 border rounded text-sm">
        <p><strong>{t("commission")}: </strong>{commission.toFixed(2)} €</p>
      </div>

      <div className="flex justify-between">
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          {t("createBooking")}
        </button>
        <button type="button" onClick={() => router.push("/agent/bookings")} className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-600">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
