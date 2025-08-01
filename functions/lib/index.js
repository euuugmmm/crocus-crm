"use strict";
// functions/src/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.nightlyFinishBookings = void 0;
const v2_1 = require("firebase-functions/v2");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
// ───────────────────────────────────────────────────────────
// Глобальные опции функций (регион/таймаут/память)
(0, v2_1.setGlobalOptions)({
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "256MiB",
});
// Инициализация Admin SDK
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
// ───────────────────────────────────────────────────────────
// УТИЛИТЫ РАБОТЫ С ДАТАМИ
/** Возвращает строку "dd.MM.yyyy" для вчерашней даты в указанном часовом поясе. */
function getYesterdayString(tz) {
    var _a, _b, _c, _d, _e, _f;
    const fmt = new Intl.DateTimeFormat("ru-RU", {
        timeZone: tz,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
    const nowParts = fmt.formatToParts(new Date());
    const y = Number((_a = nowParts.find((p) => p.type === "year")) === null || _a === void 0 ? void 0 : _a.value);
    const m = Number((_b = nowParts.find((p) => p.type === "month")) === null || _b === void 0 ? void 0 : _b.value);
    const d = Number((_c = nowParts.find((p) => p.type === "day")) === null || _c === void 0 ? void 0 : _c.value);
    const utcMidnight = new Date(Date.UTC(y, m - 1, d));
    const yesterdayUTC = new Date(utcMidnight.getTime() - 24 * 60 * 60 * 1000);
    const parts = fmt.formatToParts(yesterdayUTC);
    const yy = ((_d = parts.find((p) => p.type === "year")) === null || _d === void 0 ? void 0 : _d.value) || "";
    const mm = ((_e = parts.find((p) => p.type === "month")) === null || _e === void 0 ? void 0 : _e.value) || "";
    const dd = ((_f = parts.find((p) => p.type === "day")) === null || _f === void 0 ? void 0 : _f.value) || "";
    return `${dd}.${mm}.${yy}`;
}
/** Нормализует дату из Firestore или строку в "dd.MM.yyyy". */
function normalizeToDDMMYYYY(input, tz) {
    if (!input)
        return null;
    if (typeof input === "string") {
        const s = input.trim();
        const rex1 = /^(\d{2})\.(\d{2})\.(\d{4})$/;
        const m1 = s.match(rex1);
        if (m1) {
            const dd = +m1[1];
            const mm = +m1[2];
            const yyyy = +m1[3];
            return `${pad2(dd)}.${pad2(mm)}.${yyyy}`;
        }
        const rex2 = /^(\d{4})-(\d{2})-(\d{2})$/;
        const m2 = s.match(rex2);
        if (m2) {
            const yyyy = +m2[1];
            const mm = +m2[2];
            const dd = +m2[3];
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
function isFirestoreTimestamp(v) {
    return v && typeof v.toDate === "function";
}
function formatDateToTZ(d, tz) {
    var _a, _b, _c;
    const fmt = new Intl.DateTimeFormat("ru-RU", {
        timeZone: tz,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
    const parts = fmt.formatToParts(d);
    const yy = ((_a = parts.find((p) => p.type === "year")) === null || _a === void 0 ? void 0 : _a.value) || "";
    const mm = ((_b = parts.find((p) => p.type === "month")) === null || _b === void 0 ? void 0 : _b.value) || "";
    const dd = ((_c = parts.find((p) => p.type === "day")) === null || _c === void 0 ? void 0 : _c.value) || "";
    return `${dd}.${mm}.${yy}`;
}
function pad2(n) {
    return n < 10 ? `0${n}` : `${n}`;
}
// ───────────────────────────────────────────────────────────
// ОСНОВНАЯ ЛОГИКА
async function completeYesterdayCheckouts() {
    const TZ = "Europe/Bucharest";
    const yesterday = getYesterdayString(TZ);
    v2_1.logger.info(`[finish-cron] Target TZ=${TZ}, switching all checkOut ≤ ${yesterday}`);
    const snap = await db
        .collection("bookings")
        .where("status", "==", "confirmed")
        .get();
    let scanned = 0;
    let updated = 0;
    const batch = db.batch();
    snap.forEach((docSnap) => {
        scanned++;
        const data = docSnap.data();
        const norm = normalizeToDDMMYYYY(data.checkOut, TZ);
        if (norm && norm <= yesterday) {
            batch.update(docSnap.ref, {
                status: "finished",
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            updated++;
        }
    });
    if (updated > 0) {
        await batch.commit();
    }
    v2_1.logger.info(`[finish-cron] scanned=${scanned}, updated=${updated}`);
    return { scanned, updated, yesterday };
}
// ───────────────────────────────────────────────────────────
// ПЛАНИРОВЩИК: запускаем ежедневно в 03:05 по Бухаресту
exports.nightlyFinishBookings = (0, scheduler_1.onSchedule)("every day 03:05", async () => {
    try {
        const res = await completeYesterdayCheckouts();
        v2_1.logger.info("[finish-cron] Done", res);
    }
    catch (e) {
        v2_1.logger.error("[finish-cron] Error", e);
        throw e;
    }
});
//# sourceMappingURL=index.js.map