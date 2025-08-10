import React from "react";

type Props = {
  totalGross: number;        // комиссия по брони (брутто)
  paidGross: number;         // выплачено по брони (брутто)
  receivedNet?: number;      // опц.: получено (нетто) — если считаешь
  label?: string;            // подпись над баром
  isOpen?: boolean;          // состояние раскрытия
  onToggle?: () => void;     // клик по бару
  className?: string;
};

export default function ProgressBar({
  totalGross,
  paidGross,
  receivedNet,
  label,
  isOpen,
  onToggle,
  className
}: Props) {
  const total = Math.max(0, totalGross);
  const paid = Math.min(Math.max(0, paidGross), total);
  const pct = total > 0 ? (paid / total) * 100 : 0;

  const clickable = typeof onToggle === "function";

  return (
    <div className={className}>
      {label && <div className="text-xs mb-1 text-neutral-500">{label}</div>}

      <div
        className={`h-2 w-full rounded-full bg-neutral-200 overflow-hidden ${clickable ? "cursor-pointer select-none" : ""}`}
        onClick={onToggle}
        role={clickable ? "button" : undefined}
        aria-expanded={clickable ? !!isOpen : undefined}
        title={clickable ? (isOpen ? "Hide details" : "Show details") : undefined}
      >
        <div
          className="h-2 bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
          aria-label="paid progress"
        />
      </div>

      <div className="mt-1 text-xs text-neutral-600">
        {paid.toFixed(2)} € / {total.toFixed(2)} €
      </div>

      {typeof receivedNet === "number" && (
        <div className="mt-1">
          <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
            <div
              className="h-1.5 bg-blue-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, (receivedNet / (total || 1)) * 100))}%` }}
              aria-label="received net"
            />
          </div>
          <div className="mt-1 text-[11px] text-neutral-600">
            {receivedNet.toFixed(2)} €
          </div>
        </div>
      )}

      {clickable && (
        <div className="mt-1 text-[11px] text-indigo-600">
          {isOpen ? "▼ " : "► "}
          {isOpen ? "Hide details" : "Show details"}
        </div>
      )}
    </div>
  );
}