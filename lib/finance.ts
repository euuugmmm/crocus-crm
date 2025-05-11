// lib/finance.ts
import { db } from "@/firebaseConfig";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
} from "firebase/firestore";

/* ---------- Типы ---------- */

type BookingDoc = {
  id: string;
  commission: number;
  agentId: string;
  status: string;
  [key: string]: any;
};

type PayoutDoc = {
  id: string;
  amount: number;
  agentId: string;
  [key: string]: any;
};

type AgentDoc = {
  id: string;
  agentName?: string;
  agencyName?: string;
  role?: string;
  [key: string]: any;
};

/* ---------- 1. Один агент ---------- */

export async function getAgentBalance(agentId: string): Promise<number> {
  const [commissions, payouts] = await Promise.all([
    getAgentCommissions(agentId),
    getAgentPayouts(agentId),
  ]);

  const totalCom = commissions.reduce((s, c) => s + (c.commission || 0), 0);
  const totalPay = payouts.reduce((s, p) => s + (p.amount || 0), 0);
  return totalCom - totalPay;
}

export async function getAgentCommissions(agentId: string): Promise<BookingDoc[]> {
  const q = query(
    collection(db, "bookings"),
    where("agentId", "==", agentId),
    where("status", "==", "Завершено")
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as BookingDoc));
}

export async function getAgentPayouts(agentId: string): Promise<PayoutDoc[]> {
  const q = query(collection(db, "payouts"), where("agentId", "==", agentId));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as PayoutDoc));
}

/* ---------- 2. Все агенты и балансы ---------- */

export async function getAllAgents(): Promise<AgentDoc[]> {
  const q = query(collection(db, "users"), where("role", "==", "agent"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentDoc));
}

export async function getAllCommissions(): Promise<BookingDoc[]> {
  const q = query(collection(db, "bookings"), where("status", "==", "Завершено"));
  const snap = await getDocs(q);
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as BookingDoc))
    .filter((d) => typeof d.commission === "number" && d.agentId);
}

export async function getAllPayouts(): Promise<PayoutDoc[]> {
  const snap = await getDocs(collection(db, "payouts"));
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as PayoutDoc));
}

export async function getAgentBalances(): Promise<any[]> {
  const [agents, commissions, payouts] = await Promise.all([
    getAllAgents(),
    getAllCommissions(),
    getAllPayouts(),
  ]);

  return agents.map((agent) => {
    const id = agent.id;
    const totalCom = commissions
      .filter((c) => c.agentId === id)
      .reduce((sum, c) => sum + (c.commission || 0), 0);

    const totalPay = payouts
      .filter((p) => p.agentId === id)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    return { ...agent, balance: totalCom - totalPay };
  });
}

/* ---------- 3. Создать выплату ---------- */

export async function createPayout({
  agentId,
  amount,
  comment = "",
}: {
  agentId: string;
  amount: number;
  comment?: string;
}): Promise<string> {
  const userSnap = await getDoc(doc(db, "users", agentId));
  const userData = userSnap.exists() ? userSnap.data() : {};

  const docRef = await addDoc(collection(db, "payouts"), {
    agentId,
    amount,
    comment,
    agentName: `${userData.agencyName || "—"} — ${userData.agentName || "—"}`,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}
