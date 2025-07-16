// hooks/useBookings.ts

import { useEffect, useState } from "react";
import { Booking } from "@/types/BookingDTO";

export function useBookings(params?: { from?: string; to?: string; market?: string }) {
  const [data, setData] = useState<Booking[]>([]);
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

    fetch(`/api/finance/bookings${q}`)
      .then(r => r.json())
      .then(res => {
        if (Array.isArray(res)) setData(res);
        else setError(res.error || "Ошибка загрузки заявок");
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [JSON.stringify(params)]);

  return { data, loading, error };
}