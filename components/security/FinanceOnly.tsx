"use client";
import React from "react";
import { useAuth } from "@/context/AuthContext";
import { canViewFinance } from "@/lib/finance/roles";

/** Оборачиваем куски UI, которые нельзя показывать не-руководству */
export default function FinanceOnly({ children }: { children: React.ReactNode }) {
  const { isSuperManager, isAdmin } = useAuth();
  if (!canViewFinance({ isSuperManager, isAdmin })) return null;
  return <>{children}</>;
}
