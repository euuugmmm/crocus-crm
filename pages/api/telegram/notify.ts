// pages/api/telegram/notify.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDB } from "@/lib/firebaseAdmin";

const BOT_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
async function send(chatId: number | string, text: string) {
  await fetch(BOT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

const agentTemplates = {
  newBooking: {
    ru: (d: any) => `🆕 <b>Новая заявка</b>
№ <b>${d.bookingNumber}</b>
${d.hotel} / ${d.operator}
Скоро наш менеджер возьмёт её в работу. Вы будете получать важные обновления здесь.
Для дополнительной информации свяжитесь с нами.`,
    en: (d: any) => `🆕 <b>New booking</b>
No. <b>${d.bookingNumber}</b>
${d.hotel} / ${d.operator}
Our manager will process it soon. You'll receive updates here.
For more info, please contact us.`,
    ua: (d: any) => `🆕 <b>Нове замовлення</b>
№ <b>${d.bookingNumber}</b>
${d.hotel} / ${d.operator}
Наш менеджер опрацює замовлення незабаром. Ви отримаєте всі оновлення тут.
Для додаткової інформації зв'яжіться з нами.`,
  },
  statusChanged: {
    ru: (d: any) => `✏️ <b>Заявка №${d.bookingNumber}</b> изменила статус с <b>${d.oldStatus}</b> на <b>${d.newStatus}</b>.
Для дополнительной информации свяжитесь с нами.`,
    en: (d: any) => `✏️ <b>Booking №${d.bookingNumber}</b> status changed from <b>${d.oldStatus}</b> to <b>${d.newStatus}</b>.
For more details, please contact us.`,
    ua: (d: any) => `✏️ <b>Заявка №${d.bookingNumber}</b> змінила статус з <b>${d.oldStatus}</b> на <b>${d.newStatus}</b>.
Для додаткової інформації зв'яжіться з нами.`,
  },
  newComment: {
    ru: (d: any) => `💬 <b>Новый комментарий</b> к заявке №<b>${d.bookingNumber}</b>:
${d.comment}
Вы можете ответить в CRM.`,
    en: (d: any) => `💬 <b>New comment</b> on booking №<b>${d.bookingNumber}</b>:
${d.comment}
You can reply in the CRM.`,
    ua: (d: any) => `💬 <b>Новий коментар</b> до заявки №<b>${d.bookingNumber}</b>:
${d.comment}
Ви можете відповісти в CRM.`,
  },
};

const managerTemplates = {
  newBooking: {
    ru: (d: any) => `🆕 <b>Новая заявка №${d.bookingNumber}</b>
${d.hotel} / ${d.operator}
От агента: ${d.agentName} (${d.agentAgency})
Подробнее в CRM.`,
  },
  newUser: {
    ru: (d: any) => `👤 <b>Новая регистрация агента</b>
Агентство: <b>${d.agencyName}</b>
Имя: <b>${d.name}</b>
Email: ${d.email}`,
  },
  newComment: {
    ru: (d: any) => `💬 <b>Новый комментарий</b> к заявке №<b>${d.bookingNumber}</b> от агента:
${d.comment}
Смотрите подробности в CRM.`,
  },
};

const STATUS_LABELS: Record<string, Record<string, string>> = {
  ru: {
    new: "Новая",
    awaiting_payment: "Ожидание оплаты",
    paid: "Оплачено туристом",
    awaiting_confirm: "Ожидает подтверждения",
    confirmed: "Подтверждено",
    finished: "Завершено",
    cancelled: "Отменена",
  },
  en: {
    new: "New",
    awaiting_payment: "Awaiting Payment",
    paid: "Paid",
    awaiting_confirm: "Awaiting Confirm",
    confirmed: "Confirmed",
    finished: "Finished",
    cancelled: "Cancelled",
  },
  ua: {
    new: "Нова",
    awaiting_payment: "Очікує оплати",
    paid: "Оплачено туристом",
    awaiting_confirm: "Очікує підтвердження",
    confirmed: "Підтверджено",
    finished: "Завершено",
    cancelled: "Скасовано",
  },
};

function makeText(
  templates: Record<string, any>,
  type: string,
  data: any,
  lang: string
) {
  const group = templates[type];
  if (group) return (group[lang] || group.ru)(data);
  return {
    ru: "⚠️ Неподдерживаемый тип уведомления.",
    en: "⚠️ Unsupported notification type.",
    ua: "⚠️ Непідтримуваний тип сповіщення.",
  }[lang];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  const { agentId, managers, type, data: origData } = req.body as {
    agentId?: string;
    managers?: boolean;
    type: string;
    data: any;
  };

  // Сохраним оригинальные коды статусов (для statusChanged)
  const origOld = origData.oldStatus;
  const origNew = origData.newStatus;

  // 1) уведомление агенту
  if (agentId) {
    const snap = await adminDB.doc(`users/${agentId}`).get();
    const user = snap.data() as any;
    if (user?.tgChatId) {
      const lang = user.notifyLang || "ru";
      const data = { ...origData };
      if (type === "statusChanged") {
        data.oldStatus = STATUS_LABELS[lang][origOld] || origOld;
        data.newStatus = STATUS_LABELS[lang][origNew] || origNew;
      }
      const text = makeText(agentTemplates, type, data, lang);
      await send(user.tgChatId, text);
    }
  }

  // 2) уведомление менеджерам (только на русском)
  if (managers) {
    const snap = await adminDB
      .collection("users")
      .where("role", "==", "manager")
      .where("tgChatId", ">", 0)
      .get();

    await Promise.all(
      snap.docs.map(async (d) => {
        const u = d.data() as any;
        const data = { ...origData };
        const text = makeText(managerTemplates, type, data, "ru");
        await send(u.tgChatId, text);
      })
    );
  }

  res.status(200).end("ok");
}