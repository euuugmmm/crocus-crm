// hooks/useTransactions.ts

import { useEffect, useState } from "react";
import { BankTransaction } from "@/types/BankTransaction";

export function useTransactions(params?: { from?: string; to?: string; currency?: string; category?: string }) {
  const [data, setData] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = params
      ? "?" +
        Object.entries(params)
          .filter(([_, v]) => !!v)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
          .join("&")
      : "";

    fetch(`/api/finance/transactions${q}`)
      .then(r => r.json())
      .then(res => {
        if (Array.isArray(res)) setData(res);
        else setError(res.error || "Ошибка загрузки транзакций");
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [JSON.stringify(params)]);

  return { data, loading, error };
}