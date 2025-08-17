// pages/api/finance/cache/build-accountDaily.ts
import type { NextApiRequest, NextApiResponse } from "next";
import * as admin from "firebase-admin";

// --- lazy init admin ---
if (admin.apps.length === 0) {
  try {
    admin.initializeApp({
      // если используете serviceAccount — здесь он подтянется из ENV / GOOGLE_APPLICATION_CREDENTIALS
      credential: admin.credential.applicationDefault(),
    });
  } catch (e) {
    // ignore re-init
  }
}
const adb = admin.firestore();

// helpers
const r2 = (n: number) => Math.round(n * 100) / 100;
const abs = (v: any) => Math.abs(Number(v) || 0);
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

type DayAgg = {
  planIncome: number;
  planExpense: number;
  planIncomeOverdue: number;
  planExpenseOverdue: number;
  planIncomeMatched: number;
  planExpenseMatched: number;
  actualIncome: number;
  actualExpense: number;
};

const emptyAgg = (): DayAgg => ({
  planIncome: 0,
  planExpense: 0,
  planIncomeOverdue: 0,
  planExpenseOverdue: 0,
  planIncomeMatched: 0,
  planExpenseMatched: 0,
  actualIncome: 0,
  actualExpense: 0,
});

// безопасно достаём токен из заголовка
function getBearer(req: NextApiRequest) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// подкачка ролей (разрешаем manager/superManager/admin — как просили)
async function assertRole(uid: string) {
  const udoc = await adb.collection("users").doc(uid).get();
  const role = udoc.exists ? (udoc.get("role") as string) : undefined;
  const ok = role === "manager" || role === "superManager" || role === "admin";
  if (!ok) {
    const err: any = new Error("forbidden");
    err.status = 403;
    throw err;
  }
}

