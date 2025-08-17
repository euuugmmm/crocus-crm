/**
 * Типы материализованных (кэш) документов для финансовых отчётов.
 * Эти документы хранятся в отдельных коллекциях Firestore и читаются страницами отчётов,
 * чтобы не сканировать все finance_transactions/finance_planned заново.
 */

/** P&L по месяцу (коллекция: finance_pl_month/{YYYY-MM}) */
export type PLMonthDoc = {
  /** Ключ месяца в формате YYYY-MM */
  month: string;

  /** Выручка (EUR) */
  revenue: number;

  /** Себестоимость (EUR) */
  cogs: number;

  /** Операционные расходы (EUR) */
  opex: number;

  /** Валовая прибыль = revenue - cogs (EUR) */
  gross: number;

  /** Чистая прибыль = gross - opex (EUR) */
  net: number;

  /** Когда пересчитано */
  computedAt?: any; // Firestore Timestamp

  /** Служебная инфа о первичном источнике (необязательно) */
  source?: { lastTxUpdatedAt?: any; txCount?: number } | null;
};


/** Агрегаты по заявке из ордеров (коллекция: finance_bookingAgg/{bookingId}) */
export type BookingAggDoc = {
  bookingId: string;

  /** Суммы фактически распределённые по ордерам */
  incDone: number; // EUR
  expDone: number; // EUR

  /** Доп. поля на ваше усмотрение (если считаете остатки/переплаты заранее) */
  leftIncome?: number;       // EUR
  leftExpense?: number;      // EUR
  clientOverpay?: number;    // EUR
  operatorOverpay?: number;  // EUR

  updatedAt?: any; // Firestore Timestamp
};

/** Универсальный тип для timestamp из Firestore/Date/number */
export type Timestampish =
  | { toDate?: () => Date }  // Firestore Timestamp
  | Date
  | number
  | string
  | null
  | undefined;

  export interface CacheMeta {
  id?: string;
  lastRunAt?: Timestampish;
  lastFrom?: string;
  lastTo?: string;
  status?: "idle" | "running" | "done" | "error";
  byUid?: string;
  byName?: string;
  error?: string;
  updatedAt?: Timestampish;
    kind: "accountDaily";
  lastBuiltAt?: any; // Firestore timestamp
  rangeFrom?: string;
  rangeTo?: string;
  updatedByUid?: string;
};

export interface AccountDailyDoc {
  id?: string;
  date: string;
  planIncome: number;
  planExpense: number;
  planIncomeOverdue: number;
  planExpenseOverdue: number;
  planIncomeMatched: number;
  planExpenseMatched: number;
  actualIncome: number;
  actualExpense: number;
  updatedAt?: Timestampish;


};

