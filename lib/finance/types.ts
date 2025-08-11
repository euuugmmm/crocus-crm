// lib/finance/types.ts
export type Currency = "EUR" | "RON" | "USD";

// для категорий разрешаем "cogs"
export type CategorySide = "income" | "expense" | "cogs";

export type Category = {
  id: string;
  name: string;
  side: CategorySide;
  description?: string;
  system?: boolean;
  isSystem?: boolean;
  archived?: boolean;
  createdAt?: any;
};

export type TxType = "in" | "out" | "transfer";
export type TxStatus = "planned" | "actual" | "reconciled";

export type Transaction = {
  id: string;
  date: string;           // YYYY-MM-DD
  type: TxType;
  status?: TxStatus;

  // Счета
  accountId?: string;     // для in/out
  fromAccountId?: string; // для transfer
  toAccountId?: string;   // для transfer

  // Суммы
  amount: { value: number; currency: Currency }; // как у вас в UI
  fxRateToBase?: number;  // множитель к EUR
  baseAmount?: number;    // сумма в EUR
  eurAmount?: number;     // дубликат baseAmount для совместимости

  // семантика для матчинга с планами
  side?: "income" | "expense"; // in -> income, out -> expense

  categoryId?: string;
  categoryName?: string;
  bookingId?: string | null;

  method?: "card" | "bank" | "cash" | "iban" | "other";
  note?: string;

  createdAt?: any;
  updatedAt?: any;

  accountName?: string;
};

export type Account = {
  id: string;
  name: string;
  currency: Currency;
  openingBalance?: number;
  isDefault?: boolean;
  archived?: boolean;
  createdAt?: any;
};

export type FxRates = {
  id: string;     // YYYY-MM-DD
  base: "EUR";
  // 1 EUR = X CCY
  rates: Partial<Record<Currency, number>>;
  createdAt?: any;
};

// В планах side только доход/расход (без cogs)
export type Planned = {
  id: string;
  date: string;
  accountId: string;
  accountName?: string;
  currency: Currency;
  side: "income" | "expense"; // ВАЖНО
  amount: number;
  eurAmount?: number;
  categoryId: string;
  categoryName?: string;
  bookingId?: string | null;
  note?: string;
  matchedTxId?: string | null;
  matchedAt?: any;
  createdAt?: any;
  source?: "manual" | "booking";
};