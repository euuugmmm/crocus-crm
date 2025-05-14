// types/BookingDTO.ts

export interface BookingDTO {
  id?: string;
  bookingNumber?: string;
  operator?: string;
  region?: string;
  hotel?: string;
  checkIn?: string;      // дата заезда
  checkOut?: string;     // дата выезда
  room?: string;
  tourists?: { name: string; dob: string }[];

  bruttoClient?: number;
  bruttoOperator?: number;
  nettoOperator?: number;
  internalNet?: number;

  commission?: number;          // комиссия агента
  bankFeeAmount?: number;       // комиссия банка
  paymentMethod?: "card" | "iban";
  comment?: string;
  invoiceLink?: string;
  status?: string;

  agentName?: string;
  agentAgency?: string;
  crocusProfit?: number;

  createdAt?: string;
  updatedAt?: string;

  market?: string;             // "Украинский рынок", "Румынский рынок", etc.
  source?: string;             // Прямой/Агент
  category?: string;           // Категория для учёта
  invoiceIban?: string;        // IBAN куда платит клиент
}