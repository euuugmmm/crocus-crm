// pages/api/finance/cache/build-salesDashboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential:
      process.env.FIREBASE_CONFIG
        ? cert(JSON.parse(process.env.FIREBASE_CONFIG as string))
        : applicationDefault(),
  });
}
const db = getFirestore();
const auth = getAuth();

// --- helpers ---
function toLocalISODate(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10); // YYYY-MM-DD
}
function clampISO(s?: string) { return (s || "").slice(0, 10); }

function parseMaybeTimestamp(v: any): Date | null {
  if (!v) return null;
  if (v?.toDate) {
    try { return v.toDate() as Date; } catch {}
  }
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    // "DD.MM.YYYY"
    const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return isNaN(+dt) ? null : dt;
    }
    const dt = new Date(v);
    return isNaN(+dt) ? null : dt;
  }
  if (typeof v === "number") {
    const dt = new Date(v);
    return isNaN(+dt) ? null : dt;
  }
  return null;
}

function num(v: any) { return Number.isFinite(Number(v)) ? Number(v) : 0; }

async function requireUser(req: NextApiRequest) {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer (.+)$/i);
  if (!m) throw Object.assign(new Error("No token"), { status: 401 });
  return auth.verifyIdToken(m[1]); // менеджеров тоже пускаем
}

