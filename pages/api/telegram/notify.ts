import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/admin";

const BOT = process.env.TELEGRAM_BOT_TOKEN!;
const BOT_URL = `https://api.telegram.org/bot${BOT}/sendMessage`;

async function send(chatId: number | string, text: string) {
  await fetch(BOT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { agentId, managers, type, data } = req.body;

  /* --- уведомление агенту --- */
  if (agentId) {
    const user = (await adminDB.doc(`users/${agentId}`).get()).data() as any;
    if (user?.tgChatId) {
      const msg = makeText(type, data);
      if (msg) await send(user.tgChatId, msg);
    }
  }

  /* --- уведомление всем менеджерам --- */
  if (managers) {
    const snap = await adminDB.collection("users")
      .where("role", "==", "manager")
      .where("tgChatId", ">", 0)
      .get();

    const msg = makeText(type, data);
    if (msg) {
      const promises = snap.docs.map(doc => send(doc.data().tgChatId, msg));
      await Promise.all(promises);
    }
  }

  res.status(200).end("ok");
}

/* ---------- шаблоны сообщений ---------- */
function makeText(type: string, data: any): string | null {
  if (type === "newBooking") {
    return (
      `🆕 <b>Новая заявка</b>\n` +
      `№ <b>${data.bookingNumber || "—"}</b>\n` +
      `${data.hotel || ""} / ${data.operator || ""}\n` +
      `Даты: ${data.checkIn || "—"} – ${data.checkOut || "—"}\n` +
      `Статус: <b>${data.status || "Новая"}</b>\n` +
      `Агент: ${data.agentName || "—"} (${data.agentAgency || "—"})`
    );
  }

  if (type === "newUser") {
    return (
      `👤 <b>Новая регистрация</b>\n` +
      `Агентство: <b>${data.agencyName}</b>\n` +
      `Имя: <b>${data.name}</b>\n` +
      `Email: ${data.email}`
    );
  }

  return null;
}