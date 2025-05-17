// utils/calculateProfit.ts

import { Booking } from "@/types/BookingDTO";

export function calculateProfit(booking: Booking): number {
  const {
    salePrice = 0,
    supplierCost = 0,
    agentCommission = 0,
    bankFees = 0,
  } = booking;

  return salePrice - supplierCost - agentCommission - bankFees;
}

export function getFounderShares(booking: Booking): {
  igorShare: number;
  evgeniyShare: number;
} {
  const netProfit = calculateProfit(booking);

  let igorRatio = 0;
  let evgeniyRatio = 0;

  switch (booking.market) {
    case "Romania":
      igorRatio = 0.5;
      evgeniyRatio = 0.5;
      break;
    case "Ukraine":
      igorRatio = 0.7;
      evgeniyRatio = 0.3;
      break;
    case "IgorBase":
      igorRatio = 1.0;
      evgeniyRatio = 0.0;
      break;
    default:
      igorRatio = 0.5;
      evgeniyRatio = 0.5;
  }

  return {
    igorShare: +(netProfit * igorRatio).toFixed(2),
    evgeniyShare: +(netProfit * evgeniyRatio).toFixed(2),
  };
}