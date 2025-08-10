// pages/api/delete-payout-deep.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64]) {
    return JSON.parse(
      Buffer.from(process.env[b64]!, "base64").toString("utf8")
    );
  }
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

if (!getApps().length) {
  initializeApp({
    credential: cert(
      getCred(
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64"
      )
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
    const { payoutId } = (req.body || {}) as { payoutId?: string };
    if (!payoutId) return res.status(400).json({ error: "payoutId is required" });

    const payoutRef = db.collection("payouts").doc(String(payoutId));
    const snap = await payoutRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Payout not found" });
    const data = snap.data() as any;

    const agentId: string = data.agentId;
    const mode: string = data.mode || "byBookings";
    const withholdPct: number = num(data.withholdPct, 0.12);
    const transferFee: number = num(data.transferFee, 0);
    const totalGross: number = r2(num(data.totalGross, 0));
    const totalNet: number = r2(num(data.totalNet, Math.max(0, totalGross * (1 - withholdPct))));
    const amountFact: number = r2(num(data.amount, Math.max(0, totalNet - transferFee)));

    const items: Array<{
      bookingId: string;
      amountGross?: number;
      amountNet?: number;
      closeFully?: boolean;
      beforePaidGross?: number;
      afterPaidGross?: number;
      commissionGross?: number;
    }> = Array.isArray(data.items) ? data.items : [];

    const toNet = (g: number) => r2(Math.max(0, g * (1 - withholdPct)));

    // 1) Откатываем bookings — используем snapshot beforePaidGross, если он есть
    if (mode !== "free" && items.length > 0) {
      await Promise.all(
        items.map(async (it) => {
          const bid = String(it.bookingId);
          const ref = db.doc(`bookings/${bid}`);
          await db.runTransaction(async (tx) => {
            const bs = await tx.get(ref);
            if (!bs.exists) return;

            const b = bs.data() as any;
            const paidGross = r2(num(b.commissionPaidGrossAmount, 0));
            const paidNet   = r2(num(b.commissionPaidNetAmount ?? b.commissionPaidAmount, 0));

            const grossDec = r2(num(it.amountGross, 0));
            const netDec   = r2(num(it.amountNet, toNet(grossDec)));

            // rollback к "до выплаты", если был сохранён снимок
            const beforeGross = r2(num(it.beforePaidGross, NaN));
            let newPaidGross = Number.isFinite(beforeGross)
              ? Math.max(0, beforeGross)
              : Math.max(0, r2(paidGross - grossDec));
            let newPaidNet = Number.isFinite(beforeGross)
              ? toNet(Math.max(0, beforeGross))
              : Math.max(0, r2(paidNet - netDec));

            const commissionGross = r2(num(b.commissionGross ?? b.commission ?? it.commissionGross, 0));
            const fully = newPaidGross >= r2(commissionGross - 0.01);

            const upd: any = {
              commissionPaidGrossAmount: newPaidGross,
              commissionPaidNetAmount: newPaidNet,
              commissionPaid: fully,
              updatedAt: FieldValue.serverTimestamp(),
            };

            if (b.payoutId === payoutId) {
              upd.payoutId = FieldValue.delete();
            }

            tx.update(ref, upd);
          });
        })
      );
    }

    // 1.b Fallback: зачистить payoutId в бронях, если где-то остался хвост
    try {
      const q = await db.collection("bookings").where("payoutId", "==", payoutId).get();
      if (!q.empty) {
        const batch = db.batch();
        q.docs.forEach((d) =>
          batch.update(d.ref, {
            payoutId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        );
        await batch.commit();
      }
    } catch {}

    // 2) Возвращаем баланс агента (добавляем назад факт)
    if (agentId && amountFact) {
      await db
        .doc(`users/${agentId}`)
        .update({
          balance: FieldValue.increment(amountFact),
          updatedAt: FieldValue.serverTimestamp(),
        })
        .catch(() => null);
    }

    // 3) Удаляем файл анексы (если был), чистим ссылку и путь
    let annexDeleted = false;
    try {
      if (data.annexPath) {
        await getStorage().bucket().file(String(data.annexPath)).delete({ ignoreNotFound: true });
        annexDeleted = true;
      }
    } catch {
      // не критично
    }

    // 4) Откатываем счётчик Anexa, если это именно последняя выданная
    let annexCounterRolledBack = false;
    try {
      const seq = num(data.annexSeq, 0);
      const path = data.annexCounterPath ? String(data.annexCounterPath) : null;
      if (seq > 0 && path) {
        const counterRef = db.doc(path);
        await db.runTransaction(async (tx) => {
          const cs = await tx.get(counterRef);
          if (!cs.exists) return;
          const cur = num(cs.data()?.value, 0);
          if (cur === seq) {
            tx.update(counterRef, { value: cur - 1, updatedAt: FieldValue.serverTimestamp() });
            annexCounterRolledBack = true;
          }
        });
      }
    } catch {
      // не критично
    }

    // 5) Удаляем сам документ выплаты
    await payoutRef.delete();

    return res.status(200).json({
      ok: true,
      payoutId,
      mode,
      bookingsUpdated: items.length,
      balanceRestored: amountFact,
      annexDeleted,
      annexCounterRolledBack,
    });
  } catch (e: any) {
    console.error("delete-payout-deep error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}