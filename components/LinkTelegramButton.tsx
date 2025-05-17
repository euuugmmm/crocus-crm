"use client";

import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { useTranslation } from "next-i18next";

const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOTNAME ?? "crocus_notify_bot";

export default function LinkTelegramButton() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const [linked, setLinked] = useState<boolean>(!!user?.tgChatId);
  const [pin, setPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), snap => {
      setLinked(!!snap.data()?.tgChatId);
      if (snap.data()?.tgChatId) setPin(null);
    });
    return unsub;
  }, [user]);

  const genPin = async () => {
    if (!user) return;
    const code = nanoid(6).toUpperCase();
    await updateDoc(doc(db, "users", user.uid), { tgPin: code });
    setPin(code);
    setCopied(false);
  };

  const copy = async () => {
    if (!pin) return;
    await navigator.clipboard.writeText(pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!user) return null;

  return (
    <>
      <Button
        disabled={linked}
        onClick={linked ? undefined : genPin}
        className={
          linked
            ? "bg-gray-200 text-gray-700 cursor-default"
            : "bg-[#229ED9] hover:bg-[#1C8EC5] text-white"
        }
        title={linked ? t("telegram.connectedTitle") : t("telegram.connectTitle")}
      >
        {linked ? t("telegram.connectedLabel") : t("telegram.connectLabel")}
      </Button>

      {pin && !linked && (
        // Фон-бекдроп
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          {/* Модальное окно */}
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 relative">
            {/* Кнопка закрытия */}
            <button
              onClick={() => setPin(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              &#10005;
            </button>

            <p className="text-base mb-4 leading-snug">
              {t("telegram.popupStep1")}<br />
              {t("telegram.popupStep2")}
            </p>

            <div className="flex items-center justify-between mb-6">
              <code className="font-mono text-2xl">{pin}</code>
              <button onClick={copy} className="text-sm text-indigo-600 hover:underline">
                {copied ? t("copied") : t("copy")}
              </button>
            </div>

            <a
              href={`https://t.me/${BOT_NAME}?start=${pin}`}
              target="_blank"
              rel="noreferrer"
              className="block text-center bg-[#229ED9] hover:bg-[#1C8EC5] text-white rounded-lg py-2 font-medium"
            >
              {t("telegram.openBot")}
            </a>

            <p className="mt-4 text-sm text-gray-500">
              {t("telegram.popupAfterConfirmation")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}