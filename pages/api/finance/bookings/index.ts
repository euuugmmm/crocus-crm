// pages/api/finance/bookings/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

// POST — bulk import заявок, GET — получить список заявок
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const { bookings } = req.body;
      if (!Array.isArray(bookings)) {
        return res.status(400).json({ error: "bookings must be an array" });
      }
      const batch = adminDB.batch();
      bookings.forEach((bk: any) => {
        // Используем bookingNumber как уникальный ключ, иначе doc() сгенерит ID
        const ref = adminDB.collection("bookings").doc(bk.bookingNumber || undefined);
        batch.set(ref, bk, { merge: true });
      });
      await batch.commit();
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  if (req.method === "GET") {
    try {
      const { market, from, to, agent, client, status } = req.query;
      let q = adminDB.collection("bookings") as FirebaseFirestore.Query;

      if (market) q = q.where("market", "==", market);
      if (agent)  q = q.where("agent", "==", agent);
      if (client) q = q.where("client", "==", client);
      if (status) q = q.where("status", "==", status);
      if (from)   q = q.where("createdAt", ">=", from);
      if (to)     q = q.where("createdAt", "<=", to);

      const snap = await q.orderBy("createdAt", "desc").limit(1000).get();
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return res.status(200).json(items);
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  return res.status(405).end();
}