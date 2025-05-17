// pages/api/generate-contract.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { execSync } from "child_process";
import fs from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const config = { api: { bodyParser: true } };

// Инициализируем Admin SDK (для записи ссылки в Firestore)
if (!globalThis._firebaseAdmin) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_SDK_KEY!)),
  });
  globalThis._firebaseAdmin = true;
}
const firestore = getFirestore();

// ID корневой папки в Google Drive, где будут лежать все контракты
const ROOT_FOLDER_ID = process.env.CONTRACTS_ROOT_FOLDER_ID!;
// Сервисный аккаунт Google
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!),
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const { bookingId, agencyName, agentName, agentEmail, date } = req.body as {
      bookingId: string;
      agencyName: string;
      agentName: string;
      agentEmail: string;
      date: string;
    };

    // 1) Загрузим Word-шаблон
    const tplPath = resolve(process.cwd(), "templates/contract-template.docx");
    const content = readFileSync(tplPath, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true });
    doc.setData({ agencyName, agentName, agentEmail, date });
    doc.render();

    // 2) Сохраним заполненный .docx во временный файл
    const buffer = doc.getZip().generate({ type: "nodebuffer" });
    const tmpDocx = join(tmpdir(), `contract-${bookingId}.docx`);
    await fs.promises.writeFile(tmpDocx, buffer);

    // 3) Конвертируем docx → html через LibreOffice
    execSync(`libreoffice --headless --convert-to html --outdir ${tmpdir()} ${tmpDocx}`);
    const tmpHtml = tmpDocx.replace(/\.docx$/, ".html");

    // 4) html → pdf через puppeteer
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto("file://" + tmpHtml, { waitUntil: "networkidle0" });
    const tmpPdf = tmpDocx.replace(/\.docx$/, ".pdf");
    await page.pdf({ path: tmpPdf, format: "A4" });
    await browser.close();

    // 5) Найдём (или создадим) папку с именем agencyName внутри ROOT_FOLDER_ID
    const list = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and name='${agencyName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
    });
    let folderId: string;
    if (list.data.files && list.data.files.length) {
      folderId = list.data.files[0].id!;
    } else {
      const mk = await drive.files.create({
        requestBody: {
          name: agencyName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [ROOT_FOLDER_ID],
        },
        fields: "id",
      });
      folderId = mk.data.id!;
    }

    // 6) Загружаем PDF в Drive
    const fileName = `${bookingId}-contract.pdf`;
    const upload = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: { mimeType: "application/pdf", body: fs.createReadStream(tmpPdf) },
      fields: "id",
    });
    const fileId = upload.data.id!;

    // 7) Делаем его доступным по ссылке
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });
    const link = `https://drive.google.com/uc?id=${fileId}&export=download`;

    // 8) Сохраняем ссылку в Firestore в документе брони
    await firestore.collection("bookings").doc(bookingId).update({
      contractLinks: google.firestore.FieldValue.arrayUnion(link),
    });

    return res.status(200).json({ link });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Contract generation failed", details: String(e) });
  }
}