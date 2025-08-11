import { addDoc, collection, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
// было: import { SYS } from "@/lib/finance/bookingFinance";
import { SYS_CATEGORIES } from "@/lib/finance/bookingFinance";

export async function seedFinanceDefaults() {
  // категории
  for (const key of Object.keys(SYS_CATEGORIES) as (keyof typeof SYS_CATEGORIES)[]) {
    const c = SYS_CATEGORIES[key];
    const q = query(
      collection(db,"finance_categories"),
      where("name","==",c.name),
      where("side","==",c.side)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      await addDoc(collection(db,"finance_categories"), {
        ...c, isSystem:true, createdAt: serverTimestamp()
      });
    }
  }

  // Счёт BT EUR (если нет)
  const accQ = query(collection(db,"finance_accounts"), where("name","==","BT EUR"));
  const accSnap = await getDocs(accQ);
  if (accSnap.empty) {
    await addDoc(collection(db,"finance_accounts"), {
      name: "BT EUR",
      currency: "EUR",
      bankName: "Banca Transilvania",
      isDefault: true,
      openingBalance: 0,
      createdAt: serverTimestamp(),
    });
  }
}