// pages/api/finance/categories/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

const COLL = "categories";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET — получить все категории
  if (req.method === "GET") {
    const snap = await adminDB.collection(COLL).orderBy("type").get();
    return res.status(200).json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  // POST — добавить новую категорию
  if (req.method === "POST") {
    const { name, type, color, parentId } = req.body;
    if (!name || !type) return res.status(400).json({ error: "name, type required" });
    const doc = await adminDB.collection(COLL).add({ name, type, color: color || null, parentId: parentId || null });
    return res.status(200).json({ id: doc.id, success: true });
  }

  res.status(405).end();
}