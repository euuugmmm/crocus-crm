// pages/olimpya/profile.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LinkTelegramButton from "@/components/LinkTelegramButton";
import UploadSignedContract from "@/components/UploadSignedContract";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

export default function OlimpyProfilePage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { user, userData, loading, isOlimpya, logout } = useAuth();

  const [notifyLang, setNotifyLang] = useState("ru");
  const [saved, setSaved] = useState(false);

  const [lastGen, setLastGen] = useState<string | null>(null);
  const [signed, setSigned] = useState<string | null>(null);

  // Защита маршрута и подписка на данные профиля
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isOlimpya) {
      router.replace("/");
      return;
    }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const d = snap.data() as any || {};
      setNotifyLang(d.notifyLang || "ru");
      setLastGen(d.lastContract?.link || null);
      setSigned(d.lastContract?.signedLink || null);
    });
    return () => unsub();
  }, [loading, user, isOlimpya, router]);

  async function save() {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), { notifyLang });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (loading) {
    return <p className="text-center mt-4">…</p>;
  }

  const nav = [
    { href: "/olimpya/bookings", label: t("navBookings") },
    { href: "/olimpya/balance",  label: t("navBalance")  },
    { href: "/olimpya/history",  label: t("navHistory")  },
    { href: "/olimpya/profile",  label: t("profile")     },
  ];
  const isActive = (href: string) => router.pathname === href;

  return (
    <>
      <LanguageSwitcher />

      {/* HEADER */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>
          <nav className="flex gap-4">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 text-sm ${
                  isActive(n.href)
                    ? "border-b-2 border-indigo-600 text-black"
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

      {/* MAIN CONTENT */}
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Telegram & Notifications */}
        <section className="bg-white rounded shadow p-6 space-y-6">
          <h1 className="text-2xl font-bold">{t("profileTitle")}</h1>

          <div>
            <h2 className="text-lg font-medium mb-1">{t("connectTelegram")}</h2>
            <LinkTelegramButton />
          </div>

          <div>
            <h2 className="text-lg font-medium mb-1">{t("selectNotifyLanguage")}</h2>
            <select
              value={notifyLang}
              onChange={(e) => setNotifyLang(e.target.value)}
              className="border rounded p-2"
            >
              <option value="ru">{t("languages.ru")}</option>
              <option value="en">{t("languages.en")}</option>
              <option value="ua">{t("languages.ua")}</option>
            </select>
          </div>

          <Button
            onClick={save}
            disabled={saved}
            className={`text-white ${
              saved
                ? "bg-gray-400 cursor-default"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {saved ? t("saved") : t("save")}
          </Button>
        </section>

        {/* Contracts */}
        <section className="bg-white rounded shadow p-6 space-y-4">
          <h2 className="text-xl font-semibold">{t("contracts")}</h2>
          <p className="text-sm">{t("contractInstructions")}</p>

          <Link
            href="/olimpya/contract"
            className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
          >
            {t("generateContract")}
          </Link>

          {lastGen ? (
            <p className="text-sm">
              {t("lastContract")}{" "}
              <a
                href={lastGen}
                target="_blank"
                rel="noreferrer"
                className="underline text-sky-600"
              >
                {t("download")}
              </a>
            </p>
          ) : (
            <p className="text-sm text-gray-500">{t("noContracts")}</p>
          )}

          {lastGen && !signed && (
            <UploadSignedContract userId={user!.uid} />
          )}

          {signed && (
            <UploadSignedContract userId={user!.uid} lastLink={signed} />
          )}
        </section>
      </main>
    </>
  );
}