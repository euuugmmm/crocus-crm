// types/BankTransaction.ts

export interface BankTransaction {
  transactionId: string;
  bookingDate: string;   // дата проведения
  valueDate: string;     // дата валютирования (иногда отличается)
  transactionAmount: {
    amount: string;      // в GoCardless/Nordigen суммы строкой!
    currency: string;
  };
  creditorName?: string;
  creditorAccount?: { iban?: string };
  debtorName?: string;
  debtorAccount?: { iban?: string };
  remittanceInformationUnstructured?: string; // назначение платежа
  internalTransactionId?: string;

  // дополнительные поля для учёта
  bookingId?: string;   // если уже привязано к заявке
  category?: string;    // категория учёта
  note?: string;        // ручные комментарии

  createdAt?: string;
  updatedAt?: string;
}