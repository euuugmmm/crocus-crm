// pages/register.tsx

import { useState } from "react";
import { useRouter } from "next/router";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Head from "next/head";
import LanguageSwitcher from "@/components/LanguageSwitcher";

/* ───── i18n ───── */
export async function getServerSideProps({ locale }: { locale: string }) {
  return { props: { ...(await serverSideTranslations(locale, ["common"])) } };
}

export default function Register() {
  const { t } = useTranslation("common");
  const router = useRouter();

  const [agencyName, setAgencyName] = useState("");
  const [agentName,  setAgentName]  = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [error,      setError]      = useState("");

  /* ───── регистрация ───── */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      /* ➊ создаём пользователя в Firebase-Auth */
      const { user } = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      /* ➋ берём порядковый номер агента у бекенда */
      const seqRes = await fetch("/api/next-agent-no", { method: "POST" });
      const { agentNo } = await seqRes.json();
      if (!agentNo) throw new Error("Counter error");

      /* ➌ сохраняем профиль пользователя */
      await setDoc(doc(db, "users", user.uid), {
        agencyName,
        agentName,
        email,
        role       : "agent",
        agentNo,
        contractSeq: 0,
        createdAt  : new Date(),
      });

      /* ➍ выставляем custom-claim role=agent через защищённый API-роут */
      const idToken = await user.getIdToken(); // свежий JWT
      await fetch("/api/users/set-role", {
        method : "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid: user.uid, role: "agent" }),
      });

      /* ➎ уведомляем менеджеров (телеграм-бот) */
      fetch("/api/telegram/notify", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          managers: true,
          type   : "newUser",
          data   : { email, name: agentName, agentId: user.uid, agencyName },
        }),
      }).catch((err) => console.error("[tg notify]", err));

      /* ➏ обновляем displayName и переходим */
      await updateProfile(user, { displayName: agentName });
      router.push("/agent/bookings");
    } catch (err: any) {
      setError(err.message || "Ошибка регистрации");
    }
  };

  /* ───── UI ───── */
  return (
    <>
      <Head>
        <title>{`Crocus CRM – ${t("register")}`}</title>
      </Head>

      <LanguageSwitcher />

      <div className="p-6 max-w-md mx-auto">
        <h1 className="text-2xl font-semibold mb-4 text-center">
          {t("registerAgent")}
        </h1>

        {error && (
          <p className="text-red-500 mb-4 text-center">{error}</p>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text"
            placeholder={t("agencyName")}
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            required
            className="w-full border p-2 rounded"
          />
          <input
            type="text"
            placeholder={t("agentName")}
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            required
            className="w-full border p-2 rounded"
          />
          <input
            type="email"
            placeholder={t("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border p-2 rounded"
          />
          <input
            type="password"
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border p-2 rounded"
          />

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded"
          >
            {t("register")}
          </button>
        </form>
      </div>
    </>
  );
}