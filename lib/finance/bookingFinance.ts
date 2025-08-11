import {
  addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { CategorySide, Currency, Transaction } from "./types";
import { eurRateFor, today } from "./db";

// системные названия
export const SYS_CATEGORIES = {
  IN_CLIENT: { name: "Поступления от клиентов", side: "income" as CategorySide },
  COGS_OP:   { name: "Себестоимость оператору", side: "cogs"   as CategorySide },
  EXP_AGENT: { name: "Комиссия агенту",         side: "expense" as CategorySide },
  EXP_TAX:   { name: "Налог с комиссии агента", side: "expense" as CategorySide },
  EXP_ACQ:   { name: "Эквайринг / банковская комиссия", side: "expense" as CategorySide },
  EXP_REF:   { name: "Возвраты клиентам",       side: "expense" as CategorySide },
};

export async function ensureSystemCategoryId(cat: {name:string; side:CategorySide}) {
  const q = query(
    collection(db, "finance_categories"),
    where("name","==",cat.name),
    where("side","==",cat.side)
  );
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].id;
  const ref = await addDoc(collection(db,"finance_categories"), { ...cat, isSystem:true, createdAt: serverTimestamp() });
  return ref.id;
}

type CreateTxParams = {
  bookingId: string;
  date?: string;               // YYYY-MM-DD
  accountId?: string;          // для in/out
  fromAccountId?: string;      // для transfer
  toAccountId?: string;        // для transfer
  type: "in" | "out" | "transfer";
  status?: "planned" | "actual" | "reconciled";
  amountValue: number;
  currency: Currency;
  categoryId?: string;
  method?: "card" | "bank" | "cash" | "iban" | "other";
  note?: string;
  fxRatesDocForDate?: any;     // если есть курс на дату
};

export async function createTxForBooking(p: CreateTxParams) {
  const date = p.date || today();

  // считаем в EUR
  const rateToEur = eurRateFor(p.fxRatesDocForDate, p.currency);
  const baseAmount = +(p.amountValue * rateToEur).toFixed(2);

  const side = p.type === "in" ? "income" : p.type === "out" ? "expense" : undefined;

  const payload: Omit<Transaction,"id"> = {
    date,
    status: p.status || "actual",
    type: p.type,
    amount: { value: p.amountValue, currency: p.currency },
    fxRateToBase: rateToEur,
    baseAmount,
    eurAmount: baseAmount, // дубликат для совместимости
    side,
    categoryId: p.categoryId,
    method: p.method,
    note: p.note,
    bookingId: p.bookingId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (p.type === "transfer") {
    (payload as any).fromAccountId = p.fromAccountId;
    (payload as any).toAccountId   = p.toAccountId;
  } else {
    (payload as any).accountId     = p.accountId;
  }

  await addDoc(collection(db,"finance_transactions"), payload as any);
}

export type BookingLike = {
  id: string;
  bruttoClient?: number;
  internalNet?: number;
  agentCommission?: number;
  createdAt?: any;
  checkIn?: any;
};

export async function createPlannedFromBooking(b: BookingLike, accountIdEUR?: string, dateHint?: "created"|"checkin") {
  const date = dateHint === "checkin"
    ? (b.checkIn?.toDate ? b.checkIn.toDate().toISOString().slice(0,10) : today())
    : (b.createdAt?.toDate ? b.createdAt.toDate().toISOString().slice(0,10) : today());

  const [catIn, catCogs] = await Promise.all([
    ensureSystemCategoryId(SYS_CATEGORIES.IN_CLIENT),
    ensureSystemCategoryId(SYS_CATEGORIES.COGS_OP),
  ]);

  if (b.bruttoClient && b.bruttoClient > 0) {
    await createTxForBooking({
      bookingId: b.id,
      date,
      type: "in",
      status: "planned",
      amountValue: Number(b.bruttoClient),
      currency: "EUR",
      categoryId: catIn,
      accountId: accountIdEUR,
      note: "План: оплата клиента",
      method: "bank",
    });
  }

  if (b.internalNet && b.internalNet > 0) {
    await createTxForBooking({
      bookingId: b.id,
      date,
      type: "out",
      status: "planned",
      amountValue: Number(b.internalNet),
      currency: "EUR",
      categoryId: catCogs,
      accountId: accountIdEUR,
      note: "План: оплата оператору",
      method: "iban",
    });
  }
}

export async function saveFinanceSnapshot(bookingId: string, snapshot: any) {
  await setDoc(
    doc(db,"bookings", bookingId),
    { financeSnapshot: snapshot, financeSnapshotUpdatedAt: serverTimestamp() },
    { merge: true }
  );
}