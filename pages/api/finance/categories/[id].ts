// pages/api/finance/categories/[id].ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid category ID" });

  const ref = adminDB.collection("categories").doc(id);

  if (req.method === "GET") {
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Category not found" });
    return res.status(200).json({ id: snap.id, ...snap.data() });
  }

  if (req.method === "PUT") {
    try {
      const data = req.body;
      await ref.set(data, { merge: true });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  if (req.method === "DELETE") {
    try {
      await ref.delete();
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  return res.status(405).end();
}