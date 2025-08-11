"use client";

import { useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Account, Currency, FxRates, Transaction } from "@/lib/finance/types";
import { parseMT940, MT940Row } from "@/lib/finance/parsers/mt940";
import { defaultCategoryIdFor, fingerprint, findPlannedCandidate, getFxDoc, guessMethod, isDuplicate, eurFromAmount } from "@/lib/finance/importUtils";

type Props = {
  accounts: Account[];
  // опционально предвыбор счёта (из query ?accountId=...)
  presetAccountId?: string;
};

export default function ImportMT940({ accounts, presetAccountId }: Props) {
  const [fileName, setFileName] = useState<string>("");
  const [raw, setRaw] = useState<string>("");
  const [rows, setRows] = useState<MT940Row[]>([]);
  const [accountId, setAccountId] = useState<string>(presetAccountId || "");
  const [busy, setBusy] = useState(false);

  const acc = useMemo(() => accounts.find(a => a.id === accountId), [accounts, accountId]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result || ""));
    reader.readAsText(f);
  }

  function parse() {
    if (!raw) return;
    const ccy = acc?.currency || "EUR";
    const parsed = parseMT940(raw, { currency: ccy });
    setRows(parsed);
  }

  async function confirmImport() {
    if (!acc) return alert("Выберите счёт");
    if (!rows.length) return alert("Нет строк для импорта");
    setBusy(true);
    try {
      // лог батча
      const batchRef = await addDoc(collection(db, "finance_importBatches"), {
        format: "MT940",
        accountId: acc.id,
        accountName: acc.name,
        currency: acc.currency,
        createdAt: serverTimestamp(),
        totalLines: rows.length,
      });

      // возможные курсы будем переиспользовать по датам
      const fxCache = new Map<string, FxRates | null>();

      for (const r of rows) {
        const type: "in" | "out" = r.amount >= 0 ? "in" : "out";
        const amountAbs = Math.abs(r.amount);
        const fp = fingerprint({
          accountId: acc.id,
          date: r.date,
          type,
          amountAbs,
          currency: acc.currency,
          note: r.description,
        });
        const dup = await isDuplicate(fp);
        if (dup) continue;

        let rates = fxCache.get(r.date);
        if (rates === undefined) {
          rates = await getFxDoc(r.date);
          fxCache.set(r.date, rates);
        }
        const fxRateToBase = (acc.currency as Currency) === "EUR" ? 1 : (rates ? (1 / (rates?.rates?.[acc.currency as Currency] || 0)) : 0);
        // используем общий helper, чтобы не ошибиться с направлением
        const baseAmount = eurFromAmount(amountAbs, acc.currency as Currency, rates || null);

        const candidate = await findPlannedCandidate({
          accountId: acc.id,
          date: r.date,
          type,
          amountAbs,
          currency: acc.currency as Currency,
        });

        const categoryId = await defaultCategoryIdFor(type);
        const method = guessMethod(r.description);

        const payload: Omit<Transaction, "id"> = {
          date: r.date,
          type,
          status: candidate ? "reconciled" : "actual",
          amount: { value: amountAbs, currency: acc.currency as Currency },
          fxRateToBase: fxRateToBase || 1,
          baseAmount,
          accountId: acc.id,
          categoryId,
          method,
          note: r.description?.trim() || undefined,
          source: "import",
          importBatchId: batchRef.id,
          fingerprint: fp,
          matchedPlannedId: candidate?.id || undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const txRef = await addDoc(collection(db, "finance_transactions"), payload as any);
        if (candidate) {
          await updateDoc(doc(db, "finance_planned", candidate.id), {
            matchedTxId: txRef.id,
            matchedAt: serverTimestamp(),
          });
        }
      }

      alert("Импорт завершён");
      setRows([]);
      setRaw("");
      setFileName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-gray-600 mb-1">Счёт</div>
          <select className="w-full border rounded px-2 py-1 h-9" value={accountId} onChange={e=>setAccountId(e.target.value)}>
            <option value="">— выберите счёт —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <div className="text-xs text-gray-600 mb-1">Файл MT940</div>
          <input type="file" accept=".txt,.sta,.mt940,.940" onChange={onPickFile} />
          {fileName && <div className="text-xs text-gray-500 mt-1">Файл: {fileName}</div>}
        </div>
      </div>

      <div className="flex gap-2">
        <button disabled={!raw} onClick={parse} className="h-8 px-3 rounded border">
          Разобрать
        </button>
        <button disabled={!rows.length || !accountId || busy} onClick={confirmImport} className="h-8 px-3 rounded bg-green-600 text-white">
          Подтвердить импорт
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border text-sm">
          <thead className="bg-gray-100 text-center">
            <tr>
              <th className="border px-2 py-1">Дата</th>
              <th className="border px-2 py-1">Тип</th>
              <th className="border px-2 py-1">Сумма</th>
              <th className="border px-2 py-1">Описание</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="text-center">
                <td className="border px-2 py-1 whitespace-nowrap">{r.date}</td>
                <td className="border px-2 py-1">{r.amount >= 0 ? "Поступление" : "Выплата"}</td>
                <td className="border px-2 py-1 text-right">{Math.abs(r.amount).toFixed(2)} {acc?.currency || "—"}</td>
                <td className="border px-2 py-1 text-left">{r.description || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="border px-2 py-3 text-center text-gray-500">Загрузите файл MT940 и нажмите «Разобрать»</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}