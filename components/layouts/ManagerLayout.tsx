// components/layouts/ManagerLayout.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "next-i18next";
import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const DEFAULT_BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "CROCUS CRM";

type Props = {
  children: React.ReactNode;
  /** Растягиваем шапку (header) на всю ширину окна */
  fullWidthHeader?: boolean;
  /** Растягиваем основной контент (main) на всю ширину окна */
  fullWidthMain?: boolean;
};

export default function ManagerLayout({
  children,
  fullWidthHeader = false,
  fullWidthMain = false,
}: Props) {
  const router = useRouter();
  const { t, i18n, ready } = useTranslation("common");
  const { logout, userData } = useAuth();

  // Безопасный t: если namespace не готов или ключ не найден — отдаём фолбэк
  const safeT = (key: string, fallback?: string) => {
    if (!ready) return fallback ?? key;
    const val = t(key);
    return val === key ? (fallback ?? key) : val;
  };

  const brand = safeT("brand", DEFAULT_BRAND);

  const nav = [
    { href: "/manager/bookings", label: safeT("navBookings", "Bookings") },
    { href: "/manager/balances", label: safeT("navBalances", "Balances") },
    { href: "/manager/payouts",  label: safeT("navPayouts",  "Payouts") },
    { href: "/manager/users",    label: safeT("navUsers",    "Users") },
    // если основная точка входа — сразу на транзакции, можно поставить "/finance/transactions"
    { href: "/finance",          label: safeT("navFinance",  "Finance") },
  ];

  const [showLangs, setShowLangs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const isActive = (h: string) => router.pathname.startsWith(h);

  const changeLanguage = async (lng: string) => {
    setShowLangs(false);
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
        <div
          className={
            fullWidthHeader
              ? "w-full px-4 py-3 flex items-center justify-between"
              : "max-w-7xl mx-auto px-4 py-3 flex items-center justify-between"
          }
        >
          <span className="font-bold text-xl text-indigo-700" suppressHydrationWarning>
            {brand}
          </span>

          <nav className="flex gap-2 sm:gap-4">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`text-sm font-medium transition-colors duration-200 px-2 sm:px-3 py-2 rounded-md ${
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
            {/* Language Selector */}
            <div className="relative" ref={langRef}>
              <button
                onClick={() => setShowLangs(!showLangs)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-black"
              >
                <Globe className="w-4 h-4" />
                {safeT("language", "Language")}
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

            {/* User Menu */}
            <div className="relative" ref={userRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-black"
              >
                <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                  {userData?.managerName?.charAt(0).toUpperCase() ?? "M"}
                </div>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 mt-2 bg-white border rounded shadow-md w-44 z-50">
                  <div className="px-4 py-2 text-sm text-gray-600">
                    {userData?.managerName ?? "Manager"}
                  </div>
                  <hr />
                  <Link
                    href="/manager/profile"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {safeT("profile", "Profile")}
                  </Link>
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-red-600"
                    onClick={logout}
                  >
                    {safeT("logout", "Logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main
        className={
          fullWidthMain
            ? "w-full max-w-none px-4 py-6"
            : "mx-auto max-w-7xl px-4 py-6"
        }
      >
        {children}
      </main>
    </>
  );
}