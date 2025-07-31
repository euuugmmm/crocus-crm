// pages/api/generate-contract.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import { tmpdir } from "os";
import { join, resolve } from "path";
import fs, { promises as fsp } from "fs";
import createReport from "docx-templates";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/* ───── helpers ───── */
function getCred(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])   return JSON.parse(Buffer.from(process.env[b64]!, "base64").toString("utf8"));
  throw new Error(`env ${plain} / ${b64} not set`);
}
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_").trim();

/* ───── Firebase ───── */
// инициализируем только один раз, если ещё не было
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

/* ───── Google Drive ───── */
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

/* ───── получить № агента + следующий seq ───── */
async function getNumbers(uid: string) {
  const ref = db.doc(`users/${uid}`);
  return db.runTransaction(async tr => {
    const snap = await tr.get(ref);
    const d = snap.data() || {};
    const agentNo = d.agentNo;
    const seq     = (d.contractSeq ?? 0) + 1;
    tr.set(ref, { contractSeq: FieldValue.increment(1) }, { merge: true });
    return { agentNo, seq };
  });
}

/* ───── handler ───── */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { userId, name, address, agency, cnp, passport, nationality } = req.body as any;
    if (![userId, name, address, agency, cnp, passport, nationality].every(Boolean)) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // 1) Получаем номера
    const { agentNo, seq } = await getNumbers(userId);
    if (!agentNo) throw new Error("agentNo missing in user profile");
    const contractNumber = `${agentNo}-${String(seq).padStart(3, "0")}`;
    const date = new Date().toLocaleDateString("ru-RU");

    // 2) Генерируем DOCX
    const tpl = resolve(process.cwd(), "templates/agent-contract.docx");
    const buf = await createReport({
      template         : await fsp.readFile(tpl),
      data             : { name, address, agency, cnp, passport, nationality, contractNumber, date },
      cmdDelimiter     : ["{{","}}"],
      processLineBreaks: true,
    });
    const tmpDoc = join(tmpdir(), `contract-${userId}-${seq}.docx`);
    await fsp.writeFile(tmpDoc, buf);

    // 3) Получаем или создаём папку агентства
    const folderName = safeName(agency);
    const { data: list } = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id)",
    });
    let folderId = list.files?.[0]?.id;
    if (!folderId) {
      folderId = (
        await drive.files.create({
          requestBody: { name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [ROOT_FOLDER_ID] },
          fields: "id",
        })
      ).data.id!;
    }

    // 4) Загружаем DOCX как Google Docs
    const gdocId = (await drive.files.create({
      requestBody: { name: contractNumber, mimeType: "application/vnd.google-apps.document", parents: [folderId] },
      media: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", body: fs.createReadStream(tmpDoc) },
      fields: "id",
    })).data.id!;

    // 5) Экспортируем в PDF
    const pdfBuf = Buffer.from(
      (await drive.files.export({ fileId: gdocId, mimeType: "application/pdf" }, { responseType: "arraybuffer" })).data as ArrayBuffer
    );
    const tmpPdf = tmpDoc.replace(/\.docx$/, ".pdf");
    await fsp.writeFile(tmpPdf, pdfBuf);

    // 6) Загружаем PDF, делаем публичным
    const pdfId = (await drive.files.create({
      requestBody: { name: `${contractNumber}.pdf`, parents: [folderId] },
      media: { mimeType: "application/pdf", body: fs.createReadStream(tmpPdf) },
      fields: "id",
    })).data.id!;
    await drive.permissions.create({ fileId: pdfId, requestBody: { role: "reader", type: "anyone" }});
    const link = `https://drive.google.com/uc?id=${pdfId}&export=download`;

    // 7) Сохраняем в Firestore
    await db.doc(`users/${userId}`).set({
      agentName: name,
      lastContract: { number: contractNumber, link: link, date: date, name: name, address: address, cnp: cnp, passport: passport },
      contractLinks: FieldValue.arrayUnion(link),
      hasSignedContract: false,
    }, { merge: true });

    res.status(200).json({ link, contractNumber, date, name, address, cnp, passport });
  } catch (e: any) {
    console.error("Contract gen error:", e);
    res.status(500).json({ error: "Generation failed", details: e.message });
  }
}