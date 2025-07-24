// lib/types.ts
export interface Booking {
  id?: string;
  agentId?: string;
  bookingNumber?: string;
  agentName?: string;
  agentAgency?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  clientPrice?: number;
  agentCommission?: number;
  payments?: { amount: number; date: string }[];
  operator?: string;
  hotel?: string;
  checkIn?: string;
  checkOut?: string;
  bruttoClient?: number;
  nettoFact?: number;
  commission?: number;
  internalNet?: number;
  bankFeeAmount?: number;
  status?: string;
  invoiceLink?: string;
  comment?: string;
  bookingType?: string;
  voucherLinks?: string[];
  createdAt?: {
    toDate: () => Date;
  };
}