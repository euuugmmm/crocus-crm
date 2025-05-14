// pages/api/finance/categories/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

const COLL = "categories";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") return res.status(400).json({ error: "no id" });

  // PUT — обновить
  if (req.method === "PUT") {
    const { name, type, color, parentId } = req.body;
    await adminDB.collection(COLL).doc(id).update({ name, type, color, parentId });
    return res.status(200).json({ success: true });
  }

  // DELETE — удалить
  if (req.method === "DELETE") {
    await adminDB.collection(COLL).doc(id).delete();
    return res.status(200).json({ success: true });
  }

  res.status(405).end();
}