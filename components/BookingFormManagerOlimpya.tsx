// components/BookingFormManagerOlimpya.tsx
"use client";

import { useState, useEffect, FormEvent } from "react";
import { useTranslation } from "next-i18next";
import InputMask from "react-input-mask-next";
import { format, parse, isValid } from "date-fns";

export interface Tourist {
  name: string;
  dob: string;
  passportNumber: string;
  passportValidUntil: string;
  nationality: string;
  hasEUDoc: boolean;
  phone?: string;
}

export interface OlimpyaBookingValues {
  bookingNumber?: string;
  bookingType?: string;
  baseType?: "igor" | "evgeniy" | "crocus";
  operator?: string;
  region?: string;
  departureCity?: string;
  arrivalCity?: string;
  flightNumber?: string;
  flightTime?: string;
  hotel?: string;
  checkIn?: string;
  checkOut?: string;
  room?: string;
  mealPlan?: string;
  tourists?: Tourist[];
  bruttoClient?: number;
  nettoOlimpya?: number;
  internalNet?: number;
  paymentMethod?: string;
  status?: string;

  commissionO?: number;
  overCommission?: number;
  realCommission?: number;
  commissionIgor?: number;
  commissionEvgeniy?: number;
  commission?: number;

  supplierBookingNumber?: string;
  payerName?: string;
  comment?: string;
  agentName?: string;
  agentAgency?: string;

  /** Флаг ручного режима — если true, ничего не пересчитываем. */
  financeManualOverride?: boolean;
}

interface Props {
  initialValues?: OlimpyaBookingValues;
  onSubmit: (values: OlimpyaBookingValues) => void;
  bookingNumber?: string;
  agentName?: string;
  agentAgency?: string;
}

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

const BASES = [
  { label: "Игорь", val: "igor" },
  { label: "Евгений", val: "evgeniy" },
  { label: "Crocus", val: "crocus" },
];

const STATUS_OPTIONS = [
  { label: "Новая", val: "new" },
  { label: "Заведено DMC", val: "created_dmc" },
  { label: "Заведено Toco", val: "created_toco" },
  { label: "Подтверждено DMC", val: "confirmed_dmc" },
  { label: "Подтверждено DMC + Авиа", val: "confirmed_dmc_flight" },
  { label: "Подтверждено", val: "confirmed" },
  { label: "Завершено", val: "finished" },
  { label: "Отменено", val: "cancelled" },
];

