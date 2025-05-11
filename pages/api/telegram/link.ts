import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";

// POST { uid: string, pin: string | null }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { uid, pin } = req.body;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return res.status(404).json({ error: "User not found" });

  // 1) пользователь нажал кнопку "Сгенерировать PIN"
  if (!pin) {
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    await updateDoc(ref, { tgPin: newPin });
    return res.status(200).json({ pin: newPin });
  }

  // 2) пришёл запрос от webhook → link будет подтверждён там
  return res.status(400).end();
}