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

function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])
    return JSON.parse(Buffer.from(process.env[b64]!, "base64").toString("utf8"));
  throw new Error(`Neither ${plain} nor ${b64} set`);
}

type FireDate = Timestamp | Date | string | undefined | null;

type PayoutItem = {
  bookingId?: string;
  bookingNumber?: string;
  hotel?: string;
  checkIn?: FireDate;
  checkOut?: FireDate;
  amountGross?: number; // БРУТТО — ЭТО И ПИШЕМ В АНЕКСУ
  amountNet?: number;
};

type PayoutDoc = {
  agentId: string;
  items?: PayoutItem[];
  bookings?: string[]; // на всякий случай, если где-то хранится
  createdAt?: FireDate;
  comment?: string;
  annexSeq?: number; // номер анексы, если уже был выдан
  [k: string]: any;
};

type Tourist = { name?: string };

type BookingDoc = {
  id: string;
  bookingNumber?: string;
  hotel?: string;
  tourists?: Tourist[];
  createdAt?: FireDate;
  checkIn?: FireDate;
  checkOut?: FireDate;
  [k: string]: any;
};

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

if (!getApps().length) {
  initializeApp({
    credential: cert(
      getCred("FIREBASE_SERVICE_ACCOUNT_JSON", "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64")
    ),
  });
}
const db = getFirestore();

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Only POST");
  }

  const { payoutId } = req.body as { payoutId?: string };
  if (!payoutId) return res.status(400).json({ error: "payoutId missing" });

  try {
    // 1) payout
    const pRef = db.doc(`payouts/${payoutId}`);
    const pSnap = await pRef.get();
    if (!pSnap.exists) throw new Error("payout not found");
    const p = pSnap.data() as PayoutDoc;

    // 2) агент + номер анексы (старый метод: users.annexCount)
    const uRef = db.doc(`users/${p.agentId}`);
    const uSnap = await uRef.get();
    const u = uSnap.exists ? (uSnap.data() as DocumentData) : {};

    let annexNumber = Number(p.annexSeq || 0);
    if (!annexNumber) {
      const current = Number(u?.annexCount || 0);
      annexNumber = current + 1;
      // фиксируем номер в payout и инкрементим счётчик у пользователя
      await Promise.all([
        pRef.update({ annexSeq: annexNumber, updatedAt: FieldValue.serverTimestamp() }),
        uRef.update({ annexCount: annexNumber, updatedAt: FieldValue.serverTimestamp() }),
      ]);
    }

    // 3) соберём bookingId из items и подгрузим метаданные броней
    const items: PayoutItem[] = Array.isArray(p.items) ? p.items : [];
    const ids = Array.from(
      new Set(
        items
          .map((it) => it?.bookingId)
          .filter((x): x is string => Boolean(x))
      )
    );

    const bookingSnaps = await Promise.all(ids.map((id) => db.doc(`bookings/${id}`).get()));
    const bookings: BookingDoc[] = bookingSnaps.map((s) => ({
      id: s.id,
      ...(s.data() as any),
    }));

    // 4) строки по броням (всегда БРУТТО из payout.items[].amountGross)
    const itemById = Object.fromEntries(
      items
        .filter((it) => it?.bookingId)
        .map((it) => [String(it.bookingId), it])
    );

    const lines =
      bookings.length > 0
        ? bookings
            .map((b) => {
              const tourists = Array.isArray(b.tourists)
                ? b.tourists.map((t) => t?.name).filter(Boolean).join(", ")
                : "—";
              const it = itemById[b.id] as PayoutItem | undefined;
              const paid = Number(it?.amountGross ?? 0); // БРУТТО

              return [
                `Rezervarea №: ${b.bookingNumber || b.id}`,
                `Data rezervării: ${fmtSmart(b.createdAt)}`,
                `Hotel: ${b.hotel || "—"}`,
                `Turisti: ${tourists || "—"}`,
                `Data Check-in: ${fmtSmart(b.checkIn)}`,
                `Data Check-out: ${fmtSmart(b.checkOut)}`,
                `Comision (brut): ${paid.toFixed(2)}`,
              ].join("\n");
            })
            .join("\n\n")
        : "—";

    // 5) total = сумма БРУТТО по items
    const total = (items || []).reduce((s, it) => s + Number(it?.amountGross ?? 0), 0);

    // 6) дата контракта и комментарий
    const contractDateRaw: FireDate =
      (u?.lastContract && (u.lastContract as any).date) ??
      (u as any)?.contractDate ??
      p?.createdAt ??
      new Date();

    const vars = {
      annexNumber,
      contractNumber: (u?.lastContract && (u.lastContract as any).number) || "—",
      contractDate: fmtSmart(contractDateRaw),
      today: new Date().toLocaleDateString("ro-RO"),
      agentName: u?.agentName || "—",
      lines,
      total: total.toFixed(2),
      payoutComment: p?.comment || "", // можно вывести в шаблон, если нужно
    };

    // 7) рендер DOCX
    const tplPath = resolve(process.cwd(), "templates/payout-annex.docx");
    const buffer = await createReport({
      template: await fsp.readFile(tplPath),
      data: vars,
      cmdDelimiter: ["+++", "+++"],
      processLineBreaks: true,
    });
    const tmpDoc = join(tmpdir(), `Anexa-${payoutId}.docx`);
    await fsp.writeFile(tmpDoc, buffer);

    // 8) папка в Drive
    const { data: list } = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and name='${safe(
        u?.agencyName || u?.email || String(p.agentId)
      )}' and trashed=false and mimeType='application/vnd.google-apps.folder'`,
      fields: "files(id,name)",
    });
    let folderId = list.files?.[0]?.id;
    if (!folderId) {
      const mk = await drive.files.create({
        requestBody: {
          name: safe(u?.agencyName || u?.email || String(p.agentId)),
          mimeType: "application/vnd.google-apps.folder",
          parents: [ROOT_FOLDER_ID],
        },
        fields: "id",
      });
      folderId = mk.data.id!;
    }

    // 9) загрузка DOCX
    const up = await drive.files.create({
      requestBody: { name: `Anexa-${annexNumber}.docx`, parents: [folderId] },
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

    // 10) записываем ссылку в payout
    await pRef.update({
      annexLink: link,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ link, annexNumber });
  } catch (e: any) {
    console.error("Annex generation error:", e);
    return res.status(500).json({ error: e.message });
  }
}