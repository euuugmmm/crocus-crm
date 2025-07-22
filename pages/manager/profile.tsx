// pages/manager/profile.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import UploadSignedContract from "@/components/UploadSignedContract";
import LinkTelegramButton from "@/components/LinkTelegramButton";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return { props: { ...(await serverSideTranslations(locale, ["common"])) } };
}

export default function ManagerProfilePage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { user, loading, isManager } = useAuth();

  const [notifyLang, setNotifyLang] = useState("ru");
  const [saved, setSaved] = useState(false);
  const [lastGen, setLastGen] = useState<string | null>(null);
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isManager) {
      router.replace("/agent/profile");
      return;
    }

    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.data() as any;
      setNotifyLang(data.notifyLang || "ru");
      setLastGen(data.lastContract?.link || null);
      setSigned(data.lastContract?.signedLink || null);
    });
  }, [loading, user, isManager, router]);

  async function saveSettings() {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), { notifyLang });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return <p className="text-center mt-6">…</p>;
  }

  return (
    <ManagerLayout>
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Telegram и уведомления */}
        <section className="bg-white rounded shadow p-6 space-y-6">
          <h1 className="text-2xl font-bold">{t("profileTitle")}</h1>

          <div>
            <h2 className="text-lg font-medium mb-1">{t("connectTelegram")}</h2>
            <LinkTelegramButton />
          </div>

          <div>
            <h2 className="text-lg font-medium mb-1">
              {t("selectNotifyLanguage")}
            </h2>
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
            onClick={saveSettings}
            disabled={saved}
            className={`${
              saved ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"
            } text-white`}
          >
            {saved ? t("saved") : t("save")}
          </Button>
        </section>

        {/* Генерация и подпись контракта */}
        <section className="bg-white rounded shadow p-6 space-y-4">
          <h2 className="text-xl font-semibold">{t("contracts")}</h2>
          <p className="text-sm">{t("contractInstructions")}</p>

          <Link
            href="/manager/contract"
            className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
          >
            {t("generateContract")}
          </Link>

          {lastGen ? (
            <p className="text-sm">
              {t("lastContract")}:{" "}
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
            <UploadSignedContract
              userId={user!.uid}
              lastLink={signed}
            />
          )}
        </section>
      </main>
    </ManagerLayout>
  );
}