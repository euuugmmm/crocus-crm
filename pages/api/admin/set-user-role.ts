/* pages/api/admin/set-user-role.ts */
import type { NextApiRequest, NextApiResponse } from "next";
import { adminAuth } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const { uid, role } = req.body as { uid?: string; role?: string };
  if (!uid || !role) return res.status(400).json({ error: "uid and role required" });

  try {
    await adminAuth.setCustomUserClaims(uid, { role });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[set-user-role]", err);
    return res.status(500).json({ error: "failed_to_set_role" });
  }
}