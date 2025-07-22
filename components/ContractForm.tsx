/* components/ContractForm.tsx */
"use client";

import { useState } from "react";
import { useTranslation } from "next-i18next";

interface Props {
  userId: string;
  onDone?: () => void; // вызовется после успешной генерации
}

export default function ContractForm({ userId, onDone }: Props) {
  const { t } = useTranslation("common");

  const [name,        setName]        = useState("");
  const [address,     setAddress]     = useState("");
  const [agency,      setAgency]      = useState("");
  const [cnp,         setCnp]         = useState("");
  const [passport,    setPassp]       = useState("");
  const [nationality, setNationality] = useState("");   // ← новое поле
  const [loading,     setLoading]     = useState(false);
  const [link,        setLink]        = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setLink(null);

    const res = await fetch("/api/generate-contract", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        name,
        address,
        agency,
        cnp,
        passport,
        nationality,  // ← передаём гражданство
      }),
    });
    const json = await res.json();
    setLoading(false);

    if (json.link) {
      setLink(json.link);
      onDone?.();
    } else {
      alert(json.error || "Error");
    }
  }

  return (
    <div className="space-y-4">
      <input
        placeholder={t("name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border p-2 rounded"
      />
      <input
        placeholder={t("address")}
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        className="w-full border p-2 rounded"
      />
      <input
        placeholder={t("agencyName")}
        value={agency}
        onChange={(e) => setAgency(e.target.value)}
        className="w-full border p-2 rounded"
      />
      <input
        placeholder={t("cnp")}
        value={cnp}
        onChange={(e) => setCnp(e.target.value)}
        className="w-full border p-2 rounded"
      />
      <input
        placeholder={t("passportNumber")}
        value={passport}
        onChange={(e) => setPassp(e.target.value)}
        className="w-full border p-2 rounded"
      />
      <input
        placeholder={t("nationality")}
        value={nationality}
        onChange={(e) => setNationality(e.target.value)}
        className="w-full border p-2 rounded"
      />

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
      >
        {loading ? t("loading") : t("generateContract")}
      </button>

      {link && (
        <p className="text-green-700">
          {t("contractReady")} –{" "}
          <a href={link} target="_blank" rel="noreferrer" className="underline">
            {t("download")}
          </a>
        </p>
      )}
    </div>
  );
}