import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb, adminFs } from "@/lib/server/firebaseAdmin";

/** ===== helpers ===== */
type Currency = string;
type FxMap = Partial<Record<Currency, number>>; // 1 EUR = r(CCY)
const toLocalISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

function pickLatestFx(list: Array<{ id: string; rates?: FxMap }>) {
  if (!list.length) return null as null | { rates?: FxMap };
  const sorted = [...list].sort((a,b)=> (a.id < b.id ? 1 : -1));
  return sorted[0];
}

// convert amount using EUR as pivot. fx.rates: 1 EUR = r(CCY)
function convert(amount: number, from: Currency, to: Currency, fx: { rates?: FxMap } | null): number {
  if (!amount) return 0;
  if (from === to) return amount;
  const rates = fx?.rates;
  if (!rates) return 0;
  let eur = amount;
  if (from !== "EUR") {
    const rFrom = rates[from] || 0;
    if (!rFrom || rFrom <= 0) return 0;
    eur = amount / rFrom; // 1 CCY = 1/rFrom EUR
  }
  if (to === "EUR") return eur;
  const rTo = rates[to] || 0;
  if (!rTo || rTo <= 0) return 0;
  return eur * rTo;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  try {
    // читаем всё разом
    const [accSnap, txSnap, plannedSnap, catSnap, fxSnap] = await Promise.all([
      adminDb.collection("finance_accounts").get(),
      adminDb.collection("finance_transactions").get(),
      adminDb.collection("finance_planned").get(),
      adminDb.collection("finance_categories").get(),
      adminDb.collection("finance_fxRates").get(),
    ]);

    // карты имён
    const accMap = new Map<string, { name: string; currency: string; openingBalance: number; archived?: boolean }>();
    for (const d of accSnap.docs) {
      const v = d.data() as any;
      accMap.set(d.id, {
        name: String(v.name || d.id),
        currency: String(v.currency || "EUR"),
        openingBalance: Number(v.openingBalance || 0),
        archived: !!v.archived,
      });
    }
    const catMap = new Map<string, string>();
    for (const d of catSnap.docs) {
      const v = d.data() as any;
      catMap.set(d.id, String(v.name || d.id));
    }

    // FX
    const fxList = fxSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const latestFx = pickLatestFx(fxList);

    // ===== 1) Балансы по счетам =====
    // agg: accountId -> { amt (в валюте счёта), eur (в EUR) }
    const agg = new Map<string, { amt: number; eur: number }>();
    for (const [id, a] of accMap.entries()) {
      agg.set(id, {
        amt: Number(a.openingBalance || 0),
        eur: convert(Number(a.openingBalance || 0), a.currency, "EUR", latestFx),
      });
    }

    // транзакции: учитываем только actual/reconciled
    const txAll = txSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const txFact = txAll.filter(t => {
      const s = String(t.status || "actual").toLowerCase();
      return s === "actual" || s === "reconciled";
    });

    for (const t of txFact) {
      const type = String(t.type || "");
      const baseEUR = Math.abs(Number(t.baseAmount || 0));
      const amtVal  = Math.abs(Number(t.amount?.value || 0));
      const amtCcy  = String(t.amount?.currency || "EUR");

      if (type === "in") {
        const accId = String(t.accountId || "");
        const acc = accMap.get(accId);
        if (!acc) continue;
        const deltaAccCcy = convert(amtVal, amtCcy, acc.currency, latestFx);
        const prev = agg.get(accId) || { amt: 0, eur: 0 };
        agg.set(accId, { amt: prev.amt + deltaAccCcy, eur: prev.eur + baseEUR });
      } else if (type === "out") {
        const accId = String(t.accountId || "");
        const acc = accMap.get(accId);
        if (!acc) continue;
        const deltaAccCcy = convert(amtVal, amtCcy, acc.currency, latestFx);
        const prev = agg.get(accId) || { amt: 0, eur: 0 };
        agg.set(accId, { amt: prev.amt - deltaAccCcy, eur: prev.eur - baseEUR });
      } else if (type === "transfer") {
        const fromId = String(t.fromAccountId || "");
        const toId   = String(t.toAccountId   || "");
        if (fromId) {
          const from = accMap.get(fromId);
          if (from) {
            const deltaFrom = convert(amtVal, amtCcy, from.currency, latestFx);
            const prev = agg.get(fromId) || { amt: 0, eur: 0 };
            agg.set(fromId, { amt: prev.amt - deltaFrom, eur: prev.eur - baseEUR });
          }
        }
        if (toId) {
          const to = accMap.get(toId);
          if (to) {
            const deltaTo = convert(amtVal, amtCcy, to.currency, latestFx);
            const prev = agg.get(toId) || { amt: 0, eur: 0 };
            agg.set(toId, { amt: prev.amt + deltaTo, eur: prev.eur + baseEUR });
          }
        }
      }
    }

    const accounts = Array.from(agg.entries())
      .map(([id, v]) => ({
        id,
        name: accMap.get(id)?.name || id,
        currency: accMap.get(id)?.currency || "EUR",
        balAmt: +Number(v.amt).toFixed(2),
        balEur: +Number(v.eur).toFixed(2),
        archived: !!accMap.get(id)?.archived,
      }))
      .filter(r => !r.archived)
      .map(({ archived, ...rest }) => rest);

    const totalEur = +accounts.reduce((s, r) => s + (r.balEur || 0), 0).toFixed(2);

    // ===== 2) Потоки по дням =====
    const flowMap = new Map<string, { inflow: number; outflow: number }>();
    for (const t of txFact) {
      if (String(t.type || "") === "transfer") continue;
      const date = String(t.date || "").slice(0,10);
      const baseEUR = Math.abs(Number(t.baseAmount || 0));
      if (!date) continue;
      const entry = flowMap.get(date) || { inflow: 0, outflow: 0 };
      if (String(t.type || "") === "in") entry.inflow += baseEUR;
      else if (String(t.type || "") === "out") entry.outflow += baseEUR;
      flowMap.set(date, entry);
    }
    const flowDaily = Array.from(flowMap.entries())
      .map(([date, v]) => ({
        date,
        inflow: +Number(v.inflow).toFixed(2),
        outflow: +Number(v.outflow).toFixed(2),
        net: +Number(v.inflow - v.outflow).toFixed(2),
      }))
      .sort((a,b)=> (a.date < b.date ? -1 : 1));

    // ===== 3) Плановые (upcoming/overdue) =====
    const todayISO = toLocalISO(new Date());
    const plannedAll = plannedSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const plannedOpen = plannedAll.filter(p => !p.matchedTxId);

    const plannedUpcoming = plannedOpen
      .filter(p => String(p.date || "") >= todayISO)
      .sort((a,b)=> (a.date < b.date ? -1 : 1))
      .slice(0, 10)
      .map(p => ({
        id: p.id,
        date: String(p.date || ""),
        side: (p.side === "income" ? "income" : "expense") as "income"|"expense",
        amount: Number(p.amount || 0),
        currency: String(p.currency || "EUR"),
        eurAmount: Number(p.eurAmount || 0),
        accountName: p.accountName || (p.accountId ? accMap.get(String(p.accountId || ""))?.name : undefined),
        accountId: p.accountId || undefined,
        categoryName: p.categoryName || (p.categoryId ? catMap.get(String(p.categoryId || "")) : undefined),
        categoryId: p.categoryId || undefined,
      }));
    const plannedOverdue = plannedOpen
      .filter(p => String(p.date || "") < todayISO)
      .sort((a,b)=> (a.date < b.date ? -1 : 1))
      .slice(0, 10)
      .map(p => ({
        id: p.id,
        date: String(p.date || ""),
        side: (p.side === "income" ? "income" : "expense") as "income"|"expense",
        amount: Number(p.amount || 0),
        currency: String(p.currency || "EUR"),
        eurAmount: Number(p.eurAmount || 0),
        accountName: p.accountName || (p.accountId ? accMap.get(String(p.accountId || ""))?.name : undefined),
        accountId: p.accountId || undefined,
        categoryName: p.categoryName || (p.categoryId ? catMap.get(String(p.categoryId || "")) : undefined),
        categoryId: p.categoryId || undefined,
      }));

    const sumUpcoming = +plannedUpcoming.reduce((s,p)=> s + Number(p.eurAmount || 0), 0).toFixed(2);
    const sumOverdue  = +plannedOverdue.reduce((s,p)=> s + Number(p.eurAmount || 0), 0).toFixed(2);

    // ===== 4) Последние транзакции =====
    const recentTx = txFact
      .sort((a,b)=> (a.date < b.date ? 1 : -1))
      .slice(0, 10)
      .map(t => {
        const type = String(t.type || "");
        const status = String(t.status || "");
        const account =
          type === "transfer"
            ? "Перевод"
            : (t.accountId ? (accMap.get(String(t.accountId))?.name || String(t.accountId)) : "—");
        const category = t.categoryId ? (catMap.get(String(t.categoryId)) || String(t.categoryId)) : "—";
        const amountLabel = `${Number(t.amount?.value || 0).toFixed(2)} ${String(t.amount?.currency || "")}`;
        return {
          id: String(t.id || ""),
          date: String(t.date || "").slice(0,10),
          type: (type as "in"|"out"|"transfer"),
          status,
          account,
          category,
          amountLabel,
          eur: +Number(t.baseAmount || 0).toFixed(2),
          note: t.note || "",
        };
      });

    // ===== write cache =====
    await adminDb
      .collection("finance_overviewCache")
      .doc("summary")
      .set(
        {
          updatedAt: adminFs.FieldValue.serverTimestamp(),
          accounts,
          totalEur,
          flowDaily,
          plannedUpcoming,
          plannedOverdue,
          sumUpcoming,
          sumOverdue,
          recentTx,
        },
        { merge: true }
      );

    res.status(200).json({ ok: true, accounts: accounts.length, recentTx: recentTx.length });
  } catch (e: any) {
    console.error("[overview-cache/rebuild] error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}