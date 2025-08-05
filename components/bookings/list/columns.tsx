// components/bookings/list/columns.tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, StatusKey } from "@/lib/constants/statuses";
import { useTranslation } from "next-i18next";
import { format, parse, isValid } from "date-fns";
import React from "react";

/** Общая модель строки (гибкая под все роли) */
export type BookingRow = {
  id?: string;
  bookingType?: string;
  createdAt?: any;
  bookingNumber?: string;
  agentName?: string;
  agentAgency?: string;
  operator?: string;
  hotel?: string;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  bruttoClient?: number | string;
  bruttoOperator?: number | string;
  nettoOperator?: number | string;
  internalNet?: number | string;
  commission?: number | string;
  realCommission?: number | string;
  status?: StatusKey | string;
  invoiceLink?: string;
  voucherLinks?: string[];
  tourists?: Array<{ name?: string }>;
};

/* Безошибочные парсеры дат */
function parseDMY(s: string) {
  const d = parse(s, "dd.MM.yyyy", new Date());
  return isValid(d) ? d : null;
}
function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v === "object" && typeof v.toDate === "function") {
    const d = v.toDate();
    return isValid(d) ? d : null;
  }
  if (typeof v === "string") {
    const dmy = parseDMY(v);
    if (dmy) return dmy;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Date) return isValid(v) ? v : null;
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function fmtDate(v: any) {
  const d = toDate(v);
  return d ? format(d, "dd.MM.yyyy") : "-";
}
function fixed2(n: any) {
  const x = typeof n === "string" ? parseFloat(n) : n;
  const v = Number.isFinite(x) ? x : 0;
  return v.toFixed(2);
}

function StatusBadge({ status }: { status: string | undefined }) {
  const { t } = useTranslation("common");
  const key = (status as StatusKey) || "new";
  const cls = STATUS_COLORS[key as StatusKey] || "bg-gray-100 text-gray-800";
  return (
    <Badge className={`inline-flex px-2 py-1 text-xs rounded-sm ring-1 ring-inset ${cls}`}>
      {t(`statuses.${key}`)}
    </Badge>
  );
}

