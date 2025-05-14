// pages/api/finance/transactions/[id].ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

/**
 * GET    /api/finance/transactions/[id]  — получить транзакцию по ID
 * PUT    /api/finance/transactions/[id]  — обновить транзакцию по ID
 * DELETE /api/finance/transactions/[id]  — удалить транзакцию по ID (soft-delete)
 */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "No ID" });

  const ref = adminDB.collection("finance_transactions").doc(id);

  if (req.method === "GET") {
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(snap.data());
  }

  if (req.method === "PUT") {
    const data = req.body;
    // Тут можно добавить валидацию данных!
    await ref.set({ ...data, updatedAt: new Date().toISOString() }, { merge: true });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    await ref.set({ status: "deleted", updatedAt: new Date().toISOString() }, { merge: true });
    return res.status(200).json({ ok: true, deleted: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}