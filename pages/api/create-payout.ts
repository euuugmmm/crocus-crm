// pages/api/create-payout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue }     from "firebase-admin/firestore";

function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])   return JSON.parse(
    Buffer.from(process.env[b64]!, "base64").toString("utf8")
  );
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

// Инициализируем Admin SDK только один раз
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  console.log("create-payout body:", req.body);
  const { agentId, bookings } = req.body as {
    agentId?: string;
    bookings?: string[];
  };

  if (!agentId || !Array.isArray(bookings) || bookings.length === 0) {
    return res.status(400).json({ error: "agentId or bookings missing" });
  }

  try {
    // 1️⃣ получаем все брони и считаем сумму
    const snaps = await Promise.all(
      bookings.map((id) => db.doc(`bookings/${id}`).get())
    );
    const data = snaps.map((s) => s.data() || {});
    const amount = data.reduce(
      (sum, b: any) => sum + (Number(b.commission) || 0),
      0
    );

    // 2️⃣ создаём выплату
    const payoutRef = await db.collection("payouts").add({
      agentId,
      bookings,
      amount,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 3️⃣ помечаем каждую бронь как выплаченную
    await Promise.all(
      bookings.map((id) =>
        db.doc(`bookings/${id}`).update({
          commissionPaid: true,
          payoutId: payoutRef.id,
        })
      )
    );

    return res.status(200).json({ payoutId: payoutRef.id });
  } catch (e: any) {
    console.error("create-payout error:", e);
    return res.status(500).json({ error: e.message });
  }
}