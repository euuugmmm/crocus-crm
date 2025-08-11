// lib/finance/import/mt940.ts
export type Mt940Tx = {
  date: string;                // YYYY-MM-DD (value date)
  sign: "C" | "D";             // C=credit (in), D=debit (out)
  amount: number;              // в валюте счёта (у нас EUR)
  code: string;                // тип операции из :61: (напр. NTRF, NCOL)
  reference?: string;          // то, что после // в :61:, если было
  description: string;         // полный :86: (склеенный)
};

function toIsoDateFromYYMMDD(yymmdd: string): string {
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Парсер MT940 (под стиль BTRL): вытягивает пары :61: + :86:
 * Возвращает список движений в EUR.
 */
export function parseMt940(text: string): Mt940Tx[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const txs: Mt940Tx[] = [];

  let pending: Partial<Mt940Tx> | null = null;

  const flush = () => {
    if (pending && pending.date && typeof pending.amount === "number" && pending.description) {
      txs.push(pending as Mt940Tx);
    }
    pending = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith(":61:")) {
      // новый tx начинается — предыдущий сохраняем
      flush();

      const body = line.slice(4);
      // :61: YYMMDD[entryDate?] [C|D] amount[,decimals] code ...
      // пример: 2508010801C3027,00NTRFNONREF//008ZEXA...
      const m = body.match(/^(\d{6})(\d{4})?([CD])(\d+,\d{2})([A-Z]{4})/);
      if (!m) continue;

      const [, yymmdd, _entry, sign, amt, code] = m;
      const date = toIsoDateFromYYMMDD(yymmdd);
      const amount = parseFloat(amt.replace(",", "."));

      // референс берём как всё после последнего "//", если есть
      let reference: string | undefined;
      const refMatch = body.match(/\/\/([^\s]+)$/);
      if (refMatch) reference = refMatch[1];

      pending = {
        date,
        sign: sign as "C" | "D",
        amount,
        code,
        reference,
        description: "",
      };
    } else if (line.startsWith(":86:")) {
      if (!pending) continue;

      // :86: может быть на нескольких строках — собираем до следующего тега (начинается с ":") или "-}"
      const parts: string[] = [line.slice(4).trim()];
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith(":") && !lines[j].startsWith("-}")) {
        parts.push(lines[j].trim());
        j++;
      }
      i = j - 1;
      // склеиваем описание в одну строку
      pending.description = parts.join(" ");
    }
  }

  // добиваем последний
  flush();

  return txs;
}