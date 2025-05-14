// pages/api/reports/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Пример: агрегируем по рынкам
    const bookingsSnap = await adminDB.collection("bookings").get();
    const bookings = bookingsSnap.docs.map(d => d.data());

    const byMarket = bookings.reduce((acc, b: any) => {
      if (!acc[b.market]) acc[b.market] = 0;
      acc[b.market] += b.amount || 0;
      return acc;
    }, {} as Record<string, number>);

    res.status(200).json({ byMarket });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}