// lib/finance/bookings.ts
export type BookingFull = {
  id: string;

  bookingNumber?: string;
  operator?: string;
  operatorName?: string;
  tourOperator?: string;

  hotel?: string;
  tourName?: string;
  destination?: string;
  region?: string;
  arrivalCity?: string;

  checkIn?: any;
  checkInDate?: any;
  startDate?: any;
  dateFrom?: any;
  fromDate?: any;
  start?: any;
  departureDate?: any;

  checkOut?: any;
  checkOutDate?: any;
  endDate?: any;
  dateTo?: any;
  toDate?: any;
  end?: any;
  returnDate?: any;

  clientPrice?: number;
  bruttoClient?: number;

  internalNet?: number;
  internalNetto?: number;
  nettoOlimpya?: number;
  nettoOperator?: number;

  createdAt?: any;
};

export type OrderLite = {
  bookingId: string;
  side: "income" | "expense";
  status: "planned" | "actual" | "reconciled";
  baseAmount: number; // EUR, положительное
};

const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const bookingTotalBrutto = (b: BookingFull) =>
  toNum(b.clientPrice ?? b.bruttoClient ?? 0);

export const bookingTotalInternal = (b: BookingFull) =>
  toNum(b.internalNet ?? b.internalNetto ?? b.nettoOlimpya ?? b.nettoOperator ?? 0);

// взять первый определённый атрибут
const first = <T,>(...vals: T[]) => vals.find(v => v !== undefined && v !== null && v !== "") as T | undefined;

export const pickOperator = (b: BookingFull) =>
  first(b.operator, b.operatorName, b.tourOperator) || "—";

export const pickPlace = (b: BookingFull) =>
  first(b.hotel, b.tourName, b.destination, b.region, b.arrivalCity) || "—";

export const pickCheckIn = (b: BookingFull) =>
  first(b.checkIn, b.checkInDate, b.startDate, b.dateFrom, b.fromDate, b.start, b.departureDate);

export const pickCheckOut = (b: BookingFull) =>
  first(b.checkOut, b.checkOutDate, b.endDate, b.dateTo, b.toDate, b.end, b.returnDate);

// dd.MM.yyyy
export const dmy = (v?: any) => {
  if (!v && v !== 0) return "—";
  if (typeof v === "string") {
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return v; // dd.MM.yyyy
    const d = new Date(v);
    if (!isNaN(+d)) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }
    return v;
  }
  const d = (v && typeof (v as any).toDate === "function") ? (v as any).toDate() : new Date(v);
  if (d instanceof Date && !isNaN(+d)) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  return "—";
};

/** агрегат фактов по ордерам: bookingId -> { inc, exp } с учётом только actual|reconciled */
export function aggregateOrdersByBooking(orders: OrderLite[]) {
  const m = new Map<string, { inc: number; exp: number }>();
  for (const o of orders) {
    if (o.status !== "actual" && o.status !== "reconciled") continue;
    const cur = m.get(o.bookingId) || { inc: 0, exp: 0 };
    if (o.side === "income") cur.inc += toNum(o.baseAmount);
    else cur.exp += toNum(o.baseAmount);
    m.set(o.bookingId, cur);
  }
  return m;
}

/** Витрина по брони: план, факт, остатки */
export function buildBookingOptionsBase(
  bookings: BookingFull[],
  ordersAgg: Map<string, { inc: number; exp: number }>
) {
  const map = new Map<string, {
    id: string;
    bookingNumber: string;
    created: string;
    operator: string;
    place: string;
    period: string;

    brutto: number;    // план клиент
    internal: number;  // план оператор
    incDone: number;   // факт доход
    expDone: number;   // факт расход
    leftIncome: number;
    leftExpense: number;
  }>();

  for (const b of bookings) {
    const brutto = bookingTotalBrutto(b);
    const internal = bookingTotalInternal(b);
    const sums = ordersAgg.get(b.id) || { inc: 0, exp: 0 };

    const createdAt = (b as any).createdAt;
    const created = createdAt?.toDate ? dmy(createdAt.toDate()) : dmy(createdAt);

    map.set(b.id, {
      id: b.id,
      bookingNumber: b.bookingNumber || b.id,
      created,
      operator: pickOperator(b),
      place: pickPlace(b),
      period: `${dmy(pickCheckIn(b))} → ${dmy(pickCheckOut(b))}`,

      brutto,
      internal,
      incDone: +sums.inc.toFixed(2),
      expDone: +sums.exp.toFixed(2),
      leftIncome: Math.max(0, +(brutto - sums.inc).toFixed(2)),
      leftExpense: Math.max(0, +(internal - sums.exp).toFixed(2)),
    });
  }
  return map;
}