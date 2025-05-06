// lib/firestore.ts
import { db } from "@/firebaseConfig";
import { collection, query, where, getDocs } from "firebase/firestore";

export async function getBookingsForAgent(agentId: string): Promise<any[]> {
  const q = query(collection(db, "bookings"), where("agentId", "==", agentId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}