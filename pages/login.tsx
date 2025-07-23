import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import Head from "next/head";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

export default function Login() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const {
    login,
    user,
    loading,
    isAgent,
    isManager,
    isSupermanager,
    isAdmin,
    isOlimpya,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
    } catch (err: any) {
      setError(t("loginError") || "Ошибка входа. Проверьте email и пароль.");
      console.error("Login error:", err);
    }
  };

  useEffect(() => {
    if (loading) return;

    if (user) {
      // приоритет: admin → supermanager → manager → olimpya → agent
      if (isAdmin) {
        router.replace("/manager/bookings");
      } else if (isSupermanager) {
        router.replace("/manager/bookings");
      } else if (isManager) {
        router.replace("/manager/bookings");
      } else if (isOlimpya) {
        router.replace("/olimpya/bookings");
      } else if (isAgent) {
        router.replace("/agent/bookings");
      } else {
        router.replace("/"); // fallback
      }
    }
  }, [
    user,
    loading,
    isAgent,
    isManager,
    isSupermanager,
    isAdmin,
    isOlimpya,
    router,
  ]);

  return (
    <>
      <Head>
        <title>{`Crocus CRM – ${t("login")}`}</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <form
          onSubmit={handleSubmit}
          className="p-6 bg-white rounded shadow-md w-80"
        >
          <LanguageSwitcher />
          <h1 className="text-2xl font-bold mb-4 text-center">
            Crocus CRM
          </h1>

          {error && (
            <p className="text-red-600 text-sm mb-3 text-center">{error}</p>
          )}

          <label className="block text-sm font-medium mb-1">{t("email")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 px-3 py-2 border rounded"
            required
          />

          <label className="block text-sm font-medium mb-1">
            {t("password")}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-4 px-3 py-2 border rounded"
            required
          />

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            {loading ? `${t("login")}...` : t("login")}
          </button>

          <div className="mt-4 flex flex-col items-center text-sm space-y-2">
            <button
              type="button"
              onClick={() => router.push("/reset-password")}
              className="text-blue-600 hover:underline"
            >
              {t("forgotPassword")}
            </button>
            <button
              type="button"
              onClick={() => router.push("/register")}
              className="text-blue-600 hover:underline"
            >
              {t("register")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}