// components/BookingFormAgent.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import InputMask from "react-input-mask-next";
import UploadScreenshots from "@/components/UploadScreenshots";
import { OPERATORS } from "@/lib/constants/operators";

// Константы комиссий/сборов
const CARD_PROC = 0.018;          // 1.8% процессинг
const TOCO_RO_FEE = 0.015;        // 1.5% от нетто оператора
const TOCO_MD_FEE = 0.02;         // 2.0% от нетто оператора
const OTHER_AGENT_PCT = 0.06;     // 6% комиссия агента на прочих операторах

export default function BookingFormAgent({
  onSubmit,
  bookingNumber = "",
  agentName = "",
  agentAgency = "",
}) {
  const router = useRouter();
  const { t } = useTranslation("common");

  // Данные заявки
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

  // Блок "Цены"
  const [payer, setPayer] = useState("tourist");       // 'tourist' | 'agent'
  const [paymentMethod, setPaymentMethod] = useState("card"); // 'card' | 'iban' | 'crypto'

  // Деньги (ввод)
  const [bruttoClient, setBruttoClient] = useState("");     // Брутто клиента (€)
  const [nettoOperator, setNettoOperator] = useState("");   // Нетто оператора (€) — для TOCO
  const [bruttoOperator, setBruttoOperator] = useState(""); // Брутто оператора (€) — для прочих

  // Расчёты (вывод)
  const [commissionBase, setCommissionBase] = useState(0);
  const [crocusFee, setCrocusFee] = useState(0);
  const [cardProcessing, setCardProcessing] = useState(0);
  const [commissionAgent, setCommissionAgent] = useState(0);
  const [netToPay, setNetToPay] = useState(0); // "Netto к оплате" (для payer=agent)

  const [comment, setComment] = useState("");

  // Туристы
  const [tourists, setTourists] = useState([
    {
      name: "",
      dob: "",
      passportNumber: "",
      passportValidUntil: "",
      nationality: "",
      hasEUDoc: false,
    },
  ]);

  const opInfo = OPERATORS.find((o) => o.val === operator);
  const isToco = opInfo?.allowNet === true;
  const isTocoRO = operator === "TOCO TOUR RO";
  const isTocoMD = operator === "TOCO TOUR MD";

  const num = (v) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = (x) => Math.round(x * 100) / 100;

  // ======= РАСЧЁТЫ =======
  useEffect(() => {
    if (!operator) {
      setCommissionBase(0);
      setCrocusFee(0);
      setCardProcessing(0);
      setCommissionAgent(0);
      setNetToPay(0);
      return;
    }
    const bc = num(bruttoClient);
    const bo = num(bruttoOperator);
    const net = num(nettoOperator);

    let _commissionBase = 0;
    let _crocusFee = 0;
    let _cardProc = 0;
    let _commissionAgent = 0;
    let _netToPay = 0;

    if (isToco) {
      const feePct = isTocoMD ? TOCO_MD_FEE : TOCO_RO_FEE;
      if (payer === "tourist") {
        _commissionBase = Math.max(0, bc - net);
        _crocusFee = net * feePct;
        _cardProc = paymentMethod === "card" ? bc * CARD_PROC : 0;
        _commissionAgent = Math.max(0, _commissionBase - _crocusFee - _cardProc);
        _netToPay = 0;
      } else {
        const basePay = net + net * feePct;
        _netToPay = paymentMethod === "card" ? basePay * (1 + CARD_PROC) : basePay;
        _commissionBase = bc > 0 ? Math.max(0, bc - net) : 0;
        _crocusFee = net * feePct;
        _cardProc = paymentMethod === "card" ? basePay * CARD_PROC : 0;
        _commissionAgent = Math.max(0, _commissionBase - _crocusFee - _cardProc);
      }
    } else {
      if (payer === "tourist") {
        const markup = Math.max(0, bc - bo);
        _commissionBase = markup + bo * OTHER_AGENT_PCT;
        _cardProc = paymentMethod === "card" ? bc * CARD_PROC : 0;
        _crocusFee = 0;
        _commissionAgent = Math.max(0, _commissionBase - _cardProc);
        _netToPay = 0;
      } else {
        const basePay = bo * (1 - OTHER_AGENT_PCT);
        _netToPay = paymentMethod === "card" ? basePay * (1 + CARD_PROC) : basePay;
        const markup = bc > 0 ? Math.max(0, bc - bo) : 0;
        _commissionBase = bc > 0 ? markup + bo * OTHER_AGENT_PCT : 0;
        _cardProc = paymentMethod === "card" ? basePay * CARD_PROC : 0;
        _crocusFee = 0;
        _commissionAgent = Math.max(0, _commissionBase - _cardProc);
      }
    }

    setCommissionBase(round2(_commissionBase));
    setCrocusFee(round2(_crocusFee));
    setCardProcessing(round2(_cardProc));
    setCommissionAgent(round2(_commissionAgent));
    setNetToPay(round2(_netToPay));
  }, [operator, payer, paymentMethod, bruttoClient, bruttoOperator, nettoOperator]);

  // ===== Туристы =====
  const addTourist = () =>
    setTourists((arr) => [
      ...arr,
      {
        name: "",
        dob: "",
        passportNumber: "",
        passportValidUntil: "",
        nationality: "",
        hasEUDoc: false,
      },
    ]);
  const removeTourist = (i) =>
    setTourists((arr) => arr.filter((_, idx) => idx !== i));
  const updateTourist = (i, field, value) =>
    setTourists((arr) => arr.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));

  // ===== Сохранение =====
  async function handleSubmit(e) {
    e.preventDefault();
    await onSubmit({
      bookingNumber,
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
      payer,
      paymentMethod,
      tourists: tourists.filter((t) => t.name),
      bruttoClient: num(bruttoClient),
      bruttoOperator: num(bruttoOperator),
      nettoOperator: num(nettoOperator),
      commissionBase,
      crocusFee,
      cardProcessing,
      commission: commissionAgent,
      netToPay,
      comment,
    });
    router.push("/agent/bookings");
  }

  const renderMaskedInput = (value, setter) => (
    <InputMask
      mask="99.99.9999"
      value={value}
      onChange={(e) => setter(e.target.value)}
      className="w-full border rounded p-2"
      placeholder="DD.MM.YYYY"
    />
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Информационный блок */}
      <div className="bg-gray-100 p-2 rounded text-sm">
        <p><strong>{t("agentName")}:</strong> {agentName}</p>
        <p><strong>{t("agencyName")}:</strong> {agentAgency}</p>
        <p><strong>{t("bookingNumber")}:</strong> {bookingNumber}</p>
      </div>

      {/* Оператор и детали тура */}
      <label className="block text-sm font-medium mb-1">{t("operator")}</label>
      <select
        className="w-full border rounded p-2"
        value={operator}
        onChange={(e) => setOperator(e.target.value)}
        required
      >
        <option value="">{t("choose")}</option>
        {OPERATORS.map((o) => (
          <option key={o.val} value={o.val}>{o.label}</option>
        ))}
      </select>

      <label className="block text-sm font-medium mb-1">{t("region")}</label>
      <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} className="w-full border rounded p-2"/>
      <label className="block text-sm font-medium mb-1">{t("departureCity")}</label>
      <input type="text" value={departureCity} onChange={(e) => setDepartureCity(e.target.value)} className="w-full border rounded p-2"/>
      <label className="block text-sm font-medium mb-1">{t("arrivalCity")}</label>
      <input type="text" value={arrivalCity} onChange={(e) => setArrivalCity(e.target.value)} className="w-full border rounded p-2"/>
      <label className="block text-sm font-medium mb-1">{t("flightNumber")}</label>
      <input type="text" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} className="w-full border rounded p-2"/>
      <label className="block text-sm font-medium mb-1">{t("flightTime")}</label>
      <input type="text" value={flightTime} onChange={(e) => setFlightTime(e.target.value)} className="w-full border rounded p-2"/>
      <label className="block text-sm font-medium mb-1">{t("hotel")}</label>
      <input type="text" value={hotel} onChange={(e) => setHotel(e.target.value)} className="w-full border rounded p-2"/>
      <label className="block text-sm font-medium mb-1">{t("checkIn")}</label>
      {renderMaskedInput(checkIn, setCheckIn)}
      <label className="block text-sm font-medium mb-1">{t("checkOut")}</label>
      {renderMaskedInput(checkOut, setCheckOut)}
      <label className="block text-sm font-medium mb-1">{t("room")}</label>
      <input type="text" value={room} onChange={(e) => setRoom(e.target.value)} className="w-full border rounded p-2"/>
      <label className="block text-sm font-medium mb-1">{t("mealPlan")}</label>
      <input type="text" value={mealPlan} onChange={(e) => setMealPlan(e.target.value)} className="w-full border rounded p-2"/>

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

      {/* Цены */}
      <h3 className="text-lg font-semibold mt-4">{t("pricing")}</h3>
      <label className="block text-sm font-medium mb-1">{t("payerWhopays")}</label>
      <select value={payer} onChange={(e) => setPayer(e.target.value)} className="w-full border rounded p-2">
        <option value="tourist">{t("payerTourist")}</option>
        <option value="agent">{t("payerAgent")}</option>
      </select>
      <label className="block text-sm font-medium mb-1">{t("paymentMethod")}</label>
      <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full border rounded p-2">
        <option value="card">{t("paymentCard")}</option>
        <option value="iban">{t("paymentIban")}</option>
        <option value="crypto">{t("paymentCrypto")}</option>
      </select>

      {isToco ? (
        <>
          {payer === "tourist" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")}</label>
              <input type="number" value={bruttoClient} onChange={(e) => setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
            </>
          )}
          {payer === "agent" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")} ({t("optional")})</label>
              <input type="number" value={bruttoClient} onChange={(e) => setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
            </>
          )}
          <label className="block text-sm font-medium mb-1">{t("nettoOperator")}</label>
          <input type="number" value={nettoOperator} onChange={(e) => setNettoOperator(e.target.value)} className="w-full border rounded p-2"/>
          {payer === "agent" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("netToPay")}</label>
              <input type="number" value={netToPay} readOnly className="w-full border rounded p-2 bg-gray-50"/>
            </>
          )}
        </>
      ) : (
        <>
          {payer === "tourist" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")}</label>
              <input type="number" value={bruttoClient} onChange={(e) => setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
              <label className="block text-sm font-medium mb-1">{t("bruttoOperator")}</label>
              <input type="number" value={bruttoOperator} onChange={(e) => setBruttoOperator(e.target.value)} className="w-full border rounded p-2"/>
            </>
          )}
          {payer === "agent" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")} ({t("optional")})</label>
              <input type="number" value={bruttoClient} onChange={(e) => setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
              <label className="block text-sm font-medium mb-1">{t("bruttoOperator")}</label>
              <input type="number" value={bruttoOperator} onChange={(e) => setBruttoOperator(e.target.value)} className="w-full border rounded p-2"/>
              <label className="block text-sm font-medium mb-1">{t("netToPay")}</label>
              <input type="number" value={netToPay} readOnly className="w-full border rounded p-2 bg-gray-50"/>
            </>
          )}
        </>
      )}

      {/* Детализация расчётов */}
      {operator && (
        <div className="p-3 bg-gray-50 border rounded text-sm space-y-1">
          <p><strong>{t("commissionBase")}:</strong> {commissionBase.toFixed(2)} €</p>
          {isToco ? (
            <p><strong>{t("crocusFee")}:</strong> –{crocusFee.toFixed(2)} €</p>
          ) : (
            <p><strong>{t("crocusFee")}:</strong> {crocusFee.toFixed(2)} €</p>
          )}
          {cardProcessing > 0 && (
            <p><strong>{t("cardProcessingFee")}:</strong> –{cardProcessing.toFixed(2)} €</p>
          )}
          <p><strong>{t("commissionAgent")}:</strong> {commissionAgent.toFixed(2)} €</p>
          {payer === "agent" && (
            <p><strong>{t("toPay")}:</strong> {netToPay.toFixed(2)} €</p>
          )}
        </div>
      )}

      {/* Комментарий */}
      <label className="block text-sm font-medium mb-1">{t("comment")}</label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="w-full border rounded p-2"/>

      {/* Скриншоты */}
      <UploadScreenshots bookingDocId={bookingNumber} bookingNumber={bookingNumber} />

      {/* Кнопки */}
      <div className="flex justify-between mt-4">
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          {t("createBooking")}
        </button>
        <button type="button" onClick={() => router.push("/agent/bookings")} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}