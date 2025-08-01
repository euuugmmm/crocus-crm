// pages/api/finish-bookings.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp, QueryDocumentSnapshot } from "firebase-admin/firestore";

/** Считываем сервис-аккаунт (как в других API-роутах проекта) */
function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])   return JSON.parse(Buffer.from(process.env[b64]!, "base64").toString("utf8"));
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

/** Инициализируем Admin SDK один раз */
if (!getApps().length) {
  initializeApp({
    credential: cert(
      getCred("FIREBASE_SERVICE_ACCOUNT_JSON", "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64")
    ),
  });
}

const db = getFirestore();

/* ───────────────────────────────────────────────────────────
 * Утилиты дат: сравнение в целочисленном формате YYYYMMDD
 * ─────────────────────────────────────────────────────────── */

function isTs(v: unknown): v is Timestamp {
  return !!v && typeof (v as Timestamp).toDate === "function";
}

function dateToYmdInt(d: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value || 0);
  const m = Number(parts.find((p) => p.type === "month")?.value || 0);
  const day = Number(parts.find((p) => p.type === "day")?.value || 0);
  return y * 10000 + m * 100 + day;
}

function ymdIntToDdMmYyyy(ymd: number): string {
  const y = Math.floor(ymd / 10000);
  const m = Math.floor((ymd % 10000) / 100);
  const d = ymd % 100;
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad2(d)}.${pad2(m)}.${y}`;
}

/** Нормализуем строку / Timestamp / Date → YYYYMMDD */
function toYmdInt(input: unknown, tz: string): number | null {
  if (!input) return null;

  if (typeof input === "string") {
    const s = input.trim();

    // dd.MM.yyyy
    const m1 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m1) {
      const dd = Number(m1[1]); const mm = Number(m1[2]); const yyyy = Number(m1[3]);
      return yyyy * 10000 + mm * 100 + dd;
    }

    // yyyy-MM-dd
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) {
      const yyyy = Number(m2[1]); const mm = Number(m2[2]); const dd = Number(m2[3]);
      return yyyy * 10000 + mm * 100 + dd;
    }

    return null;
  }

  if (isTs(input)) return dateToYmdInt(input.toDate(), tz);
  if (input instanceof Date && !isNaN(input.getTime())) return dateToYmdInt(input, tz);
  return null;
}

/** YYYYMMDD «сегодня» в заданном TZ */
function getTodayYmd(tz: string): number {
  return dateToYmdInt(new Date(), tz);
}

/* ───────────────────────────────────────────────────────────
 * Основная процедура: завершить все confirmed с checkOut ≤ порога
 * ─────────────────────────────────────────────────────────── */

type BookingData = {
  status?: string;
  checkOut?: unknown;
};

async function completeCheckoutsUpTo(thresholdYmd: number, tz: string) {
  // Статусы «подтверждено» (можно расширить списком при необходимости)
  const CONFIRMED = ["confirmed"];

  const snap = await db.collection("bookings")
    .where("status", "in", CONFIRMED)
    .get();

  let scanned = 0;
  let updated = 0;

  let batch = db.batch();
  let inBatch = 0;

  const commit = async () => {
    if (inBatch > 0) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  };

  snap.forEach((docSnap: QueryDocumentSnapshot) => {
    scanned++;
    const data = docSnap.data() as BookingData;
    const outYmd = toYmdInt(data.checkOut, tz);
    if (outYmd !== null && outYmd <= thresholdYmd) {
      batch.update(docSnap.ref, {
        status: "finished",
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated++;
      inBatch++;
      // при больших объёмах можно добавить порционный commit здесь
    }
  });

  await commit();
  return { scanned, updated, threshold: ymdIntToDdMmYyyy(thresholdYmd) };
}

/* ───────────────────────────────────────────────────────────
 * HTTP-эндпоинт для ручного запуска
 * POST /api/finish-bookings
 * body: { upTo?: "dd.MM.yyyy" | "yyyy-MM-dd" }  // опционально
 * ─────────────────────────────────────────────────────────── */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).send("Use POST");
    }

    const TZ = "Europe/Bucharest";
    const { upTo } = (req.body || {}) as { upTo?: string };

    // ✅ По умолчанию — СЕГОДНЯ по TZ
    const thresholdYmd =
      typeof upTo === "string" && upTo.trim()
        ? (() => {
            const y = toYmdInt(upTo.trim(), TZ);
            if (!y) throw new Error("Bad 'upTo' date format");
            return y;
          })()
        : getTodayYmd(TZ);

    const result = await completeCheckoutsUpTo(thresholdYmd, TZ);
    return res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[finish-bookings] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
}