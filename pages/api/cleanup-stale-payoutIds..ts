import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64]) return JSON.parse(Buffer.from(process.env[b64]!, "base64").toString("utf8"));
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

if (!getApps().length) {
  initializeApp({
    credential: cert(getCred("FIREBASE_SERVICE_ACCOUNT_JSON","FIREBASE_SERVICE_ACCOUNT_JSON_BASE64")),
  });
}
const db = getFirestore();

// безопасная проверка — есть ли бронь среди items выплат
function payoutContainsBooking(p: any, bookingId: string, bookingNumber?: string) {
  const items: any[] = Array.isArray(p?.items) ? p.items : [];
  return items.some(it =>
    String(it?.bookingId) === bookingId ||
    (bookingNumber && String(it?.bookingId) === String(bookingNumber))
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Only POST");
  if (req.headers["x-migration-secret"] !== "some-strong-secret")
    return res.status(401).json({ error: "unauthorized" });

  try {
    // ВАЖНО: только одно условие where -> индекс не нужен
    const q = await db.collection("bookings")
      .where("payoutId", ">", "") // у кого payoutId задан
      .get();

    let processed = 0;
    let cleared = 0;

    for (const doc of q.docs) {
      processed++;
      const b = doc.data() as any;
      const pid = String(b.payoutId || "");
      const status = String(b.status || "").toLowerCase();

      // фильтруем по статусу уже в коде (если нужно)
      const isFinished = ["finished","завершено","confirmed","paid"].includes(status);
      // если не критично — можно не фильтровать вовсе:
      // const isFinished = true;

      if (!isFinished) continue;

      let trust = false;
      try {
        const ps = await db.doc(`payouts/${pid}`).get();
        if (ps.exists) {
          trust = payoutContainsBooking(ps.data(), doc.id, b.bookingNumber);
        }
      } catch {
        trust = false;
      }

      if (!trust) {
        await doc.ref.update({ payoutId: FieldValue.delete() });
        cleared++;
      }
    }

    return res.status(200).json({ ok: true, processed, cleared });
  } catch (e: any) {
    console.error("cleanup-stale-payoutIds error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}