// lib/utils/dates.ts
import { parse, isValid, format } from "date-fns";

/** Парс DD.MM.YYYY → Date|null */
export function parseDMY(s?: string | null): Date | null {
  if (!s) return null;
  const d = parse(String(s), "dd.MM.yyyy", new Date());
  return isValid(d) ? d : null;
}

/** Универсальный toDate: Firestore Timestamp | string(DD.MM.YYYY|ISO) | number | Date → Date|null */
export function toDate(v: any): Date | null {
  if (!v) return null;

  // Firestore Timestamp
  if (typeof v === "object" && typeof v.toDate === "function") {
    const d = v.toDate();
    return isValid(d) ? d : null;
  }

  if (v instanceof Date) return isValid(v) ? v : null;

  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof v === "string") {
    // сначала пробуем DD.MM.YYYY
    const dmy = parseDMY(v);
    if (dmy) return dmy;

    // затем ISO/иначе native
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/** Форматирует значение даты безопасно: → "dd.MM.yyyy" | "-" */
export function fmtDate(v: any): string {
  const d = toDate(v);
  return d ? format(d, "dd.MM.yyyy") : "-";
}