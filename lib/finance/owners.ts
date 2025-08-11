// lib/finance/owners.ts
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export type Owner = { id: string; name: string; share: number }; // 0..1

export async function loadOwners(): Promise<Owner[]> {
  const snap = await getDocs(collection(db, "finance_owners"));
  const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Owner[];
  if (!list.length) {
    // дефолт 50/50, если коллекция пустая
    return [
      { id: "igor", name: "Igor", share: 0.5 },
      { id: "evgeniy", name: "Evgeniy", share: 0.5 },
    ];
  }
  const total = list.reduce((s,o)=> s + (Number(o.share)||0), 0) || 1;
  return list.map(o => ({ ...o, share: (Number(o.share)||0) / total }));
}

export function splitAmount(
  amount: number,
  owners: Owner[],
  custom?: Array<{ ownerId?: string; name?: string; share?: number }>
) {
  if (!amount || amount <= 0) return [];
  if (Array.isArray(custom) && custom.length) {
    const sum = custom.reduce((s,o)=> s + (Number(o.share)||0), 0) || 1;
    return custom.map(o => ({
      name: o.name || owners.find(g=>g.id===o.ownerId)?.name || "—",
      amount: +(amount * ((Number(o.share)||0)/sum)).toFixed(2),
    }));
  }
  return owners.map(o => ({ name: o.name, amount: +(amount * o.share).toFixed(2) }));
}