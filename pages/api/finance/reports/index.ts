// pages/api/finance/reports/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

type Booking = {
  id: string;
  bookingNumber: string;
  market?: string;
  category?: string;
  [key: string]: any;
};

type Transaction = {
  id: string;
  bookingNumber?: string; // ВАЖНО: используем bookingNumber для связи
  bookingId?: string;
  transactionAmount: {
    amount: string;
    currency: string;
  };
  category?: string;
  [key: string]: any;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { from, to, market, category, currency } = req.query;

    // 1. Загружаем заявки (bookings) с лимитом на случай большого объема
    let bookingsQ = adminDB.collection("bookings") as FirebaseFirestore.Query;
    if (market)   bookingsQ = bookingsQ.where("market", "==", market);
    if (category) bookingsQ = bookingsQ.where("category", "==", category);
    if (from)     bookingsQ = bookingsQ.where("createdAt", ">=", from);
    if (to)       bookingsQ = bookingsQ.where("createdAt", "<=", to);

    const bookingsSnap = await bookingsQ.limit(1000).get();
    const bookings: Booking[] = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Booking[];
    // Делаем быстрый мап для поиска по bookingNumber
    const bookingMap = Object.fromEntries(bookings.map(bk => [bk.bookingNumber, bk]));

    // 2. Загружаем транзакции (transactions)
    let txQ = adminDB.collection("transactions") as FirebaseFirestore.Query;
    if (currency) txQ = txQ.where("transactionAmount.currency", "==", currency);
    if (from)     txQ = txQ.where("bookingDate", ">=", from);
    if (to)       txQ = txQ.where("bookingDate", "<=", to);

    const txSnap = await txQ.limit(1000).get();
    const transactions: Transaction[] = txSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Transaction[];

    // 3. Оставляем только нужные транзакции (привязанные к этим заявкам, если есть фильтр market)
    const relatedTx = !market
      ? transactions
      : transactions.filter(tx =>
          (tx.bookingNumber && bookingMap[tx.bookingNumber]) ||
          (tx.bookingId && bookingMap[tx.bookingId])
        );

    // 4. Строим summary
    const summary = {
      totalIncome: 0,
      totalExpense: 0,
      profit: 0,
      byMarket: {} as Record<string, { income: number; expense: number }>,
      byCategory: {} as Record<string, { income: number; expense: number }>,
    };

    relatedTx.forEach(tx => {
      const amt = parseFloat(tx.transactionAmount.amount) || 0;
      if (amt > 0) summary.totalIncome += amt;
      if (amt < 0) summary.totalExpense += Math.abs(amt);

      // По рынкам (если есть bookingNumber и заявка найдена)
      let marketKey = "Без рынка";
      if (tx.bookingNumber && bookingMap[tx.bookingNumber]?.market)
        marketKey = bookingMap[tx.bookingNumber].market!;
      else if (tx.bookingId && bookingMap[tx.bookingId]?.market)
        marketKey = bookingMap[tx.bookingId].market!;

      if (!summary.byMarket[marketKey]) summary.byMarket[marketKey] = { income: 0, expense: 0 };
      if (amt > 0) summary.byMarket[marketKey].income += amt;
      if (amt < 0) summary.byMarket[marketKey].expense += Math.abs(amt);

      // По категориям
      const cat = tx.category || "Без категории";
      if (!summary.byCategory[cat]) summary.byCategory[cat] = { income: 0, expense: 0 };
      if (amt > 0) summary.byCategory[cat].income += amt;
      if (amt < 0) summary.byCategory[cat].expense += Math.abs(amt);
    });

    summary.profit = summary.totalIncome - summary.totalExpense;

    res.status(200).json({ summary, bookings, transactions: relatedTx });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}