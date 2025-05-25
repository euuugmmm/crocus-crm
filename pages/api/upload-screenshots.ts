import { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import { google } from "googleapis";

export const config = { api: { bodyParser: false } };

const FOLDER_ID = process.env.SCREENSHOT_FOLDER_ID || "<YOUR_FOLDER_ID>";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const form = formidable({ multiples: true });
  form.parse(req, async (err, fields, files) => {
    try {
      if (err) throw err;

      const bookingNumber = String(fields.bookingNumber ?? "unknown");
      const fileArr = Array.isArray(files.file) ? files.file : [files.file];
      if (!fileArr[0]) throw new Error("No files uploaded");

      // Авторизация через сервисный аккаунт
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}"),
        scopes: ["https://www.googleapis.com/auth/drive"],
      });
      const drive = google.drive({ version: "v3", auth });

      const links: string[] = [];
      for (const f of fileArr) {
        const tmp = (f as any).filepath || (f as any).path;
        if (!tmp) continue;

        // Определяем расширение
        const extMatch = tmp.match(/\.(png|jpe?g)$/i);
        const ext = extMatch ? extMatch[0].toLowerCase() : "";
        const idx = links.length + 1;
        const name = `${bookingNumber}-${idx}${ext}`;

        // Загружаем
        const { data } = await drive.files.create({
          requestBody: { name, parents: [FOLDER_ID] },
          media: { mimeType: f.mimetype || "", body: fs.createReadStream(tmp) },
          fields: "id",
        });

        // Делаем доступ публичным
        await drive.permissions.create({
          fileId: data.id!,
          requestBody: { role: "reader", type: "anyone" },
        });

        // Ссылка на просмотр, не на скачивание
        links.push(`https://drive.google.com/uc?export=view&id=${data.id}`);
      }

      return res.status(200).json({ links });
    } catch (e: any) {
      console.error("Screenshot upload error", e);
      return res.status(500).json({ error: "Upload failed", details: e.message });
    }
  });
}