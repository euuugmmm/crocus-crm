"use client";

import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Button } from "@/components/ui/button";
import BookingQuickSearch from "@/components/finance/BookingQuickSearch";
import {
  BookingOption,
  CategorySide,
} from "@/types/finance";
import { useRouter } from "next/router";

/** ───────── helpers ───────── */
const todayISO = () => new Date().toISOString().slice(0, 10);
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;

type OrderDoc = {
  id?: string;
  txId?: string | null;
  bookingId: string;
  side: "income" | "expense";
  baseAmount: number;         // EUR
  date: string;               // YYYY-MM-DD
  status: "posted" | "planned";
  note?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[11px] text-gray-600 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default function OrderModal({
  open,
  onClose,
  onSaved,
  initial,                      // если есть id — режим редактирования
  bookingOptionsMap,            // карта опций заявок (как в TxModal)
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (orderId?: string) => void;
  initial?: Partial<OrderDoc> | null;
  bookingOptionsMap: Map<string, BookingOption>;
}) {
  const isEdit = !!initial?.id;
  const router = useRouter();

  /** ───────── форма ───────── */
  const [form, setForm] = useState<OrderDoc>({
    id: undefined,
    txId: null,
    bookingId: "",
    side: "income",
    baseAmount: 0,
    date: todayISO(),
    status: "posted",
    note: "",
  });

  // mini-поиск заявки
  const [bookingSearch, setBookingSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial && isEdit) {
      setForm({
        id: initial.id!,
        txId: initial.txId ?? null,
        bookingId: String(initial.bookingId || ""),
        side: (initial.side as "income"|"expense") || "income",
        baseAmount: Number(initial.baseAmount || 0),
        date: String(initial.date || todayISO()),
        status: (initial.status as "posted"|"planned") || "posted",
        note: (initial.note as string) ?? "",
      });
      setBookingSearch("");
    } else {
      setForm({
        id: undefined,
        txId: initial?.txId ?? null,
        bookingId: "",
        side: "income",
        baseAmount: 0,
        date: todayISO(),
        status: "posted",
        note: "",
      });
      setBookingSearch("");
    }
  }, [open, isEdit, initial]);

  /** ───────── текущая выбранная заявка + подсказки остатков ───────── */
  const currentOption = useMemo(() => {
    if (!form.bookingId) return null;
    return bookingOptionsMap.get(form.bookingId) || null;
  }, [form.bookingId, bookingOptionsMap]);

  // подсказка «сколько осталось» в выбранной заявке после этой суммы
  const afterApplyHint = useMemo(() => {
    const opt = currentOption;
    if (!opt) return null;
    const g = Math.max(0, Number(form.baseAmount || 0));
    if (form.side === "income") {
      const left = Math.max(0, (opt.leftIncome || 0) - g);
      return { label: "Останется получить от клиента", value: left, sign: "+" };
    } else {
      // если есть долг оператору — уменьшаем его; иначе уменьшаем переплату клиента
      if ((opt.leftExpense || 0) > 0) {
        const left = Math.max(0, (opt.leftExpense || 0) - g);
        return { label: "Останется оплатить оператору", value: left, sign: "-" };
      } else {
        const leftOver = Math.max(0, (opt.clientOverpay || 0) - g);
        return { label: "Останется переплата клиента", value: leftOver, sign: "-" };
      }
    }
  }, [currentOption, form.baseAmount, form.side]);

  /** ───────── сохранение ───────── */
  const validate = () => {
    if (!form.date) return "Дата обязательна";
    if (!form.bookingId) return "Выберите заявку";
    if (!form.side) return "Тип (доход/расход) обязателен";
    if (!(Number(form.baseAmount) > 0)) return "Сумма должна быть > 0";
    if (!["posted","planned"].includes(form.status)) return "Некорректный статус";
    return "";
  };

  const save = async () => {
    const err = validate();
    if (err) { alert(err); return; }

    const payload: any = {
      bookingId: form.bookingId,
      side: form.side,
      baseAmount: r2(form.baseAmount),
      date: form.date,
      status: form.status,
      note: form.note || "",
      updatedAt: serverTimestamp(),
    };
    if (form.txId) payload.txId = form.txId;
    // унификация на всякий: фиксируем хранение валюты
    payload.baseCurrency = "EUR";

    try {
      if (isEdit && form.id) {
        await updateDoc(doc(db, "finance_orders", form.id), payload);
        onSaved?.(form.id);
      } else {
        const ref = await addDoc(collection(db, "finance_orders"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        onSaved?.(ref.id);
      }
      onClose();
    } catch (e: any) {
      alert(`Ошибка сохранения ордера: ${e?.message || e}`);
    }
  };

  /** ───────── удаление ОРДЕРА (только его) ───────── */
  const del = async () => {
    if (!isEdit || !form.id) return;
    const ok = confirm(
      "Удалить этот ордер?\n\nБудет удалён только ордер. Связанная транзакция останется без изменений."
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "finance_orders", form.id));
      onSaved?.(undefined);
      onClose();
    } catch (e: any) {
      alert(`Ошибка удаления: ${e?.message || e}`);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
      <div className="w-full max-w-2xl bg-white rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Редактировать ордер" : "Новый ордер"}
          </h2>
          <button className="text-2xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="Дата">
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={form.date}
              onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
            />
          </Field>

          <Field label="Статус">
            <select
              className="w-full border rounded px-2 py-1"
              value={form.status}
              onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as "posted" | "planned" }))}
            >
              <option value="posted">Проведён (posted)</option>
              <option value="planned">План (planned)</option>
            </select>
          </Field>

          <Field label="Тип">
            <select
              className="w-full border rounded px-2 py-1"
              value={form.side}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  side: e.target.value as CategorySide,
                }))
              }
            >
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </Field>

          <Field label="Сумма (EUR)">
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full border rounded px-2 py-1"
              value={String(form.baseAmount)}
              onChange={(e) => setForm((s) => ({ ...s, baseAmount: r2(Number(e.target.value)) }))}
            />
          </Field>

          <Field label={`Заявка (${form.side === "income" ? "клиентский остаток" : "оператор/переплата клиента"})`} full>
            <BookingQuickSearch
              side={form.side as CategorySide}
              search={bookingSearch}
              onSearch={setBookingSearch}
              map={bookingOptionsMap}
              value={form.bookingId || ""}
              onChange={(id) => setForm((s) => ({ ...s, bookingId: id }))}
              onAdd={() => {/* not used in order modal */}}
              currentOption={currentOption || undefined}
            />
            {currentOption && (
              <div className="text-[11px] text-gray-600 mt-1">
                {afterApplyHint ? (
                  <>
                    {afterApplyHint.label}:{" "}
                    <b>{r2(afterApplyHint.value).toFixed(2)} €</b>
                  </>
                ) : (
                  <>
                    Остаток по заявке будет пересчитан после сохранения.
                  </>
                )}
              </div>
            )}
          </Field>

          <Field label="Заметка" full>
            <input
              className="w-full border rounded px-2 py-1"
              value={form.note || ""}
              onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              placeholder="комментарий к ордеру"
            />
          </Field>

          {isEdit && form.txId && (
            <Field label="Связанная транзакция" full>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-slate-50 border">{form.txId}</span>
                <Button
                  variant="outline"
                  className="h-8 px-2"
                  onClick={() => router.push(`/finance/transactions?highlight=${form.txId}`)}
                >
                  Открыть
                </Button>
              </div>
            </Field>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-xs text-gray-600">
            Удаление ордера не затрагивает связанную транзакцию. При необходимости пересоберите ордера из транзакции позже.
          </div>
          <div className="flex items-center gap-2">
            {isEdit && (
              <Button variant="destructive" onClick={del} className="h-8 px-3 text-xs">
                Удалить ордер
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="h-8 px-3 text-xs">
              Отмена
            </Button>
            <Button onClick={save} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}