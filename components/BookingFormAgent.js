// components/BookingFormAgent.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import InputMask from "react-input-mask-next";
import UploadScreenshots from "@/components/UploadScreenshots";
import { OPERATORS } from "@/lib/constants/operators";
import { 
  AGENT_CARD_PROC,
  CROCUS_CARD_PROC,
  TOCO_RO_FEE,
  TOCO_MD_FEE,
  OTHER_AGENT_PCT
} from "@/lib/constants/fees";


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
  const [netToPay, setNetToPay] = useState(0); // "Netto к оплате" (для payerAgent)

  const [comment, setComment] = useState("");

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
    // Пока оператор не выбран — ничего не считаем
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
      // ===== TOCO RO / TOCO MD =====
      const feePct = isTocoMD ? TOCO_MD_FEE : TOCO_RO_FEE; // 2% для MD, 1.5% для RO

      if (payer === "tourist") {
        // Поля: Brutto клиента, Netto оператора
        // База комиссии: markup
        _commissionBase = Math.max(0, bc - net);

        // Сбор Crocus от нетто
        _crocusFee = net * feePct;

        // Процессинг (если картой) — от суммы клиента
        _cardProc = paymentMethod === "card" ? bc * CARD_PROC : 0;

        // Итог комиссии агента
        _commissionAgent = Math.max(0, _commissionBase - _crocusFee - _cardProc);

        // Агент ничего не платит оператору напрямую
        _netToPay = 0;
      } else {
        // payer === 'agent'
        // Поля: Netto оператора + "Netto к оплате" (нередактируемо)
        const basePay = net + net * feePct; // net + crocusFee
        _netToPay = paymentMethod === "card" ? basePay * (1 + CARD_PROC) : basePay;

        // База комиссии: если известен brutto клиента — считаем markup; иначе 0
        _commissionBase = bc > 0 ? Math.max(0, bc - net) : 0;

        _crocusFee = net * feePct;
        _cardProc = paymentMethod === "card" ? basePay * CARD_PROC : 0;

        _commissionAgent = Math.max(0, _commissionBase - _crocusFee - _cardProc);
      }
    } else {
      // ===== ПРОЧИЕ ОПЕРАТОРЫ =====
      if (payer === "tourist") {
        // Поля: Brutto клиента, Brutto оператора
        // База комиссии: (markup) + 6% от брутто оператора
        const markup = Math.max(0, bc - bo);
        _commissionBase = markup + bo * OTHER_AGENT_PCT;

        // Процессинг (если картой) — от суммы клиента
        _cardProc = paymentMethod === "card" ? bc * CARD_PROC : 0;

        _crocusFee = 0; // для прочих операторов отдельного crocusFee нет
        _commissionAgent = Math.max(0, _commissionBase - _cardProc);
        _netToPay = 0;
      } else {
        // payer === 'agent'
        // Поля: Brutto оператора + "Netto к оплате"
        const basePay = bo * (1 - OTHER_AGENT_PCT); // оператору уходит 94%
        _netToPay = paymentMethod === "card" ? basePay * (1 + CARD_PROC) : basePay;

        // Если известен brutto клиента — посчитаем комиссию как обычно; иначе 0
        const markup = bc > 0 ? Math.max(0, bc - bo) : 0;
        _commissionBase = bc > 0 ? markup + bo * OTHER_AGENT_PCT : 0;

        _cardProc = paymentMethod === "card" ? _netToPay * CARD_PROC / (1 + CARD_PROC) : 0; 
        // пояснение: чтобы показывать именно комиссию 1.8% как строку, можно и просто:
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

      // исходные суммы
      bruttoClient: num(bruttoClient),
      bruttoOperator: num(bruttoOperator),
      nettoOperator: num(nettoOperator),

      // расчётные суммы
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

  // ===== UI =====
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Информационный блок */}
      <div className="bg-gray-100 p-2 rounded text-sm">
        <p><strong>{t("agentName")}:</strong> {agentName}</p>
        <p><strong>{t("agencyName")}:</strong> {agentAgency}</p>
        <p><strong>{t("bookingNumber")}:</strong> {bookingNumber}</p>
      </div>

      {/* Оператор */}
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

      {/* Основные поля тура */}
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

      {/* Цены */}
      <h3 className="text-lg font-semibold mt-4">{t("pricing") || "Цены"}</h3>

<label className="block text-sm font-medium mb-1">
  {t("payerWhopays")}
</label>
      <select value={payer} onChange={(e) => setPayer(e.target.value)} className="w-full border rounded p-2">
        <option value="tourist">{t("payerTourist") || "payerTourist"}</option>
        <option value="agent">{t("payerAgent") || "payerAgent"}</option>
      </select>

      <label className="block text-sm font-medium mb-1">{t("paymentMethod")}</label>
      <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full border rounded p-2">
        <option value="card">{t("paymentCard") || "Картой (комиссия за процессинг)"}</option>
        <option value="iban">{t("paymentIban") || "iban"}</option>
        <option value="crypto">{t("paymentCrypto") || "crypto"}</option>
      </select>

      {/* Поля сумм по условиям */}
      {isToco ? (
        <>
          {/* TOCO: всегда есть Netto оператора; Brutto клиента нужен для расчёта базовой комиссии */}
          {payer === "tourist" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient") || "Brutto клиента (€)"}</label>
              <input type="number" value={bruttoClient} onChange={(e) => setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
            </>
          )}

          {/* В payer=agent Brutto клиента можно тоже ввести (если известно) для корректной комиссии */}
          {payer === "agent" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")} ({t("optional") || "опционально"})</label>
              <input type="number" value={bruttoClient} onChange={(e) => setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>
            </>
          )}

          <label className="block text-sm font-medium mb-1">{t("nettoOperator") || "Netto оператора (€)"}</label>
          <input type="number" value={nettoOperator} onChange={(e) => setNettoOperator(e.target.value)} className="w-full border rounded p-2"/>

          {payer === "agent" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("netToPay") || "Netto к оплате (€) — не редактируется"}</label>
              <input type="number" value={netToPay} readOnly className="w-full border rounded p-2 bg-gray-50"/>
            </>
          )}
        </>
      ) : (
        <>
          {/* Прочие операторы: работаем с Brutto оператора, Brutto клиента */}
          {payer === "tourist" && (
            <>
              <label className="block text-sm font-medium mb-1">{t("bruttoClient") || "Brutto клиента (€)"}</label>
              <input type="number" value={bruttoClient} onChange={(e) => setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>

              <label className="block text-sm font-medium mb-1">{t("bruttoOperator") || "Brutto оператора (€)"}</label>
              <input type="number" value={bruttoOperator} onChange={(e) => setBruttoOperator(e.target.value)} className="w-full border rounded p-2"/>
            </>
          )}

          {payer === "agent" && (
            <>
              {/* Brutto клиента опционален: если введён — посчитаем комиссию */}
              <label className="block text-sm font-medium mb-1">{t("bruttoClient")} ({t("optional") || "опционально"})</label>
              <input type="number" value={bruttoClient} onChange={(e) => setBruttoClient(e.target.value)} className="w-full border rounded p-2"/>

              <label className="block text-sm font-medium mb-1">{t("bruttoOperator") || "Brutto оператора (€)"}</label>
              <input type="number" value={bruttoOperator} onChange={(e) => setBruttoOperator(e.target.value)} className="w-full border rounded p-2"/>

              <label className="block text-sm font-medium mb-1">{t("netToPay") || "Netto к оплате (€) — не редактируется"}</label>
              <input type="number" value={netToPay} readOnly className="w-full border rounded p-2 bg-gray-50"/>
            </>
          )}
        </>
      )}

      {/* Детализация */}
      {operator && (
        <div className="p-3 bg-gray-50 border rounded text-sm mt-4 space-y-1">
          <p><strong>{t("commissionBase")}:</strong> {commissionBase.toFixed(2)} €</p>
           {isToco && (
      <p>
        <strong>{t("crocusFee")}:</strong> –{crocusFee.toFixed(2)} €
      </p>
    )}
          {!isToco && <p><strong>{t("crocusFee")}:</strong> {crocusFee.toFixed(2)} €</p>}
          {cardProcessing > 0 && (
           <p>
           <strong>{t("cardProcessingFee")}:</strong> –{cardProcessing.toFixed(2)} €
            </p>
            )}
          <p><strong>{t("commissionAgent")}:</strong> {commissionAgent.toFixed(2)} €</p>
          {payer === "agent" && (
            <p><strong>{t("toPay") || "К оплате"}:</strong> {netToPay.toFixed(2)} €</p>
          )}
        </div>
      )}

      {/* Комментарий */}
      <label className="block text-sm font-medium mb-1 mt-4">{t("comment")}</label>
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