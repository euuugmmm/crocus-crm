// lib/telegram.ts
export async function sendTelegram(chatId:number|string, text:string) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ chat_id:chatId, text })
  });
}

/**
 * Утилита «по userId»; безопасно ничего не делает,
 * если пользователь ещё не подвязал бота.
 */
import { adminDB } from "./firebaseAdmin";
export async function notifyUser(userId:string, text:string){
  const doc = await adminDB.doc(`users/${userId}`).get();
  const chatId = doc.data()?.tgChatId;
  if (chatId) await sendTelegram(chatId,text);
}