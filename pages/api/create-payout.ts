// pages/api/create-payout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";

/* ───────────────── helpers ───────────────── */

function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])
    return JSON.parse(Buffer.from(process.env[b64]!, "base64").toString("utf8"));
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

const num = (v: any, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Удаляем undefined-поля, чтобы Firestore не ругался */
const prune = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/* ───────────────── firebase admin (singleton) ───────────────── */

let app: App;
if (!getApps().length) {
  app = initializeApp({
    credential: cert(
      getCred(
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64"
      )
    ),
  });
} else {
  app = getApps()[0]!;
}
const db: Firestore = getFirestore(app);

/* ───────────────── config (по умолчанию) ─────────────────
   AGENT_TAX_PCT — доля удержания из комиссии (например, 0.12 = 12%)
---------------------------------------------------------------- */
const DEFAULT_TAX_PCT = (() => {
  const v = parseFloat(process.env.AGENT_TAX_PCT || "");
  return Number.isFinite(v) ? v : 0.12;
})();

/* ───────────────── handler ───────────────── */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const {
      agentId,
      bookings, // старый режим: ["bookingId1", "bookingId2"]
      items,    // новый режим: [{ bookingId, amount, closeFully? }]
      comment,
      taxPct,         // опционально переопределить % удержания (0..0.5)
      transferFee,    // опциональная фикс. комиссия (SWIFT и т.п.), списывается с нетто
      annexNote,      // опциональная заметка для аннекса (если не задана — возьмём comment)
    }: {
      agentId?: string;
      bookings?: string[];
      items?: { bookingId: string; amount: number; closeFully?: boolean }[];
      comment?: string;
      taxPct?: number;
      transferFee?: number;
      annexNote?: string;
    } = req.body || {};

    if (!agentId) {
      return res.status(400).json({ error: "agentId is required" });
    }

    const _taxPct = Math.min(Math.max(num(taxPct, DEFAULT_TAX_PCT), 0), 0.5);
    const _transferFee = round2(Math.max(0, num(transferFee, 0)));
    const _comment = comment || "";
    const _annexNote = annexNote || _comment;

    /****************************************************************
     * НОВЫЙ РЕЖИМ: частичные выплаты по items[{bookingId, amount, closeFully?}]
     ****************************************************************/
    if (Array.isArray(items) && items.length > 0) {
      // Загружаем заявки пачкой
      const snaps = await Promise.all(
        items.map((it) => db.doc(`bookings/${it.bookingId}`).get())
      );

      type Upd = {
        bookingId: string;
        payGross: number;
        beforePaidGross: number;
        afterPaidGross: number;
        commissionGross: number;
        closeFully?: boolean;
        fullyPaidFlag: boolean;
      };

      const updates: Upd[] = [];
      let totalGross = 0;

      for (let i = 0; i < items.length; i++) {
        const snap = snaps[i];
        if (!snap.exists) continue;

        const incoming = items[i];
        const data = snap.data() as any;

        const commissionGross = num(data.commission, 0);            // брутто-комиссия по брони
        const alreadyPaidGross = num(data.commissionPaidAmount, 0); // брутто уже выплачено
        const remaining = Math.max(0, commissionGross - alreadyPaidGross);

        const desired = Math.max(0, num(incoming.amount, 0));       // сколько хотим выплатить (брутто)
        const payGross = Math.min(remaining, desired);

        const closeFully =
          typeof incoming.closeFully === "boolean" ? incoming.closeFully : undefined;

        // если нечего платить и не просили закрыть полностью — пропускаем
        if (payGross <= 0 && !closeFully) continue;

        const beforePaidGross = alreadyPaidGross;
        const afterPaidGross = round2(alreadyPaidGross + payGross);

        const fullyPaidFlag =
          closeFully === true ? true : afterPaidGross >= commissionGross - 0.01;

        updates.push({
          bookingId: incoming.bookingId,
          payGross,
          beforePaidGross,
          afterPaidGross,
          commissionGross,
          closeFully,
          fullyPaidFlag,
        });

        totalGross += payGross;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          error:
            "No payable items (amounts are zero or exceeded remaining, and no closeFully flags)",
        });
      }

      // Итоги выплаты
      const taxWithheld = round2(totalGross * _taxPct);                  // удержанный налог с брутто
      const amountNet = round2(totalGross - taxWithheld - _transferFee); // к перечислению

      // payout документ
      const payoutRef = await db.collection("payouts").add(
        prune({
          agentId,
          amount: totalGross,            // legacy: брутто
          amountGross: totalGross,       // брутто
          amountNet,                     // нетто к перечислению
          taxWithheld,                   // удержано налога
          taxPct: _taxPct,               // ставка
          transferFee: _transferFee,     // комиссия за перевод
          comment: _comment,
          annexNote: _annexNote,
          items: updates.map((u) =>
            prune({
              bookingId: u.bookingId,
              amountGross: u.payGross,
              amountNet: round2(u.payGross - u.payGross * _taxPct), // нетто по позиции (без transferFee)
              beforePaidGross: u.beforePaidGross,
              afterPaidGross: u.afterPaidGross,
              commissionGross: u.commissionGross,
              closeFully: typeof u.closeFully === "boolean" ? u.closeFully : undefined,
              fullyPaid: u.fullyPaidFlag,
            })
          ),
          createdAt: FieldValue.serverTimestamp(),
        })
      );

      // Обновляем брони батчем (брутто-счётчики)
      const batch = db.batch();
      updates.forEach((u) => {
        batch.update(db.doc(`bookings/${u.bookingId}`), prune({
          commissionPaidAmount: FieldValue.increment(u.payGross),
          commissionPaid: u.fullyPaidFlag,
          payoutId: payoutRef.id,
        }));
      });
      await batch.commit();

      return res.status(200).json({
        payoutId: payoutRef.id,
        amountGross: totalGross,
        amountNet,
        taxWithheld,
        items: updates.length,
      });
    }

    /****************************************************************
     * СТАРЫЙ РЕЖИМ: bookings[] — выплатить ПОЛНЫЙ ОСТАТОК по броням
     ****************************************************************/
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return res
        .status(400)
        .json({ error: "Provide items[] (new mode) or bookings[] (old mode)" });
    }

    const snapsOld = await Promise.all(
      bookings.map((id) => db.doc(`bookings/${id}`).get())
    );

    type UpdOld = {
      bookingId: string;
      payGross: number;
      beforePaidGross: number;
      afterPaidGross: number;
      commissionGross: number;
    };

    const updatesOld: UpdOld[] = [];
    let totalGrossOld = 0;

    for (const snap of snapsOld) {
      if (!snap.exists) continue;
      const data = snap.data() as any;
      const commissionGross = num(data.commission, 0);
      const alreadyPaidGross = num(data.commissionPaidAmount, 0);
      const remaining = Math.max(0, commissionGross - alreadyPaidGross);

      if (remaining <= 0) continue;

      updatesOld.push({
        bookingId: snap.id,
        payGross: remaining,
        beforePaidGross: alreadyPaidGross,
        afterPaidGross: round2(alreadyPaidGross + remaining),
        commissionGross,
      });
      totalGrossOld += remaining;
    }

    if (updatesOld.length === 0) {
      return res.status(400).json({ error: "Nothing to pay (no remaining commissions)" });
    }

    const taxWithheldOld = round2(totalGrossOld * _taxPct);
    const amountNetOld = round2(totalGrossOld - taxWithheldOld - _transferFee);

    const payoutRefOld = await db.collection("payouts").add(
      prune({
        agentId,
        amount: totalGrossOld,
        amountGross: totalGrossOld,
        amountNet: amountNetOld,
        taxWithheld: taxWithheldOld,
        taxPct: _taxPct,
        transferFee: _transferFee,
        comment: _comment,
        annexNote: _annexNote,
        items: updatesOld.map((u) =>
          prune({
            bookingId: u.bookingId,
            amountGross: u.payGross,
            amountNet: round2(u.payGross - u.payGross * _taxPct),
            beforePaidGross: u.beforePaidGross,
            afterPaidGross: u.afterPaidGross,
            commissionGross: u.commissionGross,
            fullyPaid: true,
          })
        ),
        createdAt: FieldValue.serverTimestamp(),
      })
    );

    const batchOld = db.batch();
    updatesOld.forEach((u) => {
      batchOld.update(db.doc(`bookings/${u.bookingId}`), {
        commissionPaidAmount: FieldValue.increment(u.payGross),
        commissionPaid: true,
        payoutId: payoutRefOld.id,
      });
    });
    await batchOld.commit();

    return res.status(200).json({
      payoutId: payoutRefOld.id,
      amountGross: totalGrossOld,
      amountNet: amountNetOld,
      taxWithheld: taxWithheldOld,
      items: updatesOld.length,
    });
  } catch (e: any) {
    console.error("create-payout error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}