/* components/LinkTelegramButton.tsx – замените на это */
"use client";

import { useEffect, useState } from "react";
import { nanoid }              from "nanoid";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db }                  from "@/firebaseConfig";
import { useAuth }             from "@/context/AuthContext";
import { Button }              from "@/components/ui/button";

const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOTNAME ?? "crocus_notify_bot";
const TG_BLUE  = "bg-[#229ED9] hover:bg-[#1C8EC5]";                  // фирменный цвет ТГ

export default function LinkTelegramButton() {
  const { user } = useAuth();
  const [linked , setLinked] = useState<boolean>(!!user?.tgChatId);
  const [pin    , setPin   ] = useState<string|null>(null);
  const [copied , setCopied] = useState(false);

  /*  слушаем юзер-док  */
  useEffect(()=>{
    if (!user) return;
    const unsub = onSnapshot(doc(db,"users",user.uid), snap=>{
      setLinked(!!snap.data()?.tgChatId);
      if (snap.data()?.tgChatId) setPin(null);
    });
    return unsub;
  },[user]);

  /*  выдаём одноразовый PIN  */
  const genPin = async () => {
    if (!user) return;
    const code = nanoid(6).toUpperCase();
    await updateDoc(doc(db,"users",user.uid),{ tgPin:code });
    setPin(code);
    setCopied(false);
  };

  /*  копировать  */
  const copy = async () => {
    if (!pin) return;
    await navigator.clipboard.writeText(pin);
    setCopied(true);
    setTimeout(()=>setCopied(false),1500);
  };

  if (!user) return null;

  /* ----------- button ----------- */
  return (
    <div className="relative">
      <Button
        disabled={linked}
        onClick={linked ? undefined : genPin}
        className={
          linked
            ? "bg-gray-200 text-gray-700 cursor-default"
            : `${TG_BLUE} text-white`
        }
        title={linked ? "Телеграм-уведомления подключены"
                      : "Подключить уведомления в Telegram"}
      >
        {linked ? "✅ Telegram-уведомления" : "🔔 Подключить Telegram"}
      </Button>

      {/* ---------- PIN-поп-ап ---------- */}
      {pin && !linked && (
        <div className="absolute right-0 mt-2 w-72 rounded border bg-white shadow-lg p-4 z-50">
          <p className="text-sm mb-2 leading-snug">
            1. Нажмите «Открыть бота»<br/>
            2. Отправьте PIN:
          </p>

          <div className="flex items-center justify-between mb-3">
            <code className="font-mono text-xl">{pin}</code>
            <button onClick={copy}
                    className="text-xs text-indigo-600 hover:underline">
              {copied ? "✔" : "копировать"}
            </button>
          </div>

          <a href={`https://t.me/${BOT_NAME}?start=${pin}`}
             target="_blank" rel="noreferrer"
             className={`${TG_BLUE} block text-center text-white rounded py-1 text-sm`}>
            Открыть бота
          </a>

          <p className="mt-2 text-xs text-gray-500">
            После подтверждения ботом окно закроется, а кнопка сменит цвет.
          </p>
        </div>
      )}
    </div>
  );
}