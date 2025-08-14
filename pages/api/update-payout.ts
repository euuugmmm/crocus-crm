// pages/api/update-payout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64]) {
    return JSON.parse(Buffer.from(process.env[b64]!, "base64").toString("utf8"));
  }
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

if (!getApps().length) {
  initializeApp({
    credential: cert(
      getCred("FIREBASE_SERVICE_ACCOUNT_JSON", "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64")
    ),
  });
}

const db = getFirestore();

const num = (v: any, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const r2 = (x: number) => Math.round(x * 100) / 100;
const toLocalISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const next25th = (base = new Date()) => {
  const d = new Date(base);
  d.setMonth(d.getMonth() + 1);
  const target = new Date(d.getFullYear(), d.getMonth(), 25);
  return toLocalISO(target);
};

async function getAgentLabel(agentId: string) {
  try {
    const us = await db.doc(`users/${agentId}`).get();
    if (!us.exists) return { label: "—", agencyName: "—", agentName: "—" };
    const u = us.data() as any;
    const agencyName = u.agencyName || u.agentAgency || "—";
    const agentName = u.agentName || u.name || "—";
    return { label: `${agencyName} — ${agentName}`, agencyName, agentName };
  } catch {
    return { label: "—", agencyName: "—", agentName: "—" };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const {
      payoutId,
      transferFee,   // число
      comment,       // строка
      withholdPct,   // число (например 0.12)
      items,         // [{bookingId, amountGross, closeFully}]
      foundersDistribution, // опционально — игнорируется здесь
    } = req.body as {
      payoutId: string;
      transferFee?: number;
      comment?: string;
      withholdPct?: number;
      items?: Array<{ bookingId: string; amountGross: number; closeFully?: boolean }>;
      foundersDistribution?: any;
    };

    if (!payoutId) return res.status(400).json({ error: "payoutId is required" });

    const pRef = db.collection("payouts").doc(String(payoutId));
    const pSnap = await pRef.get();
    if (!pSnap.exists) return res.status(404).json({ error: "Payout not found" });

    const pData = pSnap.data() as any;
    const agentId: string = pData.agentId;
    const agentMeta = await getAgentLabel(agentId);

    const oldTransferFee = r2(num(pData.transferFee, 0));
    const oldWithholdPct = typeof pData.withholdPct === "number" ? Number(pData.withholdPct) : 0.12;
    const pct = typeof withholdPct === "number" ? Number(withholdPct) : oldWithholdPct;
    const toNet = (g: number) => r2(Math.max(0, g * (1 - pct)));

    const oldItems: Array<any> = Array.isArray(pData.items) ? pData.items : [];
    const oldMap = new Map<string, any>();
    oldItems.forEach((it) => oldMap.set(String(it.bookingId), it));

    const newMap = new Map<string, { bookingId: string; amountGross: number; closeFully?: boolean }>();
    (items || []).forEach((it) =>
      newMap.set(String(it.bookingId), {
        bookingId: String(it.bookingId),
        amountGross: r2(num(it.amountGross, 0)),
        closeFully: !!it.closeFully,
      })
    );

    const allBookingIds = new Set<string>([
      ...Array.from(oldMap.keys()),
      ...Array.from(newMap.keys()),
    ]);

    // агрегаты новых позиций
    let newTotalGross = 0;
    const newItemsToStore: any[] = [];
    for (const [bid, newIt] of Array.from(newMap.entries())) {
      newTotalGross = r2(newTotalGross + newIt.amountGross);
      const row: any = {
        bookingId: bid,
        amountGross: newIt.amountGross,
        amountNet: toNet(newIt.amountGross),
      };
      if (newIt.closeFully) row.closeFully = true;
      newItemsToStore.push(row);
    }
    // если items не прислали — оставляем существующие
    if (!items) {
      newTotalGross = r2(num(pData.totalGross, oldItems.reduce((s, it) => s + num(it.amountGross, 0), 0)));
      newItemsToStore.splice(0, newItemsToStore.length, ...oldItems);
    }

    const newTotalNet = r2(toNet(newTotalGross));
    const newTransferFee = r2(Math.max(0, num(transferFee, oldTransferFee)));
    const newFact = r2(Math.max(0, newTotalNet - newTransferFee));
    const taxPlannedAmount = r2(Math.max(0, newTotalGross - newTotalNet));

    // обновляем брони по дельте, только если items прислали
    if (items) {
      await Promise.all(
        Array.from(allBookingIds).map(async (bid) => {
          const oldIt = oldMap.get(bid);
          const newIt = newMap.get(bid);
          if (!oldIt && !newIt) return;

          const ref = db.doc(`bookings/${bid}`);
          await db.runTransaction(async (tx) => {
            const bs = await tx.get(ref);
            if (!bs.exists) return;
            const b = bs.data() as any;

            const commissionGross = r2(num(b.commissionGross ?? b.commission ?? b.agentCommission, oldIt?.commissionGross ?? 0));
            const paidGrossCur = r2(num(b.commissionPaidGrossAmount, 0));
            const paidNetCur   = r2(num(b.commissionPaidNetAmount ?? b.commissionPaidAmount, 0));

            const oldGross = r2(num(oldIt?.amountGross, 0));
            const newGross = r2(num(newIt?.amountGross, 0));
            const deltaGross = r2(newGross - oldGross);

            let newPaidGross = paidGrossCur;
            let newPaidNet   = paidNetCur;

            if (deltaGross !== 0) {
              if (deltaGross > 0) {
                newPaidGross = r2(Math.min(commissionGross, paidGrossCur + deltaGross));
                newPaidNet   = r2(Math.min(toNet(commissionGross), paidNetCur + toNet(deltaGross)));
              } else {
                const decG = Math.min(Math.abs(deltaGross), paidGrossCur);
                const decN = Math.min(toNet(Math.abs(deltaGross)), paidNetCur);
                newPaidGross = r2(Math.max(0, paidGrossCur - decG));
                newPaidNet   = r2(Math.max(0, paidNetCur   - decN));
              }
            }

            const closeFully = !!(newIt?.closeFully);
            const fullyPaid = closeFully || newPaidGross >= r2(Math.max(0, commissionGross - 0.01));

            const upd: any = {
              commissionPaidGrossAmount: newPaidGross,
              commissionPaidNetAmount: newPaidNet,
              commissionPaid: fullyPaid,
              updatedAt: FieldValue.serverTimestamp(),
            };

            tx.update(ref, upd);
          });
        })
      );
    }

    // сбрасываем только файл/линк anexa (номер не трогаем)
    const unsetAnnex: any = {
      annexLink: FieldValue.delete(),
      annexPath: FieldValue.delete(),
    };

    await pRef.update({
      items: newItemsToStore,
      totalGross: newTotalGross,
      totalNet: newTotalNet,
      transferFee: newTransferFee,
      amount: newFact,
      comment: comment ?? pData.comment ?? "",
      withholdPct: pct,
      updatedAt: FieldValue.serverTimestamp(),
      ...unsetAnnex,
    });

    // ─────────────────────────────
    // upsert ПЛАНОВЫЕ транзакции
    // ─────────────────────────────
    const txNetId: string | undefined = pData.txNetId;
    const txTaxPlanId: string | undefined = pData.txTaxPlanId;

    // даты: если транзакция уже есть — оставляем её дату; если нет — ставим дефолт
    const nowISO = toLocalISO(new Date());
    const defaultTaxDate = pData.createdAt?.toDate
      ? next25th(pData.createdAt.toDate())
      : next25th(new Date());

    // NET (план)
    let netDateISO = nowISO;
    if (txNetId) {
      const s = await db.doc(`finance_transactions/${txNetId}`).get();
      if (s.exists) {
        const v = s.data() as any;
        netDateISO = v?.date || nowISO;
        await s.ref.update({
          status: "planned",
          side: "expense",
          baseCurrency: "EUR",
          baseAmount: r2(newFact),
          title: `Agent payout planned (net) — ${agentMeta.label}`,
          categoryName: "Agent payout (planned)",
          counterpartyName: agentMeta.label,
          payoutId,
          agentId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const ref = await db.collection("finance_transactions").add({
          status: "planned",
          side: "expense",
          date: netDateISO,
          baseCurrency: "EUR",
          baseAmount: r2(newFact),
          title: `Agent payout planned (net) — ${agentMeta.label}`,
          categoryName: "Agent payout (planned)",
          counterpartyName: agentMeta.label,
          payoutId,
          agentId,
          createdAt: FieldValue.serverTimestamp(),
        });
        await pRef.update({ txNetId: ref.id });
      }
    } else {
      const ref = await db.collection("finance_transactions").add({
        status: "planned",
        side: "expense",
        date: netDateISO,
        baseCurrency: "EUR",
        baseAmount: r2(newFact),
        title: `Agent payout planned (net) — ${agentMeta.label}`,
        categoryName: "Agent payout (planned)",
        counterpartyName: agentMeta.label,
        payoutId,
        agentId,
        createdAt: FieldValue.serverTimestamp(),
      });
      await pRef.update({ txNetId: ref.id });
    }

    // TAX (план)
    let taxDateISO = defaultTaxDate;
    if (txTaxPlanId) {
      const s = await db.doc(`finance_transactions/${txTaxPlanId}`).get();
      if (s.exists) {
        const v = s.data() as any;
        taxDateISO = v?.date || defaultTaxDate;
        await s.ref.update({
          status: "planned",
          side: "expense",
          baseCurrency: "EUR",
          baseAmount: r2(Math.max(0, newTotalGross - newTotalNet)),
          title: `Agent payout tax planned (gross-net) — ${agentMeta.label}`,
          categoryName: "Agent payout tax planned (gross-net)",
          counterpartyName: agentMeta.label,
          payoutId,
          agentId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const ref = await db.collection("finance_transactions").add({
          status: "planned",
          side: "expense",
          date: taxDateISO,
          baseCurrency: "EUR",
          baseAmount: r2(Math.max(0, newTotalGross - newTotalNet)),
          title: `Agent payout tax planned (gross-net) — ${agentMeta.label}`,
          categoryName: "Agent payout tax planned (gross-net)",
          counterpartyName: agentMeta.label,
          payoutId,
          agentId,
          createdAt: FieldValue.serverTimestamp(),
        });
        await pRef.update({ txTaxPlanId: ref.id });
      }
    } else {
      const ref = await db.collection("finance_transactions").add({
        status: "planned",
        side: "expense",
        date: taxDateISO,
        baseCurrency: "EUR",
        baseAmount: r2(Math.max(0, newTotalGross - newTotalNet)),
        title: `Agent payout tax planned (gross-net) — ${agentMeta.label}`,
        categoryName: "Agent payout tax planned (gross-net)",
        counterpartyName: agentMeta.label,
        payoutId,
        agentId,
        createdAt: FieldValue.serverTimestamp(),
      });
      await pRef.update({ txTaxPlanId: ref.id });
    }

    // удаляем старый файл anexa, если был
    try {
      if (pData.annexPath) {
        await getStorage().bucket().file(String(pData.annexPath)).delete({ ignoreNotFound: true });
      }
    } catch {
      // не критично
    }

    return res.status(200).json({
      ok: true,
      payoutId,
      totalGross: newTotalGross,
      amount: newFact,
    });
  } catch (e: any) {
    console.error("update-payout error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}