import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/firebaseConfig";
import { doc, updateDoc } from "firebase/firestore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const { uid } = req.body;              // current user id
  if (!uid) return res.status(400).end("No uid");

  const pin = Math.floor(100000 + Math.random()*900000).toString(); // 6-digit
  await updateDoc(doc(db, "users", uid), {
    tgPin: pin,
    tgPinCreatedAt: new Date(),
  });

  res.status(200).json({ pin });
}