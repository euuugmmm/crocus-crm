// components/finance/TransactionModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Currency = "EUR" | "RON" | "USD";
type CategorySide = "income" | "expense";

type Account = { id: string; name: string; currency: Currency; archived?: boolean };
type Category = { id: string; name: string; side: CategorySide; archived?: boolean; order?: number };
type Counterparty = { id: string; name: string; archived?: boolean };

type FxDoc = { id: string; base: "EUR"; rates: Partial<Record<Currency, number>> };

export type BookingOptionBase = {
  id: string;
  bookingNumber: string;
  created: string;
  operator: string;
  place: string;
  period: string;
  leftIncome: number;
  leftExpense: number;
};

export type BookingAllocation = { bookingId: string; amountBase: number };

export type TxFormData = {
  id?: string | null;
  date: string;
  accountId: string;
  currency: Currency;
  side: CategorySide;
  status: "planned" | "actual" | "reconciled";
  amount: number;          // в валюте счета (для справки)
  baseAmount?: number;     // в EUR (если задано — используем)
  categoryId: string | null;
  counterpartyId: string | null;
  ownerWho: "crocus" | "igor" | "evgeniy" | "split50" | null;
  bookingId?: string | null;             // быстрый выбор «одной» заявки
  bookingAllocations: BookingAllocation[]; // множественные
  note: string;
  method: "bank" | "card" | "cash" | "iban" | "other";
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function eurFrom(amount: number, ccy: Currency, dateISO: string, fxList: FxDoc[]) {
  if (!amount) return 0;
  if (ccy === "EUR") return +amount.toFixed(2);
  if (!fxList.length) return 0;
  const exact = fxList.find((r) => r.id === dateISO);
  const candidate =
    exact ||
    [...fxList].sort((a, b) => (a.id < b.id ? 1 : -1)).find((r) => r.id <= dateISO) ||
    fxList[fxList.length - 1];
  const inv = candidate?.rates?.[ccy];
  if (!inv || inv <= 0) return 0;
  return +(amount / inv).toFixed(2);
}

const moneyEUR = (n: number) => `${(Math.abs(n) || 0).toFixed(2)} €`;

const formatBookingLabel = (o: {
  bookingNumber: string; created: string; operator: string; place: string; period: string; left: number;
}) => `${o.bookingNumber} · ${o.created} · ${o.operator} · ${o.place} · ${o.period} · осталось ${moneyEUR(o.left)}`;

export default function TransactionModal({
  open,
  onClose,
  onSave,
  initial,
  accounts,
  categories,
  counterparties,
  fxList,
  bookingOptions, // карта id -> данные (с остатками)
}: {
  open: boolean;
  onClose: () => void;
  onSave: (form: TxFormData) => void;
  initial: TxFormData;
  accounts: Account[];
  categories: Category[];
  counterparties: Counterparty[];
  fxList: FxDoc[];
  bookingOptions: Map<string, BookingOptionBase>;
}) {
  const [form, setForm] = useState<TxFormData>(initial);
  const [bookingSearch, setBookingSearch] = useState("");

  useEffect(() => setForm(initial), [initial]);

  // авто-валюта по счету
  useEffect(() => {
    if (!form.accountId) return;
    const acc = accounts.find((a) => a.id === form.accountId);
    if (acc && form.currency !== acc.currency) {
      setForm((prev) => ({ ...prev, currency: acc.currency }));
    }
  }, [form.accountId, accounts]); // eslint-disable-line

  const isIncome = form.side === "income";

  // EUR для распределения
  const formEUR = useMemo(() => {
    return form.baseAmount != null
      ? Number(form.baseAmount)
      : eurFrom(Number(form.amount || 0), form.currency, form.date || todayISO(), fxList);
  }, [form.amount, form.baseAmount, form.currency, form.date, fxList]);

  const allocatedSum = useMemo(
    () => (form.bookingAllocations || []).reduce((s, a) => s + Math.max(0, Number(a.amountBase || 0)), 0),
    [form.bookingAllocations]
  );

  const allocateRemain = +(Math.max(0, formEUR - allocatedSum).toFixed(2));

  // генерация списка вариантов заявок (с фильтром по поиску/сумме)
  const bookingChoices = useMemo(() => {
    const arr = Array.from(bookingOptions.values())
      .map(x => ({
        id: x.id,
        bookingNumber: x.bookingNumber,
        created: x.created,
        operator: x.operator,
        place: x.place,
        period: x.period,
        left: isIncome ? x.leftIncome : x.leftExpense,
      }))
      .filter(x => x.left > 0.0001);

    const q = bookingSearch.trim().toLowerCase();
    if (!q) return arr;

    const qNum = Number(q.replace(/[^\d.,-]/g, "").replace(",", "."));
    const numeric = Number.isFinite(qNum);

    return arr.filter(b => {
      const hay = `${b.bookingNumber} ${b.created} ${b.operator} ${b.place} ${b.period} ${b.left}`.toLowerCase();
      if (hay.includes(q)) return true;
      if (numeric) {
        if (Math.abs(b.left - qNum) <= 0.5) return true;
        if (String(Math.round(b.left)).includes(String(Math.round(qNum)))) return true;
      }
      return false;
    });
  }, [bookingOptions, bookingSearch, isIncome]);

  const currentBookingOption = useMemo(() => {
    const id = form.bookingId || form.bookingAllocations?.[0]?.bookingId;
    if (!id) return null;
    const x = bookingOptions.get(id);
    if (!x) return null;
    return {
      id,
      bookingNumber: x.bookingNumber,
      created: x.created,
      operator: x.operator,
      place: x.place,
      period: x.period,
      left: isIncome ? x.leftIncome : x.leftExpense,
    };
  }, [form.bookingId, form.bookingAllocations, bookingOptions, isIncome]);

  const addAllocationFromSelect = () => {
    const chosen = form.bookingId || currentBookingOption?.id;
    if (!chosen) return;
    const x = bookingOptions.get(chosen);
    if (!x) return;
    const leftHere = isIncome ? x.leftIncome : x.leftExpense;
    const amount = Math.min(leftHere, allocateRemain || formEUR);
    setForm(s => ({
      ...s,
      bookingId: "",
      bookingAllocations: [...(s.bookingAllocations || []), { bookingId: chosen, amountBase: +amount.toFixed(2) }],
    }));
  };

  const removeAllocation = (idx: number) =>
    setForm(s => ({ ...s, bookingAllocations: (s.bookingAllocations || []).filter((_, i) => i !== idx) }));

  const changeAllocationAmount = (idx: number, value: number) =>
    setForm(s => {
      const list = [...(s.bookingAllocations || [])];
      list[idx] = { ...list[idx], amountBase: Math.max(0, Number(value) || 0) };
      return { ...s, bookingAllocations: list };
    });

  const save = () => {
    // базовые проверки
    if (!form.date || !form.accountId || !form.side) {
      alert("Дата, счёт и тип обязательны");
      return;
    }
    if (allocatedSum - formEUR > 0.01) {
      if (!confirm("Распределено больше, чем сумма в EUR. Сохранить всё равно?")) return;
    }
    onSave(form);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
      <div className="w-full max-w-3xl bg-white rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{form.id ? "Редактировать транзакцию" : "Новая транзакция"}</h2>
          <button className="text-2xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="Дата">
            <input type="date" className="w-full border rounded px-2 py-1"
              value={form.date || ""} onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}/>
          </Field>
          <Field label="Счёт">
            <select className="w-full border rounded px-2 py-1"
              value={form.accountId || ""} onChange={(e) => setForm((s) => ({ ...s, accountId: e.target.value }))}>
              <option value="" disabled>— выберите счёт —</option>
              {accounts.filter((a) => !a.archived).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </Field>

          <Field label="Тип">
            <select className="w-full border rounded px-2 py-1"
              value={form.side || "income"}
              onChange={(e) => setForm((s) => ({ ...s, side: e.target.value as CategorySide, bookingId: "", bookingAllocations: [] }))}>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </Field>
          <Field label="Категория">
            <select className="w-full border rounded px-2 py-1"
              value={form.categoryId ?? ""} onChange={(e) => setForm((s) => ({ ...s, categoryId: e.target.value || null }))}>
              <option value="">— не задано —</option>
              {categories.filter((c) => !c.archived && c.side === form.side).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label={`Сумма (${form.currency})`}>
            <input type="number" step="0.01" className="w-full border rounded px-2 py-1"
              value={form.amount ?? 0}
              onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value || 0) }))}/>
          </Field>
          <Field label="Контрагент">
            <select className="w-full border rounded px-2 py-1"
              value={form.counterpartyId ?? ""} onChange={(e) => setForm((s) => ({ ...s, counterpartyId: e.target.value || null }))}>
              <option value="">— не задан —</option>
              {counterparties.filter((x) => !x.archived).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </Field>

          {form.side === "expense" && (
            <Field label="Чей расход">
              <select className="w-full border rounded px-2 py-1"
                value={form.ownerWho ?? ""} onChange={(e) => setForm((s) => ({ ...s, ownerWho: (e.target.value || null) as any }))}>
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
            <div className="space-y-1">
              <input
                className="w-full border rounded px-2 py-1 text-xs"
                placeholder="Быстрый поиск по номеру/отелю/оператору/датам/сумме…"
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
              />
              <div className="flex gap-2">
                <select className="w-full border rounded px-2 py-1"
                  value={form.bookingId || ""}
                  onChange={(e) => setForm((s) => ({ ...s, bookingId: e.target.value || ("" as any) }))}>
                  <option value="">— не выбрана —</option>
                  {currentBookingOption && !bookingChoices.some(c => c.id === currentBookingOption.id) && (
                    <option value={currentBookingOption.id}>{formatBookingLabel(currentBookingOption)}</option>
                  )}
                  {bookingChoices.map((b) => {
                    const left = isIncome ? b.left : b.left;
                    return (
                      <option key={b.id} value={b.id}>
                        {formatBookingLabel({ ...b, left })}
                      </option>
                    );
                  })}
                </select>
                <Button variant="outline" className="whitespace-nowrap h-9 px-3" onClick={addAllocationFromSelect}>
                  + Добавить
                </Button>
              </div>
            </div>
          </Field>

          {/* Распределения по заявкам */}
          <Field label={`Распределение по заявкам (EUR) · к распределению: ${formEUR.toFixed(2)} · осталось: ${allocateRemain.toFixed(2)}`} full>
            <div className="border rounded">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-2 py-1 text-left">Заявка</th>
                    <th className="border px-2 py-1 w-40">Сумма (EUR)</th>
                    <th className="border px-2 py-1 w-28">Статус</th>
                    <th className="border px-2 py-1 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {(form.bookingAllocations || []).map((al, idx) => {
                    const x = bookingOptions.get(al.bookingId);
                    const label = x
                      ? `${x.bookingNumber} · ${x.operator} · ${x.place} · ${x.period}`
                      : al.bookingId;

                    let leftBase = 0;
                    if (x) {
                      const leftOrig = isIncome ? x.leftIncome : x.leftExpense;
                      const sameSum = (form.bookingAllocations || [])
                        .filter(a => a.bookingId === al.bookingId)
                        .reduce((s, a) => s + (a === al ? 0 : a.amountBase), 0);
                      leftBase = Math.max(0, leftOrig - sameSum);
                    }

                    return (
                      <tr key={`${al.bookingId}-${idx}`} className="align-top">
                        <td className="border px-2 py-1">{label}</td>
                        <td className="border px-2 py-1">
                          <input
                            type="number" step="0.01"
                            className="w-full border rounded px-2 py-1"
                            value={al.amountBase}
                            onChange={(e) => changeAllocationAmount(idx, Number(e.target.value))}
                          />
                        </td>
                        <td className="border px-2 py-1">
                          {x ? (
                            al.amountBase <= leftBase
                              ? <span className="text-emerald-700">OK</span>
                              : <span className="text-rose-700">переплата {(al.amountBase - leftBase).toFixed(2)} €</span>
                          ) : "—"}
                        </td>
                        <td className="border px-2 py-1 text-center">
                          <button className="h-7 px-2 border rounded hover:bg-gray-100" onClick={() => removeAllocation(idx)}>✖︎</button>
                        </td>
                      </tr>
                    );
                  })}
                  {(form.bookingAllocations || []).length === 0 && (
                    <tr><td className="border px-2 py-2 text-gray-500" colSpan={4}>Пока нет распределений</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Field>

          <Field label="Заметка" full>
            <input className="w-full border rounded px-2 py-1"
              value={form.note || ""}
              onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              placeholder="комментарий"/>
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="h-8 px-3 text-xs">Отмена</Button>
          <Button onClick={save} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">Сохранить</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: any; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[11px] text-gray-600 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}