type Basis = "createdAt" | "checkIn";
type DailyAgg = { gross: number; count: number; igor: number; evg: number };
type OpAgg = DailyAgg & { operator: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireUser(req);

    // Опционально можно ограничить окно пересчёта — по умолчанию "всё время"
    const fromParam = clampISO((req.query.from as string) || req.body?.from || "");
    const toParam   = clampISO((req.query.to   as string) || req.body?.to   || "");
    const basisParam = ((req.query.basis as string) || req.body?.basis || "both") as Basis | "both";

    await db.collection("finance_cacheMeta").doc("salesDashboard").set({
      status: "running",
      lastRunAt: FieldValue.serverTimestamp(),
      range: { from: fromParam || null, to: toParam || null, basis: basisParam },
    }, { merge: true });

    // 1) Читаем ВСЕ бронирования (если данных очень много — можно пагинировать)
    const snap = await db.collection("bookings").get();
    const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // 2) Находим покрытие
    const allDatesCreated = all
      .map(b => parseMaybeTimestamp(b.createdAt))
      .filter(Boolean) as Date[];
    const allDatesCheckin = all
      .map(b => parseMaybeTimestamp(b.checkIn))
      .filter(Boolean) as Date[];

    const minCreated = allDatesCreated.length ? new Date(Math.min(...allDatesCreated.map(d=>d.getTime()))) : null;
    const maxCreated = allDatesCreated.length ? new Date(Math.max(...allDatesCreated.map(d=>d.getTime()))) : null;
    const minCheckin = allDatesCheckin.length ? new Date(Math.min(...allDatesCheckin.map(d=>d.getTime()))) : null;
    const maxCheckin = allDatesCheckin.length ? new Date(Math.max(...allDatesCheckin.map(d=>d.getTime()))) : null;

    const covFrom = fromParam || toLocalISODate(minCreated && minCheckin
      ? (minCreated < minCheckin ? minCreated : minCheckin)
      : (minCreated || minCheckin || new Date()));
    const covTo = toParam || toLocalISODate(maxCreated && maxCheckin
      ? (maxCreated > maxCheckin ? maxCreated : maxCheckin)
      : (maxCreated || maxCheckin || new Date()));

    const bases: Basis[] = basisParam === "both"
      ? ["createdAt", "checkIn"]
      : [basisParam];

    // 3) Готовим корзины
    const daily: Record<string, DailyAgg> = {};                      // key: `${basis}|${YYYY-MM-DD}`
    const opDaily: Record<string, OpAgg> = {};                       // key: `${basis}|${YYYY-MM-DD}|${operator}`

    const addDaily = (basis: Basis, dateISO: string, add: DailyAgg) => {
      const k = `${basis}|${dateISO}`;
      if (!daily[k]) daily[k] = { gross: 0, count: 0, igor: 0, evg: 0 };
      daily[k].gross += add.gross;
      daily[k].count += add.count;
      daily[k].igor  += add.igor;
      daily[k].evg   += add.evg;
    };
    const addOp = (basis: Basis, dateISO: string, operator: string, add: DailyAgg) => {
      const k = `${basis}|${dateISO}|${operator}`;
      if (!opDaily[k]) opDaily[k] = { operator, gross: 0, count: 0, igor: 0, evg: 0 };
      opDaily[k].gross += add.gross;
      opDaily[k].count += add.count;
      opDaily[k].igor  += add.igor;
      opDaily[k].evg   += add.evg;
    };

    // 4) Проходим по всем броням и накапливаем по каждой основе дат
    for (const b of all) {
      const gross = num(b.clientPrice ?? b.bruttoClient ?? 0);
      const igor  = num(b.commissionIgor);
      const evg   = num(b.commissionEvgeniy);
      const baseAdd = { gross, count: 1, igor, evg };
      const op = (b.operator || "—") as string;

      if (bases.includes("createdAt")) {
        const d = parseMaybeTimestamp(b.createdAt);
        if (d) {
          const iso = toLocalISODate(d);
          // фильтр по окну, если задан (иначе пишем всё)
          if ((!fromParam || iso >= fromParam) && (!toParam || iso <= toParam)) {
            addDaily("createdAt", iso, baseAdd);
            addOp("createdAt", iso, op, baseAdd);
          }
        }
      }
      if (bases.includes("checkIn")) {
        const d = parseMaybeTimestamp(b.checkIn);
        if (d) {
          const iso = toLocalISODate(d);
          if ((!fromParam || iso >= fromParam) && (!toParam || iso <= toParam)) {
            addDaily("checkIn", iso, baseAdd);
            addOp("checkIn", iso, op, baseAdd);
          }
        }
      }
    }

    // 5) Пишем в две коллекции: finance_salesDaily и finance_salesDailyByOperator
    //    разбиваем на батчи по 400 операций
    const chunks = <T,>(arr: T[], size: number) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, (i + 1) * size)
      );

    const dailyEntries = Object.entries(daily);
    for (const part of chunks(dailyEntries, 400)) {
      const batch = db.batch();
      for (const [key, v] of part) {
        const [basis, dateISO] = key.split("|") as [Basis, string];
        const id = `${basis}_${dateISO}`;
        batch.set(
          db.collection("finance_salesDaily").doc(id),
          {
            basis,
            date: dateISO,
            gross: +v.gross.toFixed(2),
            count: v.count,
            igor:  +v.igor.toFixed(2),
            evg:   +v.evg.toFixed(2),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
    }

    const opEntries = Object.entries(opDaily);
    for (const part of chunks(opEntries, 400)) {
      const batch = db.batch();
      for (const [key, v] of part) {
        const [basis, dateISO, operatorRaw] = key.split("|") as [Basis, string, string];
        const operator = operatorRaw;
        // ограничим id
        const opId = operator.replace(/[^\w\-]+/g, "_").slice(0, 100);
        const id = `${basis}_${dateISO}__${opId}`;
        batch.set(
          db.collection("finance_salesDailyByOperator").doc(id),
          {
            basis,
            date: dateISO,
            operator,
            gross: +v.gross.toFixed(2),
            count: v.count,
            igor:  +v.igor.toFixed(2),
            evg:   +v.evg.toFixed(2),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
    }

    // 6) Мета
    await db.collection("finance_cacheMeta").doc("salesDashboard").set({
      status: "done",
      lastRunAt: FieldValue.serverTimestamp(),
      coverage: { from: covFrom, to: covTo, bases: bases },
      range: { from: fromParam || null, to: toParam || null, basis: basisParam },
      error: FieldValue.delete(),
    }, { merge: true });

    res.json({ ok: true, daysWritten: dailyEntries.length, opsWritten: opEntries.length });
  } catch (e: any) {
    try {
      await db.collection("finance_cacheMeta").doc("salesDashboard").set(
        { status: "error", lastRunAt: FieldValue.serverTimestamp(), error: String(e?.message || e) },
        { merge: true }
      );
    } catch {}
    res.status(e?.status || 500).json({ error: e?.message || "Internal Server Error" });
  }
}