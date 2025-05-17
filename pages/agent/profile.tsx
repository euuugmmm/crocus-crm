// pages/agent/profile.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LinkTelegramButton from "@/components/LinkTelegramButton";
import { db } from "@/firebaseConfig";
import Link from "next/link";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

export default function ProfilePage() {
  const { t } = useTranslation("common");
  const { user, logout } = useAuth();
  const [notifyLang, setNotifyLang] = useState<string>("ru");
  const [saved, setSaved] = useState<boolean>(false);
  const router = useRouter();

  // Загрузка текущего языка уведомлений из Firestore
  useEffect(() => {
    if (!user) return;
    const userDoc = doc(db, "users", user.uid);
    getDoc(userDoc).then(snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.data() as any;
        setNotifyLang(data.notifyLang || "ru");
      }
    });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    const userDoc = doc(db, "users", user.uid);
    await updateDoc(userDoc, { notifyLang });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Навигация
  const nav = [
    { href: "/agent/bookings", label: t("navBookings") },
    { href: "/agent/balance",  label: t("navBalance")  },
    { href: "/agent/history",  label: t("navHistory")  },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  return (
    <>
      <LanguageSwitcher />

      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">{t("brand")}</span>

          <nav className="flex gap-4">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  isActive(n.href)
                    ? "border-indigo-600 text-black"
                    : "border-transparent text-gray-600 hover:text-black"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <Button size="sm" variant="destructive" onClick={logout}>
            {t("logout")}
          </Button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto mt-6 p-6 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-4">{t("profileTitle")}</h1>

        <section className="mb-6">
          <h2 className="text-lg font-medium mb-2">{t("connectTelegram")}</h2>
          <LinkTelegramButton />
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-medium mb-2">{t("selectNotifyLanguage")}</h2>
          <select
            value={notifyLang}
            onChange={(e) => setNotifyLang(e.target.value)}
            className="border rounded p-2"
          >
            <option value="ru">{t("languages.ru")}</option>
            <option value="en">{t("languages.en")}</option>
            <option value="ua">{t("languages.ua")}</option>
          </select>
        </section>
            
        <div className="flex space-x-2">
          <Button
            onClick={handleSave}
            disabled={saved}
            className={`${
              saved ? "bg-gray-400 cursor-default" : "bg-green-600 hover:bg-green-700"
            } text-white`}
          >
            {saved ? t("saved") : t("save")}
          </Button>

        </div>
      </div>
    </>
  );
}
