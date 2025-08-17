// pages/api/finance/cache/build-plMonthly.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

// --- init admin once ---
if (!getApps().length) {
  initializeApp({
    credential:
      process.env.FIREBASE_CONFIG
        ? cert(JSON.parse(process.env.FIREBASE_CONFIG as string))
        : applicationDefault(),
  });
}
const db = getFirestore();
// не сохранять undefined
try { db.settings({ ignoreUndefinedProperties: true }); } catch {}

const auth = getAuth();

/* ===== types & helpers ===== */
type Currency = "EUR" | "USD" | "RUB" | "TRY" | "AED" | "KZT" | string;
type TxDoc = {
  id: string;
  status?: "planned" | "actual" | "reconciled" | string;
  type?: "in" | "out" | "transfer" | string;
  date?: string;
  actualDate?: string;
  baseAmount?: number;
  amount?: { currency?: Currency; value?: number };
  categoryId?: string | null;
};
type Category = {
  id: string;
  name?: string;
  side?: "income" | "expense";
  isCogs?: boolean;
  plGroup?: string;
  kind?: string;
  type?: string;
};
type FxRates = { id: string; rates: Record<string, number> };

const abs = (v: any) => Math.abs(Number(v) || 0);
const ymOf = (iso: string) => (iso || "").slice(0, 7);
const clampISO = (s?: string) => (s || "").slice(0, 10);
const listMonths = (fromISO: string, toISO: string) => {
  const out: string[] = [];
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T00:00:00");
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
};

function pickFxForDate(list: FxRates[], d: string): FxRates | null {
  if (!list.length) return null;
  const exact = list.find((x) => x.id === d);
  if (exact) return exact;
  const older = [...list].filter((x) => x.id <= d).sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  return older || [...list].sort((a, b) => (a.id < b.id ? 1 : -1))[0] || null;
}
function convert(amount: number, from: Currency, to: Currency, fx: FxRates | null): number {
  if (!amount) return 0;
  if (from === to) return amount;
  if (!fx?.rates) return 0;
  let eur = amount;
  if (from !== "EUR") {
    const rFrom = fx.rates[from];
    if (!rFrom || rFrom <= 0) return 0;
    eur = amount / rFrom; // 1 EUR = r(CCY)
  }
  if (to === "EUR") return eur;
  const rTo = fx.rates[to];
  if (!rTo || rTo <= 0) return 0;
  return eur * rTo;
}

function classifyCategory(cat?: Partial<Category> | null, fallbackByType?: "in" | "out") {
  if (!cat) return fallbackByType === "in" ? "rev" : fallbackByType === "out" ? "opex" : "skip";
  const side = cat.side;
  if (side === "income") return "rev";
  if (side !== "expense") return "skip";
  const c: any = cat;
  if (c.isCogs === true || c.plGroup === "cogs" || c.kind === "cogs" || c.type === "cogs") return "cogs";
  const name = String(cat.name || "").toLowerCase();
  const hints = ["себестоимость","нетто","netto","net","internal","интернал","operator","оператор","supplier","поставщ","перевозчик","avia","авиа","отель","hotel","туроператор","оператору"];
  return hints.some((h) => name.includes(h)) ? "cogs" : "opex";
}

async function requireUser(req: NextApiRequest) {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer (.+)$/i);
  if (!m) throw Object.assign(new Error("No token"), { status: 401 });
  return auth.verifyIdToken(m[1]); // менеджеров тоже пускаем по токену
}

