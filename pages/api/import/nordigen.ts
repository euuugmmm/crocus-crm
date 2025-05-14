// pages/api/import/nordigen.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: "transactions must be an array" });
    }
    // Сохраняем транзакции в Firestore
    const batch = adminDB.batch();
    transactions.forEach((txn: any) => {
      const ref = adminDB.collection("transactions").doc(txn.transactionId);
      batch.set(ref, txn, { merge: true });
    });
    await batch.commit();

    res.status(200).json({ success: true, count: transactions.length });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}