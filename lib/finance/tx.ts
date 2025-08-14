// lib/finance/tx.ts
import {
  Account,
  Allocation,
  Category,
  Counterparty,
  Currency,
  FxDoc,
  OwnerWho,
  TxRow,
  CategorySide,
} from "@/types/finance";
import { Timestamp, collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { eurFrom, todayISO } from "./fx";

/** безопасное число */
const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;

/** Нормализация Firestore-документа транзакции под UI */
export function normalizeTx(raw: any, accounts: Account[], fxList: FxDoc[]): TxRow {
  const side: CategorySide =
    raw.side ||
    (raw.type === "in" ? "income" : raw.type === "out" ? "expense" : "income");

  const currency: Currency =
    raw.currency ||
    raw.amount?.currency ||
    (accounts.find((a) => a.id === raw.accountId)?.currency as Currency) ||
    "EUR";

  const rawAmt =
    typeof raw.amount === "number"
      ? Number(raw.amount || 0)
      : Number(raw.amount?.value || 0);

  const dateStr: string = raw.date || todayISO();

  const rawBase = Number(
    raw.baseAmount ?? raw.eurAmount ?? eurFrom(rawAmt, currency, dateStr, fxList)
  );

  const amount = Math.abs(rawAmt);
  const baseAmount = Math.abs(rawBase);

  const row: TxRow = {
    id: String(raw.id),
    date: dateStr,
    status: raw.status || "actual",
    accountId: raw.accountId,
    accountName: raw.accountName,
    currency,
    side,
    amount,
    baseAmount,
    categoryId: raw.categoryId ?? null,
    categoryName: raw.categoryName,
    counterpartyId: raw.counterpartyId ?? null,
    counterpartyName: raw.counterpartyName,
    ownerWho: (raw.ownerWho as OwnerWho) ?? null,
    bookingId: raw.bookingId ?? null,
    bookingAllocations: Array.isArray(raw.bookingAllocations)
      ? raw.bookingAllocations.map((a: any) => ({
          bookingId: String(a.bookingId),
          amountBase: Number(a.amountBase || 0),
        }))
      : undefined,
    note: raw.note ?? "",
    method: raw.method,
    source: raw.source,
    createdAt: raw.createdAt,
  };

  // --- ВАЖНО: прокидываем точные суммы распределения по учредителям ---
  (row as any).ownerIgorEUR     = Number(raw.ownerIgorEUR || 0);
  (row as any).ownerEvgeniyEUR  = Number(raw.ownerEvgeniyEUR || 0);
  (row as any).foundersTotalEUR = Number(raw.foundersTotalEUR || 0);

  return row;
}

/** Payload для Firestore (канонический формат, положительные суммы) */
export function buildTxPayload(
  data: Partial<TxRow>,
  deps: {
    accounts: Account[];
    categories: Category[];
    counterparties: Counterparty[];
    fxList: FxDoc[];
  },
  forId?: string
) {
  const { accounts, categories, counterparties, fxList } = deps;
  const acc = accounts.find((a) => a.id === data.accountId);
  const ccy = (acc?.currency || data.currency || "EUR") as Currency;

  const amtAbs = Math.abs(toNum(data.amount));
  const eurAbs =
    data.baseAmount != null
      ? Math.abs(toNum(data.baseAmount))
      : Math.abs(eurFrom(amtAbs, ccy, data.date || todayISO(), fxList));

  const cat = categories.find((c) => c.id === data.categoryId);
  const cp = counterparties.find((x) => x.id === data.counterpartyId);

  const side = (data.side || "income") as CategorySide;

  // точные суммы по учредителям (если side=expense и пришли из формы)
  const igorEUR = side === "expense" ? r2((data as any)?.ownerIgorEUR ?? 0) : 0;
  const evgEUR  = side === "expense" ? r2((data as any)?.ownerEvgeniyEUR ?? 0) : 0;
  const foundersTotalEUR = side === "expense" ? r2(igorEUR + evgEUR) : 0;

  const payload: any = {
    date: data.date || todayISO(),
    status: data.status || "actual",

    accountId: data.accountId,
    accountName: acc?.name || null,

    currency: ccy,
    side,
    type: side === "income" ? "in" : "out", // для совместимости

    // суммы в канонике — положительные
    amount: { value: +amtAbs.toFixed(2), currency: ccy },
    baseAmount: +eurAbs.toFixed(2),

    categoryId: data.categoryId ?? null,
    categoryName: cat?.name || null,

    counterpartyId: data.counterpartyId ?? null,
    counterpartyName: cp?.name || null,

    // «лайт-метка» владения (legacy): сохраняем только для расходов
    ownerWho: side === "expense" ? ((data.ownerWho ?? null) as OwnerWho) : null,

    // точные суммы по учредителям (кастомный сплит)
    ...(side === "expense"
      ? {
          ownerIgorEUR: igorEUR || 0,
          ownerEvgeniyEUR: evgEUR || 0,
          foundersTotalEUR: foundersTotalEUR || 0,
        }
      : {}),

    bookingId: (data.bookingId ?? null) || null, // одиночная ссылка для совместимости
    note: (data.note || "").trim(),
    method: data.method || "bank",

    source: forId ? "manual_edit" : "manual",
    updatedAt: Timestamp.now(),
    ...(forId ? {} : { createdAt: Timestamp.now() }),
  };

  return payload;
}

/** Пересобираем ордера под транзакцию (удаляем старые, создаём текущие) */
export async function upsertOrdersForTransaction(
  txId: string,
  payload: any,
  allocations: Allocation[]
) {
  // 1) удалить прежние
  const q = query(collection(db, "finance_orders"), where("txId", "==", txId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));

  // 2) создать новые
  const date = payload.date;
  const side = payload.side;
  const accountId = payload.accountId ?? null;
  const currency = payload.currency ?? "EUR";
  const amount = payload.amount?.value ?? null;

  allocations.forEach((a) => {
    if (!a.bookingId || !a.amountBase) return;
    const ref = doc(collection(db, "finance_orders"));
    batch.set(ref, {
      txId,
      date,
      side,
      accountId,
      currency,
      amount, // справочно
      baseAmount: +Number(a.amountBase).toFixed(2),
      bookingId: a.bookingId,
      note: payload.note || null,
      status: "posted",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    } as any);
  });

  await batch.commit();
}

/** Удалить транзакцию вместе с её ордерами */
export async function removeTxWithOrders(txId: string) {
  const q = query(collection(db, "finance_orders"), where("txId", "==", txId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "finance_transactions", txId));
  await batch.commit();
}