// pages/api/finance/founders-cache/rebuild.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb, adminFs } from "@/lib/server/firebaseAdmin";

// helpers
const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const toISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

type OwnerMove = {
  kind: "booking_income" | "owner_tx";
  date: string;
  side: "income" | "expense";
  baseAmount: number;
  igor: number;
  evgeniy: number;

  bookingId?: string;
  bookingNumber?: string;
  txId?: string;

  /** Доп. мета (идёт в кэш; фронт использует для разрезов и фильтров) */
  operator?: string | null;
  completion?: number; // 0..1 — доля закрытия заявки по факту оплат

  accountName?: string | null;
  categoryName?: string | null;
  counterpartyName?: string | null;
  note?: string | null;
};

type Booking = {
  id: string;
  bookingType?: string; // "olimpya_base" | "subagent" | ...
  baseType?: "igor" | "evgeniy" | "split50";
  createdAt?: any;
  bookingNumber?: string;

  bruttoClient?: number;
  internalNet?: number;
  nettoOlimpya?: number;
  commission?: number;
  realCommission?: number;

  commissionIgor?: number;
  commissionEvgeniy?: number;
  financeManualOverride?: boolean;

  owners?: Array<{ ownerId?: string; name?: string; share?: number }>;
  operator?: string;
};

type OrderDoc = {
  id: string;
  txId: string;
  date: string;    // YYYY-MM-DD
  side: "income" | "expense";
  bookingId: string;
  baseAmount: number; // EUR
  status: string;     // posted
};

type TxDoc = {
  id: string;
  date: string;          // YYYY-MM-DD
  side: "income" | "expense";
  status?: string;       // actual/reconciled/planned
  baseAmount: number;    // EUR (канонически положительный)
  accountName?: string | null;
  categoryName?: string | null;
  counterpartyName?: string | null;
  note?: string | null;

  // legacy / hints
  ownerWho?: "igor" | "evgeniy" | "split50" | "crocus" | null;

  // точные суммы сплита (для расходов)
  ownerIgorEUR?: number;
  ownerEvgeniyEUR?: number;
};

function isActual(t: TxDoc) {
  const s = (t.status || "actual").toLowerCase();
  return s === "actual" || s === "reconciled";
}

function detectOwnerFromText(txt?: string | null): "igor" | "evgeniy" | null {
  const v = (txt || "").toLowerCase();
  if (v.includes("igor") || v.includes("игор")) return "igor";
  if (v.includes("evgen") || v.includes("евген")) return "evgeniy";
  return null;
}

// server-side owners config (опционально)
type OwnerCfg = { id: string; name: string; share: number };
async function loadOwnersServer(): Promise<OwnerCfg[]> {
  const snap = await adminDb.collection("finance_owners").get().catch(() => null);
  if (!snap || snap.empty) {
    return [
      { id: "igor", name: "Igor", share: 50 },
      { id: "evgeniy", name: "Evgeniy", share: 50 },
    ];
  }
  return snap.docs.map(d => {
    const v = d.data() as any;
    return { id: d.id, name: String(v.name || ""), share: Number(v.share || 0) };
  });
}

