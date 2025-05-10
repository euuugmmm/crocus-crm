// pages/api/upload-drive.ts
import { google } from "googleapis";
import { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import path from "path";

export const config = { api: { bodyParser: false } };

const SERVICE_ACCOUNT_FILE = path.resolve(process.cwd(), "crocuscrm-5323c46d9f54.json");
const FOLDER_ID = "160xWSmlUlvocw4t7-u5uQiwhV1gsGG7D";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
  try {
    if (err) throw err;

    const bookingNum = String(fields.bookingId ?? "БезID");

    // ➊ Нормализуем: files.file может быть File | File[]
    const fileArr = Array.isArray(files.file) ? files.file : [files.file];
    if (!fileArr.length || !fileArr[0]) throw new Error("Файл не передан");

    /* ---------- Google Drive auth ---------- */
    const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}"),
  scopes: ["https://www.googleapis.com/auth/drive"],
});
    const drive = google.drive({ version: "v3", auth });

    const links: string[] = [];

    // ➋ загружаем каждый файл
    for (const f of fileArr) {
      // @ts-ignore — совместимость v1/v2/v3 Formidable
      const tmp = f.filepath || f.path;
      if (!tmp) continue;

      const { data } = await drive.files.create({
        requestBody: {
          // CRT-01021-ваучер-1.pdf и т.д.
          name   : `${bookingNum}-${links.length + 1}.pdf`,
          parents: [FOLDER_ID],
        },
        media: { mimeType: "application/pdf", body: fs.createReadStream(tmp) },
        fields: "id",
      });

      await drive.permissions.create({
        fileId    : data.id!,
        requestBody: { role: "reader", type: "anyone" },
      });

      links.push(`https://drive.google.com/uc?id=${data.id}&export=download`);
    }

    return res.status(200).json({ links });
  } catch (e) {
    console.error("Drive upload error:", e);
    return res.status(500).json({ error: "Drive upload failed", details: String(e) });
  }
});
}