// components/bookings/list/BookingListCore.tsx
"use client";

import React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";

type Props<T> = {
  data: T[];
  columns: ColumnDef<T, any>[];
  title?: string;
  toolbar?: React.ReactNode;
  filters?: React.ReactNode;
  footer?: React.ReactNode;
  tableClassName?: string;
  minWidth?: number; // px
};

export default function BookingListCore<T>({
  data,
  columns,
  title,
  toolbar,
  filters,
  footer,
  tableClassName,
  minWidth = 1400,
}: Props<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: false,
    debugTable: false,
  });

  return (
    <div className="w-full">
      {(title || toolbar) && (
        <div className="flex items-center justify-between mb-4">
          {title ? <h1 className="text-2xl font-bold">{title}</h1> : <div />}
          {toolbar}
        </div>
      )}

      {filters && <div className="mb-3">{filters}</div>}

      <div className="overflow-x-auto">
        <table
          className={`w-full border text-sm ${tableClassName || ""}`}
          style={{ minWidth }}
        >
          <thead className="bg-gray-100 text-center">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sortDir = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      className="px-2 py-1 border whitespace-nowrap"
                    >
                      <button
                        className={`w-full text-left ${
                          canSort ? "cursor-pointer" : "cursor-default"
                        }`}
                        onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                        title={
                          canSort
                            ? sortDir === "asc"
                              ? "Сорт. по возр. (клик — по убыв.)"
                              : sortDir === "desc"
                              ? "Сорт. по убыв. (клик — сброс)"
                              : "Сортировать"
                            : ""
                        }
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {canSort ? (
                          <span className="ml-1">
                            {sortDir === "asc" ? "↑" : sortDir === "desc" ? "↓" : ""}
                          </span>
                        ) : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50 text-center">
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="px-2 py-1 border align-middle">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot className="bg-gray-100 font-semibold">{footer}</tfoot>
          )}
        </table>
      </div>
    </div>
  );
}