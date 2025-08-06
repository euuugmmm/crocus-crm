// components/AgentLayout.tsx
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { useTranslation } from "next-i18next";
import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function AgentLayout({
  children,
  pageTitle, // опциональный проп для динамического заголовка
}: {
  children: React.ReactNode;
  pageTitle?: string;
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation("common");
  const { logout, userData } = useAuth();

  // Если pageTitle не передан, возьмём бренд
  const title = pageTitle
    ? `${pageTitle} — ${t("brand")}`
    : t("brand");

  const nav = [
    { href: "/agent/bookings", label: t("navBookings") },
    { href: "/agent/balance",  label: t("navBalance") },
    { href: "/agent/history",  label: t("navHistory") },
  ];

  const [showLangs, setShowLangs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const isActive = (h: string) => router.pathname.startsWith(h);

  const changeLanguage = async (lng: string) => {
    await i18n.changeLanguage(lng);
    setShowLangs(false);
    // Перенавигация с новым locale
    router.push(router.asPath, router.asPath, { locale: lng });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        langRef.current && !langRef.current.contains(event.target as Node) &&
        userRef.current && !userRef.current.contains(event.target as Node)
      ) {
        setShowLangs(false);
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <header className="w-full bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-xl text-indigo-700">{t("brand")}</span>

          <nav className="flex gap-6">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`text-sm font-medium transition-colors duration-200 px-3 py-2 rounded-md ${
                  isActive(n.href)
                    ? "bg-indigo-100 text-indigo-800"
                    : "text-gray-600 hover:text-black hover:bg-gray-100"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {/* Селектор языка */}
            <div className="relative" ref={langRef}>
              <button
                onClick={() => setShowLangs(!showLangs)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-black"
              >
                <Globe className="w-4 h-4" /> {t("language")}
              </button>
              {showLangs && (
                <div className="absolute right-0 mt-2 bg-white border rounded shadow-md z-50 py-2 min-w-[80px] flex flex-col gap-1">
                  {["en", "ru", "ua"].map((lng) => (
                    <button
                      key={lng}
                      onClick={() => changeLanguage(lng)}
                      className={`px-3 py-1 text-sm rounded text-center transition ${
                        i18n.language === lng
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                      }`}
                    >
                      {lng.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Меню пользователя */}
            <div className="relative" ref={userRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-black"
              >
                <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                  {userData?.agentName?.charAt(0).toUpperCase() ?? "A"}
                </div>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 mt-2 bg-white border rounded shadow-md w-40 z-50">
                  <div className="px-4 py-2 text-sm text-gray-600">
                    {userData?.agentName ?? "Agent"}
                  </div>
                  <hr />
                  <Link
                    href="/agent/profile"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {t("profile")}
                  </Link>
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-red-600"
                    onClick={logout}
                  >
                    {t("logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-6">{children}</main>
    </>
  );
}