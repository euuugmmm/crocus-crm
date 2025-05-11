/* pages/api/telegram/webhook.ts */
import type { NextApiRequest, NextApiResponse } from "next";
import getRawBody from "raw-body";
import { adminDB } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export const config = { api: { bodyParser: false } };

/* helper для отправки сообщения в Telegram */
async function send(chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

/* основной webhook-обработчик */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const raw  = await getRawBody(req);
  const body = JSON.parse(raw.toString());

  const msg = body?.message;
  if (!msg) return res.status(200).end("no message");

  const chatId = msg.chat.id;
  const text   = String(msg.text || "").trim().toUpperCase();

  // Если текст — это 6-значный PIN
  if (/^[A-Z0-9]{6}$/.test(text)) {
    const qsnap = await adminDB
      .collection("users")
      .where("tgPin", "==", text)
      .limit(1)
      .get();

    if (qsnap.empty) {
      await send(chatId, "❌ PIN не найден или уже использован.");
    } else {
      const ref = qsnap.docs[0].ref;
      await ref.update({
        tgChatId   : chatId,
        tgLinkedAt : Timestamp.now(),
        tgPin      : null,
      });
      await send(chatId, "✅ Успешно! Уведомления включены.");
    }
  } else {
    await send(chatId, "Отправьте одноразовый PIN из CRM, чтобы связать аккаунт.");
  }

  res.status(200).end("ok");
}