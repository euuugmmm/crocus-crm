/* pages/agent/contract.tsx */
"use client";

import { useRouter } from "next/router";
import Link          from "next/link";
import { useAuth }   from "@/context/AuthContext";
import ContractForm  from "@/components/ContractForm";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button }    from "@/components/ui/button";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }:{ locale:string }) {
  return { props:{ ...(await serverSideTranslations(locale,["common"])) } };
}

export default function ContractPage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { user, loading, isAgent, logout } = useAuth();

  /* --- guards --- */
  if (loading) return <p className="text-center mt-4">…</p>;
  if (!user || !isAgent) { router.replace("/login"); return null; }

  /* --- nav --- */
  const nav = [
    { href: "/agent/bookings", label: t("navBookings") },
    { href: "/agent/profile",  label: t("profile")     },
  ];
  const isActive = (href:string) => router.pathname.startsWith(href);

  /* --- UI --- */
  return (
    <>
      <LanguageSwitcher />

      {/* HEADER */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>

          <nav className="flex gap-4">
            {nav.map(n => (
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

      {/* CONTENT */}
      <main className="max-w-xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">{t("generateContract")}</h1>

        <ContractForm
          userId={user.uid}
          onDone={() => router.push("/agent/profile")}
          
        />
      </main>
    </>
  );
}