// генерация списка дат между from..to (включительно)
function dateList(from: string, to: string): string[] {
  const s = new Date(from + "T00:00:00");
  const e = new Date(to + "T00:00:00");
  const out: string[] = [];
  for (let d = s; d <= e; d = new Date(d.getTime() + 86400000)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${dd}`);
  }
  return out;
}

// запрос с опциональным фильтром по статусу; при отсутствии индекса — фолбэк
async function txRangeWithOptionalStatus(
  field: "date" | "dueDate" | "actualDate",
  from: string,
  to: string,
  statusFilter:
    | null
    | { type: "eq"; value: string }
    | { type: "in"; values: string[] }
) {
  const col = adb.collection("finance_transactions");
  let q = col.where(field, ">=", from).where(field, "<=", to).orderBy(field, "asc");

  // сначала пробуем со статусом (может потребоваться индекс)
  try {
    let q2: FirebaseFirestore.Query = q;
    if (statusFilter?.type === "eq") q2 = q2.where("status", "==", statusFilter.value);
    if (statusFilter?.type === "in") q2 = q2.where("status", "in", statusFilter.values as any);

    return await q2.get();
  } catch (e: any) {
    const msg = String(e?.message || e);
    const needIndex =
      e?.code === 9 || msg.includes("FAILED_PRECONDITION") || msg.includes("requires an index");

    if (!needIndex) throw e;

    // Фолбэк: читаем без статуса и фильтруем после
    const snap = await q.get();
    const docs = snap.docs.filter((d) => {
      if (!statusFilter) return true;
      const st = d.get("status");
      if (statusFilter.type === "eq") return st === statusFilter.value;
      return (statusFilter.values as string[]).includes(st);
    });
    // имитируем Snapshot API
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
      forEach: (cb: any) => docs.forEach((dd) => cb(dd)),
    } as unknown as FirebaseFirestore.QuerySnapshot;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    // аутентификация
    const token = getBearer(req);
    if (!token) return res.status(401).json({ error: "No token" });
    const decoded = await admin.auth().verifyIdToken(token);
    await assertRole(decoded.uid);

    const from = (req.query.from as string) || (req.body?.from as string);
    const to = (req.query.to as string) || (req.body?.to as string);
    if (!from || !to) return res.status(400).json({ error: "from/to required (YYYY-MM-DD)" });

    // инициализируем карту всех дней диапазона нулевыми значениями
    const dayAgg = new Map<string, DayAgg>();
    for (const iso of dateList(from, to)) {
      dayAgg.set(iso, emptyAgg());
    }
    const ensure = (k: string) => {
      if (!dayAgg.has(k)) dayAgg.set(k, emptyAgg());
      return dayAgg.get(k)!;
    };

    const today = todayISO();

    // --- legacy planned ---
    const plannedSnap = await adb
      .collection("finance_planned")
      .where("date", ">=", from)
      .where("date", "<=", to)
      .orderBy("date", "asc")
      .get();

    plannedSnap.forEach((d) => {
      const v = d.data() as any;
      const key = String(v.date || "");
      if (!key) return;
      const side = v.side === "income" ? "income" : "expense";
      const amount = abs(v.eurAmount ?? v.amount ?? 0);
      const agg = ensure(key);

      const isMatched = !!v.matchedTxId;
      const isOverdue = !isMatched && key < today;

      if (side === "income") {
        agg.planIncome += amount;
        if (isOverdue) agg.planIncomeOverdue += amount;
        if (isMatched) agg.planIncomeMatched += amount;
      } else {
        agg.planExpense += amount;
        if (isOverdue) agg.planExpenseOverdue += amount;
        if (isMatched) agg.planExpenseMatched += amount;
      }
    });

    // --- planned in transactions (status=planned): dueDate & date — DEDUP по doc.id ---
    const tPlannedDue = await txRangeWithOptionalStatus("dueDate", from, to, {
      type: "eq",
      value: "planned",
    });
    const tPlannedDate = await txRangeWithOptionalStatus("date", from, to, {
      type: "eq",
      value: "planned",
    });

    const plannedDocs = new Map<string, any>();
    for (const snap of [tPlannedDue, tPlannedDate]) {
      snap.forEach((d) => plannedDocs.set(d.id, d.data()));
    }

    plannedDocs.forEach((t) => {
      if (t.type === "transfer") return;
      const key = (t.dueDate || t.date) as string;
      if (!key) return;
      const side = t.type === "in" ? "income" : "expense";
      const amount = abs(t.baseAmount ?? t.amount?.value ?? 0);
      const agg = ensure(key);
      const isOverdue = key < today;

      if (side === "income") {
        agg.planIncome += amount;
        if (isOverdue) agg.planIncomeOverdue += amount;
      } else {
        agg.planExpense += amount;
        if (isOverdue) agg.planExpenseOverdue += amount;
      }
    });

    // --- actual/reconciled transactions: actualDate & date — DEDUP по doc.id ---
    const statuses = ["actual", "reconciled"];
    const tActualActual = await txRangeWithOptionalStatus("actualDate", from, to, {
      type: "in",
      values: statuses,
    });
    const tActualDate = await txRangeWithOptionalStatus("date", from, to, {
      type: "in",
      values: statuses,
    });

    const actualDocs = new Map<string, any>();
    for (const snap of [tActualActual, tActualDate]) {
      snap.forEach((d) => actualDocs.set(d.id, d.data()));
    }

    actualDocs.forEach((t) => {
      if (t.type === "transfer") return;
      const key = (t.actualDate || t.date) as string;
      if (!key) return;
      const amount = abs(t.baseAmount ?? t.amount?.value ?? 0);
      const agg = ensure(key);
      if (t.type === "in") agg.actualIncome += amount;
      else agg.actualExpense += amount;
    });

    // --- запись в finance_accountDaily + мета ---
    const batch = adb.batch();
    const coll = adb.collection("finance_accountDaily");

    // помечаем «running»
    batch.set(
      adb.collection("finance_cacheMeta").doc("accountDaily"),
      {
        lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "running",
        range: { from, to },
      },
      { merge: true }
    );

    // пишем КАЖДЫЙ день в диапазоне (включая нули) — чтобы обнулять удалённые
    for (const [date, a] of dayAgg.entries()) {
      batch.set(
        coll.doc(date),
        {
          date,
          planIncome: r2(a.planIncome),
          planExpense: r2(a.planExpense),
          planIncomeOverdue: r2(a.planIncomeOverdue),
          planExpenseOverdue: r2(a.planExpenseOverdue),
          planIncomeMatched: r2(a.planIncomeMatched),
          planExpenseMatched: r2(a.planExpenseMatched),
          actualIncome: r2(a.actualIncome),
          actualExpense: r2(a.actualExpense),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // помечаем «done»
    batch.set(
      adb.collection("finance_cacheMeta").doc("accountDaily"),
      {
        lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "done",
        range: { from, to },
      },
      { merge: true }
    );

    await batch.commit();

    return res.status(200).json({
      ok: true,
      from,
      to,
      days: dayAgg.size,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(e?.status || 500).json({ error: msg });
  }
}