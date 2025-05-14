// pages/api/finance/bookings/import.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

// POST — bulk upload заявок (например, из CSV/JSON)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { bookings } = req.body;
    if (!Array.isArray(bookings)) {
      return res.status(400).json({ error: "bookings must be an array" });
    }

    const batch = adminDB.batch();
    for (const booking of bookings) {
      if (!booking.bookingNumber) continue; // Пропуск без id
      const ref = adminDB.collection("bookings").doc(booking.bookingNumber);
      batch.set(ref, booking, { merge: true });
    }
    await batch.commit();

    return res.status(200).json({ success: true, count: bookings.length });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}