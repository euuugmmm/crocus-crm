// pages/api/generate-annex.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import { tmpdir } from "os";
import { join, resolve } from "path";
import fs from "fs";
import fsp from "fs/promises";
import createReport from "docx-templates";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

/* ───────── helpers ───────── */
function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])
    return JSON.parse(
      Buffer.from(process.env[b64]!, "base64").toString("utf8")
    );
  throw new Error(`Neither ${plain} nor ${b64} set`);
}
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_").trim();
const fmt = (d?: string | Date | Timestamp) => {
  if (!d) return "—";
  const dt =
    d instanceof Timestamp
      ? d.toDate()
      : d instanceof Date
      ? d
      : new Date(d);
  return dt.toLocaleDateString("ro-RO");
};

/* ───────── Firebase Admin ───────── */
// инициализируем только если ещё нет никаких приложений
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
  if (req.method !== "POST") return res.status(405).end("Only POST");
  const { payoutId } = req.body as { payoutId?: string };
  if (!payoutId) return res.status(400).json({ error: "payoutId missing" });

  try {
    /* 1️⃣ Load payout */
    const pSnap = await db.doc(`payouts/${payoutId}`).get();
    if (!pSnap.exists) throw new Error("payout not found");
    const p: any = pSnap.data();

    /* 2️⃣ Load bookings */
    const bookingSnaps = await Promise.all(
      (p.bookings as string[]).map((id) => db.doc(`bookings/${id}`).get())
    );
    const bookings: any[] = bookingSnaps.map((s) => ({ id: s.id, ...s.data() }));

    /* 3️⃣ Load agent and compute annex number */
    const uSnap = await db.doc(`users/${p.agentId}`).get();
    const u: any = uSnap.data() || {};
    const annexNumber = (u.annexCount || 0) + 1;

    /* 4️⃣ Prepare lines blocks */
    const lines = bookings
      .map((b) => {
        const tourists = Array.isArray(b.tourists)
          ? b.tourists.map((t: any) => t.name).join(", ")
          : "—";
        return [
          `Rezervarea №: ${b.bookingNumber}`,
          `Data rezervării: ${fmt(b.createdAt?.toDate?.())}`,
          `Hotel: ${b.hotel || "—"}`,
          `Turisti: ${tourists}`,
          `Data Check-in: ${fmt(b.checkIn)}`,
          `Data Check-out: ${fmt(b.checkOut)}`,
          `Comision: ${(b.commission || 0).toFixed(2)}`,
        ].join("\n");
      })
      .join("\n\n");

    /* 5️⃣ Template vars */
    const vars = {
      annexNumber,
      contractNumber: u.lastContract?.number || "—",
      contractDate:   u.lastContract?.date   || "—",
      today:          new Date().toLocaleDateString("ro-RO"),
      agentName:      u.agentName || "—",
      lines,
      total: bookings
        .reduce((sum, b) => sum + (b.commission || 0), 0)
        .toFixed(2),
    };

    /* 6️⃣ Generate DOCX */
    const tplPath = resolve(process.cwd(), "templates/payout-annex.docx");
    const buffer = await createReport({
      template: await fsp.readFile(tplPath),
      data: vars,
      cmdDelimiter: ["+++", "+++"],
      processLineBreaks: true,
    });
    const tmpDoc = join(tmpdir(), `Annexa-${payoutId}.docx`);
    await fsp.writeFile(tmpDoc, buffer);

    /* 7️⃣ Ensure Drive folder */
    const { data: list } = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and name='${safe(
        u.agencyName || u.email || p.agentId
      )}' and trashed=false and mimeType='application/vnd.google-apps.folder'`,
      fields: "files(id,name)",
    });
    let folderId = list.files?.[0]?.id;
    if (!folderId) {
      const mk = await drive.files.create({
        requestBody: {
          name: safe(u.agencyName || u.email || p.agentId),
          mimeType: "application/vnd.google-apps.folder",
          parents: [ROOT_FOLDER_ID],
        },
        fields: "id",
      });
      folderId = mk.data.id!;
    }

    /* 8️⃣ Upload DOCX */
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

    /* 9️⃣ Update Firestore */
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