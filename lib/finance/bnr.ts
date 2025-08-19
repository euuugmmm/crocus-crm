// lib/finance/bnr.ts
import { XMLParser } from "fast-xml-parser";

export type BnrDay = { date: string; ratesRON: Record<string, number> };

/** Разбор XML BNR → список дней с курсами в базе RON (RON за 1 единицу валюты). */
export function parseBnrXml(xml: string): BnrDay[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
  const data: any = parser.parse(xml);
  const cubes = data?.DataSet?.Body?.Cube;
  const list: any[] = Array.isArray(cubes) ? cubes : cubes ? [cubes] : [];

  const out: BnrDay[] = [];
  for (const cube of list) {
    const date = cube?.["@_date"];
    if (!date) continue;
    const ratesArr = Array.isArray(cube?.Rate) ? cube.Rate : cube?.Rate ? [cube.Rate] : [];
    const ratesRON: Record<string, number> = {};

    for (const r of ratesArr) {
      const ccy = r?.["@_currency"];
      if (!ccy) continue;
      const mult = Number(r?.["@_multiplier"] || 1);
      const raw = Number(r?.["#text"]);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const ronPerOne = mult > 1 ? raw / mult : raw; // 100 HUF → делим на 100
      ratesRON[ccy] = ronPerOne;
    }

    if (ratesRON.EUR && ratesRON.EUR > 0) {
      out.push({ date, ratesRON });
    }
  }
  // возращаем ASC
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** Преобразуем RON-базу в EUR-базу: rates[CCY] = CCY per 1 EUR. */
export function toEurBase(day: BnrDay): { date: string; rates: Record<string, number> } {
  const RON_per_EUR = day.ratesRON.EUR;
  const out: Record<string, number> = { EUR: 1, RON: +RON_per_EUR.toFixed(6) };
  for (const [ccy, RON_per_CCY] of Object.entries(day.ratesRON)) {
    if (ccy === "EUR" || ccy === "RON") continue;
    const CCY_per_EUR = RON_per_EUR / RON_per_CCY;
    out[ccy] = +CCY_per_EUR.toFixed(6);
  }
  return { date: day.date, rates: out };
}

/** Годовые XML → Map<date, EUR-база rates> */
export async function fetchBnrYearsToEurBase(years: number[]): Promise<Map<string, Record<string, number>>> {
  const base = "https://curs.bnr.ro/files/xml/years";
  const map = new Map<string, Record<string, number>>();
  for (const y of years) {
    const res = await fetch(`${base}/nbrfxrates${y}.xml`, { cache: "no-store" });
    if (!res.ok) throw new Error(`BNR ${y}: HTTP ${res.status}`);
    const xml = await res.text();
    const days = parseBnrXml(xml);
    for (const d of days) {
      const eur = toEurBase(d);
      map.set(eur.date, eur.rates);
    }
  }
  return map;
}

/** Последние N банковских дней (из годовых файлов) */
export async function fetchBnrLastNDaysEURBase(n: number) {
  const now = new Date();
  const y = now.getFullYear();
  const map = await fetchBnrYearsToEurBase([y - 1, y]);
  const dates = Array.from(map.keys()).sort();
  const last = dates.slice(-n);
  return last.map(d => ({ date: d, rates: map.get(d)! }));
}

/** Текущая публикация: https://curs.bnr.ro/nbrfxrates.xml → последний <Cube @date> */
export async function fetchBnrLatestEURBase() {
  const res = await fetch("https://curs.bnr.ro/nbrfxrates.xml", { cache: "no-store" });
  if (!res.ok) throw new Error(`BNR latest: HTTP ${res.status}`);
  const xml = await res.text();
  const days = parseBnrXml(xml);
  if (!days.length) throw new Error("BNR latest: empty payload");
  const last = days[days.length - 1]; // последний куб
  const eur = toEurBase(last);
  return eur; // { date, rates }
}

/** Последние 10 записей: https://curs.bnr.ro/nbrfxrates10days.xml */
export async function fetchBnrLast10EURBase() {
  const res = await fetch("https://curs.bnr.ro/nbrfxrates10days.xml", { cache: "no-store" });
  if (!res.ok) throw new Error(`BNR 10days: HTTP ${res.status}`);
  const xml = await res.text();
  const days = parseBnrXml(xml).map(toEurBase);
  return days; // ASC
}