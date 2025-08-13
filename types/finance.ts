// types/finance.ts

/** ===== Базовые справочники ===== */

export type Currency = "EUR" | "RON" | "USD";
export type CategorySide = "income" | "expense";

export type OwnerWho = "crocus" | "igor" | "evgeniy" | "split50" | null;

export type Account = {
  id: string;
  name: string;
  currency: Currency;
  archived?: boolean;
};

export type CategoryRole =
  | "client_payment"
  | "operator_payment"
  | "client_refund"
  | "operator_refund"
  | "other";

export type Category = {
  id: string;
  name: string;
  side: CategorySide;
  role?: CategoryRole;
  archived?: boolean;
  order?: number;
};

export type Counterparty = {
  id: string;
  name: string;
  archived?: boolean;
};

export type FxDoc = {
  id: string; // YYYY-MM-DD
  base: "EUR";
  rates: Partial<Record<Currency, number>>;
};

/** ===== Бронирование (как хранится в разных схемах) ===== */

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

  // даты начала
  checkIn?: any;
  checkInDate?: any;
  startDate?: any;
  dateFrom?: any;
  fromDate?: any;
  start?: any;
  departureDate?: any;

  // даты окончания
  checkOut?: any;
  checkOutDate?: any;
  endDate?: any;
  dateTo?: any;
  toDate?: any;
  end?: any;
  returnDate?: any;

  status?: string;
  agentName?: string;

  // суммы (альтернативные поля)
  clientPrice?: number;   // «классика»
  bruttoClient?: number;  // Олимпия

  internalNet?: number;       // fact / net
  internalNetto?: number;
  nettoOlimpya?: number;
  nettoOperator?: number;

  payments?: { amount?: number }[];

  createdAt?: any;

  // любые другие поля не мешают
  [key: string]: any;
};

/** ===== Транзакции (унифицированная строка для UI) ===== */

// Распределение на заявку (EUR)
export type Allocation = { bookingId: string; amountBase: number };

export type TxRow = {
  id: string;
  date: string; // YYYY-MM-DD
  status?: "planned" | "actual" | "reconciled";
  accountId: string;
  accountName?: string;
  currency: Currency;
  side: CategorySide;

  amount: number;     // в валюте счёта, всегда >= 0 в UI
  baseAmount: number; // в EUR, всегда >= 0 в UI

  categoryId: string | null;
  categoryName?: string;

  counterpartyId?: string | null;
  counterpartyName?: string;

  ownerWho?: OwnerWho; // только для расходов "вне заявок"

  // совместимость со старым форматом
  bookingId?: string | null;

  // современная схема
  bookingAllocations?: Allocation[]; // EUR, >= 0

  note?: string;
  method?: "bank" | "card" | "cash" | "iban" | "other";
  source?: string;

  createdAt?: any;
  updatedAt?: any;
};

/** ===== Ордера (вторичный слой: проводки по заявкам) ===== */

export type FinanceOrder = {
  id: string;
  txId: string;

  date: string; // YYYY-MM-DD
  status: "planned" | "actual" | "reconciled";
  side: CategorySide;

  bookingId: string;   // обязателен
  baseAmount: number;  // EUR, > 0

  // справочно
  accountId?: string | null;
  currency?: Currency | null;
  amount?: number | null;

  categoryId?: string | null;
  categoryName?: string | null;

  note?: string | null;

  createdAt?: any;
  updatedAt?: any;
};

/** ===== Витрина заявок для быстрого поиска/подбора ===== */

export type BookingOption = {
  id: string;
  bookingNumber: string;
  created: string; // dd.MM.yyyy
  operator: string;
  place: string;
  period: string; // "dd.MM.yyyy → dd.MM.yyyy"
  leftIncome: number;   // осталось принять от клиента
  leftExpense: number;  // осталось оплатить оператору
  // план
  brutto: number;   // плановая сумма клиента
  internal: number; // плановая сумма оператору

  // факт из ордеров
  incDone: number; // Σ income (EUR)
  expDone: number; // Σ expense (EUR)

  // НОВОЕ:
  touristFirst?: string;      // первый турист / плательщик
  clientOverpay?: number;     // переплата клиента = max(0, incSum - bruttoPlan)
  operatorOverpay?: number;   // (на будущее) переплата оператору = max(0, expSum - netPlan)
};


  