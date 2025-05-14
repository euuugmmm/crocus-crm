// pages/api/transactions/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

// POST — добавить транзакции (bulk upload), GET — получить список транзакций
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const { transactions } = req.body;
      if (!Array.isArray(transactions)) {
        return res.status(400).json({ error: "transactions must be an array" });
      }
      // Сохраняем каждую транзакцию
      const batch = adminDB.batch();
      transactions.forEach((txn: any) => {
        const ref = adminDB.collection("transactions").doc(txn.transactionId);
        batch.set(ref, txn, { merge: true });
      });
      await batch.commit();
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  if (req.method === "GET") {
    try {
      const { currency, from, to, category } = req.query;

      let q = adminDB.collection("transactions") as FirebaseFirestore.Query;

      if (currency) q = q.where("transactionAmount.currency", "==", currency);
      if (category) q = q.where("category", "==", category);
      // Фильтрация по дате (если нужно)
      if (from) q = q.where("bookingDate", ">=", from);
      if (to) q = q.where("bookingDate", "<=", to);

      const snap = await q.orderBy("bookingDate", "desc").get();
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return res.status(200).json(items);
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  return res.status(405).end();
}