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
  { label: "ANEX TOUR RO", val: "ANEX TOUR RO", allowNet: false },
];

const SHARE_CARD = 0.80;
const SHARE_IBAN = 0.85;

export default function BookingFormAgent({ onSubmit, bookingNumber = "", agentName = "", agentAgency = "", isManager = false }) {
  const router = useRouter();
  const { t } = useTranslation("common");

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
  const [bruttoOperator, setBruttoOperator] = useState("");
  const [nettoOperator, setNettoOperator] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [commission, setCommission] = useState(0);
  const [comment, setComment] = useState("");
  const [attachments, setAttachments] = useState([]);

  const [tourists, setTourists] = useState([{ name: "", dob: "", passportNumber: "", passportValidUntil: "", nationality: "", hasEUDoc: false }]);

  const opInfo = OPERATORS.find(o => o.val === operator);

  useEffect(() => {
    const bc = parseFloat(bruttoClient) || 0;
    const bo = parseFloat(bruttoOperator) || 0;
    const net = parseFloat(nettoOperator) || 0;
    const share = paymentMethod === "iban" || paymentMethod === "crypto" ? SHARE_IBAN : SHARE_CARD;

    let comm = 0;
    if (opInfo?.allowNet) {
      comm = (bc - net) * share;
    } else {
      const markup = bc - bo;
      comm = bo > bc ? 0 : bo * 0.03 + (markup > 0 ? markup * share : 0);
    }
    setCommission(Math.round(comm * 100) / 100);
  }, [bruttoClient, bruttoOperator, nettoOperator, operator, paymentMethod]);

  const addTourist = () => setTourists([...tourists, { name: "", dob: "", passportNumber: "", passportValidUntil: "", nationality: "", hasEUDoc: false }]);
  const removeTourist = (i) => setTourists(tourists.filter((_, idx) => idx !== i));
  const updateTourist = (i, field, value) => setTourists(tourists.map((t, idx) => idx === i ? { ...t, [field]: value } : t));

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanedTourists = tourists.filter(t => t.name);
    onSubmit({
      bookingNumber, operator, region, departureCity, arrivalCity,
      flightNumber, flightTime, hotel, checkIn, checkOut,
      room, mealPlan, tourists: cleanedTourists,
      bruttoClient: parseFloat(bruttoClient) || 0,
      bruttoOperator: parseFloat(bruttoOperator) || 0,
      nettoOperator: parseFloat(nettoOperator) || 0,
      paymentMethod, commission, comment, attachments
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-100 p-2 rounded text-sm text-gray-700">
        <p><strong>{t("agentName")}</strong>: {agentName}</p>
        <p><strong>{t("agencyName")}</strong>: {agentAgency}</p>
        <p><strong>{t("bookingNumber")}</strong>: {bookingNumber}</p>
      </div>
<div>
  <label className="block text-sm font-medium mb-1">{t("operator")}</label>
  <select
    value={operator}
    onChange={(e) => setOperator(e.target.value)}
    className="w-full border rounded p-2"
    required
  >
    <option value="">{t("choose")}</option>
    {OPERATORS.map(o => (
      <option key={o.val} value={o.val}>{o.label}</option>
    ))}
  </select>
</div>
      {[, ['region', region, setRegion], ['departureCity', departureCity, setDepartureCity],
        ['arrivalCity', arrivalCity, setArrivalCity], ['checkIn', checkIn, setCheckIn], ['checkOut', checkOut, setCheckOut], ['flightNumber', flightNumber, setFlightNumber], ['hotel', hotel, setHotel], ['room', room, setRoom], 
        ['mealPlan', mealPlan, setMealPlan]].map(([labelKey, value, setter]) => (
        <div key={labelKey}>
          <label className="block text-sm font-medium mb-1">{t(labelKey)}</label>
          <input type={(labelKey.includes("check") || labelKey.includes("Date")) ? "date" : "text"}
                 value={value} onChange={e => setter(e.target.value)}
                 className="w-full border rounded p-2" />
        </div>
      ))}

      <h3 className="text-lg font-semibold mt-4">{t("tourists")}</h3>
      {tourists.map((tourist, i) => (
        <div key={i} className="relative border p-4 rounded-lg bg-white mb-4 shadow-sm">
          <button type="button" onClick={() => removeTourist(i)} className="absolute bottom-2 right-2 text-red-500">🗑</button>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['name', 'dob', 'passportNumber', 'passportValidUntil', 'nationality'].map(field => (
              <div key={field}>
                <label className="block text-sm font-medium mb-1">{t(field)}</label>
                <input type={field.includes("dob") || field.includes("Until") ? "date" : "text"}
                       value={tourist[field]} onChange={e => updateTourist(i, field, e.target.value)}
                       className="w-full border rounded p-2" />
              </div>
            ))}
            <div className="flex items-center mt-2">
              <input type="checkbox" checked={tourist.hasEUDoc} onChange={e => updateTourist(i, "hasEUDoc", e.target.checked)} className="mr-2" />
              <label>{t("hasEUDoc")}</label>
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">+ {t("addTourist")}</button>

      <h3 className="text-lg font-semibold mt-4">{t("pricing")}</h3>
      {[['bruttoClient', bruttoClient, setBruttoClient], ['bruttoOperator', bruttoOperator, setBruttoOperator], ['nettoOperator', nettoOperator, setNettoOperator]].map(([labelKey, value, setter]) => (
        <div key={labelKey}>
          <label className="block text-sm font-medium mb-1">{t(labelKey)}</label>
          <input type="number" value={value} onChange={e => setter(e.target.value)} className="w-full border rounded p-2" disabled={labelKey === 'bruttoOperator' && opInfo?.allowNet} />
        </div>
      ))}

      <label className="block text-sm font-medium mb-1">{t("paymentMethod")}</label>
      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border rounded p-2">
        <option value="card">{t("paymentCard")}</option>
        <option value="iban">{t("paymentIban")}</option>
        <option value="crypto">{t("paymentCrypto")}</option>
      </select>

      <label className="block text-sm font-medium mb-1 mt-4">{t("attachments")}</label>
      <input type="file" multiple onChange={e => setAttachments(Array.from(e.target.files))} className="w-full border rounded p-2" />

      <label className="block text-sm font-medium mb-1 mt-4">{t("comment")}</label>
      <textarea value={comment} onChange={e => setComment(e.target.value)} className="w-full border rounded p-2" />

      <div className="p-3 bg-gray-50 border rounded text-sm mt-4">
        <p><strong>{t("commission")}: </strong>{commission.toFixed(2)} €</p>
      </div>

      <div className="flex justify-between mt-4">
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">{t("createBooking")}</button>
        <button type="button" onClick={() => router.push("/agent/bookings")} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">{t("cancel")}</button>
      </div>
    </form>
  );
}
