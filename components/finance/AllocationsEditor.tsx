// components/finance/AllocationsEditor.tsx
import React, { useMemo } from "react";

export type CategorySide = "income" | "expense";

export type BookingOptionLite = {
  id: string;
  bookingNumber: string;
  operator: string;
  place: string;
  period: string;
  leftIncome: number;
  leftExpense: number;
};

export type Allocation = { bookingId: string; amountBase: number };

function moneyEUR(n: number) {
  if (!isFinite(n)) return "0 €";
  const abs = Math.abs(n);
  const s = Math.round(abs) === +abs.toFixed(0) ? String(Math.round(abs)) : abs.toFixed(2);
  return `${s} €`;
}

export default function AllocationsEditor({
  side,
  allocations,
  onChange,
  optionsMap,
  totalEUR,
  title,
}: {
  side: CategorySide;
  allocations: Allocation[];
  onChange: (allocs: Allocation[]) => void;
  optionsMap: Map<string, BookingOptionLite>;
  totalEUR: number; // EUR к распределению
  title?: string;
}) {
  const allocatedSum = useMemo(
    () => (allocations || []).reduce((s, a) => s + Math.max(0, Number(a.amountBase || 0)), 0),
    [allocations]
  );
  const remain = +(Math.max(0, totalEUR - allocatedSum).toFixed(2));

  const rows = (allocations || []).map((al, idx) => {
    const x = optionsMap.get(al.bookingId);
    const label = x
      ? `${x.bookingNumber} · ${x.operator} · ${x.place} · ${x.period}`
      : al.bookingId;

    // исходный остаток по заявке
    let leftBase = 0;
    if (x) {
      const leftOrig = side === "income" ? x.leftIncome : x.leftExpense;
      // учитываем уже введённые аллокации на эту заявку (кроме текущей строки)
      const sameSum = (allocations || [])
        .filter((a) => a.bookingId === al.bookingId)
        .reduce((s, a) => s + (a === al ? 0 : a.amountBase), 0);
      leftBase = Math.max(0, leftOrig - sameSum);
    }

    const overpay = Math.max(0, al.amountBase - leftBase);

    return {
      key: `${al.bookingId}-${idx}`,
      label,
      amountBase: al.amountBase,
      leftBase,
      overpay,
      idx,
    };
  });

  const updateAmount = (idx: number, v: number) => {
    const next = [...allocations];
    next[idx] = { ...next[idx], amountBase: Math.max(0, Number(v) || 0) };
    onChange(next);
  };

  const removeRow = (idx: number) => {
    const next = allocations.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div className="border rounded">
      <div className="px-2 py-2 text-xs text-gray-600 border-b">
        {title || "Распределение по заявкам"} · к распределению: {totalEUR.toFixed(2)} € · осталось:{" "}
        {remain.toFixed(2)} €
      </div>
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="border px-2 py-1 text-left">Заявка</th>
            <th className="border px-2 py-1 w-40">Сумма (EUR)</th>
            <th className="border px-2 py-1 w-36">Статус</th>
            <th className="border px-2 py-1 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="align-top">
              <td className="border px-2 py-1">{r.label}</td>
              <td className="border px-2 py-1">
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-2 py-1"
                  value={r.amountBase}
                  onChange={(e) => updateAmount(r.idx, Number(e.target.value))}
                />
              </td>
              <td className="border px-2 py-1">
                {r.leftBase > 0 ? (
                  r.amountBase <= r.leftBase ? (
                    <span className="text-emerald-700">OK</span>
                  ) : (
                    <span className="text-rose-700">
                      переплата {moneyEUR(Math.max(0, r.amountBase - r.leftBase))}
                    </span>
                  )
                ) : (
                  <span className="text-rose-700">по заявке нет остатка</span>
                )}
              </td>
              <td className="border px-2 py-1 text-center">
                <button
                  className="h-7 px-2 border rounded hover:bg-gray-100"
                  onClick={() => removeRow(r.idx)}
                >
                  ✖︎
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="border px-2 py-2 text-gray-500" colSpan={4}>
                Пока нет распределений
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}