// универсальная санация: убираем undefined (в массиве станут null)
function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (v === undefined ? null : v)));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireUser(req);

    const from = clampISO((req.query.from as string) || req.body?.from);
    const to   = clampISO((req.query.to as string)   || req.body?.to);
    if (!from || !to) return res.status(400).json({ error: "Missing ?from=YYYY-MM-DD&to=YYYY-MM-DD" });

    // мета: running
    await db.collection("finance_cacheMeta").doc("plMonthly").set(
      { status: "running", range: { from, to }, lastRunAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    // справочники
    const catSnap = await db.collection("finance_categories").get();
    const catById = new Map<string, Category>();
    catSnap.forEach((d) => catById.set(d.id, { id: d.id, ...(d.data() as any) }));

    const fxSnap = await db.collection("finance_fxRates").get();
    const fxList: FxRates[] = fxSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // транзакции (две выборки и мердж)
    const q1 = await db.collection("finance_transactions")
      .where("actualDate", ">=", from).where("actualDate", "<=", to)
      .orderBy("actualDate", "asc").get();
    const q2 = await db.collection("finance_transactions")
      .where("date", ">=", from).where("date", "<=", to)
      .orderBy("date", "asc").get();

    const txById = new Map<string, TxDoc>();
    for (const d of q1.docs) txById.set(d.id, { id: d.id, ...(d.data() as any) });
    for (const d of q2.docs) if (!txById.has(d.id)) txById.set(d.id, { id: d.id, ...(d.data() as any) });

    // DEBUG корзины — строго без undefined
    const dbg = {
      counts: { totalFetched: txById.size, q1: q1.size, q2: q2.size },
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      amounts: { withBaseAmount: 0, fromAmountEUR: 0, convertedByFx: 0, couldNotConvert: 0 },
      includedAfterFilters: 0,
      sums: { rev: 0, cogs: 0, opex: 0 },
      sampleExcluded: [] as Array<{ id: string; status: string | null; type: string | null; reason: string }>,
    };

    const pushExcluded = (t: TxDoc, reason: string) => {
      if (dbg.sampleExcluded.length < 5) {
        dbg.sampleExcluded.push({
          id: t.id,
          status: (t.status ?? null) as any,
          type: (t.type ?? null) as any,
          reason,
        });
      }
    };

    type Agg = { revenue: number; cogs: number; opex: number };
    const agg = new Map<string, Agg>();

    for (const t of txById.values()) {
      dbg.byStatus[t.status || "undefined"] = (dbg.byStatus[t.status || "undefined"] || 0) + 1;
      dbg.byType[t.type || "undefined"] = (dbg.byType[t.type || "undefined"] || 0) + 1;

      const dateStr = (t.actualDate || t.date) || "";
      if (!dateStr || dateStr < from || dateStr > to) { pushExcluded(t, "date out of range"); continue; }

      const okStatus = t.status === "actual" || t.status === "reconciled";
      if (!okStatus) { pushExcluded(t, "status not actual/reconciled"); continue; }
      if (t.type === "transfer") { pushExcluded(t, "transfer excluded"); continue; }

      // EUR
      let eur = abs(t.baseAmount);
      if (eur) {
        dbg.amounts.withBaseAmount++;
      } else {
        const val = Number(t.amount?.value || 0);
        const ccy = (t.amount?.currency || "EUR") as Currency;
        if (val && ccy === "EUR") {
          eur = abs(val);
          dbg.amounts.fromAmountEUR++;
        } else if (val) {
          const fx = pickFxForDate(fxList, dateStr);
          const conv = convert(val, ccy, "EUR", fx);
          if (conv) { eur = abs(conv); dbg.amounts.convertedByFx++; }
          else { dbg.amounts.couldNotConvert++; }
        } else {
          dbg.amounts.couldNotConvert++;
        }
      }
      if (!eur) { pushExcluded(t, "no amount EUR"); continue; }

      const cat = t.categoryId ? catById.get(String(t.categoryId)) : undefined;
      const fallback = t.type === "in" ? "in" : t.type === "out" ? "out" : undefined;
      const cls = classifyCategory(cat, fallback);

      const ym = ymOf(dateStr);
      if (!agg.has(ym)) agg.set(ym, { revenue: 0, cogs: 0, opex: 0 });
      const a = agg.get(ym)!;
      if (cls === "rev") { a.revenue += eur; dbg.sums.rev += eur; }
      else if (cls === "cogs") { a.cogs += eur; dbg.sums.cogs += eur; }
      else if (cls === "opex") { a.opex += eur; dbg.sums.opex += eur; }

      dbg.includedAfterFilters++;
    }

    // запись месячных агрегатов
    const months = listMonths(from, to);
    const batch = db.batch();
    for (const ym of months) {
      const a = agg.get(ym) || { revenue: 0, cogs: 0, opex: 0 };
      const gross = a.revenue - a.cogs;
      const net = gross - a.opex;
      batch.set(
        db.collection("finance_plMonthly").doc(ym),
        {
          ym,
          revenue: +a.revenue.toFixed(2),
          cogs: +a.cogs.toFixed(2),
          opex: +a.opex.toFixed(2),
          gross: +gross.toFixed(2),
          net: +net.toFixed(2),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();

    // мета + debug (SANITIZE + очистить error)
    const safeDbg = sanitizeForFirestore(dbg);
    await db.collection("finance_cacheMeta").doc("plMonthly").set(
      {
        status: "done",
        lastRunAt: FieldValue.serverTimestamp(),
        range: { from, to },
        debug: safeDbg,
        error: FieldValue.delete(), // убрать старую ошибку
      },
      { merge: true }
    );

    return res.json({ ok: true, months: months.length, debug: safeDbg });
  } catch (e: any) {
    try {
      await db.collection("finance_cacheMeta").doc("plMonthly").set(
        {
          status: "error",
          lastRunAt: FieldValue.serverTimestamp(),
          error: String(e?.message || e),
        },
        { merge: true }
      );
    } catch {}
    return res.status(e?.status || 500).json({ error: e?.message || "Internal Server Error" });
  }
}