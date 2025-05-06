// lib/types.ts
interface Booking {
  id: string;
  bookingNumber?: string;
  agentName?: string;
  agentAgency?: string;
  operator?: string;
  hotel?: string;
  checkIn?: string;
  checkOut?: string;
  bruttoClient?: number;
  commission?: number;
  internalNet?: number;
  bankFeeAmount?: number;
  status?: string;
  invoiceLink?: string;
  comment?: string;
  createdAt?: {
    toDate: () => Date;
  };
}
export type Booking = {
    id?: string;
    agentId?: string;
    bookingNumber?: string;
    destination?: string;
    startDate?: string;
    endDate?: string;
    clientPrice?: number;
    agentCommission?: number;
    payments?: { amount: number; date: string }[];
    status?: string;
  };