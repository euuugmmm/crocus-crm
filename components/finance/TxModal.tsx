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
import { Briefcase, Users2 } from "lucide-react";

const todayISO = () => new Date().toISOString().slice(0, 10);
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[11px] text-gray-600 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}

type TargetMode = "bookings" | "founders";

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

  // назначение: заявки / учредители (кнопки-иконки)
  const [target, setTarget] = useState<TargetMode>("bookings");

  // founders split amounts (EUR)
  const [igorEUR, setIgorEUR] = useState<string>("");
  const [evgEUR, setEvgEUR]   = useState<string>("");
  const [lastEdited, setLastEdited] = useState<"igor" | "evg" | null>(null);

  // поиск заявки
  const [bookingSearch, setBookingSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial && isEdit) {
      setForm({
        ...initial,
        amount: Math.abs(Number(initial.amount || 0)),
        baseAmount: Math.abs(Number(initial.baseAmount || 0)),
        bookingAllocations: [],
        bookingId: "",
      });

      // если это расход по учредителям — покажем founders; подтянем сохранённые суммы
      const initOwner = (initial as any)?.ownerWho as OwnerWho | null | undefined;
      const igSaved = Number((initial as any)?.ownerIgorEUR || 0);
      const evSaved = Number((initial as any)?.ownerEvgeniyEUR || 0);
      setTarget((initOwner || igSaved > 0 || evSaved > 0) ? "founders" : "bookings");
      setIgorEUR(igSaved > 0 ? String(r2(igSaved)) : "");
      setEvgEUR(evSaved > 0 ? String(r2(evSaved)) : "");
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
      setTarget("bookings");
      setIgorEUR("");
      setEvgEUR("");
      setLastEdited(null);
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

  // переключение режимов: при входе в founders — сгенерировать 50/50 по текущей базе
  useEffect(() => {
    if (target !== "founders") return;
    const total = foundersEUR;
    if (total <= 0) {
      setIgorEUR("0");
      setEvgEUR("0");
      setLastEdited(null);
      return;
    }
    if (igorEUR === "" && evgEUR === "") {
      const half = r2(total / 2);
      setIgorEUR(String(half));
      setEvgEUR(String(r2(total - half)));
      setLastEdited(null);
    } else {
      if (lastEdited === "igor") {
        const ig = clamp01n(+Number(igorEUR), total);
        setIgorEUR(String(r2(ig)));
        setEvgEUR(String(r2(total - ig)));
      } else if (lastEdited === "evg") {
        const ev = clamp01n(+Number(evgEUR), total);
        setEvgEUR(String(r2(ev)));
        setIgorEUR(String(r2(total - ev)));
      } else {
        const ig = clamp01n(+Number(igorEUR), total);
        setIgorEUR(String(r2(ig)));
        setEvgEUR(String(r2(total - ig)));
      }
    }
    // не трогаем form.ownerWho — пресет задаётся селектором ниже
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const isIncome = form.side === "income";

  // EUR суммы из формы (приоритет baseAmount, иначе конверсия amount)
  const formEUR = useMemo(() => {
    const ccy = (form.currency as Currency) || "EUR";
    return form.baseAmount != null
      ? Number(form.baseAmount)
      : eurFrom(Number(form.amount || 0), ccy, form.date || todayISO(), fxList);
  }, [form.amount, form.baseAmount, form.currency, form.date, fxList]);

  // уже распределено по ордерам (факт)
  const alreadyAllocatedEUR = useMemo(
    () => (existingAllocations || []).reduce((s, a) => s + Math.max(0, Number(a.amountBase || 0)), 0),
    [existingAllocations]
  );

  // сколько добавляем в этой сессии
  const addedNowEUR = useMemo(
    () => (form.bookingAllocations || []).reduce((s, a) => s + Math.max(0, Number(a.amountBase || 0)), 0),
    [form.bookingAllocations]
  );

  // остаток к распределению по заявкам
  const allocateRemain = useMemo(
    () => +Math.max(0, formEUR - alreadyAllocatedEUR - addedNowEUR).toFixed(2),
    [formEUR, alreadyAllocatedEUR, addedNowEUR]
  );

  // общая сумма, доступная учредителям = EUR формы − факт по заявкам
  const foundersEUR = useMemo(
    () => +Math.max(0, formEUR - alreadyAllocatedEUR).toFixed(2),
    [formEUR, alreadyAllocatedEUR]
  );

  // синхронизировать второе поле учредителей при изменении первого / изменении total
  useEffect(() => {
    if (target !== "founders") return;
    const total = foundersEUR;
    if (lastEdited === "igor") {
      const ig = clamp01n(+Number(igorEUR), total);
      setIgorEUR(String(r2(ig)));
      setEvgEUR(String(r2(total - ig)));
    } else if (lastEdited === "evg") {
      const ev = clamp01n(+Number(evgEUR), total);
      setEvgEUR(String(r2(ev)));
      setIgorEUR(String(r2(total - ev)));
    } else {
      const half = r2(total / 2);
      setIgorEUR(String(half));
      setEvgEUR(String(r2(total - half)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundersEUR, target]);

  // «наложенная» карта опций для живого уменьшения остатков
  const optionsOverlayMap: Map<string, BookingOption> = useMemo(() => {
    const delta = new Map<string, number>();
    for (const a of form.bookingAllocations || []) {
      const v = (delta.get(a.bookingId) || 0) + Math.max(0, Number(a.amountBase || 0));
      delta.set(a.bookingId, +v.toFixed(2));
    }
    const out = new Map<string, BookingOption>();
    bookingOptionsMap.forEach((opt, id) => {
      const dec = delta.get(id) || 0;
      const clone: BookingOption = { ...opt };
      if (form.side === "income") {
        clone.leftIncome = Math.max(0, (opt.leftIncome || 0) - dec);
      } else {
        if ((opt.leftExpense || 0) > 0) {
          clone.leftExpense = Math.max(0, (opt.leftExpense || 0) - dec);
        } else {
          clone.clientOverpay = Math.max(0, (opt.clientOverpay || 0) - dec);
        }
      }
      out.set(id, clone);
    });
    return out;
  }, [bookingOptionsMap, form.bookingAllocations, form.side]);

  // текущая заявка
  const currentBookingOption = useMemo(() => {
    const id = form.bookingId || form.bookingAllocations?.[0]?.bookingId;
    if (!id) return null;
    return optionsOverlayMap.get(id) || null;
  }, [form.bookingId, form.bookingAllocations, optionsOverlayMap]);

  // добавить аллокацию по выбранной заявке
  const addAllocationFromSelect = () => {
    if (target !== "bookings") return;
    if (allocateRemain <= 0) return;
    const chosen = form.bookingId || currentBookingOption?.id;
    if (!chosen) return;
    const opt = optionsOverlayMap.get(chosen);
    if (!opt) return;

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

  /** быстрый пресет «чья затрата»: проставляет ownerWho и суммы */
  const applyOwnerPreset = (preset: OwnerWho | "" ) => {
    const total = foundersEUR;
    if (!preset) {
      // сброс пресета — оставляем текущие суммы, ownerWho -> null
      setForm(s => ({ ...s, ownerWho: null }));
      return;
    }
    if (preset === "igor") {
      setIgorEUR(String(r2(total)));
      setEvgEUR("0");
    } else if (preset === "evgeniy") {
      setIgorEUR("0");
      setEvgEUR(String(r2(total)));
    } else if (preset === "split50" || (preset as string) === "crocus") {
      const half = r2(total / 2);
      setIgorEUR(String(half));
      setEvgEUR(String(r2(total - half)));
      preset = "split50"; // нормализуем значение
    }
    setLastEdited(null);
    setForm(s => ({ ...s, ownerWho: preset as OwnerWho }));
  };

  // валидация и сохранение
  const save = async () => {
    if (!form.date || !form.accountId || !form.side) {
      alert("Дата, счёт и тип обязательны");
      return;
    }

    let finalAllocs: Allocation[] = [];

    if (target === "bookings") {
      finalAllocs = [
        ...(existingAllocations || []),
        ...((form.bookingAllocations || []).map(a => ({ bookingId: a.bookingId, amountBase: +Number(a.amountBase || 0).toFixed(2) }))),
      ];
      const finalSum = finalAllocs.reduce((s, a) => s + Math.max(0, a.amountBase), 0);
      if (finalSum - formEUR > 0.01) {
        const ok = confirm("Распределено больше, чем сумма транзакции в EUR. Сохранить всё равно?");
        if (!ok) return;
      }
    } else {
      if (form.side !== "expense") {
        alert("Выплата учредителям — это расходная транзакция.");
        return;
      }
      const ig = r2(+Number(igorEUR || 0));
      const ev = r2(+Number(evgEUR  || 0));
      const tot = r2(ig + ev);
      if (Math.abs(tot - foundersEUR) > 0.01) {
        alert("Сумма Игорь + Евгений должна совпадать с общей суммой в EUR (минус распределённое по заявкам).");
        return;
      }
    }

    // владельцы: сохраняем точные суммы, а ownerWho — «лайт-метка»
    let ownerWhoAuto: OwnerWho | null = form.ownerWho ?? null;
    let ownerIgorEUR = 0, ownerEvgeniyEUR = 0, foundersTotalEUR = 0;

    if (target === "founders") {
      ownerIgorEUR = r2(+Number(igorEUR || 0));
      ownerEvgeniyEUR = r2(+Number(evgEUR  || 0));
      foundersTotalEUR = r2(ownerIgorEUR + ownerEvgeniyEUR);

      // если пользователь руками изменил суммы — ownerWhoAuto может стать null (кастомный сплит)
      if (ownerIgorEUR > 0 && ownerEvgeniyEUR === 0) ownerWhoAuto = "igor";
      else if (ownerEvgeniyEUR > 0 && ownerIgorEUR === 0) ownerWhoAuto = "evgeniy";
      else if (Math.abs(ownerIgorEUR - ownerEvgeniyEUR) <= 0.01 && foundersTotalEUR > 0) ownerWhoAuto = "split50";
      else ownerWhoAuto = null;
    }

    const payload = buildTxPayload(
      {
        ...form,
        ownerWho: ownerWhoAuto,
        // по заявкам — сохраняем все аллокации; по учредителям — только существующие (не трогаем ордера)
        bookingAllocations: target === "bookings" ? finalAllocs : existingAllocations,
        // точные суммы по учредителям (нужны, чтобы кастомный сплит сохранялся):
        ...(target === "founders" ? { ownerIgorEUR, ownerEvgeniyEUR, foundersTotalEUR } : {}),
      },
      { accounts, categories, counterparties, fxList },
      initial?.id || undefined
    );

    if (isEdit && initial?.id) {
      await updateDoc(doc(db, "finance_transactions", initial.id), payload);
      if (target === "bookings") {
        await upsertOrdersForTransaction(initial.id, payload, finalAllocs);
      }
      onSaved?.(initial.id);
    } else {
      const ref = await addDoc(collection(db, "finance_transactions"), payload);
      if (target === "bookings") {
        await upsertOrdersForTransaction(ref.id, payload, finalAllocs);
      }
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

          {/* назначение — кнопки без текста */}
          <Field label="Назначение" full>
            <div className="inline-flex gap-2">
              <button
                className={`px-3 py-2 rounded-lg border ${target === "bookings" ? "bg-blue-50 border-blue-400 text-blue-700" : ""}`}
                title="По заявкам"
                onClick={() => setTarget("bookings")}
              >
                <Briefcase className="w-4 h-4" />
              </button>
              <button
                className={`px-3 py-2 rounded-lg border ${target === "founders" ? "bg-blue-50 border-blue-400 text-blue-700" : ""}`}
                title="Учредители"
                onClick={() => setTarget("founders")}
              >
                <Users2 className="w-4 h-4" />
              </button>
            </div>
          </Field>

          {/* Режим: ЗАЯВКИ */}
          {target === "bookings" && (
            <>
              <Field label={`Заявка (${isIncome ? "неоплаченные по клиенту" : "остаток оплаты оператору / переплата клиента"})`} full>
                <BookingQuickSearch
                  side={form.side as CategorySide}
                  search={bookingSearch}
                  onSearch={setBookingSearch}
                  map={optionsOverlayMap}
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

              <Field label="" full>
                <AllocationsEditor
                  side={form.side as CategorySide}
                  allocations={form.bookingAllocations || []}
                  onChange={changeAllocations}
                  optionsMap={optionsOverlayMap}
                  totalEUR={formEUR - alreadyAllocatedEUR}
                  title={`Распределение по заявкам (EUR)`}
                />
              </Field>
            </>
          )}

          {/* Режим: УЧРЕДИТЕЛИ */}
          {target === "founders" && (
            <>
              <Field label="К распределению между учредителями (EUR)" full>
                <div className="inline-flex items-center gap-2 text-sm">
                  <div className="px-2 py-1 rounded border bg-gray-50">
                    Всего: <b>{foundersEUR.toFixed(2)} €</b>
                  </div>
                </div>
              </Field>

              {/* Селектор пресета «чья затрата» */}
              {form.side === "expense" && (
                <Field label="Чья затрата (пресет)">
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.ownerWho ?? ""}
                    onChange={(e) => applyOwnerPreset(e.target.value as OwnerWho | "")}
                  >
                    <option value="">— не выбрано —</option>
                    <option value="igor">Игорь</option>
                    <option value="evgeniy">Евгений</option>
                    <option value="split50">Крокус (50/50)</option>
                  </select>
                </Field>
              )}
              <div>
              </div>
              <Field label="Игорь (EUR)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border rounded px-2 py-1 text-right"
                  value={igorEUR}
                  onChange={(e) => {
                    setLastEdited("igor");
                    const total = foundersEUR;
                    const ig = clamp01n(+Number(e.target.value || 0), total);
                    setIgorEUR(String(r2(ig)));
                    setEvgEUR(String(r2(total - ig)));
                    // кастомная правка — снимаем пресет
                    setForm(s => ({ ...s, ownerWho: null }));
                  }}
                />
              </Field>
              <Field label="Евгений (EUR)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border rounded px-2 py-1 text-right"
                  value={evgEUR}
                  onChange={(e) => {
                    setLastEdited("evg");
                    const total = foundersEUR;
                    const ev = clamp01n(+Number(e.target.value || 0), total);
                    setEvgEUR(String(r2(ev)));
                    setIgorEUR(String(r2(total - ev)));
                    // кастомная правка — снимаем пресет
                    setForm(s => ({ ...s, ownerWho: null }));
                  }}
                />
              </Field>
            </>
          )}

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
            Подсказка: возврат клиенту делайте как расход — переплата исчезнет из списка сразу.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} className="h-8 px-3 text-xs">Отмена</Button>
            <Button
              onClick={save}
              className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700"
              disabled={target==="bookings" && allocateRemain < 0}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** clamp [0..total] */
function clamp01n(x: number, total: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > total) return total;
  return x;
}