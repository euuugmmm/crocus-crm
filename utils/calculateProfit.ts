// utils/calculateProfit.ts

export type Ownership = {
  crocusProfit: number;
  evgeniyShare: number;
  igorShare: number;
};

export function calculateProfit(
  booking: {
    crocusProfit?: number;
    market?: string;
    agentId?: string;
    bruttoClient?: number;
    nettoOperator?: number;
    internalNet?: number;
    bookingType?: string;
  }
): Ownership {
  const {
    crocusProfit = 0,
    market = "",
    agentId = "",
    bruttoClient = 0,
    nettoOperator = 0,
    internalNet = 0,
  } = booking;

  const bookingType = booking.bookingType || (() => {
    if (market === "Украина" && agentId) return "subagent";
    if (market === "Румыния") return "romania";
    if (market === "База Игоря") return "igorBase";
    return "default";
  })();

  // Случай 1 — украинские субагенты → делим прибыль 50/50
  if (bookingType === "subagent") {
    const share = crocusProfit / 2;
    return { crocusProfit, evgeniyShare: share, igorShare: share };
  }

  // Случай 2 — румынские заявки → тоже 50/50
  if (bookingType === "romania") {
    const share = crocusProfit / 2;
    return { crocusProfit, evgeniyShare: share, igorShare: share };
  }

  // Случай 3 — база Игоря → 100% комиссии Игорю, но с перераспределением дельты
  if (bookingType === "igorBase") {
    const nominalCommission = bruttoClient - internalNet;
    const delta = internalNet - nettoOperator;

    const evgeniyShare = delta > 0 ? delta * 0.3 : 0;
    const igorShare = nominalCommission - evgeniyShare;
    const total = evgeniyShare + igorShare;

    return { crocusProfit: total, evgeniyShare, igorShare };
  }

  // По умолчанию — всё Евгению
  return { crocusProfit, evgeniyShare: crocusProfit, igorShare: 0 };
}