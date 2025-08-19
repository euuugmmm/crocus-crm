// pages/api/finance/fx/bnr-sync.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  fetchBnrYearsToEurBase,
  fetchBnrLastNDaysEURBase,
  fetchBnrLatestEURBase,
  fetchBnrLast10EURBase,
} from "@/lib/finance/bnr";
import { FieldPath } from "firebase-admin/firestore";

type Mode = "init60" | "fillMissing" | "latest";

type Json = {
  ok: boolean;
  mode: Mode;
  inserted?: number;
  skipped?: number;
  fixed?: number;          // <- сколько существующих документов починили
  checked?: number;
  fromDate?: string | null;
  toDate?: string | null;
  lastBnrDate?: string | null;
  latestDbId?: string | null;
  message?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Json>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, mode: "latest", message: "Method Not Allowed" });
  }

  try {
    const m = (req.query.mode as string) || "latest";
    const mode: Mode = (["init60", "fillMissing", "latest"].includes(m) ? m : "latest") as Mode;

    // Узнаём максимальный id в БД (инфо)
    const maxSnap = await adminDb
      .collection("finance_fxRates")
      .orderBy(FieldPath.documentId())
      .limitToLast(1)
      .get();
    const latestDbId = maxSnap.docs[0]?.id || null;

    let candidates: Array<{ id: string; rates: Record<string, number> }> = [];
    let lastBnrDate: string | null = null;

    if (mode === "init60") {
      const last60 = await fetchBnrLastNDaysEURBase(60); // ASC
      candidates = last60.map(x => ({ id: x.date, rates: x.rates }));
      lastBnrDate = last60[last60.length - 1]?.date || null;
    }

    if (mode === "fillMissing") {
      const now = new Date();
      const y = now.getFullYear();
      const map = await fetchBnrYearsToEurBase([y - 1, y]);
      const allDates = Array.from(map.keys()).sort(); // ASC
      lastBnrDate = allDates[allDates.length - 1] || null;

      const slice = latestDbId ? allDates.filter(d => d > latestDbId) : allDates;
      candidates = slice.map(d => ({ id: d, rates: map.get(d)! }));
    }

    if (mode === "latest") {
      const latest = await fetchBnrLatestEURBase(); // { date, rates }
      lastBnrDate = latest.date;

      const last10 = await fetchBnrLast10EURBase(); // ASC
      const join = new Map<string, Record<string, number>>();
      for (const d of last10) join.set(d.date, d.rates);
      join.set(latest.date, latest.rates);

      const dates = Array.from(join.keys()).sort(); // ASC
      candidates = dates.map(d => ({ id: d, rates: join.get(d)! }));
      // Ничего не отрезаем по latestDbId — существование проверим по месту
    }

    // Пакетная запись + "ремонт" существующих документов без publishedAt
    let inserted = 0;
    let skipped = 0;
    let fixed = 0;

    const chunkSize = 300;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);
      const batch = adminDb.batch();

      for (const c of chunk) {
        const ref = adminDb.collection("finance_fxRates").doc(c.id);
        const snap = await ref.get();

        if (!snap.exists) {
          // создаём новый документ
          batch.set(
            ref,
            {
              base: "EUR",
              rates: c.rates, // CCY per 1 EUR
              source: { all: "BNR XML (curs.bnr.ro)" },
              publishedAt: new Date().toISOString(), // обязательно строка ISO
            },
            { merge: true }
          );
          inserted++;
          continue;
        }

        // существует — возможно, надо "подшаманить"
        const data = snap.data() || {};
        const lacksPublishedAt = !("publishedAt" in data) || typeof data.publishedAt !== "string";
        const lacksBase = !("base" in data);
        const lacksSource = !("source" in data);

        if (lacksPublishedAt || lacksBase || lacksSource) {
          batch.set(
            ref,
            {
              ...(lacksBase ? { base: "EUR" } : {}),
              ...(lacksSource ? { source: { all: "BNR XML (curs.bnr.ro)" } } : {}),
              ...(lacksPublishedAt ? { publishedAt: new Date().toISOString() } : {}),
            },
            { merge: true }
          );
          fixed++;
        } else {
          skipped++;
        }
      }

      if (inserted > 0 || fixed > 0) {
        await batch.commit();
      }
    }

    // Мета
    await adminDb.collection("finance_fxMeta").doc("bnr").set(
      {
        lastSyncAt: new Date().toISOString(),
        lastBnrDate,
        source: "BNR XML (https://curs.bnr.ro)",
      },
      { merge: true }
    );

    const fromDate = candidates[0]?.id ?? null;
    const toDate = candidates[candidates.length - 1]?.id ?? null;

    return res.status(200).json({
      ok: true,
      mode,
      inserted,
      skipped,
      fixed,
      checked: candidates.length,
      fromDate,
      toDate,
      lastBnrDate,
      latestDbId,
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      mode: (req.query.mode as any) || "latest",
      message: String(e?.message || e),
    });
  }
}