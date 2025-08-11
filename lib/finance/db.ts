import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Account, Category, FxRates, Transaction } from "./types";

export const colAccounts = () => collection(db, "finance_accounts");
export const colCategories = () => collection(db, "finance_categories");
export const colFxRates  = () => collection(db, "finance_fxRates");
export const colTx       = () => collection(db, "finance_transactions");

// маленькие утилиты
export const today = () => new Date().toISOString().slice(0,10);
export function toNumberSafe(v: any) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
export function eurRateFor(dateRates: FxRates | undefined, cur: string) {
  if (!dateRates) return 1;
  if (cur === "EUR") return 1;
  const r = dateRates.rates[cur as "RON"|"USD"];
  return r && r > 0 ? 1 / r : 1; // если rates храним как 1 EUR = 4.97 RON → EUR = value / 4.97
}

export async function seedDefaults() {
  // Счета
  const accSnap = await import("firebase/firestore").then(m=>m.getDocs(query(colAccounts())));
  if (accSnap.empty) {
    await addDoc(colAccounts(), { name:"BT EUR", currency:"EUR", type:"bank", isDefault:true, createdAt:serverTimestamp() });
    await addDoc(colAccounts(), { name:"BT RON", currency:"RON", type:"bank", createdAt:serverTimestamp() });
    await addDoc(colAccounts(), { name:"BT USD", currency:"USD", type:"bank", createdAt:serverTimestamp() });
  }
  // Категории
  const catSnap = await import("firebase/firestore").then(m=>m.getDocs(query(colCategories())));
  if (catSnap.empty) {
    const base: Omit<Category,"id">[] = [
      { name:"Поступления от клиентов", side:"income", isSystem:true },
      { name:"Себестоимость оператору", side:"cogs",   isSystem:true },
      { name:"Комиссия агенту",         side:"expense",isSystem:true },
      { name:"Налог с комиссии агента", side:"expense",isSystem:true },
      { name:"Эквайринг / банковская комиссия", side:"expense", isSystem:true },
      { name:"Возвраты клиентам",       side:"expense",isSystem:true },
      { name:"Курсовые разницы",        side:"income", isSystem:true },
      { name:"Прочие расходы",          side:"expense",isSystem:false },
    ];
    for (const c of base) await addDoc(colCategories(), { ...c, createdAt: serverTimestamp() });
  }
}