import { useState } from "react";
import { useRouter } from "next/router";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Head from "next/head";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"]))
    }
  };
}

export default function ResetPassword() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage(t("resetLinkSent"));
    } catch (err: any) {
      setError(err.message || "Помилка під час надсилання листа");
    }
  };

  return (
    <>
      <Head>
        <title>Crocus CRM – {t("forgotPassword")}</title>
      </Head>
      <LanguageSwitcher />

      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <form onSubmit={handleReset} className="p-6 bg-white rounded shadow-md w-80">
          <h1 className="text-2xl font-bold mb-4 text-center">{t("forgotPassword")}</h1>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          {message && <p className="text-green-600 text-sm mb-3">{message}</p>}

          <label className="block text-sm font-medium mb-1">{t("email")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full mb-4 px-3 py-2 border rounded"
          />

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            {t("sendResetLink")}
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mt-4 text-sm text-blue-600 hover:underline w-full text-center"
          >
            ← {t("backToLogin")}
          </button>
        </form>
      </div>
    </>
  );
}