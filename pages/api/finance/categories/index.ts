// pages/api/finance/categories/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

// GET — получить все категории, POST — добавить новую категорию
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const snap = await adminDB.collection("categories").get();
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return res.status(200).json(items);
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  if (req.method === "POST") {
    try {
      const { name, type, description } = req.body;
      if (!name || !type) return res.status(400).json({ error: "name and type are required" });
      const ref = await adminDB.collection("categories").add({ name, type, description: description || "" });
      return res.status(200).json({ id: ref.id, name, type, description });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  return res.status(405).end();
}