/* ================== МЕНЕДЖЕР ================== */
export function managerColumns(opts: {
  onEdit: (row: BookingRow) => void;
  onDelete: (row: BookingRow) => void;
}): ColumnDef<BookingRow, any>[] {
  return [
    {
      accessorKey: "bookingType",
      header: "Тип заявки",
      cell: ({ getValue }) => getValue<string>() || "-",
      enableSorting: true,
    },
    {
      id: "createdAt",
      header: "Дата",
      accessorFn: (row) => toDate(row.createdAt)?.getTime() ?? 0,
      cell: ({ row }) => fmtDate(row.original.createdAt),
      enableSorting: true,
    },
    {
      accessorKey: "bookingNumber",
      header: "№",
      cell: ({ getValue }) => getValue<string>() || "—",
      enableSorting: true,
    },
    {
      id: "agent",
      header: "Агент",
      accessorFn: (row) => `${row.agentName || ""}${row.agentAgency ? ` (${row.agentAgency})` : ""}`,
      cell: ({ row }) =>
        `${row.original.agentName || ""}${row.original.agentAgency ? ` (${row.original.agentAgency})` : ""}` || "—",
      enableSorting: true,
    },
    {
      accessorKey: "operator",
      header: "Оператор",
      cell: ({ getValue }) => getValue<string>() || "—",
      enableSorting: true,
    },
    {
      accessorKey: "hotel",
      header: "Отель",
      cell: ({ getValue }) => getValue<string>() || "—",
      enableSorting: true,
    },
    {
      id: "checkIn",
      header: "Заезд",
      accessorFn: (row) => toDate(row.checkIn)?.getTime() ?? 0,
      cell: ({ row }) => fmtDate(row.original.checkIn),
      enableSorting: true,
    },
    {
      id: "checkOut",
      header: "Выезд",
      accessorFn: (row) => toDate(row.checkOut)?.getTime() ?? 0,
      cell: ({ row }) => fmtDate(row.original.checkOut),
      enableSorting: true,
    },
    {
      id: "bruttoClient",
      header: "Брутто Клиент (€)",
      accessorFn: (row) => Number(row.bruttoClient || 0),
      cell: ({ row }) => fixed2(row.original.bruttoClient),
      enableSorting: true,
    },
    {
      id: "internalNet",
      header: "Netto Fact (€)",
      accessorFn: (row) => Number(row.internalNet || 0),
      cell: ({ row }) => fixed2(row.original.internalNet),
      enableSorting: true,
    },
    {
      id: "crocusProfit",
      header: "Комиссия Crocus (€)",
      accessorFn: (row) => Number(row.bruttoClient || 0) - Number(row.internalNet || 0),
      cell: ({ getValue }) => fixed2(getValue<number>()),
      enableSorting: true,
    },
    {
      accessorKey: "status",
      header: "Статус",
      cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      enableSorting: true,
    },
    {
      id: "invoice",
      header: "Инвойс",
      cell: ({ row }) =>
        row.original.invoiceLink ? (
          <a
            href={row.original.invoiceLink}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Open
          </a>
        ) : (
          "—"
        ),
    },
    {
      id: "vouchers",
      header: "Ваучеры",
      cell: ({ row }) =>
        Array.isArray(row.original.voucherLinks) && row.original.voucherLinks.length ? (
          <div className="min-w-[110px]">
            {row.original.voucherLinks!.map((l, i) => (
              <div key={i}>
                <a href={l} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
                  Voucher {i + 1}
                </a>
              </div>
            ))}
          </div>
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      header: "Действия",
      cell: ({ row }) => (
        <div className="flex gap-2 justify-center">
          <button
            title="Редактировать"
            className="text-xl hover:scale-110 transition"
            onClick={() => opts.onEdit(row.original)}
          >
            ✏️
          </button>
          <button
            title="Удалить"
            className="text-xl hover:scale-110 transition"
            onClick={() => opts.onDelete(row.original)}
          >
            🗑️
          </button>
        </div>
      ),
    },
  ];
}

/* ================== АГЕНТ ================== */
export function agentColumns(opts: { onEdit: (row: BookingRow) => void }): ColumnDef<BookingRow, any>[] {
  return [
    {
      accessorKey: "bookingNumber",
      header: "№",
      cell: ({ getValue }) => getValue<string>() || "—",
      enableSorting: true,
    },
    {
      id: "createdAt",
      header: "Создана",
      accessorFn: (row) => toDate(row.createdAt)?.getTime() ?? 0,
      cell: ({ row }) => fmtDate(row.original.createdAt),
      enableSorting: true,
    },
    {
      accessorKey: "operator",
      header: "Оператор",
      cell: ({ getValue }) => getValue<string>() || "—",
      enableSorting: true,
    },
    {
      accessorKey: "hotel",
      header: "Отель",
      cell: ({ getValue }) => getValue<string>() || "—",
      enableSorting: true,
    },
    {
      id: "checkIn",
      header: "Заезд",
      accessorFn: (row) => toDate(row.checkIn)?.getTime() ?? 0,
      cell: ({ row }) => fmtDate(row.original.checkIn),
      enableSorting: true,
    },
    {
      id: "checkOut",
      header: "Выезд",
      accessorFn: (row) => toDate(row.checkOut)?.getTime() ?? 0,
      cell: ({ row }) => fmtDate(row.original.checkOut),
      enableSorting: true,
    },
    {
      id: "bruttoClient",
      header: "Клиент (€)",
      accessorFn: (row) => Number(row.bruttoClient || 0),
      cell: ({ row }) => fixed2(row.original.bruttoClient),
      enableSorting: true,
    },
    {
      id: "commission",
      header: "Комиссия (€)",
      accessorFn: (row) => Number(row.commission || 0),
      cell: ({ row }) => fixed2(row.original.commission),
      enableSorting: true,
    },
    {
      accessorKey: "status",
      header: "Статус",
      cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      enableSorting: true,
    },
    {
      id: "invoice",
      header: "Инвойс",
      cell: ({ row }) =>
        row.original.invoiceLink ? (
          <a href={row.original.invoiceLink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
            Open
          </a>
        ) : (
          "—"
        ),
    },
    {
      id: "vouchers",
      header: "Ваучеры",
      cell: ({ row }) =>
        Array.isArray(row.original.voucherLinks) && row.original.voucherLinks.length ? (
          <div className="min-w-[110px]">
            {row.original.voucherLinks!.map((l, i) => (
              <div key={i}>
                <a href={l} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
                  Voucher {i + 1}
                </a>
              </div>
            ))}
          </div>
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      header: "Действия",
      cell: ({ row }) => (
        <div className="flex gap-2 justify-center">
          <button
            title="Редактировать"
            className="text-xl hover:scale-110 transition"
            onClick={() => opts.onEdit(row.original)}
          >
            ✏️
          </button>
        </div>
      ),
    },
  ];
}

/* ================== OLIMPYA ================== */
export function olimpyaColumns(opts: { onEdit: (row: BookingRow) => void }): ColumnDef<BookingRow, any>[] {
  return [
    {
      id: "createdAt",
      header: "Создана",
      accessorFn: (row) => toDate(row.createdAt)?.getTime() ?? 0,
      cell: ({ row }) => fmtDate(row.original.createdAt),
      enableSorting: true,
    },
    {
      accessorKey: "bookingNumber",
      header: "№",
      cell: ({ getValue }) => getValue<string>() || "—",
      enableSorting: true,
    },
    {
      accessorKey: "operator",
      header: "Оператор",
      cell: ({ getValue }) => getValue<string>() || "—",
      enableSorting: true,
    },
    {
      accessorKey: "hotel",
      header: "Отель",
      cell: ({ getValue }) => getValue<string>() || "—",
      enableSorting: true,
    },
    {
      id: "checkIn",
      header: "Заезд",
      accessorFn: (row) => toDate(row.checkIn)?.getTime() ?? 0,
      cell: ({ row }) => fmtDate(row.original.checkIn),
      enableSorting: true,
    },
    {
      id: "checkOut",
      header: "Выезд",
      accessorFn: (row) => toDate(row.checkOut)?.getTime() ?? 0,
      cell: ({ row }) => fmtDate(row.original.checkOut),
      enableSorting: true,
    },
    {
      id: "firstTourist",
      header: "Имя туриста",
      accessorFn: (row) => row.tourists?.[0]?.name || "",
      cell: ({ row }) => row.original.tourists?.[0]?.name || "—",
      enableSorting: true,
    },
    {
      id: "bruttoClient",
      header: "Клиент (€)",
      accessorFn: (row) => Number(row.bruttoClient || 0),
      cell: ({ row }) => fixed2(row.original.bruttoClient),
      enableSorting: true,
    },
    {
      id: "internalNet",
      header: "Netto Fact (€)",
      accessorFn: (row) => Number(row.internalNet || 0),
      cell: ({ row }) => fixed2(row.original.internalNet),
      enableSorting: true,
    },
    {
      id: "realCommission",
      header: "Real комис. (€)",
      accessorFn: (row) => Number(row.realCommission || 0),
      cell: ({ row }) => fixed2(row.original.realCommission),
      enableSorting: true,
    },
    {
      accessorKey: "status",
      header: "Статус",
      cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      enableSorting: true,
    },
    {
      id: "actions",
      header: "Действия",
      cell: ({ row }) => (
        <div className="flex gap-2 justify-center">
          <button
            title="Редактировать"
            className="text-xl hover:scale-110 transition"
            onClick={() => opts.onEdit(row.original)}
          >
            ✏️
          </button>
        </div>
      ),
    },
  ];
}