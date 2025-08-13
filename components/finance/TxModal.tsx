// components/finance/TxModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import BookingQuickSearch from "@/components/finance/BookingQuickSearch";
import AllocationsEditor from "@/components/finance/AllocationsEditor";
import {
  Account,
  Allocation,
  BookingOption,
  Category,
  CategorySide,
  Counterparty,
  Currency,
  FxDoc,
  OwnerWho,
  TxRow,
} from "@/types/finance";
import { buildTxPayload, upsertOrdersForTransaction } from "@/lib/finance/tx";
import { eurFrom } from "@/lib/finance/fx";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const todayISO = () => new Date().toISOString().slice(0, 10);

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[11px] text-gray-600 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default function TxModal({
  open,
  onClose,
  onSaved,
  initial,
  accounts,
  categories,
  counterparties,
  fxList,
  bookingOptionsMap,
  existingAllocations = [],
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (txId: string) => void;
  initial?: Partial<TxRow> | null;
  accounts: Account[];
  categories: Category[];
  counterparties: Counterparty[];
  fxList: FxDoc[];
  bookingOptionsMap: Map<string, BookingOption>;
  /** аллокации, уже сохранённые в finance_orders по этой транзакции (источник факта) */
  existingAllocations?: Allocation[];
}) {
  const isEdit = !!initial?.id;

  // ---- форма
  const [form, setForm] = useState<Partial<TxRow>>({
    date: todayISO(),
    accountId: "",
    currency: "EUR" as Currency,
    side: "income",
    amount: 0,
    baseAmount: 0,
    categoryId: null,
    counterpartyId: null,
    ownerWho: null,
    bookingId: "",
    bookingAllocations: [],
    note: "",
    method: "bank",
    status: "actual",
  });

  // поиск и выбор заявки
  const [bookingSearch, setBookingSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial && isEdit) {
      setForm({
        ...initial,
        amount: Math.abs(Number(initial.amount || 0)),
        baseAmount: Math.abs(Number(initial.baseAmount || 0)),
        // ВАЖНО: локально не подтягиваем старые alloc из транзакции — фактом считаем existingAllocations (из orders)
        bookingAllocations: [],
        bookingId: "",
      });
      setBookingSearch("");
    } else {
      const firstAcc = accounts.find((a) => !a.archived);
      setForm({
        date: todayISO(),
        accountId: firstAcc?.id || "",
        currency: (firstAcc?.currency as Currency) || "EUR",
        side: "income",
        amount: 0,
        baseAmount: 0,
        categoryId: null,
        counterpartyId: null,
        ownerWho: null,
        bookingId: "",
        bookingAllocations: [],
        note: "",
        method: "bank",
        status: "actual",
      });
      setBookingSearch("");
    }
  }, [open, isEdit, initial, accounts]);

  // следим за валютой по счёту
  useEffect(() => {
    if (!form.accountId) return;
    const acc = accounts.find((a) => a.id === form.accountId);
    if (acc && form.currency !== acc.currency) {
      setForm((prev) => ({ ...prev, currency: acc.currency as Currency }));
    }
  }, [form.accountId, accounts]); // eslint-disable-line

  const isIncome = form.side === "income";

  // EUR к распределению из формы (приоритет baseAmount, иначе конвертим amount)
  const formEUR = useMemo(() => {
    const ccy = (form.currency as Currency) || "EUR";
    return form.baseAmount != null
      ? Number(form.baseAmount)
      : eurFrom(Number(form.amount || 0), ccy, form.date || todayISO(), fxList);
  }, [form.amount, form.baseAmount, form.currency, form.date, fxList]);

  // факт уже распределённого (по ордерам)
  const alreadyAllocatedEUR = useMemo(
    () => (existingAllocations || []).reduce((s, a) => s + Math.max(0, Number(a.amountBase || 0)), 0),
    [existingAllocations]
  );

  // сколько пользователь добавил сейчас в этой сессии
  const addedNowEUR = useMemo(
    () => (form.bookingAllocations || []).reduce((s, a) => s + Math.max(0, Number(a.amountBase || 0)), 0),
    [form.bookingAllocations]
  );

  // общий остаток к распределению = EUR формы − факт (ордера) − новые строки
  const allocateRemain = useMemo(
    () => +Math.max(0, formEUR - alreadyAllocatedEUR - addedNowEUR).toFixed(2),
    [formEUR, alreadyAllocatedEUR, addedNowEUR]
  );

  // текущая опция выбранной заявки (для селекта)
  const currentBookingOption = useMemo(() => {
    const id = form.bookingId || form.bookingAllocations?.[0]?.bookingId;
    if (!id) return null;
    return bookingOptionsMap.get(id) || null;
  }, [form.bookingId, form.bookingAllocations, bookingOptionsMap]);

  // добавить строку по выбранной заявке
  const addAllocationFromSelect = () => {
    if (allocateRemain <= 0) return; // НЕЛЬЗЯ добавлять при нулевом остатке
    const chosen = form.bookingId || currentBookingOption?.id;
    if (!chosen) return;
    const opt = bookingOptionsMap.get(chosen);
    if (!opt) return;

    // если расход и нет долга оператору, но есть переплата клиента — подставим переплату
    let leftHere = isIncome ? opt.leftIncome : opt.leftExpense;
    if (!isIncome && (!leftHere || leftHere <= 0) && (opt.clientOverpay || 0) > 0) {
      leftHere = opt.clientOverpay!;
    }

    const base = leftHere && leftHere > 0 ? leftHere : allocateRemain;
    const amount = Math.min(base, allocateRemain);

    if (amount <= 0) return;

    setForm((s) => ({
      ...s,
      bookingId: "",
      bookingAllocations: [
        ...(s.bookingAllocations || []),
        { bookingId: chosen, amountBase: +Number(amount || 0).toFixed(2) },
      ],
    }));
  };

  const changeAllocations = (allocs: Allocation[]) => {
    setForm((s) => ({ ...s, bookingAllocations: allocs }));
  };

  // валидация и сохранение
  const save = async () => {
    if (!form.date || !form.accountId || !form.side) {
      alert("Дата, счёт и тип обязательны");
      return;
    }
    // формируем итоговый набор аллокаций = уже существующие (из ордеров) + новые строки из формы
    const finalAllocs: Allocation[] = [
      ...(existingAllocations || []),
      ...((form.bookingAllocations || []).map(a => ({ bookingId: a.bookingId, amountBase: +Number(a.amountBase || 0).toFixed(2) }))),
    ];

    // мягкий контроль переплаты: позволяем, но предупреждаем
    const finalSum = finalAllocs.reduce((s, a) => s + Math.max(0, a.amountBase), 0);
    if (finalSum - formEUR > 0.01) {
      const ok = confirm("Распределено больше, чем сумма транзакции в EUR. Сохранить всё равно?");
      if (!ok) return;
    }

    const payload = buildTxPayload(
      { ...form, bookingAllocations: finalAllocs },
      { accounts, categories, counterparties, fxList },
      initial?.id || undefined
    );

    if (isEdit && initial?.id) {
      await updateDoc(doc(db, "finance_transactions", initial.id), payload);
      await upsertOrdersForTransaction(
        initial.id,
        payload,
        finalAllocs
      );
      onSaved?.(initial.id);
    } else {
      const ref = await addDoc(collection(db, "finance_transactions"), payload);
      await upsertOrdersForTransaction(
        ref.id,
        payload,
        finalAllocs
      );
      onSaved?.(ref.id);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
      <div className="w-full max-w-3xl bg-white rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{isEdit ? "Редактировать транзакцию" : "Новая транзакция"}</h2>
          <button className="text-2xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="Дата">
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={form.date || ""}
              onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
            />
          </Field>
          <Field label="Счёт">
            <select
              className="w-full border rounded px-2 py-1"
              value={form.accountId || ""}
              onChange={(e) => setForm((s) => ({ ...s, accountId: e.target.value }))}
            >
              <option value="" disabled>— выберите счёт —</option>
              {accounts.filter((a) => !a.archived).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </Field>

          <Field label="Тип">
            <select
              className="w-full border rounded px-2 py-1"
              value={form.side || "income"}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  side: e.target.value as CategorySide,
                  bookingId: "",
                  bookingAllocations: [],
                }))
              }
            >
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </Field>
          <Field label="Категория">
            <select
              className="w-full border rounded px-2 py-1"
              value={form.categoryId ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, categoryId: e.target.value || null }))}
            >
              <option value="">— не задано —</option>
              {categories.filter((c) => !c.archived && c.side === form.side).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label={`Сумма (${form.currency})`}>
            <input
              type="number"
              step="0.01"
              className="w-full border rounded px-2 py-1"
              value={form.amount ?? 0}
              onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value || 0) }))}
            />
            {isEdit && alreadyAllocatedEUR > 0 && (
              <div className="text-[11px] text-gray-600 mt-1">
                Уже распределено (по ордерам): {alreadyAllocatedEUR.toFixed(2)} €
              </div>
            )}
          </Field>
          <Field label="Контрагент">
            <select
              className="w-full border rounded px-2 py-1"
              value={form.counterpartyId ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, counterpartyId: e.target.value || null }))}
            >
              <option value="">— не задан —</option>
              {counterparties.filter((x) => !x.archived).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </Field>

          {form.side === "expense" && (
            <Field label="Чей расход">
              <select
                className="w-full border rounded px-2 py-1"
                value={form.ownerWho ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, ownerWho: (e.target.value || null) as OwnerWho }))}
              >
                <option value="">— не указан —</option>
                <option value="crocus">Крокус</option>
                <option value="igor">Игорь</option>
                <option value="evgeniy">Евгений</option>
                <option value="split50">Крокус (50/50)</option>
              </select>
            </Field>
          )}

          {/* Выбор заявки + мини-поиск */}
          <Field label={`Заявка (${isIncome ? "неоплаченные по клиенту" : "остаток оплаты оператору"})`} full>
            <BookingQuickSearch
              side={form.side as CategorySide}
              search={bookingSearch}
              onSearch={setBookingSearch}
              map={bookingOptionsMap}
              value={form.bookingId || ""}
              onChange={(id) => setForm((s) => ({ ...s, bookingId: id }))}
              onAdd={addAllocationFromSelect}
              currentOption={currentBookingOption || undefined}
            />
            {allocateRemain <= 0 && (
              <div className="text-[11px] text-emerald-700 mt-1">
                Остаток к распределению: 0 € — добавлять новые строки нельзя.
              </div>
            )}
          </Field>

          {/* Распределения (только новые строки этой сессии) */}
          <Field label="" full>
            <AllocationsEditor
              side={form.side as CategorySide}
              allocations={form.bookingAllocations || []}
              onChange={changeAllocations}
              optionsMap={bookingOptionsMap}
              totalEUR={formEUR - alreadyAllocatedEUR}
              title={`Распределение по заявкам (EUR)`}
            />
          </Field>

          <Field label="Заметка" full>
            <input
              className="w-full border rounded px-2 py-1"
              value={form.note || ""}
              onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              placeholder="комментарий"
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-xs text-gray-600">
            Подсказка: если у клиента переплата — оформите «Возврат клиенту» как расходную транзакцию.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} className="h-8 px-3 text-xs">Отмена</Button>
            <Button onClick={save} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700" disabled={allocateRemain < 0}>
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}