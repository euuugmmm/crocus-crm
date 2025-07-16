// types/BookingDTO.ts
export interface Booking {
  id?: string;
  bookingNumber: string;
  date: string;
  market: "Romania" | "Ukraine" | "IgorBase";
  clientName: string;
  agentId?: string;
  agentName?: string;
  agentAgency?: string;
  bookingType?: "subagent" | "igor" | "romania";
  category?: string;
  currency: string;
  salePrice: number;
  supplierCost: number;
  agentCommission?: number;
  bankFees?: number;
  operatorCommission?: number;
  netProfit?: number;
  status: "Open" | "Closed" | "Cancelled";
  createdAt?: any;
  updatedAt?: any;
  founderShareScheme?: {
    igor: number;
    evgeniy: number;
  };
  transactionsIds?: string[];
  bruttoClient?: number;
  nettoOperator?: number;
  internalNet?: number;
  commission?: number;
  bankFeeAmount?: number;
}