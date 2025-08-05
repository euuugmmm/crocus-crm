// components/bookings/list/filters.tsx
"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_KEYS } from "@/lib/constants/statuses";

export type CommonFilters = {
  bookingType?: string;
  bookingNumber?: string;
  operator?: string;
  hotel?: string;
  agentName?: string;
  status?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  checkInFrom?: string;
  checkInTo?: string;
  checkOutFrom?: string;
  checkOutTo?: string;
  bruttoClient?: string;
  commission?: string;
  internalNet?: string;
  crocusProfit?: string;
  firstTourist?: string;
};

type RowProps = {
  children: React.ReactNode;
};
const Row = ({ children }: RowProps) => (
  <div className="grid grid-cols-12 gap-2 items-end">{children}</div>
);

const Cell: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={className || ""}>{children}</div>
);

/* Универсальные фильтры. Через флаги включаем/выключаем поля под разные роли. */
export function BookingFilters({
  filters,
  setFilters,
  showType = false,
  showAgent = false,
  showTourist = false,
}: {
  filters: CommonFilters;
  setFilters: (f: CommonFilters) => void;
  showType?: boolean;
  showAgent?: boolean;
  showTourist?: boolean;
}) {
  const small = "h-8 w-full text-xs px-2";

  return (
    <div className="p-3 border rounded bg-white">
      <Row>
        {showType && (
          <Cell className="col-span-2">
            <label className="text-xs block mb-1">Тип</label>
            <Input
              value={filters.bookingType || ""}
              onChange={(e) => setFilters({ ...filters, bookingType: e.target.value })}
              placeholder="Тип"
              className={small}
            />
          </Cell>
        )}

        <Cell className="col-span-2">
          <label className="text-xs block mb-1">Дата создана (с)</label>
          <Input
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            className={small}
          />
        </Cell>
        <Cell className="col-span-2">
          <label className="text-xs block mb-1">Дата создана (по)</label>
          <Input
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className={small}
          />
        </Cell>

        <Cell className="col-span-2">
          <label className="text-xs block mb-1">№</label>
          <Input
            value={filters.bookingNumber || ""}
            onChange={(e) => setFilters({ ...filters, bookingNumber: e.target.value })}
            placeholder="#"
            className={small}
          />
        </Cell>

        {showAgent && (
          <Cell className="col-span-2">
            <label className="text-xs block mb-1">Агент</label>
            <Input
              value={filters.agentName || ""}
              onChange={(e) => setFilters({ ...filters, agentName: e.target.value })}
              placeholder="Имя агента"
              className={small}
            />
          </Cell>
        )}

        <Cell className="col-span-2">
          <label className="text-xs block mb-1">Оператор</label>
          <Input
            value={filters.operator || ""}
            onChange={(e) => setFilters({ ...filters, operator: e.target.value })}
            placeholder="Оператор"
            className={small}
          />
        </Cell>

        <Cell className="col-span-3">
          <label className="text-xs block mb-1">Отель</label>
          <Input
            value={filters.hotel || ""}
            onChange={(e) => setFilters({ ...filters, hotel: e.target.value })}
            placeholder="Отель"
            className={small}
          />
        </Cell>

        <Cell className="col-span-2">
          <label className="text-xs block mb-1">Заезд (с)</label>
          <Input
            type="date"
            value={filters.checkInFrom || ""}
            onChange={(e) => setFilters({ ...filters, checkInFrom: e.target.value })}
            className={small}
          />
        </Cell>
        <Cell className="col-span-2">
          <label className="text-xs block mb-1">Заезд (по)</label>
          <Input
            type="date"
            value={filters.checkInTo || ""}
            onChange={(e) => setFilters({ ...filters, checkInTo: e.target.value })}
            className={small}
          />
        </Cell>

        <Cell className="col-span-2">
          <label className="text-xs block mb-1">Выезд (с)</label>
          <Input
            type="date"
            value={filters.checkOutFrom || ""}
            onChange={(e) => setFilters({ ...filters, checkOutFrom: e.target.value })}
            className={small}
          />
        </Cell>
        <Cell className="col-span-2">
          <label className="text-xs block mb-1">Выезд (по)</label>
          <Input
            type="date"
            value={filters.checkOutTo || ""}
            onChange={(e) => setFilters({ ...filters, checkOutTo: e.target.value })}
            className={small}
          />
        </Cell>

        <Cell className="col-span-2">
          <label className="text-xs block mb-1">Статус</label>
          <Select
            value={filters.status || "all"}
            onValueChange={(v) => setFilters({ ...filters, status: v })}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Все" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              {STATUS_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Cell>

        {showTourist && (
          <Cell className="col-span-3">
            <label className="text-xs block mb-1">Имя 1-го туриста</label>
            <Input
              value={filters.firstTourist || ""}
              onChange={(e) => setFilters({ ...filters, firstTourist: e.target.value })}
              placeholder="Имя"
              className={small}
            />
          </Cell>
        )}

        {/* Числовые фильтры для нужных ролей */}
        {"bruttoClient" in filters && (
          <Cell className="col-span-2">
            <label className="text-xs block mb-1">Brutto (€)</label>
            <Input
              value={filters.bruttoClient || ""}
              onChange={(e) => setFilters({ ...filters, bruttoClient: e.target.value })}
              placeholder="0.00"
              className={`${small} text-right`}
            />
          </Cell>
        )}
        {"commission" in filters && (
          <Cell className="col-span-2">
            <label className="text-xs block mb-1">Комиссия (€)</label>
            <Input
              value={filters.commission || ""}
              onChange={(e) => setFilters({ ...filters, commission: e.target.value })}
              placeholder="0.00"
              className={`${small} text-right`}
            />
          </Cell>
        )}
        {"internalNet" in filters && (
          <Cell className="col-span-2">
            <label className="text-xs block mb-1">Netto Fact (€)</label>
            <Input
              value={filters.internalNet || ""}
              onChange={(e) => setFilters({ ...filters, internalNet: e.target.value })}
              placeholder="0.00"
              className={`${small} text-right`}
            />
          </Cell>
        )}
        {"crocusProfit" in filters && (
          <Cell className="col-span-2">
            <label className="text-xs block mb-1">Crocus (€)</label>
            <Input
              value={filters.crocusProfit || ""}
              onChange={(e) => setFilters({ ...filters, crocusProfit: e.target.value })}
              placeholder="0.00"
              className={`${small} text-right`}
            />
          </Cell>
        )}
      </Row>
    </div>
  );
}