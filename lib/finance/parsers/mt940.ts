// Простой разбор MT940: тянем операции из тегов :61: (сумма/дата/знак) и :86: (описание)
export type MT940Row = {
  date: string;                 // YYYY-MM-DD
  amount: number;               // со знаком (+/-) в валюте счёта
  currency: "EUR" | "RON" | "USD" | string;
  description?: string;
};

function parse61(line: string) {
  // формат: :61:YYMMDD...C/DAMOUNT...
  // пример: :61:2507240724C123,45NTRF...
  const m = line.match(/^:61:(\d{6})\d{0,4}([CD])(\d+[.,]\d{0,2})/);
  if (!m) return null;
  const yymmdd = m[1];
  const sign = m[2] === "C" ? +1 : -1;
  const amt = Number(m[3].replace(",", "."));
  const yy = yymmdd.slice(0, 2);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  // наивно приводим к 20xx
  const yyyy = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  const date = `${yyyy}-${mm}-${dd}`;
  return { date, amountSigned: sign * amt };
}

export function parseMT940(text: string, opts?: { currency?: string }): MT940Row[] {
  const rows: MT940Row[] = [];
  const currency = (opts?.currency || "EUR").toUpperCase();

  const lines = text.replace(/\r/g, "").split("\n");
  let pending: { date: string; amount: number } | null = null;
  let descBuf: string[] = [];

  const flush = () => {
    if (!pending) return;
    rows.push({
      date: pending.date,
      amount: pending.amount,
      currency: currency as any,
      description: descBuf.join(" ").trim() || undefined,
    });
    pending = null;
    descBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith(":61:")) {
      // новая операция — предыдущую сбрасываем
      flush();
      const p = parse61(line);
      if (p) pending = { date: p.date, amount: p.amountSigned };
    } else if (line.startsWith(":86:")) {
      // описание — может быть многострочным (:86: + продолжения)
      descBuf.push(line.replace(/^:86:/, "").trim());
    } else if (pending && (line.startsWith(":") === false) && line.length > 0) {
      // возможное продолжение описания
      descBuf.push(line);
    }
  }
  flush();
  return rows;
}