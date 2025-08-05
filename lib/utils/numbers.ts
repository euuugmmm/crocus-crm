// lib/utils/numbers.ts

/** Безопасно привести к числу */
export function toNumber(n: any): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const v = parseFloat(n.replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
}

/** Формат с 2 знаками */
export function fixed2(n: any): string {
  return toNumber(n).toFixed(2);
}