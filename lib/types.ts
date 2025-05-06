// lib/types.ts

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