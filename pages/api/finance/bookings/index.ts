// pages/api/finance/bookings/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { calculateNetProfit } from "@/utils/calculateProfit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const { bookings } = req.body;
      if (!Array.isArray(bookings)) {
        return res.status(400).json({ error: "bookings must be an array" });
      }

      const batch = adminDB.batch();

      bookings.forEach((bk: any) => {
        const ref = adminDB.collection("bookings").doc(bk.bookingNumber || undefined);

        const netProfit = calculateNetProfit(bk);
        const updated = {
          ...bk,
          netProfit,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        batch.set(ref, updated, { merge: true });
      });

      await batch.commit();
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  if (req.method === "GET") {
    try {
      const snap = await adminDB
        .collection("bookings")
        .orderBy("createdAt", "desc")
        .limit(500)
        .get();

      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json(items);
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  return res.status(405).end();
}