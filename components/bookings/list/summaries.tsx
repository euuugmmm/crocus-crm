// components/bookings/list/summaries.tsx
"use client";

import React from "react";
import { BookingRow } from "./columns";

function fixed2(n: any) {
  const x = typeof n === "string" ? parseFloat(n) : n;
  const v = Number.isFinite(x) ? x : 0;
  return v.toFixed(2);
}

export function ManagerSummaries({ data }: { data: BookingRow[] }) {
  const sumBrutto = data.reduce((s, b) => s + Number(b.bruttoClient || 0), 0);
  const sumInternal = data.reduce((s, b) => s + Number(b.internalNet || 0), 0);
  const sumCrocus = sumBrutto - sumInternal;

  return (
    <tr>
      <td colSpan={8} className="px-2 py-2 text-right">
        Итого:
      </td>
      <td className="px-2 py-2 text-right">{fixed2(sumBrutto)}</td>
      <td className="px-2 py-2 text-right">{fixed2(sumInternal)}</td>
      <td className="px-2 py-2 text-right">{fixed2(sumCrocus)}</td>
      <td colSpan={4} />
    </tr>
  );
}

export function AgentSummaries({ data }: { data: BookingRow[] }) {
  const sumBrutto = data.reduce((s, b) => s + Number(b.bruttoClient || 0), 0);
  const sumComm = data.reduce((s, b) => s + Number(b.commission || 0), 0);

  return (
    <tr>
      <td colSpan={6} className="px-2 py-2 text-right">
        Итого:
      </td>
      <td className="px-2 py-2 text-right">{fixed2(sumBrutto)}</td>
      <td className="px-2 py-2 text-right">{fixed2(sumComm)}</td>
      <td colSpan={3} />
    </tr>
  );
}

export function OlimpyaSummaries({ data }: { data: BookingRow[] }) {
  const sumBrutto = data.reduce((s, b) => s + Number(b.bruttoClient || 0), 0);
  const sumInternal = data.reduce((s, b) => s + Number(b.internalNet || 0), 0);
  const sumReal = data.reduce((s, b) => s + Number(b.realCommission || 0), 0);

  return (
    <tr>
      <td colSpan={7} className="px-2 py-2 text-right">
        Итого:
      </td>
      <td className="px-2 py-2 text-right">{fixed2(sumBrutto)}</td>
      <td className="px-2 py-2 text-right">{fixed2(sumInternal)}</td>
      <td className="px-2 py-2 text-right">{fixed2(sumReal)}</td>
      <td colSpan={2} />
    </tr>
  );
}