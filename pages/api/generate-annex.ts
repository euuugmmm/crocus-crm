// pages/api/generate-annex.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import { tmpdir } from "os";
import { join, resolve } from "path";
import fs from "fs";
import fsp from "fs/promises";
import createReport from "docx-templates";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  DocumentData,
} from "firebase-admin/firestore";

/* ───────── helpers ───────── */
function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])
    return JSON.parse(
      Buffer.from(process.env[b64]!, "base64").toString("utf8")
    );
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

type FireDate = Timestamp | Date | string | undefined | null;

type PayoutItem = {
  bookingId?: string;
  amount?: number;
  commission?: number;
  [k: string]: any;
};

type PayoutDoc = {
  agentId: string;
  items?: PayoutItem[];
  bookings?: string[];
  createdAt?: FireDate;
  [k: string]: any;
};

type Tourist = { name?: string; [k: string]: any };

type BookingDoc = {
  id: string;
  bookingNumber?: string;
  hotel?: string;
  tourists?: Tourist[];
  createdAt?: FireDate;
  checkIn?: FireDate;
  checkOut?: FireDate;
  commission?: number;
  agentCommission?: number;
  [k: string]: any;
};

// "умное" форматирование даты:
// - если строка вида dd.MM.yyyy или dd/MM/yyyy — нормализуем и возвращаем
// - если Timestamp/Date/ISO — форматируем в ro-RO
function fmtSmart(d?: FireDate): string {
  if (!d) return "—";
  if (typeof d === "string") {
    const s = d.trim();
    const sDots = s.replace(/\//g, ".");
    if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(sDots)) {
      const [dd, mm, yy] = sDots.split(".");
      const dd2 = dd.padStart(2, "0");
      const mm2 = mm.padStart(2, "0");
      const yyyy = yy.length === 2 ? `20${yy}` : yy;
      return `${dd2}.${mm2}.${yyyy}`;
    }
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return dt.toLocaleDateString("ro-RO");
    return s;
  }
  if (d instanceof Timestamp) return d.toDate().toLocaleDateString("ro-RO");
  if (d instanceof Date) return d.toLocaleDateString("ro-RO");
  return "—";
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_").trim();

/* ───────── Firebase Admin ───────── */
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

/* ───────── Google Drive ───────── */
const drive = google.drive({
  version: "v3",
  auth: new google.auth.GoogleAuth({
    credentials: getCred(
      "GOOGLE_SERVICE_ACCOUNT_JSON",
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64"
    ),
    scopes: ["https://www.googleapis.com/auth/drive"],
  }),
});
const ROOT_FOLDER_ID = process.env.CONTRACTS_ROOT_FOLDER_ID!;

/* ───────── Handler ───────── */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Only POST");
  }
  const { payoutId } = req.body as { payoutId?: string };
  if (!payoutId) return res.status(400).json({ error: "payoutId missing" });

  try {
    // 1) payout
    const pSnap = await db.doc(`payouts/${payoutId}`).get();
    if (!pSnap.exists) throw new Error("payout not found");
    const p = pSnap.data() as PayoutDoc;

    // 2) собрать id броней из p.bookings и/или p.items[].bookingId
    const items: PayoutItem[] = Array.isArray(p.items) ? p.items : [];
    const direct: string[] = Array.isArray(p.bookings) ? p.bookings : [];

    const fromItems = items
      .map((i) => i?.bookingId)
      .filter((x): x is string => Boolean(x));
    const allIdsUnique = Array.from(new Set<string>([...direct, ...fromItems]));

    // карта "bookingId -> item"
    const itemByBooking: Record<string, PayoutItem> = {};
    for (const it of items) {
      if (it?.bookingId) itemByBooking[it.bookingId] = it;
    }

    // 3) загрузить брони
    const snaps = await Promise.all(
      allIdsUnique.map((id) => db.doc(`bookings/${id}`).get())
    );
const bookingIds: string[] = Array.isArray(p.items)
  ? p.items.map((it: any) => it.bookingId)
  : (p.bookings as string[]);

const bookingSnaps = await Promise.all(
  bookingIds.map(id => db.doc(`bookings/${id}`).get())
);
const bookings: any[] = bookingSnaps.map(s => ({ id: s.id, ...s.data() }));

    // 4) агент + номер аннекса + дата контракта
    const uSnap = await db.doc(`users/${p.agentId}`).get();
    const u = uSnap.exists ? (uSnap.data() as DocumentData) : {};
    const annexNumber = (u?.annexCount || 0) + 1;

    const contractDateRaw: FireDate =
      (u?.lastContract && (u.lastContract as any).date) ??
      (u as any)?.contractDate ??
      p?.date ??
      (u as any)?.date ??
      new Date();

    // 5) строки по броням
    const lines =
      bookings.length > 0
        ? bookings
            .map((b) => {
              const tourists = Array.isArray(b.tourists)
                ? b.tourists.map((t) => t?.name).filter(Boolean).join(", ")
                : "—";

              // выбрать сумму для этой брони
              const it =
                itemByBooking[b.id] ||
                (b.bookingNumber ? itemByBooking[b.bookingNumber] : undefined);

              const paidCandidate =
                (typeof it?.amount === "number" ? it.amount : undefined) ??
                (typeof it?.commission === "number" ? it.commission : undefined) ??
                (typeof b.agentCommission === "number"
                  ? b.agentCommission
                  : undefined) ??
                (typeof b.commission === "number" ? b.commission : undefined);

              const paid = Number(paidCandidate ?? 0);

              return [
                `Rezervarea №: ${b.bookingNumber || b.id}`,
                `Data rezervării: ${fmtSmart(b.createdAt)}`,
                `Hotel: ${b.hotel || "—"}`,
                `Turisti: ${tourists || "—"}`,
                `Data Check-in: ${fmtSmart(b.checkIn)}`,
                `Data Check-out: ${fmtSmart(b.checkOut)}`,
                `Comision: ${paid.toFixed(2)}`,
              ].join("\n");
            })
            .join("\n\n")
        : "—";

    // 6) total
    const total = bookings.reduce((sum, b) => {
      const it =
        itemByBooking[b.id] ||
        (b.bookingNumber ? itemByBooking[b.bookingNumber] : undefined);

      const paidCandidate =
        (typeof it?.amount === "number" ? it.amount : undefined) ??
        (typeof it?.commission === "number" ? it.commission : undefined) ??
        (typeof b.agentCommission === "number" ? b.agentCommission : undefined) ??
        (typeof b.commission === "number" ? b.commission : undefined);

      return sum + Number(paidCandidate ?? 0);
    }, 0);

    const vars = {
      annexNumber,
      contractNumber: (u?.lastContract && (u.lastContract as any).number) || "—",
      contractDate: fmtSmart(contractDateRaw),
      today: new Date().toLocaleDateString("ro-RO"),
      agentName: u?.agentName || "—",
      lines,
      total: total.toFixed(2),
    };

    // 7) генерируем DOCX
    const tplPath = resolve(process.cwd(), "templates/payout-annex.docx");
    const buffer = await createReport({
      template: await fsp.readFile(tplPath),
      data: vars,
      cmdDelimiter: ["+++", "+++"],
      processLineBreaks: true,
    });
    const tmpDoc = join(tmpdir(), `Annexa-${payoutId}.docx`);
    await fsp.writeFile(tmpDoc, buffer);

    // 8) папка в Drive
    const { data: list } = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and name='${safe(
        u?.agencyName || u?.email || p.agentId
      )}' and trashed=false and mimeType='application/vnd.google-apps.folder'`,
      fields: "files(id,name)",
    });
    let folderId = list.files?.[0]?.id;
    if (!folderId) {
      const mk = await drive.files.create({
        requestBody: {
          name: safe(u?.agencyName || u?.email || p.agentId),
          mimeType: "application/vnd.google-apps.folder",
          parents: [ROOT_FOLDER_ID],
        },
        fields: "id",
      });
      folderId = mk.data.id!;
    }

    // 9) загрузка DOCX
    const up = await drive.files.create({
      requestBody: { name: `Annexa-${annexNumber}.docx`, parents: [folderId] },
      media: {
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body: fs.createReadStream(tmpDoc),
      },
      fields: "id",
    });
    await drive.permissions.create({
      fileId: up.data.id!,
      requestBody: { role: "reader", type: "anyone" },
    });
    const link = `https://drive.google.com/uc?id=${up.data.id}&export=download`;

    // 10) обновить payout и счётчик
    await db.doc(`payouts/${payoutId}`).update({ annexLink: link });
    await db.doc(`users/${p.agentId}`).update({
      annexCount: FieldValue.increment(1),
    });

    return res.status(200).json({ link });
  } catch (e: any) {
    console.error("Annex generation error:", e);
    return res.status(500).json({ error: e.message });
  }
}