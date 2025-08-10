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
    } = req.body as {
      payoutId: string;
      transferFee?: number;
      comment?: string;
      withholdPct?: number;
      items: Array<{ bookingId: string; amountGross: number; closeFully?: boolean }>;
    };

    if (!payoutId) return res.status(400).json({ error: "payoutId is required" });

    const pRef = db.collection("payouts").doc(String(payoutId));
    const pSnap = await pRef.get();
    if (!pSnap.exists) return res.status(404).json({ error: "Payout not found" });

    const pData = pSnap.data() as any;
    const agentId: string = pData.agentId;
    const oldTransferFee = r2(num(pData.transferFee, 0));
    const oldWithholdPct = r2(num(pData.withholdPct, withholdPct ?? 0.12));
    const oldItems: Array<any> = Array.isArray(pData.items) ? pData.items : [];

    const pct = typeof withholdPct === "number" ? Number(withholdPct) : oldWithholdPct;
    const toNet = (g: number) => r2(Math.max(0, g * (1 - pct)));

    // индексы старых/новых
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
    const newTotalNet = r2(toNet(newTotalGross));
    const newTransferFee = r2(Math.max(0, num(transferFee, oldTransferFee)));
    const newFact = r2(Math.max(0, newTotalNet - newTransferFee));

    // агрегаты старых
    const oldTotalGross = r2(num(pData.totalGross, oldItems.reduce((s, it) => s + num(it.amountGross, 0), 0)));
    const oldTotalNet = r2(num(pData.totalNet, toNet(oldTotalGross)));
    const oldFact = r2(num(pData.amount, Math.max(0, oldTotalNet - oldTransferFee)));

    // дельта по факту
    const factDelta = r2(newFact - oldFact);

    // обновляем брони по дельте
    await Promise.all(
      Array.from(allBookingIds).map(async (bid) => {
        const oldIt = oldMap.get(bid);
        const newIt = newMap.get(bid);

        const ref = db.doc(`bookings/${bid}`);
        await db.runTransaction(async (tx) => {
          const bs = await tx.get(ref);
          if (!bs.exists) return;
          const b = bs.data() as any;

          const commissionGross = r2(num(b.commissionGross ?? b.commission ?? b.agentCommission, oldIt?.commissionGross ?? 0));
          const paidGrossCur = r2(num(b.commissionPaidGrossAmount, 0));
          const paidNetCur   = r2(num(b.commissionPaidNetAmount ?? b.commissionPaidAmount, 0)); // читаем, но писать не будем в legacy

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

    // сбрасываем только файл/линк анексы (номер не трогаем)
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

    // правим баланс на дельту факта
    if (agentId && factDelta !== 0) {
      await db.doc(`users/${agentId}`).update({
        balance: FieldValue.increment(-factDelta),
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => null);
    }

    // удаляем старый файл анексы, если был
    try {
      if (pData.annexPath) {
        await getStorage().bucket().file(String(pData.annexPath)).delete({ ignoreNotFound: true });
      }
    } catch {
      // не критично
    }

    return res.status(200).json({ ok: true, payoutId, totalGross: newTotalGross, amount: newFact });
  } catch (e: any) {
    console.error("update-payout error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}