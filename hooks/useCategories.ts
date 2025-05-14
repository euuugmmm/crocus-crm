// hooks/useCategories.ts

import { useEffect, useState } from "react";

export interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer" | string;
  description?: string;
}

export function useCategories() {
  const [data, setData] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/finance/categories")
      .then(r => r.json())
      .then(res => {
        if (Array.isArray(res)) setData(res);
        else setError(res.error || "Ошибка загрузки категорий");
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}