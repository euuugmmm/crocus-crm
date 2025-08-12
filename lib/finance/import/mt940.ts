// lib/finance/import/mt940.ts

export type Mt940Tx = {
  date: string;           // YYYY-MM-DD (value date)
  sign: "C" | "D";        // C = credit (in), D = debit (out)
  amount: number;         // amount in account currency
  code: string;           // 3–4 letter transaction code from :61: (e.g., NTRF, NCOL)
  reference?: string;     // everything after last "//" in :61:, if present
  description: string;    // full :86: text (multiline joined with spaces)
};

function toIsoDateFromYYMMDD(yymmdd: string): string {
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  return `${yyyy}-${mm}-${dd}`;
}

function parseAmount(s: string): number {
  // Accept "123", "123,45", "123.45"
  return parseFloat(s.replace(",", "."));
}

/**
 * MT940 parser tailored to common BTRL/BT formats.
 * Extracts pairs of :61: (date, sign, amount, code, ref) and following :86: description.
 */
export function parseMt940(text: string): Mt940Tx[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const txs: Mt940Tx[] = [];

  let pending: Partial<Mt940Tx> | null = null;

  const flush = () => {
    if (
      pending &&
      pending.date &&
      (pending.sign === "C" || pending.sign === "D") &&
      typeof pending.amount === "number" &&
      isFinite(pending.amount) &&
      pending.description != null
    ) {
      txs.push(pending as Mt940Tx);
    }
    pending = null;
  };

  const isTagLine = (s: string) => /^:\d{2}/.test(s) || s.startsWith("-}");

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    // :61:YYMMDD[entryDate?][C|D][amount][Ncode]... [//reference]
    if (raw.startsWith(":61:")) {
      flush();

      const body = raw.slice(4);

      // match: 6 digits date, optional 4 digits entry date, C/D sign,
      // amount with optional decimals, 3-4 upper letters code
      const m = body.match(
        /^(\d{6})(\d{4})?([CD])(\d+(?:[.,]\d{0,4})?)(?:[A-Z]?)([A-Z]{3,4})/
      );
      if (!m) {
        // Some banks may omit code; try a relaxed fallback
        const fallback = body.match(/^(\d{6})(\d{4})?([CD])(\d+(?:[.,]\d{0,4})?)/);
        if (!fallback) continue;
        const [, yymmdd2, _entry2, sign2, amt2] = fallback;
        pending = {
          date: toIsoDateFromYYMMDD(yymmdd2),
          sign: sign2 as "C" | "D",
          amount: parseAmount(amt2),
          code: "UNKN",
          description: "",
        };
      } else {
        const [, yymmdd, _entry, sign, amt, code] = m;
        // reference: last //chunk (no spaces) if present
        let reference: string | undefined;
        const refMatch = body.match(/\/\/([^\s]+)\s*$/);
        if (refMatch) reference = refMatch[1];

        pending = {
          date: toIsoDateFromYYMMDD(yymmdd),
          sign: sign as "C" | "D",
          amount: parseAmount(amt),
          code,
          reference,
          description: "",
        };
      }
      continue;
    }

    // :86: description may span multiple following lines until next tag
    if (raw.startsWith(":86:")) {
      if (!pending) continue;
      const parts: string[] = [raw.slice(4).trim()];

      // collect continuations
      let j = i + 1;
      while (j < lines.length && !isTagLine(lines[j].trim())) {
        parts.push(lines[j].trim());
        j++;
      }
      i = j - 1;

      // normalize excessive spaces
      pending.description = parts.join(" ").replace(/\s+/g, " ").trim();
      continue;
    }

    // If we meet another tag while a tx is pending, flush it
    if (isTagLine(raw)) {
      flush();
      continue;
    }
  }

  flush();
  return txs;
}