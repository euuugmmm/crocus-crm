// hooks/useReports.ts

import { useEffect, useState } from "react";

export interface ReportSummary {
  totalIncome: number;
  totalExpense: number;
  profit: number;
  byMarket: Record<string, { income: number; expense: number }>;
  byCategory: Record<string, { income: number; expense: number }>;
}

export function useReports(params?: { from?: string; to?: string; market?: string; category?: string; currency?: string }) {
  const [data, setData] = useState<ReportSummary | null>(null);
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

    fetch(`/api/finance/reports${q}`)
      .then(r => r.json())
      .then(res => {
        if (res.summary) setData(res.summary);
        else setError(res.error || "Ошибка загрузки отчёта");
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [JSON.stringify(params)]);

  return { data, loading, error };
}