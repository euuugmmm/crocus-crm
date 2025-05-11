/* pages/api/telegram/webhook.ts ----------------------------------- */
import type { NextApiRequest, NextApiResponse } from "next";
import getRawBody   from "raw-body";
import { adminDB }  from "@/lib/firebaseAdmin";   //  ← убрали admin
import { Timestamp } from "firebase-admin/firestore"; // если нужен реальный timestamp

export const config = { api: { bodyParser: false } };

/* маленький helper для отправки сообщения */
async function send(chatId: number | string, text: string) {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    }
  );
}

/* --------------------------------------------------------------- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");
  /* 1. получаем update от Telegram */
  const raw  = await getRawBody(req);          // <Buffer ...>
  const body = JSON.parse(raw.toString());     // объект update

  const msg = body?.message;
  if (!msg) return res.status(200).end("no message");

  const chatId = msg.chat.id;
  const text   = String(msg.text || "").trim().toUpperCase();   // "ABC123"

  /* 2. если это 6-символьный PIN — ищем в /users */
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
        tgLinkedAt : Timestamp.now(),                     // real timestamp
        tgPin      : null,                                // «удаляем» PIN
      });
      await send(chatId, "✅ Успешно! Уведомления включены.");
    }
  } else {
    /* 3. любое другое сообщение */
    await send(chatId, "Отправьте одноразовый PIN из CRM, чтобы связать аккаунт.");
  }

  res.status(200).end("ok");
}