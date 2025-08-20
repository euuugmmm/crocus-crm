// pages/api/finance/report.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/server/firebaseAdmin";
import * as admin from "firebase-admin";

type CategorySide = "income" | "expense";

type BookingDoc = {
  id: string;
  bookingNumber?: string;
  payerName?: string;
  tourists?: Array<{ name?: string }>;
  operator?: string;
  operatorName?: string;
  tourOperator?: string;

  clientPrice?: number;
  bruttoClient?: number;

  internalNet?: number;
  internalNetto?: number;
  nettoOlimpya?: number;
  nettoOperator?: number;

  agentCommissionEUR?: number;
  agentCommissionPercent?: number;

  createdAt?: any;
};

type OrderDoc = {
  id: string;
  txId: string;
  date: string; // YYYY-MM-DD
  side: CategorySide; // income | expense
  bookingId: string;
  baseAmount: number; // EUR
  status?: string;    // posted
};

type TxDoc = {
  id: string;
  date: string;
  side?: CategorySide;
  categoryId?: string | null;
  status?: string;
  baseAmount?: number;
  accountId?: string;
};

type Category = {
  id: string;
  name: string;
  side: CategorySide;
  code?: string;
};

function toNum(v: any, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
const EPS = 0.01;
const clamp0 = (x: number) => (x < 0 ? 0 : x);

function pickBrutto(b: BookingDoc | undefined) {
  if (!b) return 0;
  return toNum(b.clientPrice ?? b.bruttoClient ?? 0);
}
function pickNetto(b: BookingDoc | undefined) {
  if (!b) return 0;
  return toNum(b.internalNet ?? b.internalNetto ?? b.nettoOlimpya ?? b.nettoOperator ?? 0);
}
function pickOperator(b: BookingDoc | undefined) {
  if (!b) return "";
  return (b.operator || b.operatorName || b.tourOperator || "").trim();
}
function isAgentCategory(c?: Category | null) {
  if (!c) return false;
  if (c.code && c.code.toLowerCase() === "agent_commission") return true;
  return /агент/i.test(c.name || "");
}

async function fetchByIds<T>(col: string, ids: string[]): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (!ids.length) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  for (const ch of chunks) {
    const snap = await adminDb
      .collection(col)
      .where(admin.firestore.FieldPath.documentId(), "in", ch)
      .get();
    snap.forEach(d => out.set(d.id, { id: d.id, ...(d.data() as any) } as T));
  }
  return out;
}

function parseISO(s: any, def: string) {
  const t = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : def;
}
function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth()+1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function diffDaysIncl(a: string, b: string) {
  const A = new Date(a+"T00:00:00Z").getTime();
  const B = new Date(b+"T00:00:00Z").getTime();
  return Math.round((B - A) / 86400000) + 1;
}

type BookingRow = {
  bookingId: string;
  bookingNumber?: string;
  title: string;
  operator?: string;

  B: number;  // brutto
  N: number;  // netto

  CI: number; // пришло от клиента (до to)
  CE: number; // ушло по заявке (до to)

  expToSupplier: number;   // фактически ушло оператору (<= N)
  refundsEtc: number;      // CE - expToSupplier (возвраты/прочее поверх нетто)
  clientOverpay: number;   // (clientPaidEff - B)+

  operatorDebtAsOf: number;       // долг оператору по правилу аванса
  operatorPrepaidByOwn: number;   // оплачено оператору из своих (не покрыто клиентскими платежами)

  bookingCashBalance: number; // CI - CE
  fullyPaid: boolean;

  agentAccrued: number;   // если fullyPaid
  agentPaid: number;      // расход по категориям «агент»
  ownersProfit: number;   // (B - N) если fullyPaid
};

