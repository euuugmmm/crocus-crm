/* pages/api/telegram/notify.ts -------------------------------- */
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

const BOT_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

const send = (chatId: number | string, text: string) =>
  fetch(BOT_URL, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { agentId, managers, type, data } = req.body;

  /* --- агенту --- */
  if (agentId) {
    const user = (await adminDB.doc(`users/${agentId}`).get()).data() as any;
    if (user?.tgChatId) await send(user.tgChatId, makeText(type, data));
  }

  /* --- менеджерам --- */
  if (managers) {
    const snap = await adminDB.collection("users")
      .where("role", "==", "manager")
      .where("tgChatId", ">", 0)
      .get();

    const msg = makeText(type, data);
    await Promise.all(snap.docs.map(d => send(d.data().tgChatId, msg)));
  }

  res.status(200).end("ok");
}

/* шаблоны ------------------------------------------------------ */
function makeText(type: string, d: any): string {
  if (type === "newBooking")
    return `🆕 <b>Новая заявка</b>
№ <b>${d.bookingNumber || "—"}</b>
${d.hotel || ""} / ${d.operator || ""}
Даты: ${d.checkIn || "—"} – ${d.checkOut || "—"}
Статус: <b>${d.status || "Новая"}</b>
Агент: ${d.agentName || "—"} (${d.agentAgency || "—"})`;

  if (type === "newUser")
    return `👤 <b>Новая регистрация</b>
Агентство: <b>${d.agencyName}</b>
Имя: <b>${d.name}</b>
Email: ${d.email}`;

  return "⚠️ Неподдерживаемый тип уведомления.";
}
