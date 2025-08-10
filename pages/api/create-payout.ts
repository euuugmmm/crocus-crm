// pages/api/create-payout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { AGENT_WITHHOLD_PCT, OLIMPIA_WITHHOLD_PCT } from "@/lib/constants/fees";

function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])
    return JSON.parse(Buffer.from(process.env[b64]!, "base64").toString("utf8"));
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

if (!getApps().length) {
  initializeApp({
    credential: cert(
      getCred(
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64"
      )
    ),
  });
}

const db = getFirestore();

const num = (v: any, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

async function detectDefaultWithholdPct(agentId: string, provided?: number) {
  if (typeof provided === "number") return provided; // UI задал явно
  try {
    const us = await db.doc(`users/${agentId}`).get();
    const u = us.exists ? (us.data() as any) : {};
    const agency: string = (u?.agentAgency || u?.agencyName || "").toString();
    const isOlimpia =
      /olimpya|olympya|olympia/i.test(agency) ||
      u?.isOlimpia === true ||
      u?.olimpya === true;
    return isOlimpia ? OLIMPIA_WITHHOLD_PCT : AGENT_WITHHOLD_PCT;
  } catch {
    return AGENT_WITHHOLD_PCT;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const body = req.body || {};
    const {
      mode,
      agentId,
      comment,
      transferFee: transferFeeRaw,
      withholdPct: withholdPctRaw,
    } = body as any;

    if (!agentId) {
      return res.status(400).json({ error: "agentId is required" });
    }

    const withholdPct = await detectDefaultWithholdPct(agentId, typeof withholdPctRaw === "number" ? withholdPctRaw : undefined);
    const toNet = (gross: number) => r2(Math.max(0, gross * (1 - withholdPct)));
    const transferFee = Math.max(0, num(transferFeeRaw, 0));

    /****************************************************************
     * РЕЖИМ 1: выплаты по выбранным броням (BY BOOKINGS)
     * body.items: [{ bookingId, amountGross, closeFully? }]
     ****************************************************************/
    if (mode === "byBookings") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        return res.status(400).json({ error: "items[] is required" });
      }

      const snaps = await Promise.all(
        items.map((it: any) => db.doc(`bookings/${it.bookingId}`).get())
      );

      type Update = {
        bookingId: string;
        commissionGross: number;
        beforePaidGross: number;
        payGross: number;
        afterPaidGross: number;
        closeFully: boolean;
      };

      const updates: Update[] = [];
      let totalGross = 0;

      for (let i = 0; i < items.length; i++) {
        const snap = snaps[i];
        if (!snap.exists) continue;

        const b = snap.data() as any;

        // брутто-комиссия по брони
        const commissionGross = r2(
          num(b.commissionGross ?? b.commission ?? b.agentCommission ?? 0, 0)
        );

        // уже выплачено (берём только «доверенные» поля)
        const paidGrossStored = r2(num(b.commissionPaidGrossAmount, 0));
        const paidNetStored   = r2(num(b.commissionPaidNetAmount, 0));
        const hasTrustedPayout =
          typeof b.payoutId === "string" && b.payoutId.length > 0;

        const beforePaidGross =
          paidGrossStored > 0
            ? paidGrossStored
            : hasTrustedPayout && paidNetStored > 0
            ? r2(paidNetStored / (1 - withholdPct))
            : 0;

        const remainingGross = Math.max(0, r2(commissionGross - beforePaidGross));

        const desiredGross = r2(Math.max(0, num(items[i].amountGross ?? items[i].amount, 0)));
        const closeFully = !!items[i].closeFully;

        const payGross = closeFully
          ? Math.min(remainingGross, desiredGross || remainingGross)
          : Math.min(remainingGross, desiredGross);

        if (payGross <= 0 && !closeFully) continue;

        const afterPaidGross = r2(beforePaidGross + payGross);

        updates.push({
          bookingId: String(items[i].bookingId),
          commissionGross,
          beforePaidGross,
          payGross,
          afterPaidGross,
          closeFully,
        });

        totalGross = r2(totalGross + payGross);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          error:
            "No payable items (amounts are zero or exceeded remaining, and no closeFully flags)",
        });
      }

      const totalNet = toNet(totalGross);
      const amount = Math.max(0, r2(totalNet - transferFee));

      // создаём payout
      const payloadItems = updates.map((u) => {
        const base: any = {
          bookingId: u.bookingId,
          amountGross: r2(u.payGross),
          amountNet: toNet(u.payGross),
          beforePaidGross: r2(u.beforePaidGross),
          afterPaidGross: r2(u.afterPaidGross),
          commissionGross: r2(u.commissionGross),
        };
        if (u.closeFully) base.closeFully = true; // undefined в Firestore не пишем
        return base;
      });

      const payoutRef = await db.collection("payouts").add({
        mode: "byBookings",
        agentId,
        comment: comment || "",
        withholdPct,
        transferFee,
        totalGross: r2(totalGross),
        totalNet: r2(totalNet),
        amount: r2(amount),
        items: payloadItems,
        createdAt: FieldValue.serverTimestamp(),
      });

      // обновляем брони
      const batch = db.batch();
      for (const u of updates) {
        const ref = db.doc(`bookings/${u.bookingId}`);
        const fullyPaid =
          u.closeFully || u.afterPaidGross >= r2(u.commissionGross - 0.01);
        batch.update(ref, {
          commissionPaidGrossAmount: FieldValue.increment(r2(u.payGross)),
          commissionPaidNetAmount: FieldValue.increment(toNet(u.payGross)),
          commissionPaid: fullyPaid,
          payoutId: payoutRef.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      return res.status(200).json({
        payoutId: payoutRef.id,
        totalGross,
        totalNet,
        amount,
        items: updates.length,
      });
    }

    /****************************************************************
     * РЕЖИМ 2: свободная сумма (FREE)
     ****************************************************************/
    if (mode === "free") {
      const amountGross = r2(Math.max(0, num(body.amountGross, 0)));
      if (!(amountGross > 0)) {
        return res.status(400).json({ error: "amountGross must be > 0" });
      }
      const totalGross = amountGross;
      const totalNet = toNet(totalGross);
      const amount = Math.max(0, r2(totalNet - transferFee));

      const payoutRef = await db.collection("payouts").add({
        mode: "free",
        agentId,
        comment: comment || "",
        withholdPct,
        transferFee,
        totalGross: r2(totalGross),
        totalNet: r2(totalNet),
        amount: r2(amount),
        items: [],
        createdAt: FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        payoutId: payoutRef.id,
        totalGross,
        totalNet,
        amount,
        items: 0,
      });
    }

    /****************************************************************
     * РЕЖИМ 3 (legacy): bookings[] — выплатить остатки полностью
     ****************************************************************/
    if (Array.isArray(body.bookings) && body.bookings.length > 0) {
      const bookings: string[] = body.bookings;
      const snapsOld = await Promise.all(
        bookings.map((id) => db.doc(`bookings/${id}`).get())
      );

      const updatesOld: {
        bookingId: string;
        commissionGross: number;
        beforePaidGross: number;
        payGross: number;
        afterPaidGross: number;
      }[] = [];
      let totalGross = 0;

      for (const snap of snapsOld) {
        if (!snap.exists) continue;
        const b = snap.data() as any;

        const commissionGross = r2(
          num(b.commissionGross ?? b.commission ?? b.agentCommission ?? 0, 0)
        );

        const paidGrossStored = r2(num(b.commissionPaidGrossAmount, 0));
        const paidNetStored   = r2(num(b.commissionPaidNetAmount, 0));
        const hasTrustedPayout =
          typeof b.payoutId === "string" && b.payoutId.length > 0;

        const beforePaidGross =
          paidGrossStored > 0
            ? paidGrossStored
            : hasTrustedPayout && paidNetStored > 0
            ? r2(paidNetStored / (1 - withholdPct))
            : 0;

        const remaining = r2(Math.max(0, commissionGross - beforePaidGross));
        if (remaining <= 0) continue;

        updatesOld.push({
          bookingId: snap.id,
          commissionGross,
          beforePaidGross,
          payGross: remaining,
          afterPaidGross: r2(beforePaidGross + remaining),
        });
        totalGross = r2(totalGross + remaining);
      }

      if (updatesOld.length === 0) {
        return res
          .status(400)
          .json({ error: "Nothing to pay (no remaining commissions)" });
      }

      const totalNet = toNet(totalGross);
      const amount = Math.max(0, r2(totalNet - transferFee));

      const payoutRefOld = await db.collection("payouts").add({
        mode: "old-full-rest",
        agentId,
        comment: comment || "",
        withholdPct,
        transferFee,
        totalGross: r2(totalGross),
        totalNet: r2(totalNet),
        amount: r2(amount),
        items: updatesOld.map((u) => ({
          bookingId: u.bookingId,
          amountGross: r2(u.payGross),
          amountNet: toNet(u.payGross),
          beforePaidGross: r2(u.beforePaidGross),
          afterPaidGross: r2(u.afterPaidGross),
          commissionGross: r2(u.commissionGross),
          closeFully: true,
        })),
        createdAt: FieldValue.serverTimestamp(),
      });

      const batchOld = db.batch();
      updatesOld.forEach((u) => {
        batchOld.update(db.doc(`bookings/${u.bookingId}`), {
          commissionPaidGrossAmount: FieldValue.increment(r2(u.payGross)),
          commissionPaidNetAmount: FieldValue.increment(toNet(u.payGross)),
          commissionPaid: true,
          payoutId: payoutRefOld.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await batchOld.commit();

      return res.status(200).json({
        payoutId: payoutRefOld.id,
        totalGross,
        totalNet,
        amount,
        items: updatesOld.length,
      });
    }

    return res
      .status(400)
      .json({ error: 'Provide mode="byBookings"| "free" or bookings[]' });
  } catch (e: any) {
    console.error("create-payout error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}