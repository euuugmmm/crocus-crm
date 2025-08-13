// lib/finance/fx.ts
import { Currency, FxDoc } from "@/types/finance";

export const todayISO = () => new Date().toISOString().slice(0, 10);

function pickFx(dateISO: string, list: FxDoc[]): FxDoc | undefined {
  if (!list.length) return undefined;
  const exact = list.find((r) => r.id === dateISO);
  if (exact) return exact;
  // берем ближайший <= dateISO
  const sorted = [...list].sort((a, b) => (a.id < b.id ? 1 : -1));
  return sorted.find((r) => r.id <= dateISO) || sorted[sorted.length - 1];
}

/** Конвертируем сумму ИЗ валюты счета В EUR (1 EUR = rate CCY) */
export function eurFrom(amount: number, ccy: Currency, dateISO: string, fxList: FxDoc[]): number {
  const val = Number(amount || 0);
  if (!val) return 0;
  if (ccy === "EUR") return +val.toFixed(2);
  const fx = pickFx(dateISO, fxList);
  const inv = fx?.rates?.[ccy];
  if (!inv || inv <= 0) return 0;
  return +(val / inv).toFixed(2);
}

/** Конвертируем сумму ИЗ EUR В валюту счета (1 EUR = rate CCY) */
export function ccyFromEur(eur: number, ccy: Currency, dateISO: string, fxList: FxDoc[]): number {
  const val = Number(eur || 0);
  if (!val) return 0;
  if (ccy === "EUR") return +val.toFixed(2);
  const fx = pickFx(dateISO, fxList);
  const rate = fx?.rates?.[ccy];
  if (!rate || rate <= 0) return 0;
  return +(val * rate).toFixed(2);
}