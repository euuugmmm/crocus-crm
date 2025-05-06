import { Timestamp } from "firebase/firestore";

// Тип комиссии
export interface Commission {
  id?: string;
  agentId: string;
  bookingId: string;
  amount: number;
  currency: string;
  status: CommissionStatus;
  createdAt: Timestamp;
  confirmedAt?: Timestamp;
  paidOut: boolean;
  payoutId?: string;
}

// Возможные статусы комиссии
export type CommissionStatus = "pending" | "confirmed" | "cancelled";

// Тип выплаты
export interface Payout {
  id?: string;
  agentId: string;
  amount: number;
  currency: string;
  date: Timestamp;
  managerId: string;
  note?: string;
  commissionIds: string[];
}