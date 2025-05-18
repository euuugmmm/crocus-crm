// pages/api/telegram/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB }   from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

/** ⚠️ bodyParser включён по умолчанию, можно убрать эту строку */
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

function getMessages(lang: string) {
  return {
    invalidPin: {
      ru: "❌ PIN не найден или уже использован.",
      en: "❌ PIN not found or already used.",
      ua: "❌ PIN не знайдено або вже використано.",
    },
    success: {
      ru: "✅ Успешно! Уведомления включены.",
      en: "✅ Success! Notifications enabled.",
      ua: "✅ Успішно! Сповіщення увімкнено.",
    },
    promptPin: {
      ru: "Отправьте одноразовый PIN из CRM, чтобы связать аккаунт.",
      en: "Send the one-time PIN from CRM to link your account.",
      ua: "Відправте одноразовий PIN з CRM, щоб зв'язати акаунт.",
    },
  } as const;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const body = req.body as any;
  const msg  = body?.message;
  if (!msg) return res.status(200).end("no message");

  const chatId = msg.chat.id;
  const text   = String(msg.text || "").trim().toUpperCase();

  // Определяем пользователя по chatId, чтобы взять его notifyLang
  const userSnap = await adminDB
    .collection("users")
    .where("tgChatId", "==", chatId)
    .limit(1)
    .get();

  const userData = userSnap.docs[0]?.data() as any;
  const lang     = userData?.notifyLang || "ru";

  const msgs = getMessages(lang);

  if (/^[A-Z0-9]{6}$/.test(text)) {
    // Ищем по PIN
    const qsnap = await adminDB
      .collection("users")
      .where("tgPin", "==", text)
      .limit(1)
      .get();

    if (qsnap.empty) {
      await send(chatId, msgs.invalidPin[lang]);
    } else {
      await qsnap.docs[0].ref.update({
        tgChatId:   chatId,
        tgLinkedAt: Timestamp.now(),
        tgPin:      null,
      });
      await send(chatId, msgs.success[lang]);
    }
  } else {
    await send(chatId, msgs.promptPin[lang]);
  }

  res.status(200).end("ok");
}