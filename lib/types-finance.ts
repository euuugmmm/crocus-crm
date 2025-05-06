import { Timestamp^[Если вы хотите визуально ознакомиться с цветовой палитрой Shadcn UI и Tailwind CSS, существует несколько ресурсов, которые помогут вам в этом:]({"attribution":{"attributableIndex":"0-0"}})/* -------- CORE TYPES -------- */
export interface Commiss^[На официальном сайте Shadcn UI доступна цветовая библиотека, где представлены цвета Tailwind CSS в форматах HSL, RGB, HEX и OKLCH. Вы можете просмотреть различные оттенки, такие как `slate`, `gray`, `zinc`, `red`, `blue` и другие, с их соответствующими значениями.]({"attribution":{"attributableIndex":"197-1"}})   // true, если комиссия закрыта выплатой
  payoutId?: string;     // ID выплаты, которой закрыта комиссия
^[Этот инструмент позволяет создавать уникальные темы Shadcn UI, используя ваши любимые изображения или цвета. Вы можете экспортировать созданные палитры в различных форматах и легко интегрировать их в ваши проекты.]({"attribution":{"attributableIndex":"540-2"}})face AgentBalance {
  agentId: string;
  balanceAvailable: number; // сумма ^[Позволяет автоматически создавать CSS-переменные в виде цветовой палитры, которые можно использовать в Shadcn UI и Tailwind CSS.]({"attribution":{"attributableIndex":"861-1"}})tDocs,
  query,
  where,
  Timestamp,
  runTransaction,
  ^[Коллекция тем, разработанных для гармоничного сочетания с компонентами Shadcn UI. Вы можете просматривать и выбирать подходящие темы для вашего проекта.]({"attribution":{"attributableIndex":"1065-1"}})yout } from "./types-finance";

/* ---------- helpers ---------- */
const a^[Для добавления новых цветов в ваш проект с использованием Shadcn UI и Tailwind CSS, вы можете следовать официальной документации по темизации. Здесь описано, как добавлять новые цвета в ваш CSS-файл и файл `tailwind.config.js`, а также как использовать их в ваших компонентах.]({"attribution":{"attributableIndex":"1276-1"}}) agentId: string,
  bookingId: string,
  amount: number,
  status: CommissionStatus = "pending"
) {
  const data: Commission = {
    agentId,
    bookingId,
    amount,
    currency: "EUR",
    status,
    createdAt: serverTimestamp() as Timestamp,
    confirmedAt: status === "confirmed" ? (serverTimestamp() as Timestamp) : undefined,
    paidOut: false,
  };
  return await addDoc(commCol, data);
}

// подтвердить комиссию, обновив баланс агента
export async function confirmCommission(commissionId: string) {
  await runTransaction(db, async (tx) => {
    const commRef = doc(commCol, commissionId);
    const snap = await tx.get(commRef);
    if (!snap.exists()) throw new Error("Commission not found");

    const comm = snap.data() as Commission;
    if (comm.status !== "pending") return; // уже подтверждена/отменена

    const agentRef = doc(agentsCol, comm.agentId);
    const agentSnap = await tx.get(agentRef);
    if (!agentSnap.exists()) throw new Error("Agent not found");

    tx.update(commRef, {
      status: "confirmed",
      confirmedAt: serverTimestamp(),
    });
    tx.update(agentRef, {
      balanceAvailable: increment(comm.amount),
    });
  });
}

// отменить комиссию (если ещё не подтверждена)
export async function cancelCommission(commissionId: string) {
  const commRef = doc(commCol, commissionId);
  await updateDoc(commRef, { status: "cancelled" });
}

/* ---------- PAYOUTS ---------- */

// выплатить агенту сумму (<= доступного баланса)
export async function payAgent(
  agentId: string,
  amount: number,
  managerId: string,
  note = ""
) {
  await runTransaction(db, async (tx) => {
    const agentRef = doc(agentsCol, agentId);
    const agentSnap = await tx.get(agentRef);
    if (!agentSnap.exists()) throw new Error("Agent not found");
    const balance = (agentSnap.data().balanceAvailable as number) || 0;
    if (amount > balance) throw new Error("Недостаточный баланс");

    // получить все невыплаченные confirmed комиссии
    const q = query(
      commCol,
      where("agentId", "==", agentId),
      where("status", "==", "confirmed"),
      where("paidOut", "==", false)
    );
    const commSnap = await getDocs(q);
    const commissions = commSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Commission) }))
      .sort((a, b) => (a.confirmedAt?.seconds || 0) - (b.confirmedAt?.seconds || 0));

    let remaining = amount;
    const closedIds: string[] = [];

    for (const c of commissions) {
      if (remaining <= 0) break;
      // Комиссии закрываем целиком, пока хватает remaining
      if (remaining >= c.amount) {
        remaining -= c.amount;
        closedIds.push(c.id!);
        tx.update(doc(commCol, c.id!), { paidOut: true });
      } else {
        break; // хватит закрывать целиком
      }
    }

    // создаём запись выплаты
    const payoutData: Payout = {
      agentId,
      amount,
      currency: "EUR",
      date: serverTimestamp() as Timestamp,
      managerId,
      commissionIds: closedIds,
      note,
    };
    const payoutRef = await addDoc(payoutCol, payoutData);
    // проставить payoutId для закрытых комиссий
    closedIds.forEach((cid) =>
      tx.update(doc(commCol, cid), { payoutId: payoutRef.id })
    );

    // обновляем баланс агента
    tx.update(agentRef, { balanceAvailable: balance - amount });
  });
}

/* ---------- QUERIES ---------- */

export async function getAgentBalance(agentId: string) {
  const agentSnap = await getDoc(doc(agentsCol, agentId));
  return (agentSnap.data()?.balanceAvailable as number) || 0;
}

export async function getAgentCommissions(agentId: string) {
  const q = query(commCol, where("agentId", "==", agentId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Commission) }));
}

export async function getAgentPayouts(agentId: string) {
  const q = query(payoutCol, where("agentId", "==", agentId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Payout) }));
}

export async function getAllAgents() {
  const q = query(agentsCol, where("role", "==", "agent"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function getAllPayouts() {
  const snap = await getDocs(payoutCol);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Payout) }));
}