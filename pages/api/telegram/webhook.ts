/* pages/api/telegram/webhook.ts */
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB }   from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

/** ⚠️ bodyParser включён по умолчанию, можно вовсе убрать эту строку */
export const config = { api: { bodyParser: true } };

async function send(chatId: number | string, text: string) {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    },
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  /* ---------- НИКАКОГО  getRawBody  ---------- */
  const body = req.body as any;          // Next.js уже распарсил JSON
  const msg  = body?.message;
  if (!msg) return res.status(200).end("no message");

  const chatId = msg.chat.id;
  const text   = String(msg.text || "").trim().toUpperCase();

  if (/^[A-Z0-9]{6}$/.test(text)) {
    const qsnap = await adminDB
      .collection("users")
      .where("tgPin", "==", text)
      .limit(1)
      .get();

    if (qsnap.empty) {
      await send(chatId, "❌ PIN не найден или уже использован.");
    } else {
      await qsnap.docs[0].ref.update({
        tgChatId  : chatId,
        tgLinkedAt: Timestamp.now(),
        tgPin     : null,
      });
      await send(chatId, "✅ Успешно! Уведомления включены.");
    }
  } else {
    await send(chatId, "Отправьте одноразовый PIN из CRM, чтобы связать аккаунт.");
  }

  res.status(200).end("ok");
}