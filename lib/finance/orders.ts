// lib/finance/orders.ts
import {
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  where,
  writeBatch,
  Firestore,
} from "firebase/firestore";

export type Allocation = { bookingId: string; amountBase: number };

export type TxPayloadForOrders = {
  // базовые поля транзакции, которые нам нужны в ордерах
  date: string; // YYYY-MM-DD
  status: "planned" | "actual" | "reconciled";
  side: "income" | "expense";
  accountId?: string | null;
  currency?: string | null;
  amount?: { value?: number; currency?: string } | null;

  categoryId?: string | null;
  categoryName?: string | null;
  note?: string | null;
};

/**
 * Полностью пересобрать ордера под транзакцию:
 * 1) удалить все старые finance_orders где txId == ...
 * 2) создать новые по списку распределений (EUR, ≥ 0)
 */
export async function upsertOrdersForTransaction(
  db: Firestore,
  txId: string,
  payload: TxPayloadForOrders,
  allocations: Allocation[],
) {
  // 1) удалить прежние ордера
  const qOld = query(collection(db, "finance_orders"), where("txId", "==", txId));
  const snap = await getDocs(qOld);
  const batch = writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));

  // 2) поставить новые
  const now = Timestamp.now();
  const cleanAllocs = (allocations || []).filter(
    (a) => a && a.bookingId && Number(a.amountBase) > 0
  );

  for (const a of cleanAllocs) {
    const ref = doc(collection(db, "finance_orders"));
    batch.set(ref, {
      txId,
      date: payload.date,
      status: payload.status,
      side: payload.side, // income | expense

      // справочно:
      accountId: payload.accountId ?? null,
      currency: payload.currency ?? null,
      amount: payload.amount?.value ?? null, // валютная сумма — опционально

      // аналитика:
      categoryId: payload.categoryId ?? null,
      categoryName: payload.categoryName ?? null,

      // главное:
      bookingId: String(a.bookingId),
      baseAmount: +Number(a.amountBase || 0).toFixed(2), // EUR, положительное

      note: payload.note || null,
      createdAt: now,
      updatedAt: now,
    } as any);
  }

  await batch.commit();
}