function splitAmount(
  amount: number,
  ownersCfg: OwnerCfg[],
  bookingOwners?: Array<{ name?: string; share?: number }>
) {
  const list = bookingOwners && bookingOwners.length > 0
    ? bookingOwners.map(o => ({ name: String(o.name || ""), share: Number(o.share || 0) }))
    : ownersCfg.map(o => ({ name: o.name, share: o.share }));
  const sumShare = list.reduce((s, x) => s + Math.max(0, Number(x.share || 0)), 0) || 100;
  return list.map(o => ({
    name: o.name,
    amount: +(amount * (Math.max(0, Number(o.share || 0)) / sumShare)).toFixed(2)
  }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  try {
    // параллельные чтения
    const [ordersSnap, bookingsSnap, txSnap, ownersCfg] = await Promise.all([
      adminDb.collection("finance_orders").where("status", "==", "posted").get(),
      adminDb.collection("bookings").get(),
      adminDb.collection("finance_transactions").get(),
      loadOwnersServer(),
    ]);

    // ---- ORDERS → агрегаты по заявкам (факт)
    const orders: OrderDoc[] = ordersSnap.docs.map(d => {
      const v = d.data() as any;
      const side: "income" | "expense" = v.side === "expense" ? "expense" : "income";
      return {
        id: d.id,
        txId: String(v.txId || ""),
        date: String(v.date || ""),
        side,
        bookingId: String(v.bookingId || ""),
        baseAmount: Number(v.baseAmount || 0),
        status: String(v.status || ""),
      } as OrderDoc;
    });

    const factByBooking = new Map<string, { inEUR: number; outEUR: number; lastDate?: string }>();
    for (const o of orders) {
      const prev = factByBooking.get(o.bookingId) || { inEUR: 0, outEUR: 0, lastDate: undefined as string | undefined };
      if (o.side === "income") prev.inEUR += Math.abs(o.baseAmount);
      else prev.outEUR += Math.abs(o.baseAmount);
      if (!prev.lastDate || o.date > prev.lastDate) prev.lastDate = o.date;
      factByBooking.set(o.bookingId, prev);
    }

    // ---- BOOKINGS
    const bookings: Booking[] = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // распределение Crocus для заявки (НЕ меняем заявки; только читаем)
    const splitForBooking = (b: Booking) => {
      const brutto = toNum(b.bruttoClient);
      const netCrocus = toNum(b.internalNet);
      const netOlimp = toNum(b.nettoOlimpya) || netCrocus;

      const baseCommission = toNum((b as any).realCommission) || toNum((b as any).commission) || (brutto - netCrocus);

      // ── РУЧНЫЕ СУММЫ — это финал (никаких нормализаций)
      const hasManual =
        !!(b as any).financeManualOverride ||
        toNum((b as any).commissionIgor) !== 0 ||
        toNum((b as any).commissionEvgeniy) !== 0;

      if (hasManual) {
        const Igor = +toNum((b as any).commissionIgor).toFixed(2);
        const Evgeniy = +toNum((b as any).commissionEvgeniy).toFixed(2);
        const crocusAmount = +(Igor + Evgeniy).toFixed(2);
        return { brutto, netCrocus, netOlimp, crocusAmount, Igor, Evgeniy };
      }

      // olimpya_base → комиссия
      const crocusAmount =
        b.bookingType === "olimpya_base"
          ? baseCommission
          : (brutto - netCrocus);

      // subagent → 50/50
      if (b.bookingType && b.bookingType !== "olimpya_base") {
        const half = +(crocusAmount / 2).toFixed(2);
        const rest = +(crocusAmount - half).toFixed(2);
        return { brutto, netCrocus, netOlimp, crocusAmount: +crocusAmount.toFixed(2), Igor: half, Evgeniy: rest };
      }

      // baseType
      if (b.baseType === "igor")     return { brutto, netCrocus, netOlimp, crocusAmount: +crocusAmount.toFixed(2), Igor: +crocusAmount.toFixed(2), Evgeniy: 0 };
      if (b.baseType === "evgeniy")  return { brutto, netCrocus, netOlimp, crocusAmount: +crocusAmount.toFixed(2), Igor: 0, Evgeniy: +crocusAmount.toFixed(2) };

      // fallback: конфиг владельцев
      const parts =
        b.bookingType === "olimpya_base"
          ? splitAmount(baseCommission, ownersCfg, b.owners)
          : splitAmount(brutto - netCrocus, ownersCfg);
      let Igor = 0, Evgeniy = 0;
      for (const p of parts) {
        if (p.name === "Igor") Igor += p.amount;
        if (p.name === "Evgeniy") Evgeniy += p.amount;
      }
      return {
        brutto,
        netCrocus,
        netOlimp,
        crocusAmount: +(brutto - netCrocus).toFixed(2),
        Igor: +Igor.toFixed(2),
        Evgeniy: +Evgeniy.toFixed(2)
      };
    };

    // доходы учредителей по заявкам (факт из ордеров)
    const movesB: OwnerMove[] = [];
    for (const b of bookings) {
      const { brutto, netCrocus, crocusAmount, Igor, Evgeniy } = splitForBooking(b);
      if (!Number.isFinite(crocusAmount)) continue;

      const fb = factByBooking.get(b.id) || { inEUR: 0, outEUR: 0, lastDate: undefined };
      const ratioIn  = brutto     > 0 ? fb.inEUR  / brutto     : (netCrocus > 0 ? fb.outEUR / netCrocus : 0);
      const ratioOut = netCrocus  > 0 ? fb.outEUR / netCrocus  : (brutto    > 0 ? fb.inEUR  / brutto    : 0);
      const completion = clamp01(Math.min(ratioIn || 0, ratioOut || 0)); // 1.0 = «завершена»

      const inc = +((crocusAmount || 0) * completion).toFixed(2);
      const ig  = +((Igor         || 0) * completion).toFixed(2);
      const ev  = +((Evgeniy      || 0) * completion).toFixed(2);
      if (Math.abs(inc) < 0.01 && Math.abs(ig) < 0.01 && Math.abs(ev) < 0.01) continue;

      let when = fb.lastDate;
      if (!when) {
        const d = (b as any).createdAt?.toDate?.() as Date | undefined;
        when = d ? toISO(d) : toISO(new Date());
      }

      movesB.push({
        kind: "booking_income",
        date: when!,
        side: "income",
        baseAmount: inc,
        igor: ig,
        evgeniy: ev,
        bookingId: b.id,
        bookingNumber: (b as any).bookingNumber || b.id,
        operator: (b as any).operator || null,
        completion, // 0..1
        note: `Доход по заявке ${(b as any).bookingNumber || b.id}`,
      });
    }

    // ---- TRANSACTIONS → прочие движения (ownerWho / выплаты / точные суммы)
    const txs: TxDoc[] = txSnap.docs
      .map(d => {
        const v = d.data() as any;
        const side: "income" | "expense" = v.side === "expense" ? "expense" : "income";
        const t: TxDoc = {
          id: d.id,
          date: String(v.date || ""),
          side,
          status: String(v.status || "actual"),
          baseAmount: Math.abs(Number(v.baseAmount ?? v.eurAmount ?? 0)),
          accountName: v.accountName || null,
          categoryName: v.categoryName || null,
          counterpartyName: v.counterpartyName || null,
          note: v.note || null,
          ownerWho: (v.ownerWho ?? null) as TxDoc["ownerWho"],
          ownerIgorEUR: Number(v.ownerIgorEUR || 0),
          ownerEvgeniyEUR: Number(v.ownerEvgeniyEUR || 0),
        };
        return t;
      })
      .filter(isActual);

    const isOwnerPayout = (t: TxDoc) => {
      const cat = (t.categoryName || "").toLowerCase();
      const txt = [t.note, t.counterpartyName].filter(Boolean).join(" ").toLowerCase();
      if (cat.includes("owner") || cat.includes("учред") || cat.includes("дивид")) return true;
      if (txt.includes("учред")) return true;
      if (txt.includes("выплата") && (txt.includes("igor") || txt.includes("игор") || txt.includes("evgen") || txt.includes("евген"))) return true;
      return false;
    };

    const movesT: OwnerMove[] = [];
    for (const t of txs) {
      const eur = t.baseAmount;
      let ig = 0, ev = 0;
      let pushed = false;

      // точные суммы — ПРИОРИТЕТ
      const igExact = Number(t.ownerIgorEUR || 0);
      const evExact = Number(t.ownerEvgeniyEUR || 0);
      if (t.side === "expense" && (igExact > 0 || evExact > 0)) {
        ig += -igExact;
        ev += -evExact;
        const eventEUR = +(igExact + evExact).toFixed(2);
        movesT.push({
          kind: "owner_tx",
          date: t.date,
          side: t.side,
          baseAmount: eventEUR,
          igor: +ig.toFixed(2),
          evgeniy: +ev.toFixed(2),
          txId: t.id,
          accountName: t.accountName || null,
          categoryName: t.categoryName || null,
          counterpartyName: t.counterpartyName || null,
          note: t.note || null,
        });
        continue;
      }

      // legacy ownerWho
      const ow = t.ownerWho;
      if (ow) {
        const sign = t.side === "income" ? +1 : -1;
        if (ow === "igor") ig += sign * eur;
        else if (ow === "evgeniy") ev += sign * eur;
        else if (ow === "split50" || ow === "crocus") { ig += sign * eur / 2; ev += sign * eur / 2; }
        pushed = true;
      }

      // эвристика выплат
      if (!pushed && isOwnerPayout(t)) {
        const who =
          detectOwnerFromText(t.note) ||
          detectOwnerFromText(t.counterpartyName) ||
          null;
        const delta = -eur;
        if (who === "igor") ig += delta;
        else if (who === "evgeniy") ev += delta;
        else { ig += delta / 2; ev += delta / 2; }
        pushed = true;
      }

      if (!pushed) continue;
      if (Math.abs(ig) < 0.005 && Math.abs(ev) < 0.005) continue;

      movesT.push({
        kind: "owner_tx",
        date: t.date,
        side: t.side,
        baseAmount: eur,
        igor: +ig.toFixed(2),
        evgeniy: +ev.toFixed(2),
        txId: t.id,
        accountName: t.accountName || null,
        categoryName: t.categoryName || null,
        counterpartyName: t.counterpartyName || null,
        note: t.note || null,
      });
    }

    const moves = [...movesB, ...movesT].sort((a, b) => (a.date < b.date ? 1 : -1));

    await adminDb
      .collection("finance_foundersCache")
      .doc("summary")
      .set(
        {
          updatedAt: adminFs.FieldValue.serverTimestamp(),
          moves,
        },
        { merge: true }
      );

    res.status(200).json({ ok: true, count: moves.length });
  } catch (e: any) {
    console.error("[founders-cache/rebuild] error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}