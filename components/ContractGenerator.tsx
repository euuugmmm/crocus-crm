"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  bookingId:  string;
  agencyName: string;
  agentName:  string;
  agentEmail: string;
}

export default function ContractGenerator({
  bookingId,
  agencyName,
  agentName,
  agentEmail,
}: Props) {
  const [date,     setDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading]   = useState(false);
  const [link,    setLink]      = useState<string | null>(null);
  const [error,   setError]     = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-agent-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: bookingId, agencyName, agentName, agentEmail, date }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setLink(json.link);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="my-6 space-y-3">
      <h2 className="text-lg font-medium">Генерация договора</h2>

      <label className="flex items-center gap-2">
        <span>Дата договора:</span>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border rounded p-1"
        />
      </label>

      <Button onClick={handleGenerate} disabled={loading}>
        {loading ? "Генерация..." : "Сгенерировать договор"}
      </Button>

      {error && <p className="text-red-600">Ошибка: {error}</p>}
      {link && (
        <p className="mt-2">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 underline"
          >
            Скачать договор (PDF)
          </a>
        </p>
      )}
    </section>
  );
}