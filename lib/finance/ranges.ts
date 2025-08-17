/**
 * Утилиты для работы с датами/диапазонами в отчётах.
 * Главная идея — использовать локальные ISO-строки YYYY-MM-DD без UTC-сдвигов.
 */

/** Возвращает YYYY-MM-DD для локальной даты (без UTC-сдвига) */
export const localISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Начало месяца (локально) */
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** Конец месяца (локально) — последний календарный день месяца */
export const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/** Понедельник недели, в которую попадает первый день месяца (для календарной сетки 6×7) */
export const startOfCalendar = (anchor: Date) => {
  const first = startOfMonth(anchor);
  // Пн=0, … Вс=6
  const dow = (first.getDay() + 6) % 7;
  const res = new Date(first);
  res.setDate(first.getDate() - dow);
  return res;
};

/** Прибавить n дней (может быть отрицательным) */
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Сравнение дат по дню (через localISO) */
export const sameDay = (a: Date, b: Date) => localISO(a) === localISO(b);

/** Ключ месяца из YYYY-MM-DD → YYYY-MM */
export const ym = (iso: string) => (iso?.slice(0, 7) || "");

/** Перечислить все YYYY-MM-DD между fromISO и toISO (включительно) */
export const enumerateDays = (fromISO: string, toISO: string) => {
  const out: string[] = [];
  let cur = new Date(fromISO);
  const to = new Date(toISO);
  while (cur <= to) {
    out.push(localISO(cur));
    cur = addDays(cur, 1);
  }
  return out;
};

/** Перечислить YYYY-MM между fromISO и toISO (по месяцам, включительно) */
export const enumerateMonths = (fromISO: string, toISO: string) => {
  const out: string[] = [];
  let y = Number(fromISO.slice(0, 4));
  let m = Number(fromISO.slice(5, 7));
  const y2 = Number(toISO.slice(0, 4));
  const m2 = Number(toISO.slice(5, 7));

  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  return out;
};