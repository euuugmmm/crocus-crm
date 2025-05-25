/* -----------------------------------------------
   components/BookingFormOlimpya.tsx
------------------------------------------------ */
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import UploadScreenshots from "@/components/UploadScreenshots";

/** Операторы и признак, можно ли вводить чистое нетто  */
const OPERATORS = [
  { label: "TOCO TOUR RO",  val: "TOCO TOUR RO",  allowNet: true  },
  { label: "TOCO TOUR MD",  val: "TOCO TOUR MD",  allowNet: true  },
  { label: "KARPATEN",      val: "KARPATEN",      allowNet: false },
  { label: "DERTOUR",       val: "DERTOUR",       allowNet: false },
  { label: "CHRISTIAN",     val: "CHRISTIAN",     allowNet: false },
  { label: "CORAL TRAVEL RO", val: "CORAL TRAVEL RO", allowNet: false },
  { label: "JOIN UP RO",      val: "JOIN UP RO",      allowNet: false },
  { label: "ANEX TOUR RO",    val: "ANEX TOUR RO",    allowNet: false },
];

/* ---------- типы ---------- */
type Payment = "card" | "iban" | "crypto";
type TaxMode = "personal" | "corporate";

interface Props {
  onSubmit: (data: any) => Promise<void>;
  bookingNumber?: string;
  agentName?: string;
  agentAgency?: string;
}

