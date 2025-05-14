// pages/api/finance/statistics.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Всего заявок
    const bookingsSnap = await adminDB.collection("bookings").get();
    const bookings = bookingsSnap.docs.map(d => d.data());
    const totalBookings = bookings.length;

    // Всего транзакций
    const txSnap = await adminDB.collection("transactions").get();
    const transactions = txSnap.docs.map(d => d.data());
    const totalTransactions = transactions.length;

    // Общая прибыль (грубый расчет)
    const profit = transactions.reduce((sum, tx: any) => {
      const amt = parseFloat(tx.transactionAmount?.amount || 0);
      return sum + amt;
    }, 0);

    res.status(200).json({
      totalBookings,
      totalTransactions,
      totalProfit: profit
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}