// functions/src/index.ts
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
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

/** Возвращает объект Date, соответствующий «вчера» в часовом поясе tz. */
function getYesterdayDate(tz: string): Date {
  // Текущая дата в TZ
  const now = new Date();
  const tzString = now.toLocaleString("en-US", { timeZone: tz });
  const tzDate = new Date(tzString);
  // Минус один день
  tzDate.setDate(tzDate.getDate() - 1);
  // Обнуляем время
  tzDate.setHours(0, 0, 0, 0);
  return tzDate;
}

/** Преобразует dd.MM.yyyy или yyyy-MM-dd или Timestamp в JS Date (00:00 TZ). */
function parseToDate(input: unknown, tz: string): Date | null {
  if (!input) return null;

  // Firestore Timestamp
  if (typeof (input as any)?.toDate === "function") {
    const d = (input as any).toDate() as Date;
    return new Date(d.toLocaleString("en-US", { timeZone: tz }));
  }

  // Строка
  if (typeof input === "string") {
    const s = input.trim();
    // dd.MM.yyyy
    let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) {
      const [ , dd, mm, yyyy ] = m;
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00${getTZOffset(tz)}`);
    }
    // yyyy-MM-dd
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [ , yyyy, mm, dd ] = m;
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00${getTZOffset(tz)}`);
    }
  }

  return null;
}

/** Возвращает смещение часового пояса в формате ±HH:MM для включения в ISO-строку. */
function getTZOffset(tz: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
  const parts = dtf.formatToParts(new Date());
  const hour = Number(parts.find(p => p.type === "hour")?.value);
  const minute = Number(parts.find(p => p.type === "minute")?.value);
  const offsetMinutes = hour * 60 + minute;
  // Определяем знак по сравнению с UTC
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

// ───────────────────────────────────────────────────────────
// ОСНОВНАЯ ЛОГИКА

/**
 * Проходит по всем бронированиям со статусом "confirmed"
 * и переводит в "finished", если их checkOut был вчера или раньше.
 */
async function completeYesterdayCheckouts() {
  const TZ = "Europe/Bucharest";
  const yesterdayDate = getYesterdayDate(TZ);
  logger.info(`[finish-cron] Target TZ=${TZ}, switching all checkOut ≤ ${yesterdayDate.toISOString()}`);

  // Получаем все подтверждённые
  const snap = await db.collection("bookings")
    .where("status", "==", "confirmed")
    .get();

  let scanned = 0;
  let updated = 0;
  const batch = db.batch();

  snap.forEach(docSnap => {
    scanned++;
    const data = docSnap.data();
    const coDate = parseToDate(data.checkOut, TZ);
    if (coDate && coDate.getTime() <= yesterdayDate.getTime()) {
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
  return { scanned, updated };
}

// ───────────────────────────────────────────────────────────
// ПЛАНИРОВЩИК: ежедневно в 03:05 по Бухаресту
export const nightlyFinishBookings = onSchedule(
  {
    schedule: "every day 03:05",
    timeZone: "Europe/Bucharest",
  },
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