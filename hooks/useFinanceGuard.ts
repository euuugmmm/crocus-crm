"use client";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import { canViewFinance } from "@/lib/finance/roles";

/** Навешиваем в начале любой фин. страницы */
export function useFinanceGuard() {
  const router = useRouter();
  const { user, isSuperManager, isAdmin } = useAuth();
  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canViewFinance({ isSuperManager, isAdmin })) {
      router.replace("/agent/bookings"); // или своя страница «нет доступа»
    }
  }, [user, isSuperManager, isAdmin, router]);
}