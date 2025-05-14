// pages/api/finance/import/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

// POST — загрузка массива транзакций
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: "transactions must be an array" });
    }

    const batch = adminDB.batch();
    for (const txn of transactions) {
      if (!txn.transactionId) continue; // Пропуск без id

      // Проверка на существование
      const ref = adminDB.collection("transactions").doc(txn.transactionId);
      const exists = (await ref.get()).exists;
      if (!exists) {
        batch.set(ref, txn, { merge: true });
      }
    }

    await batch.commit();
    return res.status(200).json({ success: true, count: transactions.length });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}