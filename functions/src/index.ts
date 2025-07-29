// functions/src/index.ts

import { logger, setGlobalOptions } from "firebase-functions";
import { onSchedule } from "firebase-functions/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

// ───────────────────────────────────────────────────────────
// Глобальные опции функций (регион/таймаут/память)
setGlobalOptions({
  region: "europe-west1",
  timeoutSeconds: 120,
  memory: "256MiB",
});

// Инициализация Admin SDK
initializeApp();
const db = getFirestore();

// ───────────────────────────────────────────────────────────
// УТИЛИТЫ РАБОТЫ С ДАТАМИ

/** Возвращает строку "dd.MM.yyyy" для вчерашней даты в указанном часовом поясе. */
function getYesterdayString(tz: string): string {
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const nowParts = fmt.formatToParts(new Date());
  const y = Number(nowParts.find((p) => p.type === "year")?.value);
  const m = Number(nowParts.find((p) => p.type === "month")?.value);
  const d = Number(nowParts.find((p) => p.type === "day")?.value);

  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const yesterdayUTC = new Date(utcMidnight.getTime() - 24 * 60 * 60 * 1000);

  const parts = fmt.formatToParts(yesterdayUTC);
  const yy = parts.find((p) => p.type === "year")?.value || "";
  const mm = parts.find((p) => p.type === "month")?.value || "";
  const dd = parts.find((p) => p.type === "day")?.value || "";
  return `${dd}.${mm}.${yy}`;
}

/** Нормализует дату из Firestore или строку в "dd.MM.yyyy". */
function normalizeToDDMMYYYY(input: unknown, tz: string): string | null {
  if (!input) return null;
  if (typeof input === "string") {
    const s = input.trim();
    const rex1 = /^(\d{2})\.(\d{2})\.(\d{4})$/;
    const m1 = s.match(rex1);
    if (m1) {
      const dd = +m1[1], mm = +m1[2], yyyy = +m1[3];
      return `${pad2(dd)}.${pad2(mm)}.${yyyy}`;
    }
    const rex2 = /^(\d{4})-(\d{2})-(\d{2})$/;
    const m2 = s.match(rex2);
    if (m2) {
      const yyyy = +m2[1], mm = +m2[2], dd = +m2[3];
      return `${pad2(dd)}.${pad2(mm)}.${yyyy}`;
    }
    return null;
  }
  if (isFirestoreTimestamp(input)) {
    return formatDateToTZ(input.toDate(), tz);
  }
  if (input instanceof Date && !isNaN(input.getTime())) {
    return formatDateToTZ(input, tz);
  }
  return null;
}

function isFirestoreTimestamp(v: any): v is Timestamp {
  return v && typeof v.toDate === "function";
}

function formatDateToTZ(d: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const parts = fmt.formatToParts(d);
  const yy = parts.find((p) => p.type === "year")?.value || "";
  const mm = parts.find((p) => p.type === "month")?.value || "";
  const dd = parts.find((p) => p.type === "day")?.value || "";
  return `${dd}.${mm}.${yy}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// ───────────────────────────────────────────────────────────
// ОСНОВНАЯ ЛОГИКА

async function completeYesterdayCheckouts() {
  const TZ = "Europe/Bucharest";
  const yesterday = getYesterdayString(TZ);
  logger.info(`[finish-cron] Target TZ=${TZ}, switching all checkOut ≤ ${yesterday}`);

  const snap = await db
    .collection("bookings")
    .where("status", "==", "confirmed")
    .get();

  let scanned = 0, updated = 0;
  const batch = db.batch();

  snap.forEach((docSnap) => {
    scanned++;
    const data = docSnap.data() as any;
    const norm = normalizeToDDMMYYYY(data.checkOut, TZ);
    if (norm && norm <= yesterday) {
      batch.update(docSnap.ref, {
        status: "finished",
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated++;
    }
  });

  if (updated > 0) {
    await batch.commit();
  }

  logger.info(`[finish-cron] scanned=${scanned}, updated=${updated}`);
  return { scanned, updated, yesterday };
}

// ───────────────────────────────────────────────────────────
// ПЛАНИРОВЩИК: запускаем ежедневно в 03:05 по Бухаресту

export const nightlyFinishBookings = onSchedule(
  "every day 03:05",
  async () => {
    try {
      const res = await completeYesterdayCheckouts();
      logger.info("[finish-cron] Done", res);
    } catch (e) {
      logger.error("[finish-cron] Error", e);
      throw e;
    }
  }
);