/* ---------- компонент ---------- */
export default function BookingFormOlimpya({
  onSubmit,
  bookingNumber = "",
  agentName = "",
  agentAgency = "",
}: Props) {
  const { t } = useTranslation("common");
  const router = useRouter();

  /* ---------- fields ---------- */
  const [operator,       setOperator]       = useState("");
  const [region,         setRegion]         = useState("");
  const [departureCity,  setDepartureCity]  = useState("");
  const [arrivalCity,    setArrivalCity]    = useState("");
  const [flightNumber,   setFlightNumber]   = useState("");
  const [flightTime,     setFlightTime]     = useState("");
  const [hotel,          setHotel]          = useState("");
  const [checkIn,        setCheckIn]        = useState("");
  const [checkOut,       setCheckOut]       = useState("");
  const [room,           setRoom]           = useState("");
  const [mealPlan,       setMealPlan]       = useState("");

  const [bruttoClient,   setBruttoClient]   = useState("");
  const [bruttoOperator, setBruttoOperator] = useState("");
  const [nettoOperator,  setNettoOperator]  = useState("");

  const [paymentMethod,  setPaymentMethod]  = useState<Payment>("iban");
  const [taxMode,        setTaxMode]        = useState<TaxMode>("personal");
  const [comment,        setComment]        = useState("");

  /* ---------- расчёты ---------- */
  const [bankFee,         setBankFee]         = useState(0);
  const [profitBeforeTax, setProfitBeforeTax] = useState(0);
  const [netProfit,       setNetProfit]       = useState(0);

  /* ---------- туристы ---------- */
  const [tourists, setTourists] = useState([
    { name:"", dob:"", passportNumber:"", passportValidUntil:"", nationality:"", hasEUDoc:false },
  ]);

  const opInfo = OPERATORS.find(o => o.val === operator);

  /* ---------- пересчёт прибыли ---------- */
  useEffect(() => {
    const bc  = +bruttoClient   || 0;
    const bo  = +bruttoOperator || 0;
    const net = +nettoOperator  || 0;

    /* комиссия банка только при оплате картой */
    const fee = paymentMethod === "card" ? +(bc * 0.015).toFixed(2) : 0;
    setBankFee(fee);

    let beforeTax = 0;

    if (opInfo?.allowNet) {
      /* TOCO-операторы */
      beforeTax = bc - net - fee;
    } else {
      /* остальные */
      const markUp = bc - bo;
      beforeTax = bo * 0.05 + markUp * 0.75 - fee;
    }
    beforeTax = +beforeTax.toFixed(2);
    setProfitBeforeTax(beforeTax);

    /* чистая прибыль после налогов */
    const multiplier = taxMode === "personal" ? 0.90 /* 10 % */ : 0.76 /* 16 % + 8 % */;
    setNetProfit(+ (beforeTax * multiplier).toFixed(2));
  }, [bruttoClient, bruttoOperator, nettoOperator, operator, paymentMethod, taxMode]);

  /* ---------- обработчики туристов ---------- */
  const addTourist    = ()             => setTourists([...tourists, { ...tourists[0] }]);
  const removeTourist = (i:number)     => setTourists(tourists.filter((_,idx) => idx!==i));
  const updateTourist = (i:number,f:string,v:any) =>
    setTourists(tourists.map((t,idx) => idx===i?{...t,[f]:v}:t));

  /* ---------- submit ---------- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await onSubmit({
      /* поля брони */
      bookingNumber, operator, region, departureCity, arrivalCity,
      flightNumber, flightTime, hotel, checkIn, checkOut,
      room, mealPlan,
      tourists: tourists.filter(t => t.name.trim()),

      /* финансы */
      bruttoClient:    +bruttoClient   || 0,
      bruttoOperator:  +bruttoOperator || 0,
      nettoOperator:   +nettoOperator  || 0,
      paymentMethod,
      taxMode,
      bankFee,
      profitBeforeTax,
      netProfit,

      /* метаданные */
      segment: "olimpya",
      comment,
      commissionPaid: false,
    });

    router.push("/olimpya/bookings");
  }

  /* ---------- helpers ---------- */
  const renderInput = (
    labelKey:string,
    value:string,
    setter:(v:string)=>void,
    type: "text" | "number" | "date" = "text"
  ) => (
    <div>
      <label className="block text-sm font-medium mb-1">{t(labelKey)}</label>
      <input
        type={type}
        value={value}
        onChange={e => setter(e.target.value)}
        className="w-full border rounded p-2"
      />
    </div>
  );

  /* ---------- UI ---------- */
  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* summary */}
      <div className="bg-gray-100 p-2 rounded text-sm">
        <p><strong>{t("agentName")}:</strong> {agentName}</p>
        <p><strong>{t("agencyName")}:</strong> {agentAgency}</p>
        <p><strong>{t("bookingNumber")}:</strong> {bookingNumber}</p>
      </div>

      {/* operator */}
      <label className="block text-sm font-medium mb-1">{t("operator")}</label>
      <select
        value={operator}
        onChange={e => setOperator(e.target.value)}
        required
        className="w-full border rounded p-2"
      >
        <option value="">{t("choose")}</option>
        {OPERATORS.map(o => (
          <option key={o.val} value={o.val}>{o.label}</option>
        ))}
      </select>

      {/* основные поля */}
      {renderInput("region", region, setRegion)}
      {renderInput("departureCity", departureCity, setDepartureCity)}
      {renderInput("arrivalCity", arrivalCity, setArrivalCity)}
      {renderInput("flightNumber", flightNumber, setFlightNumber)}
      {renderInput("flightTime", flightTime, setFlightTime)}
      {renderInput("hotel", hotel, setHotel)}
      {renderInput("checkIn", checkIn, setCheckIn, "date")}
      {renderInput("checkOut", checkOut, setCheckOut, "date")}
      {renderInput("room", room, setRoom)}
      {renderInput("mealPlan", mealPlan, setMealPlan)}

      {/* tourists */}
      <h3 className="text-lg font-semibold mt-4">{t("tourists")}</h3>
      {tourists.map((tourist,i) => (
        <div key={i} className="relative border p-4 rounded-lg bg-white mb-4 shadow-sm">
          <button type="button" onClick={() => removeTourist(i)}
                  className="absolute bottom-2 right-2 text-red-500">🗑</button>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {["name","dob","passportNumber","passportValidUntil","nationality"].map(f => (
              <div key={f}>
                <label className="block text-sm font-medium mb-1">{t(f)}</label>
                <input
                  type={f.includes("dob")||f.includes("Until")?"date":"text"}
                  value={(tourist as any)[f]}
                  onChange={e => updateTourist(i, f, e.target.value)}
                  className="w-full border rounded p-2"
                />
              </div>
            ))}
            <div className="flex items-center mt-2">
              <input type="checkbox"
                     checked={tourist.hasEUDoc}
                     onChange={e => updateTourist(i,"hasEUDoc",e.target.checked)}
                     className="mr-2" />
              <label>{t("hasEUDoc")}</label>
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">
        + {t("addTourist")}
      </button>

      {/* pricing */}
      <h3 className="text-lg font-semibold mt-4">{t("pricing")}</h3>
      {renderInput("bruttoClient", bruttoClient, setBruttoClient, "number")}

      {!opInfo?.allowNet && renderInput("bruttoOperator", bruttoOperator, setBruttoOperator, "number")}
      {opInfo?.allowNet && renderInput("nettoOperator", nettoOperator, setNettoOperator, "number")}

      {/* payment / tax */}
      <label className="block text-sm font-medium mb-1">{t("paymentMethod")}</label>
      <select
        value={paymentMethod}
        onChange={e => setPaymentMethod(e.target.value as Payment)}
        className="w-full border rounded p-2"
      >
        <option value="card">{t("paymentCard")}</option>
        <option value="iban">{t("paymentIban")}</option>
        <option value="crypto">{t("paymentCrypto")}</option>
      </select>

      <label className="block text-sm font-medium mb-1 mt-4">{t("taxMode")}</label>
      <select
        value={taxMode}
        onChange={e => setTaxMode(e.target.value as TaxMode)}
        className="w-full border rounded p-2"
      >
        <option value="personal">{t("taxPersonal")}</option>
        <option value="corporate">{t("taxCorporate")}</option>
      </select>

      {/* comment */}
      <label className="block text-sm font-medium mb-1 mt-4">{t("comment")}</label>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        className="w-full border rounded p-2"
      />

      {/* profit block */}
      <div className="p-3 bg-gray-50 border rounded text-sm mt-4 space-y-1">
        <p><strong>{t("profitBeforeTax")}:</strong> {profitBeforeTax.toFixed(2)} €</p>
        <p><strong>{t("netProfit")}:</strong> {netProfit.toFixed(2)} €</p>
        <p className="text-xs text-gray-500">
          {t("bankFee")}: {bankFee.toFixed(2)} €
        </p>
      </div>

      {/* screenshots */}
      <UploadScreenshots bookingDocId={bookingNumber} bookingNumber={bookingNumber} />

      {/* buttons */}
      <div className="flex justify-between mt-4">
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          {t("createBooking")}
        </button>
        <button
          type="button"
          onClick={() => router.push("/olimpya/bookings")}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}