export default function BookingFormManagerOlimpya({
  initialValues,
  onSubmit,
  bookingNumber = "",
  agentName = "",
  agentAgency = "",
}: Props) {
  const { t } = useTranslation("common");

  const [base, setBase] = useState<"igor" | "evgeniy" | "crocus">("igor");
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
  const [nettoOlimpya, setNettoOlimpya] = useState("");
  const [internalNet, setinternalNet] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [status, setStatus] = useState("created_dmc");
  const [comment, setComment] = useState("");

  const [tourists, setTourists] = useState<Tourist[]>([
    { name: "", dob: "", passportNumber: "", passportValidUntil: "", nationality: "", hasEUDoc: false },
  ]);

  const [supplierBookingNumber, setSupplierBookingNumber] = useState("");
  type PayerMode = "agent" | "first" | "custom";
  const [payerMode, setPayerMode] = useState<PayerMode>("agent");
  const [customPayerName, setCustomPayerName] = useState("");

  // --- Финансовые поля ---
  const [commissionO, setCommissionO] = useState(0);
  const [overCommission, setOverCommission] = useState(0);
  const [realCommission, setRealCommission] = useState(0);
  const [commissionIgor, setCommissionIgor] = useState(0);
  const [commissionEvgeniy, setCommissionEvgeniy] = useState(0);
  const [commission, setCommission] = useState(0);

  // Ручной режим + «касался ли пользователь сумм»
  const [financeManual, setFinanceManual] = useState<boolean>(false);
  const [manualTouched, setManualTouched] = useState<boolean>(false);

  // Подтягиваем initialValues
  useEffect(() => {
    if (!initialValues) return;
    setBase(initialValues.baseType || "igor");
    setOperator(initialValues.operator || "");
    setRegion(initialValues.region || "");
    setDepartureCity(initialValues.departureCity || "");
    setArrivalCity(initialValues.arrivalCity || "");
    setFlightNumber(initialValues.flightNumber || "");
    setFlightTime(initialValues.flightTime || "");
    setHotel(initialValues.hotel || "");
    setCheckIn(initialValues.checkIn || "");
    setCheckOut(initialValues.checkOut || "");
    setRoom(initialValues.room || "");
    setMealPlan(initialValues.mealPlan || "");
    setBruttoClient(String(initialValues.bruttoClient ?? ""));
    setNettoOlimpya(String(initialValues.nettoOlimpya ?? ""));
    setinternalNet(String(initialValues.internalNet ?? ""));
    setPaymentMethod(initialValues.paymentMethod || "card");
    setStatus(initialValues.status || "created_dmc");
    setComment(initialValues.comment || "");
    setTourists(
      Array.isArray(initialValues.tourists) && initialValues.tourists.length
        ? initialValues.tourists
        : [{ name: "", dob: "", passportNumber: "", passportValidUntil: "", nationality: "", hasEUDoc: false }]
    );
    setSupplierBookingNumber(initialValues.supplierBookingNumber || "");

    // payerName -> режим
    const pv = (initialValues.payerName || "").trim();
    const firstTouristName =
      Array.isArray(initialValues.tourists) && initialValues.tourists[0]?.name
        ? initialValues.tourists[0].name
        : "";
    if (pv) {
      if (pv === (agentName || "")) { setPayerMode("agent"); setCustomPayerName(""); }
      else if (firstTouristName && pv === firstTouristName) { setPayerMode("first"); setCustomPayerName(""); }
      else { setPayerMode("custom"); setCustomPayerName(pv); }
    } else { setPayerMode("first"); setCustomPayerName(""); }

    // Финансы из initialValues (без пересчёта)
    if (typeof initialValues.commissionO === "number") setCommissionO(initialValues.commissionO);
    if (typeof initialValues.overCommission === "number") setOverCommission(initialValues.overCommission);
    if (typeof initialValues.realCommission === "number") setRealCommission(initialValues.realCommission);
    if (typeof initialValues.commissionIgor === "number") setCommissionIgor(initialValues.commissionIgor);
    if (typeof initialValues.commissionEvgeniy === "number") setCommissionEvgeniy(initialValues.commissionEvgeniy);
    if (typeof initialValues.commission === "number") setCommission(initialValues.commission);

    // ВАЖНО: читаем флаг из БД и не сбрасываем его нигде автоматически
    setFinanceManual(!!initialValues.financeManualOverride);
    setManualTouched(false);
  }, [initialValues, agentName]);

  // Автопересчёт — только если НЕТ ручного режима и пользователь ещё не правил суммы
  useEffect(() => {
    if (financeManual || manualTouched) return;

    const bc = parseFloat(bruttoClient) || 0;
    const no = parseFloat(nettoOlimpya) || 0;
    const nf = parseFloat(internalNet) || 0;

    const O = bc - no;
    const real = bc - nf;
    const over = no - nf;

    let ig = 0, ev = 0;
    if (base === "igor") {
      ig = O + Math.max(0, over) * 0.3;
      ev = Math.max(0, over) * 0.7;
    } else if (base === "evgeniy") {
      ev = O + Math.max(0, over) * 0.7;
      ig = Math.max(0, over) * 0.3;
    } else {
      ig = real * 0.5;
      ev = real * 0.5;
    }

    const rnd = (x: number) => Math.round(x * 100) / 100;
    const realR = rnd(real);

    setCommissionO(rnd(O));
    setOverCommission(rnd(over));
    setRealCommission(realR);
    setCommissionIgor(rnd(ig));
    setCommissionEvgeniy(rnd(ev));
    setCommission(rnd(realR * 0.9));
  }, [bruttoClient, nettoOlimpya, internalNet, base, financeManual, manualTouched]);

  const parseDMYLocal = (s: string) => {
    const p = parse(s, "dd.MM.yyyy", new Date());
    return isValid(p) ? p : new Date(s);
  };
  const age = (dob: string) => {
    const b = parseDMYLocal(dob), n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n < new Date(b.setFullYear(b.getFullYear() + a))) a--;
    return a;
  };
  const fmt = (d?: string) => {
    if (!d) return "—";
    const parsed = parseDMYLocal(d);
    return isValid(parsed) ? format(parsed, "dd.MM.yyyy") : "—";
  };

  const renderMaskedInput = (value: string, setter: (v: string) => void) => (
    <InputMask
      mask="99.99.9999"
      value={value}
      onChange={(e) => setter(e.target.value)}
      className="w-full border rounded p-2"
      placeholder="дд.мм.гггг"
    />
  );

  const addTourist = () =>
    setTourists((t) => [...t, { name: "", dob: "", passportNumber: "", passportValidUntil: "", nationality: "", hasEUDoc: false, phone: "" }]);
  const delTourist = (idx: number) => setTourists((t) => t.filter((_, i) => i !== idx));
  const chTourist = (idx: number, f: keyof Tourist, v: any) =>
    setTourists((t) => t.map((tr, i) => (i === idx ? { ...tr, [f]: v } : tr)));

  const resolvedPayerName = (): string => {
    if (payerMode === "agent") return agentName || "";
    if (payerMode === "first") return tourists[0]?.name || "";
    return customPayerName;
  };

  // Помечаем, что вручную меняли суммы (блокирует автопересчёт в эту сессию)
  const markManual = () => {
    setManualTouched(true);
  };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      bookingNumber,
      bookingType: initialValues?.bookingType || "olimpya_base",
      baseType: base,
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
      tourists,
      bruttoClient: parseFloat(bruttoClient) || 0,
      nettoOlimpya: parseFloat(nettoOlimpya) || 0,
      internalNet: parseFloat(internalNet) || 0,
      paymentMethod,
      status,

      // Сохраняем РОВНО введённые цифры:
      commissionO,
      overCommission,
      realCommission,
      commissionIgor,
      commissionEvgeniy,
      commission,

      supplierBookingNumber,
      payerName: resolvedPayerName(),
      comment,
      agentName,
      agentAgency,

      // Сохраняем флаг — больше нигде его не сбрасываем автоматически
      financeManualOverride: financeManual,
    });
  }

  // Редактировать суммы можно только при «Агент» и включённом флаге
  const manualMode = payerMode === "agent" && financeManual;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
      <div className="p-4 bg-gray-100 rounded-lg border space-y-4">
        <h2 className="text-lg font-semibold">Информация о заявке</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <p><strong>Агент:</strong> {agentName}</p>
          <p><strong>Агентство:</strong> {agentAgency}</p>
          <p><strong>Номер заявки (внутр.):</strong> {bookingNumber}</p>
          <p><strong>Номер у оператора:</strong> {supplierBookingNumber || "—"}</p>
          <p><strong>Оператор:</strong> {operator}</p>
          <p><strong>Направление:</strong> {region}</p>
          <p><strong>Город вылета:</strong> {departureCity}</p>
          <p><strong>Город прилёта:</strong> {arrivalCity}</p>
          <p><strong>Отель:</strong> {hotel}</p>
          <p><strong>Период:</strong> {checkIn} → {checkOut}</p>
          <p><strong>Комната:</strong> {room}</p>
          <p><strong>Brutto клиента:</strong> {bruttoClient} €</p>
          <p><strong>Netto Олимпия:</strong> {nettoOlimpya} €</p>
          <p><strong>Netto Fact:</strong> {internalNet} €</p>
          <p><strong>Плательщик:</strong> {resolvedPayerName() || "—"}</p>

          <div className="col-span-full overflow-x-auto">
            <strong>Туристы:</strong>
            <div className="mt-2 grid gap-4 whitespace-nowrap grid-cols-[minmax(250px,_auto)_max-content_max-content_max-content_max-content_max-content_max-content]">
              <div>{tourists.map((t, i) => <p key={i}>{t.name}</p>)}</div>
              <div>{tourists.map((t, i) => <p key={i}>{age(t.dob)}</p>)}</div>
              <div>{tourists.map((t, i) => <p key={i}>{fmt(t.dob)}</p>)}</div>
              <div>{tourists.map((t, i) => <p key={i}>{t.nationality}</p>)}</div>
              <div>{tourists.map((t, i) => <p key={i}>{t.passportNumber}</p>)}</div>
              <div>{tourists.map((t, i) => <p key={i}>{fmt(t.passportValidUntil)}</p>)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* База клиента */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">База клиента</label>
          <select className="w-full border rounded p-2" value={base} onChange={(e) => setBase(e.target.value as any)} required>
            {BASES.map((b) => (<option key={b.val} value={b.val}>{b.label}</option>))}
          </select>
        </div>
      </div>

      {/* Оператор и номер */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Оператор</label>
          <select className="w-full border rounded p-2" value={operator} onChange={(e) => setOperator(e.target.value)} required>
            <option value="">— выберите —</option>
            {OPERATORS.map((o) => (<option key={o.val} value={o.val}>{o.label}</option>))}
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="block font-medium">Номер у оператора/поставщика</label>
          <input className="w-full border rounded p-2" value={supplierBookingNumber} onChange={(e) => setSupplierBookingNumber(e.target.value)} placeholder="например, TOCO-123456" />
        </div>
      </div>

      {/* Маршрут и отель */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Направление</label>
          <input className="w-full border rounded p-2" value={region} onChange={(e) => setRegion(e.target.value)} required />
        </div>
        <div>
          <label className="block font-medium">Отель</label>
          <input className="w-full border rounded p-2" value={hotel} onChange={(e) => setHotel(e.target.value)} required />
        </div>
      </div>

      {/* Перелёт */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block font-medium">Город вылета</label>
          <input className="w-full border rounded p-2" value={departureCity} onChange={(e) => setDepartureCity(e.target.value)} />
        </div>
        <div>
          <label className="block font-medium">Город прилёта</label>
          <input className="w-full border rounded p-2" value={arrivalCity} onChange={(e) => setArrivalCity(e.target.value)} />
        </div>
        <div>
          <label className="block font-medium">Номер рейса</label>
          <input className="w-full border rounded p-2" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} />
        </div>
      </div>

      {/* Даты */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Заезд</label>
          {renderMaskedInput(checkIn, setCheckIn)}
        </div>
        <div>
          <label className="block font-medium">Выезд</label>
          {renderMaskedInput(checkOut, setCheckOut)}
        </div>
      </div>

      {/* Туристы */}
      <h3 className="text-lg font-semibold">Туристы</h3>
      {tourists.map((t, i) => (
        <div key={i} className="relative border p-4 rounded-lg bg-white mb-4 shadow-sm">
          {tourists.length > 1 && (
            <button type="button" onClick={() => delTourist(i)} className="absolute top-2 right-2 text-red-500">🗑</button>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input placeholder="ФИО" required value={t.name} onChange={(e) => chTourist(i, "name", e.target.value)} className="border rounded p-2" />
            {renderMaskedInput(t.dob, (v) => chTourist(i, "dob", v))}
            <input placeholder="Паспорт №" value={t.passportNumber} onChange={(e) => chTourist(i, "passportNumber", e.target.value)} className="border rounded p-2" />
            {renderMaskedInput(t.passportValidUntil, (v) => chTourist(i, "passportValidUntil", v))}
            <input placeholder="Гражданство" value={t.nationality} onChange={(e) => chTourist(i, "nationality", e.target.value)} className="border rounded p-2" />
            <label className="flex items-center space-x-2">
              <input type="checkbox" checked={t.hasEUDoc} onChange={(e) => chTourist(i, "hasEUDoc", e.target.checked)} />
              <span>EU-документ</span>
            </label>
          </div>
        </div>
      ))}
      <button type="button" onClick={addTourist} className="text-blue-600 text-sm">+ Добавить туриста</button>

      {/* Финансы (ввод) */}
      <h3 className="text-lg font-semibold mt-4">Финансовые данные</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium">Brutto клиента (€)</label>
          <input type="number" step="0.01" className="w-full border rounded p-2" value={bruttoClient} onChange={(e) => setBruttoClient(e.target.value)} required />
        </div>
        <div>
          <label className="block font-medium">Netto Олимпия (€)</label>
          <input type="number" step="0.01" className="w-full border rounded p-2" value={nettoOlimpya} onChange={(e) => setNettoOlimpya(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block font-medium">Netto Fact (€)</label>
        <input type="number" step="0.01" className="w-full border rounded p-2" value={internalNet} onChange={(e) => setinternalNet(e.target.value)} />
      </div>

      {/* Плательщик + ручной режим */}
      <div className="md:col-span-2">
        <label className="block font-medium">Плательщик</label>
        <div className="flex flex-col gap-2 mt-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="payerMode" value="first" checked={payerMode === "first"} onChange={() => setPayerMode("first")} />
            <span>Первый турист ({tourists[0]?.name || "—"})</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="payerMode" value="agent" checked={payerMode === "agent"} onChange={() => setPayerMode("agent")} />
            <span>Агент ({agentName || "—"})</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="payerMode" value="custom" checked={payerMode === "custom"} onChange={() => setPayerMode("custom")} />
            <span>Другое</span>
          </label>
        </div>

        <input
          className="w-full border rounded p-2 mt-2"
          value={payerMode === "agent" ? (agentName || "") : payerMode === "first" ? (tourists[0]?.name || "") : customPayerName}
          onChange={(e) => { if (payerMode === "custom") setCustomPayerName(e.target.value); }}
          placeholder="Имя плательщика"
          disabled={payerMode !== "custom"}
        />

        {payerMode === "agent" && (
          <label className="mt-3 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={financeManual}
              onChange={(e) => setFinanceManual(e.target.checked)}
            />
            <span>Ручное редактирование финансов (агентский платёж)</span>
          </label>
        )}
      </div>

      {/* Комиссии */}
      <div className="p-3 bg-gray-50 border rounded text-sm space-y-2">
        <div className="font-medium">Комиссии</div>

        <RowField label="Комиссия Олимпия (O)" value={commissionO} editable={manualMode} onChange={(v) => { markManual(); setCommissionO(v); }} />
        <RowField label="Оверкомиссия"          value={overCommission} editable={manualMode} onChange={(v) => { markManual(); setOverCommission(v); }} />
        <RowField label="Комиссия реальная"     value={realCommission} editable={manualMode} onChange={(v) => { markManual(); setRealCommission(v); }} />
        <RowField label="Игорю"                  value={commissionIgor} editable={manualMode} onChange={(v) => { markManual(); setCommissionIgor(v); }} />
        <RowField label="Евгению"               value={commissionEvgeniy} editable={manualMode} onChange={(v) => { markManual(); setCommissionEvgeniy(v); }} />
        <RowField label="Комиссия (после -10%)" value={commission} editable={manualMode} onChange={(v) => { markManual(); setCommission(v); }} />

        {!financeManual && !manualTouched && (
          <div className="text-xs text-gray-500">
            Значения рассчитываются автоматически на основе Brutto/Netto и базы. Чтобы изменить суммы вручную,
            выберите плательщика «Агент» и включите галочку «Ручное редактирование финансов».
          </div>
        )}
      </div>

      <div>
        <label className="block font-medium">Статус заявки</label>
        <select className="w-full border rounded p-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (<option key={s.val} value={s.val}>{s.label}</option>))}
        </select>
      </div>

      <div>
        <label className="block font-medium">Комментарий при создании</label>
        <textarea className="w-full border rounded p-2" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>

      <div className="flex justify-between mt-4">
        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          {initialValues ? "Сохранить" : "Создать"}
        </button>

        <button type="button" className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600" onClick={() => window.history.back()}>
          Отмена
        </button>
      </div>
    </form>
  );
}

/** Строка с числовым полем/значением */
function RowField({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: number;
  editable: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}:</span>
      {editable ? (
        <input
          type="number"
          step="0.01"
          className="w-40 border rounded p-1 text-right"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value || "0") || 0)}
        />
      ) : (
        <span>{(Number(value) || 0).toFixed(2)} €</span>
      )}
    </div>
  );
}