type OperatorRow = {
  operator: string;
  bookings: number;
  fullyPaid: number;

  B: number; N: number; CI: number; CE: number;
  debt: number; overpay: number; cash: number;

  agentAccrued: number; agentPaid: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const from = parseISO(req.query.from, today);
    const to   = parseISO(req.query.to,   today);

    // ========= ORDERS (as-of "to") =========
    const ordersSnap = await adminDb
      .collection("finance_orders")
      .where("status", "==", "posted")
      .where("date", "<=", to)
      .get();
    const ordersAllTo: OrderDoc[] = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const ordersBeforeFrom = ordersAllTo.filter(o => o.date < from);
    const ordersInPeriod   = ordersAllTo.filter(o => o.date >= from && o.date <= to);

    const sumCI = (arr: OrderDoc[]) => arr.reduce((s, o) => s + (o.side === "income" ? toNum(o.baseAmount) : 0), 0);
    const sumCE = (arr: OrderDoc[]) => arr.reduce((s, o) => s + (o.side === "expense" ? toNum(o.baseAmount) : 0), 0);

    const CI_before = +sumCI(ordersBeforeFrom).toFixed(2);
    const CE_before = +sumCE(ordersBeforeFrom).toFixed(2);
    const Z0 = clamp0(CI_before - CE_before); // деньги в заявках на начало

    const CI_period = +sumCI(ordersInPeriod).toFixed(2);
    const CE_period = +sumCE(ordersInPeriod).toFixed(2);
    const Z_asOf = clamp0(Z0 + CI_period - CE_period);

    // all-time to "to"
    const CI_to = +sumCI(ordersAllTo).toFixed(2);
    const CE_to = +sumCE(ordersAllTo).toFixed(2);
    const OwnToBookings = +Math.max(0, CE_to - CI_to).toFixed(2); // сколько своих в заявках (если CE > CI)

    // ========= BOOKINGS / CATEGORIES / TX (for agent-paid) =========
    const bookingIds = Array.from(new Set(ordersAllTo.map(o => o.bookingId).filter(Boolean)));
    const bookingsMap = await fetchByIds<BookingDoc>("bookings", bookingIds);

    const txIdsInExpOrders = Array.from(new Set(
      ordersAllTo.filter(o => o.side === "expense").map(o => o.txId)
    ));
    const txMap = await fetchByIds<TxDoc>("finance_transactions", txIdsInExpOrders);

    const catsSnap = await adminDb.collection("finance_categories").get();
    const categories = new Map<string, Category>(
      catsSnap.docs.map(d => [d.id, { id: d.id, ...(d.data() as any) } as Category])
    );

    // ========= AGG BY BOOKING =========
    const ordersByBooking = new Map<string, OrderDoc[]>();
    for (const o of ordersAllTo) {
      if (!o.bookingId) continue;
      const list = ordersByBooking.get(o.bookingId) || [];
      list.push(o);
      ordersByBooking.set(o.bookingId, list);
    }

    const bookingRows: BookingRow[] = [];
    let OwnersProfitRecognized = 0;
    let AgentAccruedTotal = 0;
    let AgentPaidTotal = 0;
    let OperatorsDebtTotal = 0;
    let ClientsAdvanceTotal = 0;
    let OperatorsPaidFromOwnTotal = 0;

    for (const [bid, list] of ordersByBooking) {
      const b = bookingsMap.get(bid);
      const B = +pickBrutto(b).toFixed(2);
      const N = +pickNetto(b).toFixed(2);

      const CI_b_raw = +list.filter(x => x.side === "income").reduce((s, x) => s + toNum(x.baseAmount), 0).toFixed(2);
      const CE_b_raw = +list.filter(x => x.side === "expense").reduce((s, x) => s + toNum(x.baseAmount), 0).toFixed(2);

      const operatorPaid      = Math.min(CE_b_raw, N);                 // ушло оператору в пределах N
      const refundsEtc        = Math.max(0, CE_b_raw - operatorPaid);  // возвраты/прочие расходы сверх N
      const clientPaidEff     = Math.max(0, CI_b_raw - refundsEtc);    // сколько денег клиента реально осталось у нас
      const fullyPaid         = clientPaidEff + EPS >= B;

      const payableCap        = Math.min(clientPaidEff, N);
      const operatorDebt_b    = Math.max(0, +(payableCap - operatorPaid).toFixed(2));
      const clientOverpay_b   = Math.max(0, +(clientPaidEff - B).toFixed(2));
      const prepaidByOwn_b    = Math.max(0, +(operatorPaid - payableCap).toFixed(2));

      // агентская комиссия: начисляем только когда клиент полностью оплатил
      let agentAccrued_b = 0;
      if (fullyPaid) {
        if (typeof b?.agentCommissionEUR === "number") agentAccrued_b = toNum(b?.agentCommissionEUR);
        else if (typeof b?.agentCommissionPercent === "number") agentAccrued_b = +(B * (toNum(b?.agentCommissionPercent) / 100)).toFixed(2);
      }

      // выплачено агенту — расходы по категории «комиссия агенту»
      let agentPaid_b = 0;
      for (const o of list) {
        if (o.side !== "expense") continue;
        const tx = txMap.get(o.txId);
        const cat = categories.get(String(tx?.categoryId || ""));
        if (isAgentCategory(cat)) agentPaid_b += toNum(o.baseAmount);
      }
      agentPaid_b = +agentPaid_b.toFixed(2);

      const ownersProfit_b = fullyPaid ? +(B - N).toFixed(2) : 0;

      OwnersProfitRecognized   += ownersProfit_b;
      AgentAccruedTotal        += agentAccrued_b;
      AgentPaidTotal           += agentPaid_b;
      OperatorsDebtTotal       += operatorDebt_b;
      OperatorsPaidFromOwnTotal+= prepaidByOwn_b;
      if (!fullyPaid && clientPaidEff > 0) {
        // «Авансы клиентов (не закрыты)» — эффективная оплата клиента по частично оплаченной заявке
        ClientsAdvanceTotal += clientPaidEff;
      }

      const row: BookingRow = {
        bookingId: bid,
        bookingNumber: b?.bookingNumber || bid,
        title: [b?.payerName, b?.tourists?.[0]?.name].filter(Boolean).join(" • "),
        operator: pickOperator(b) || "—",

        B, N,
        CI: CI_b_raw, CE: CE_b_raw,
        expToSupplier: +operatorPaid.toFixed(2),
        refundsEtc: +refundsEtc.toFixed(2),
        clientOverpay: +clientOverpay_b.toFixed(2),

        operatorDebtAsOf: +operatorDebt_b.toFixed(2),
        operatorPrepaidByOwn: +prepaidByOwn_b.toFixed(2),

        bookingCashBalance: +(CI_b_raw - CE_b_raw).toFixed(2),
        fullyPaid,

        agentAccrued: +agentAccrued_b.toFixed(2),
        agentPaid: agentPaid_b,
        ownersProfit: +ownersProfit_b.toFixed(2),
      };
      bookingRows.push(row);
    }

    OwnersProfitRecognized     = +OwnersProfitRecognized.toFixed(2);
    AgentAccruedTotal          = +AgentAccruedTotal.toFixed(2);
    AgentPaidTotal             = +AgentPaidTotal.toFixed(2);
    OperatorsDebtTotal         = +OperatorsDebtTotal.toFixed(2);
    ClientsAdvanceTotal        = +ClientsAdvanceTotal.toFixed(2);
    OperatorsPaidFromOwnTotal  = +OperatorsPaidFromOwnTotal.toFixed(2);

    // ========= OWNERS PAYOUTS (все транзы до "to") =========
    const ownersTxSnap = await adminDb
      .collection("finance_transactions")
      .where("date", "<=", to)
      .get();
    let OwnersPayout = 0;
    ownersTxSnap.forEach(d => {
      const v = d.data() as any;
      OwnersPayout += toNum(v.ownerIgorEUR) + toNum(v.ownerEvgeniyEUR);
    });
    OwnersPayout = +OwnersPayout.toFixed(2);
    const OwnersUnwithdrawn = +(OwnersProfitRecognized - OwnersPayout).toFixed(2);

    const AgentLeft = +Math.max(0, AgentAccruedTotal - AgentPaidTotal).toFixed(2);

    // ========= BANK: остатки на конец периода (EUR) + разрез по счетам =========
    const txToSnap = await adminDb
      .collection("finance_transactions")
      .where("date", "<=", to)
      .orderBy("date", "asc")
      .get();
    const txAllTo: TxDoc[] = txToSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const txBeforeFrom = txAllTo.filter(t => t.date < from && (t.status === undefined || t.status === "actual"));
    const txInPeriod   = txAllTo.filter(t => t.date >= from && t.date <= to && (t.status === undefined || t.status === "actual"));

    let opening = 0, inflow = 0, outflow = 0;
    const byAccount = new Map<string, { name: string; currency: string; opening: number; inflow: number; outflow: number; closing: number }>();

    function addAccRow(accId: string) {
      if (!byAccount.has(accId)) byAccount.set(accId, { name: accId, currency: "EUR", opening: 0, inflow: 0, outflow: 0, closing: 0 });
      return byAccount.get(accId)!;
    }

    for (const t of txBeforeFrom) {
      const eur = toNum((t as any).baseAmount);
      const row = addAccRow(String(t.accountId || "—"));
      if (t.side === "income") { opening += eur; row.opening += eur; }
      else if (t.side === "expense") { opening -= eur; row.opening -= eur; }
    }
    for (const t of txInPeriod) {
      const eur = toNum((t as any).baseAmount);
      const row = addAccRow(String(t.accountId || "—"));
      if (t.side === "income") { inflow += eur; row.inflow += eur; }
      else if (t.side === "expense") { outflow += eur; row.outflow += eur; }
    }
    for (const r of byAccount.values()) {
      r.opening = +r.opening.toFixed(2);
      r.inflow  = +r.inflow.toFixed(2);
      r.outflow = +r.outflow.toFixed(2);
      r.closing = +(r.opening + r.inflow - r.outflow).toFixed(2);
    }
    const closing = +(opening + inflow - outflow).toFixed(2);

    // ========= BANK: чистое движение из банка vs ордеров =========
    let bankCI = 0, bankCE = 0;
    for (const t of txInPeriod) {
      const n = toNum((t as any).baseAmount);
      if (t.side === "income") bankCI += n;
      else if (t.side === "expense") bankCE += n;
    }
    bankCI = +bankCI.toFixed(2);
    bankCE = +bankCE.toFixed(2);
    const bankNet = +(bankCI - bankCE).toFixed(2);
    const ordersNet = +(CI_period - CE_period).toFixed(2);
    const otherNet  = +(bankNet - ordersNet).toFixed(2);

    // ========= Покрытие обязательств кассой =========
    const clientOverpayTotal = +bookingRows.reduce((s,b)=>s+b.clientOverpay,0).toFixed(2);
    const hardLiabilities = +(OperatorsDebtTotal + clientOverpayTotal + AgentLeft).toFixed(2);
    const hardGap = +(closing - hardLiabilities).toFixed(2);
    const foundersGap = +(hardGap - OwnersUnwithdrawn).toFixed(2);

    // ========= GROUP BY OPERATOR =========
    const opMap = new Map<string, OperatorRow>();
    for (const r of bookingRows) {
      const key = (r.operator || "—").trim() || "—";
      const o = opMap.get(key) || {
        operator: key, bookings: 0, fullyPaid: 0,
        B: 0, N: 0, CI: 0, CE: 0, debt: 0, overpay: 0, cash: 0,
        agentAccrued: 0, agentPaid: 0,
      };
      o.bookings += 1;
      if (r.fullyPaid) o.fullyPaid += 1;
      o.B  += r.B;  o.N  += r.N;
      o.CI += r.CI; o.CE += r.CE;
      o.debt += r.operatorDebtAsOf;
      o.overpay += r.clientOverpay;
      o.cash += r.bookingCashBalance;
      o.agentAccrued += r.agentAccrued;
      o.agentPaid    += r.agentPaid;
      opMap.set(key, o);
    }
    const operators = Array.from(opMap.values()).map(o => ({
      ...o,
      B: +o.B.toFixed(2), N: +o.N.toFixed(2), CI: +o.CI.toFixed(2), CE: +o.CE.toFixed(2),
      debt: +o.debt.toFixed(2), overpay: +o.overpay.toFixed(2), cash: +o.cash.toFixed(2),
      agentAccrued: +o.agentAccrued.toFixed(2), agentPaid: +o.agentPaid.toFixed(2),
    })).sort((a,b)=> b.debt - a.debt || b.overpay - a.overpay || b.bookings - a.bookings);

    // ========= TIMESERIES =========
    const dayMap = new Map<string, { CI: number; CE: number }>();
    for (const o of ordersInPeriod) {
      const r = dayMap.get(o.date) || { CI: 0, CE: 0 };
      if (o.side === "income") r.CI += toNum(o.baseAmount); else r.CE += toNum(o.baseAmount);
      dayMap.set(o.date, r);
    }
    const byDay = Array.from(dayMap.entries())
      .sort((a,b)=> a[0]<b[0]?-1:1)
      .map(([date, v]) => ({ date, CI: +v.CI.toFixed(2), CE: +v.CE.toFixed(2) }));
    let runZ = Z0;
    const timeseries = byDay.map(d => {
      runZ = clamp0(runZ + d.CI - d.CE);
      return { ...d, Z: +runZ.toFixed(2) };
    });

    // ========= ANOMALIES / QA =========
    const anomalies = {
      overpayClients: bookingRows.filter(b => b.clientOverpay > EPS).map(b => ({ bookingId: b.bookingId, overpay: b.clientOverpay })),
      ceBeyondNetto:  bookingRows.filter(b => b.refundsEtc > EPS).map(b => ({ bookingId: b.bookingId, refunds: b.refundsEtc })),
      negativeCash:   bookingRows.filter(b => b.bookingCashBalance < -EPS).map(b => ({ bookingId: b.bookingId, cash: b.bookingCashBalance })),
    };

    // ========= PREVIOUS PERIOD COMPARISON =========
    const days = Math.max(1, diffDaysIncl(from, to));
    const prevTo = addDaysISO(from, -1);
    const prevFrom = addDaysISO(prevTo, -(days-1));

    let compare: any = null;
    try {
      const prevOrdersSnap = await adminDb
        .collection("finance_orders")
        .where("status", "==", "posted")
        .where("date", "<=", prevTo)
        .get();
      const prevOrdersAllTo: OrderDoc[] = prevOrdersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const prevBefore = prevOrdersAllTo.filter(o => o.date < prevFrom);
      const prevIn     = prevOrdersAllTo.filter(o => o.date >= prevFrom && o.date <= prevTo);
      const CI_prev = +sumCI(prevIn).toFixed(2);
      const CE_prev = +sumCE(prevIn).toFixed(2);

      const prevBookingIds = Array.from(new Set(prevOrdersAllTo.map(o => o.bookingId).filter(Boolean)));
      const prevBookingsMap = await fetchByIds<BookingDoc>("bookings", prevBookingIds);

      const prevOrdersByBooking = new Map<string, OrderDoc[]>();
      for (const o of prevOrdersAllTo) {
        const l = prevOrdersByBooking.get(o.bookingId) || [];
        l.push(o); prevOrdersByBooking.set(o.bookingId, l);
      }
      let OperatorsDebt_prev = 0;
      for (const [bid, list] of prevOrdersByBooking) {
        const b = prevBookingsMap.get(bid);
        const B = +pickBrutto(b).toFixed(2);
        const N = +pickNetto(b).toFixed(2);
        const CI_b = +list.filter(x => x.side === "income").reduce((s, x) => s + toNum(x.baseAmount), 0).toFixed(2);
        const CE_b = +list.filter(x => x.side === "expense").reduce((s, x) => s + toNum(x.baseAmount), 0).toFixed(2);

        const operatorPaid   = Math.min(CE_b, N);
        const refundsEtc     = Math.max(0, CE_b - operatorPaid);
        const clientPaidEff  = Math.max(0, CI_b - refundsEtc);
        const fullyPaid      = clientPaidEff + EPS >= B;

        const payableCap     = Math.min(clientPaidEff, N);
        const debt           = Math.max(0, +(payableCap - operatorPaid).toFixed(2));
        OperatorsDebt_prev   += debt;
      }
      OperatorsDebt_prev = +OperatorsDebt_prev.toFixed(2);

      compare = {
        prevFrom, prevTo,
        CI_prev, CE_prev,
        OperatorsDebt_prev,
        delta: {
          CI: +(CI_period - CI_prev).toFixed(2),
          CE: +(CE_period - CE_prev).toFixed(2),
          OperatorsDebt: +(OperatorsDebtTotal - OperatorsDebt_prev).toFixed(2),
        }
      };
    } catch {
      compare = null;
    }

    // ========= RESPONSE =========
    res.status(200).json({
      meta: { from, to, generatedAt: new Date().toISOString(), days, compare },
      totals: {
        Z0,
        CI_period,
        CE_period,
        Z_asOf,
        OwnToBookings,

        OperatorsDebtTotal,
        ClientsAdvanceTotal,
        OperatorsPaidFromOwnTotal,

        OwnersProfitRecognized,
        OwnersPayout,
        OwnersUnwithdrawn,

        AgentAccrued: AgentAccruedTotal,
        AgentPaid: AgentPaidTotal,
        AgentLeft,
      },
      bank: {
        period: { bankCI, bankCE, bankNet },
        ordersNet,
        otherNet,
        cash: {
          opening: +opening.toFixed(2),
          inflow: +inflow.toFixed(2),
          outflow: +outflow.toFixed(2),
          closing,
          byAccount: Array.from(byAccount.entries()).map(([accountId, a]) => ({ accountId, name: a.name, currency: a.currency, opening: a.opening, inflow: a.inflow, outflow: a.outflow, closing: a.closing })),
        },
        coverage: {
          cashOnHand: closing,
          hardLiabilities,
          hardGap,
          foundersUnwithdrawn: OwnersUnwithdrawn,
          foundersGap,
        }
      },
      bookings: bookingRows,
      operators,
      timeseries,
      anomalies,
    });
  } catch (e: any) {
    console.error("[api/finance/report] error:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
}