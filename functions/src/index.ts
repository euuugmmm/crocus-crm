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

/** Возвращает строку "dd.MM.yyyy" для вчерашней даты в указанном часовом поясе. */
function getYesterdayString(tz: string): string {
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  // Текущая дата в TZ
  const nowParts = fmt.formatToParts(new Date());
  const y = Number(nowParts.find((p) => p.type === "year")?.value);
  const m = Number(nowParts.find((p) => p.type === "month")?.value);
  const d = Number(nowParts.find((p) => p.type === "day")?.value);

  // Создаём объект Date в этом TZ через UTC-конструктор (00:00 TZ)
  // Для простоты: создаём в UTC полночь, затем уменьшаем на 1 день.
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const yesterdayUTC = new Date(utcMidnight.getTime() - 24 * 60 * 60 * 1000);

  // Форматируем вчера в том же TZ как dd.MM.yyyy
  const parts = fmt.formatToParts(yesterdayUTC);
  const yy = parts.find((p) => p.type === "year")?.value || "";
  const mm = parts.find((p) => p.type === "month")?.value || "";
  const dd = parts.find((p) => p.type === "day")?.value || "";
  return `${dd}.${mm}.${yy}`;
}

/** Пытается нормализовать произвольное значение даты в строку "dd.MM.yyyy" в TZ. */
function normalizeToDDMMYYYY(input: unknown, tz: string): string | null {
  if (!input) return null;

  // Уже строка dd.MM.yyyy — вернём как есть (и проверим валидность).
  if (typeof input === "string") {
    const s = input.trim();

    // dd.MM.yyyy
    const ddmmyyyy = /^(\d{2})\.(\d{2})\.(\d{4})$/;
    const m1 = s.match(ddmmyyyy);
    if (m1) {
      const dd = Number(m1[1]);
      const mm = Number(m1[2]);
      const yyyy = Number(m1[3]);
      if (isValidYMD(yyyy, mm, dd)) return `${pad2(dd)}.${pad2(mm)}.${yyyy}`;
      return null;
    }

    // yyyy-MM-dd
    const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;
    const m2 = s.match(yyyymmdd);
    if (m2) {
      const yyyy = Number(m2[1]);
      const mm = Number(m2[2]);
      const dd = Number(m2[3]);
      if (isValidYMD(yyyy, mm, dd)) return `${pad2(dd)}.${pad2(mm)}.${yyyy}`;
      return null;
    }

    // Любой другой текст — не поддерживаем
    return null;
  }

  // Firestore Timestamp
  if (isFirestoreTimestamp(input)) {
    return formatDateToTZ(input.toDate(), tz);
  }

  // JS Date
  if (input instanceof Date && !isNaN(input.getTime())) {
    return formatDateToTZ(input, tz);
  }

  // Неизвестный формат
  return null;
}

function isFirestoreTimestamp(v: any): v is Timestamp {
  return v && typeof v.toDate === "function" && v.seconds != null && v.nanoseconds != null;
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

function isValidYMD(y: number, m: number, d: number): boolean {
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// ───────────────────────────────────────────────────────────
// ОСНОВНАЯ ЛОГИКА

/**
 * Проходит по всем бронированиям со статусом "confirmed"
 * и переводит в "finished", если их checkOut был вчера
 * (по часовому поясу Europe/Bucharest).
 */
async function completeYesterdayCheckouts() {
  const TZ = "Europe/Bucharest";
  const yesterday = getYesterdayString(TZ);

  logger.info(`[finish-cron] Target TZ=${TZ}, yesterday=${yesterday}`);

  const snap = await db.collection("bookings").where("status", "==", "confirmed").get();

  if (snap.empty) {
    logger.info("[finish-cron] No confirmed bookings found.");
    return { updated: 0, scanned: 0, yesterday };
  }

  let updated = 0;
  let scanned = 0;
  const batch = db.batch();

  snap.forEach((docSnap) => {
    scanned++;
    const data = docSnap.data() as any;
    const normalized = normalizeToDDMMYYYY(data.checkOut, TZ);
    if (!normalized) return;
    if (normalized === yesterday) {
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
  return { updated, scanned, yesterday };
}

// ───────────────────────────────────────────────────────────
// ПЛАНИРОВЩИК: запускаем ежедневно в 03:05 по Бухаресту

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

// ───────────────────────────────────────────────────────────
// (ОПЦИОНАЛЬНО) Ручной запуск из консоли/браузера для теста:
//   GET https://<region>-<project>.cloudfunctions.net/runFinishBookingsOnce
// Не забудьте ограничить доступ (защита по секрету или IAM).
//
// import { onRequest } from "firebase-functions/v2/https";
// export const runFinishBookingsOnce = onRequest(async (_req, res) => {
//   try {
//     const result = await completeYesterdayCheckouts();
//     res.status(200).json({ ok: true, result });
//   } catch (e: any) {
///     res.status(500).json({ ok: false, error: e?.message || String(e) });
//   }
// });