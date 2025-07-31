// pages/api/create-payout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])
    return JSON.parse(
      Buffer.from(process.env[b64]!, "base64").toString("utf8")
    );
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

// Инициализируем Admin SDK один раз
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

// Безопасно получить число
const num = (v: any, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const { agentId, bookings, items, comment } = req.body as {
      agentId?: string;
      bookings?: string[];                // старый режим
      items?: { bookingId: string; amount: number }[]; // новый режим
      comment?: string;
    };

    if (!agentId) {
      return res.status(400).json({ error: "agentId is required" });
    }

    /****************************************************************
     * НОВЫЙ РЕЖИМ: частичные выплаты по items[{bookingId, amount}]
     ****************************************************************/
    if (Array.isArray(items) && items.length > 0) {
      // Загружаем заявки
      const snaps = await Promise.all(
        items.map((it) => db.doc(`bookings/${it.bookingId}`).get())
      );

      const updates: {
        bookingId: string;
        pay: number;
        beforePaid: number;
        afterPaid: number;
        commission: number;
      }[] = [];

      let totalAmount = 0;

      for (let i = 0; i < items.length; i++) {
        const snap = snaps[i];
        if (!snap.exists) continue;

        const data = snap.data() as any;
        const commission = num(data.commission, 0);
        const alreadyPaid = num(data.commissionPaidAmount, 0);
        const remaining = Math.max(0, commission - alreadyPaid);

        // Сколько хотим заплатить
        const desired = Math.max(0, num(items[i].amount, 0));
        const pay = Math.min(remaining, desired);

        if (pay <= 0) continue;

        updates.push({
          bookingId: items[i].bookingId,
          pay,
          beforePaid: alreadyPaid,
          afterPaid: alreadyPaid + pay,
          commission,
        });

        totalAmount += pay;
      }

      if (updates.length === 0) {
        return res
          .status(400)
          .json({ error: "No payable items (amounts are zero or exceeded remaining)" });
      }

      // Создаём payout документ
      const payoutRef = await db.collection("payouts").add({
        agentId,
        amount: totalAmount,
        comment: comment || "",
        // детализация выплат по броням
        items: updates.map((u) => ({
          bookingId: u.bookingId,
          amount: u.pay,
          beforePaid: u.beforePaid,
          afterPaid: u.afterPaid,
          commission: u.commission,
        })),
        createdAt: FieldValue.serverTimestamp(),
      });

      // Обновляем заявки батчем
      const batch = db.batch();
      updates.forEach((u) => {
        const ref = db.doc(`bookings/${u.bookingId}`);
        const fullyPaid = u.afterPaid >= u.commission - 0.01; // допускаем копейки
        batch.update(ref, {
          commissionPaidAmount: FieldValue.increment(u.pay),
          commissionPaid: fullyPaid,
          payoutId: payoutRef.id,
        });
      });
      await batch.commit();

      return res
        .status(200)
        .json({ payoutId: payoutRef.id, amount: totalAmount, items: updates.length });
    }

    /****************************************************************
     * СТАРЫЙ РЕЖИМ: bookings[] — выплатить ПОЛНЫЙ ОСТАТОК по броням
     ****************************************************************/
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return res
        .status(400)
        .json({ error: "Provide items[] (new mode) or bookings[] (old mode)" });
    }

    const snapsOld = await Promise.all(
      bookings.map((id) => db.doc(`bookings/${id}`).get())
    );
    const updatesOld: {
      bookingId: string;
      pay: number;
      beforePaid: number;
      afterPaid: number;
      commission: number;
    }[] = [];
    let totalAmountOld = 0;

    for (let i = 0; i < snapsOld.length; i++) {
      const snap = snapsOld[i];
      if (!snap.exists) continue;
      const data = snap.data() as any;
      const commission = num(data.commission, 0);
      const alreadyPaid = num(data.commissionPaidAmount, 0);
      const remaining = Math.max(0, commission - alreadyPaid);

      if (remaining <= 0) continue;

      updatesOld.push({
        bookingId: snap.id,
        pay: remaining,
        beforePaid: alreadyPaid,
        afterPaid: alreadyPaid + remaining,
        commission,
      });
      totalAmountOld += remaining;
    }

    if (updatesOld.length === 0) {
      return res
        .status(400)
        .json({ error: "Nothing to pay (no remaining commissions)" });
    }

    const payoutRefOld = await db.collection("payouts").add({
      agentId,
      amount: totalAmountOld,
      comment: comment || "",
      items: updatesOld.map((u) => ({
        bookingId: u.bookingId,
        amount: u.pay,
        beforePaid: u.beforePaid,
        afterPaid: u.afterPaid,
        commission: u.commission,
      })),
      createdAt: FieldValue.serverTimestamp(),
    });

    const batchOld = db.batch();
    updatesOld.forEach((u) => {
      batchOld.update(db.doc(`bookings/${u.bookingId}`), {
        commissionPaidAmount: FieldValue.increment(u.pay),
        commissionPaid: true,
        payoutId: payoutRefOld.id,
      });
    });
    await batchOld.commit();

    return res
      .status(200)
      .json({ payoutId: payoutRefOld.id, amount: totalAmountOld, items: updatesOld.length });
  } catch (e: any) {
    console.error("create-payout error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}