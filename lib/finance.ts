// lib/finance.ts – client-side helpers (без firebase-admin)
import {
  collection, query, where, getDocs,
  addDoc, doc, getDoc, updateDoc,
  serverTimestamp, increment,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

/* ---------- типы ---------- */
export type BookingDoc = {
  id: string;
  agentId: string;
  commission: number;
  status: "finished" | string;
  commissionPaid?: boolean;
  bookingNumber?: string;
  createdAt?: any;
  [k: string]: any;
};

export type PayoutDoc = {
  id: string;
  agentId: string;
  amount: number;
  annexLink?: string;
  bookings: string[];
  createdAt?: any;
  [k: string]: any;
};

export type AgentDoc = {
  id: string;
  agencyName?: string;
  agentName?: string;
  role?: string;
  [k: string]: any;
};

/* 1. Баланс одного агента (не выплачено) */
export async function getAgentBalance(agentId: string): Promise<number> {
  const q = query(
    collection(db, "bookings"),
    where("agentId", "==", agentId),
    where("status", "==", "finished")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => d.data() as BookingDoc)
    .filter(b => !b.commissionPaid) 
    .reduce((s, b) => s + Number(b.commission || 0), 0);
}

/* 2. Свод балансов по всем агентам */
export async function getAllBalances(): Promise<(AgentDoc & { balance: number })[]> {
  const [agentsSnap, finishedSnap] = await Promise.all([
    getDocs(query(collection(db, "users"), where("role", "==", "agent"))),
    getDocs(query(collection(db, "bookings"), where("status", "==", "finished")))
  ]);
  const finished = finishedSnap.docs.map(d => d.data() as BookingDoc);
  return agentsSnap.docs.map(d => {
    const a = d.data() as AgentDoc;
    const bal = finished
      .filter(b => b.agentId === d.id && !b.commissionPaid)
      .reduce((s, b) => s + Number(b.commission || 0), 0);
    return { id: d.id, ...a, balance: bal };
  });
}

/* 3. Все выплаты (история) */
export async function getAllPayouts(): Promise<PayoutDoc[]> {
  const snap = await getDocs(collection(db, "payouts"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PayoutDoc));
}

/* 3a. Комиссии одного агента (finished) */
  export async function getAgentCommissions(agentId: string) {
  const snap = await getDocs(
    query(
      collection(db, "bookings"),
      where("agentId", "==", agentId),
      where("status", "==", "finished")
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as BookingDoc) }));
}

export async function getAgentPayouts(agentId: string) {
  const snap = await getDocs(
    query(
      collection(db, "payouts"),
      where("agentId", "==", agentId)
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as PayoutDoc) }));
}

/* 4. «Простая» ручная выплата */
export async function createSimplePayout(
  agentId: string,
  amount: number,
  comment = ""
) {
  const u = (await getDoc(doc(db, "users", agentId))).data() || {};
  await addDoc(collection(db, "payouts"), {
    agentId,
    amount,
    comment,
    bookings: [],
    agentName: `${u.agencyName || "—"} — ${u.agentName || "—"}`,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "users", agentId), {
    manualPayoutCount: increment(1),
  });
}