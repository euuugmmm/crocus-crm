import {
  addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Currency, FxRates, Planned, Transaction, CategorySide } from "@/lib/finance/types";
import { eurRateFor } from "@/lib/finance/db";
import { ensureSystemCategoryId, SYS_CATEGORIES } from "@/lib/finance/bookingFinance";

export function fingerprint(d: {
  accountId: string;
  date: string;
  type: "in" | "out";
  amountAbs: number;               // без знака
  currency: Currency | string;
  note?: string;
}) {
  // включаем тип и 2 знака после запятой
  const amt = d.amountAbs.toFixed(2);
  const note = (d.note || "").slice(0, 64);
  return `${d.accountId}|${d.date}|${d.type}|${amt}|${String(d.currency).toUpperCase()}|${note}`;
}

export async function isDuplicate(fp: string) {
  const qDup = query(collection(db, "finance_transactions"), where("fingerprint", "==", fp));
  const snap = await getDocs(qDup);
  return !snap.empty;
}

export function eurFromAmount(amount: number, currency: Currency, rates?: FxRates | null) {
  const fx = eurRateFor(rates || undefined, currency);
  return +(amount * fx).toFixed(2);
}

export async function getFxDoc(date: string): Promise<FxRates | null> {
  const snap = await getDoc(doc(db, "finance_fxRates", date));
  return snap.exists() ? ({ id: date, ...(snap.data() as any) }) : null;
}

// Находим ближайший план по счёту/типу/дате с допуском по сумме в EUR
export async function findPlannedCandidate(p: {
  accountId: string;
  date: string;
  type: "in" | "out";
  amountAbs: number;
  currency: Currency;
}) {
  const side: CategorySide = p.type === "in" ? "income" : "expense";

  const d = new Date(p.date);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const shift = (dd: Date, delta: number) => {
    const c = new Date(dd);
    c.setDate(c.getDate() + delta);
    return `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`;
  };
  const from = shift(d, -3);
  const to = shift(d, +3);

  const qPlan = query(
    collection(db, "finance_planned"),
    where("accountId", "==", p.accountId),
    where("side", "==", side),
    where("date", ">=", from),
    where("date", "<=", to),
  );
  const snap = await getDocs(qPlan);
  if (snap.empty) return null;

  const rates = await getFxDoc(p.date);
  const txEur = eurFromAmount(p.amountAbs, p.currency, rates);

  let best: (Planned & { id: string }) | null = null;
  let bestDiff = Infinity;

  snap.forEach(d => {
    const pl = { id: d.id, ...(d.data() as any) } as Planned & { id: string };
    if (pl.matchedTxId) return;
    const plEur = pl.eurAmount ?? eurFromAmount(Number(pl.amount || 0), pl.currency as Currency, rates);
    const diff = Math.abs(plEur - txEur);
    if (diff < bestDiff) {
      best = pl;
      bestDiff = diff;
    }
  });

  return bestDiff <= 1.0 ? best : null; // допуск 1 EUR
}

// Берём системную категорию по типу движения
export async function defaultCategoryIdFor(type: "in" | "out") {
  if (type === "in") {
    return ensureSystemCategoryId(SYS_CATEGORIES.IN_CLIENT);
  }
  // базовый вариант для расхода — прочие расходы / либо возвраты клиентам
  // Если у вас есть системная "Прочие расходы" — замените на неё.
  return ensureSystemCategoryId(SYS_CATEGORIES.EXP_REF);
}

export function guessMethod(description?: string): "bank" | "card" | "cash" | "iban" | "other" {
  const s = (description || "").toUpperCase();
  if (s.includes("POS") || s.includes("CARD")) return "card";
  if (s.includes("IBAN")) return "iban";
  if (s.includes("CASH")) return "cash";
  if (s.includes("TRANSFER")) return "bank";
  return "bank";
}