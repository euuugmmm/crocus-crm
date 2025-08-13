// components/finance/BookingQuickSearch.tsx
"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { BookingOption, CategorySide } from "@/types/finance";

export default function BookingQuickSearch({
  side,
  search,
  onSearch,
  map,
  value,
  onChange,
  onAdd,
  currentOption,
}: {
  side: CategorySide;
  search: string;
  onSearch: (v: string) => void;
  map: Map<string, BookingOption>;
  value: string;
  onChange: (id: string) => void;
  onAdd: () => void;
  currentOption?: BookingOption;
}) {
  // строим список с учётом «переплаты клиента» для расхода
  const choices = useMemo(() => {
    const all = Array.from(map.values()).map((o) => {
      const leftRelevant =
        side === "income"
          ? o.leftIncome
          : Math.max(o.leftExpense, o.clientOverpay || 0);

      return { ...o, leftRelevant };
    });

    // фильтр по поиску
    const q = search.trim().toLowerCase();
    let filtered = all.filter((o) => o.leftRelevant > 0.0001);

    if (q) {
      filtered = filtered.filter((o) => {
        const hay = [
          o.bookingNumber,
          o.created,
          o.operator,
          o.place,
          o.touristFirst || "",
          o.period,
          String(o.leftIncome),
          String(o.leftExpense),
          String(o.clientOverpay || ""),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    // если выбранная заявка не прошла фильтр — добавим в начало
    if (currentOption && !filtered.some((x) => x.id === currentOption.id)) {
      const leftRelevant =
        side === "income"
          ? currentOption.leftIncome
          : Math.max(currentOption.leftExpense, currentOption.clientOverpay || 0);
      filtered = [{ ...currentOption, leftRelevant }, ...filtered];
    }

    // сортировка: по дате создания (строкой), новые выше
    filtered.sort((a, b) => (a.created < b.created ? 1 : -1));
    return filtered;
  }, [map, side, search, currentOption]);

  const formatLabel = (o: BookingOption & { leftRelevant: number }) => {
    const tailIncome = `осталось принять ${o.leftIncome.toFixed(2)} €`;
    const tailExpense =
      (o.leftExpense > 0 ? `оператору ${o.leftExpense.toFixed(2)} €` : "") +
      (o.clientOverpay && o.clientOverpay > 0
        ? `${o.leftExpense > 0 ? " · " : ""}переплата клиента ${o.clientOverpay.toFixed(2)} €`
        : "");

    const tail = side === "income" ? tailIncome : tailExpense || "—";

    const tourist = o.touristFirst ? ` · ${o.touristFirst}` : "";

    // порядок: № · дата · оператор · отель · турист · период · хвост
    return `${o.bookingNumber} · ${o.created} · ${o.operator} · ${o.place}${tourist} · ${o.period} · ${tail}`;
  };

  return (
    <div className="space-y-1">
      <input
        className="w-full border rounded px-2 py-1 text-xs"
        placeholder="Поиск по №/оператор/отель/турист/датам/сумме…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <div className="flex gap-2">
        <select
          className="w-full border rounded px-2 py-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— не выбрана —</option>
          {choices.map((o) => (
            <option key={o.id} value={o.id}>
              {formatLabel(o)}
            </option>
          ))}
        </select>
        <Button variant="outline" className="whitespace-nowrap h-9 px-3" onClick={onAdd}>
          + Добавить
        </Button>
      </div>
    </div>
  );
}