// /lib/utils/dates-extra.ts
export function next25th(date = new Date()): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = d.getMonth();
  const target = new Date(y, m, 25);
  const z = new Date(target.getTime() - target.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}