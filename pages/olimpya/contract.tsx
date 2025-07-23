// pages/agent/contract.tsx
"use client";

import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import ContractForm from "@/components/ContractForm";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import AgentLayout from "@/components/layouts/AgentLayout";

export async function getServerSideProps({ locale }: { locale: string }) {
  return { props: { ...(await serverSideTranslations(locale, ["common"])) } };
}

export default function ContractPage() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { user, loading, isAgent } = useAuth();

  if (loading) return <p className="text-center mt-4">…</p>;
  if (!user || !isAgent) {
    router.replace("/login");
    return null;
  }

  return (
    <AgentLayout>
      <main className="max-w-xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">{t("generateContract")}</h1>
        <ContractForm userId={user.uid} onDone={() => router.push("/agent/profile")} />
      </main>
    </AgentLayout>
  );
}