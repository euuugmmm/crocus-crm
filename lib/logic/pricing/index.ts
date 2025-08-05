// lib/logic/pricing/index.ts
import { SHARE_CARD, SHARE_IBAN, CARD_FEE } from "./config";

export type AgentPricingInput = {
  operator: string;
  bruttoClient: number;
  internalNet: number;
  bruttoOperator: number;
  paymentMethod: "card" | "iban" | "crypto";
  allowNet: boolean;
};

export const calcAgentCommission = (p: AgentPricingInput) => {
  const share = ["iban", "crypto"].includes(p.paymentMethod)
    ? SHARE_IBAN
    : SHARE_CARD;
  const bankFee = p.paymentMethod === "card" ? p.bruttoClient * CARD_FEE : 0;

  let commission = 0;
  if (p.allowNet) {
    commission = (p.bruttoClient - p.internalNet) * share;
  } else {
    const markup = Math.max(0, p.bruttoClient - p.bruttoOperator);
    commission = p.bruttoOperator * 0.03 + markup * share;
  }
  return {
    agent: Math.round(commission * 100) / 100,
    bankFee: Math.round(bankFee * 100) / 100,
  };
};