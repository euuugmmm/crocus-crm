/* pages/finance/transactions.tsx */
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  Timestamp,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

/** === Types (UI) === */
type Currency = "EUR" | "RON" | "USD";
type Account = { id: string; name: string; currency: Currency; archived?: boolean };

type CategorySide = "income" | "expense";
type Category = { id: string; name: string; side: CategorySide; archived?: boolean };

type Counterparty = { id: string; name: string; archived?: boolean };

type OwnerWho = "crocus" | "igor" | "evgeniy" | "split50" | null;

/** Унифицированная строка для UI после нормализации любого документа */
type TxRow = {
  id: string;
  date: string; // YYYY-MM-DD
  status?: "planned" | "actual" | "reconciled";
  accountId: string;
  accountName?: string;
  currency: Currency;
  side: CategorySide;
  amount: number; // в валюте счёта
  baseAmount: number; // в EUR
  categoryId: string | null;
  categoryName?: string;
  counterpartyId?: string | null;
  counterpartyName?: string;
  ownerWho?: OwnerWho; // «чей расход»
  bookingId?: string | null;
  note?: string;
  method?: "bank" | "card" | "cash" | "iban" | "other";
  source?: string;
  createdAt?: any;
};

type FxDoc = { id: string; base: "EUR"; rates: Partial<Record<Currency, number>> };

type BookingLite = {
  id: string;
  clientPrice?: number;
  payments?: { amount?: number }[];
  destination?: string;
  status?: string;
};

/** === Helpers === */
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
  // 1 EUR = inv CCY → 1 CCY = 1/inv EUR
  return +(amount / inv).toFixed(2);
}

// нормализация «сырых» документов к UI-формату
function normalizeTx(raw: any, accounts: Account[], fxList: FxDoc[]): TxRow {
  const side: CategorySide =
    raw.side ||
    (raw.type === "in" ? "income" : raw.type === "out" ? "expense" : "income");

  const currency: Currency =
    raw.currency ||
    raw.amount?.currency ||
    (accounts.find((a) => a.id === raw.accountId)?.currency as Currency) ||
    "EUR";

  const amount: number =
    typeof raw.amount === "number"
      ? Number(raw.amount || 0)
      : Number(raw.amount?.value || 0);

  const baseAmount: number = Number(
    raw.baseAmount ??
      raw.eurAmount ??
      eurFrom(amount, currency, raw.date || todayISO(), fxList)
  );

  return {
    id: raw.id,
    date: raw.date || todayISO(),
    status: raw.status,
    accountId: raw.accountId,
    accountName: raw.accountName,
    currency,
    side,
    amount,
    baseAmount,
    categoryId: raw.categoryId ?? null,
    categoryName: raw.categoryName,
    counterpartyId: raw.counterpartyId ?? null,
    counterpartyName: raw.counterpartyName,
    ownerWho: (raw.ownerWho as OwnerWho) ?? null,
    bookingId: raw.bookingId ?? null,
    note: raw.note ?? "",
    method: raw.method,
    source: raw.source,
    createdAt: raw.createdAt,
  };
}

export default function FinanceTransactions() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [fxList, setFxList] = useState<FxDoc[]>([]);
  const [rowsRaw, setRowsRaw] = useState<any[]>([]);
  const [unpaidBookings, setUnpaidBookings] = useState<BookingLite[]>([]);

  // фильтры
  const [f, setF] = useState({
    dateFrom: "",
    dateTo: "",
    accountId: "all",
    side: "all",
    search: "",
  });

  // инлайн-редактирование
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TxRow>>({});

  // модалка
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<TxRow>>({
    date: todayISO(),
    accountId: "",
    currency: "EUR",
    side: "income",
    amount: 0,
    baseAmount: 0,
    categoryId: null,
    counterpartyId: null,
    ownerWho: null,
    bookingId: "",
    note: "",
    method: "bank",
    status: "actual",
  });

  /** загрузка справочников и транзакций */
  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canEdit) {
      router.replace("/agent/bookings");
      return;
    }

    // Accounts — можно с orderBy по одиночному полю
    const ua = onSnapshot(
      query(collection(db, "finance_accounts"), orderBy("name", "asc")),
      (s) => setAccounts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Account[]),
      (err) => console.error("[accounts] onSnapshot error:", err)
    );

    // Categories — без orderBy (чтобы не требовать композитный индекс), сортируем на клиенте
const uc = onSnapshot(
  query(collection(db, "finance_categories"), orderBy("order", "asc")),
  (s) => {
    const list = s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Category[];
    setCategories(list); // порядок уже как в реестре категорий
  },
  (err) => console.error("[categories] onSnapshot error:", err)
);

    // Counterparties — без orderBy, сортируем на клиенте
    const up = onSnapshot(
      collection(db, "finance_counterparties"),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Counterparty[];
        list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        setCounterparties(list);
      },
      (err) => console.error("[counterparties] onSnapshot error:", err)
    );

    // FX
    const uf = onSnapshot(
      collection(db, "finance_fxRates"),
      (s) => setFxList(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FxDoc[]),
      (err) => console.error("[fxRates] onSnapshot error:", err)
    );

    // Transactions — по дате (однопольная сортировка)
    const ut = onSnapshot(
      query(collection(db, "finance_transactions"), orderBy("date", "desc")),
      (s) => setRowsRaw(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      (err) => console.error("[transactions] onSnapshot error:", err)
    );

    // Неоплаченные заявки — последние 200 по createdAt
const ub = onSnapshot(
  collection(db, "bookings"),
  (s) => {
    const all = s.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as BookingLite[];

    // аккуратная сортировка на клиенте (createdAt может быть undefined)
    all.sort((a, b) => {
      const ax = (a as any).createdAt?.toMillis?.() ?? 0;
      const bx = (b as any).createdAt?.toMillis?.() ?? 0;
      return bx - ax;
    });

    const list = all.filter(b => {
      const total = Number(b.clientPrice || 0);
      const paid  = (b.payments || []).reduce((acc, p) => acc + Number(p?.amount || 0), 0);
      return paid < total;
    }).slice(0, 200);

    setUnpaidBookings(list);
  },
  (err) => console.error("[bookings] onSnapshot error:", err)
);

    return () => {
      ua();
      uc();
      up();
      uf();
      ut();
      ub();
    };
  }, [user, canEdit, router]);

  /** нормализованный список */
  const txs: TxRow[] = useMemo(
    () => rowsRaw.map((raw) => normalizeTx(raw, accounts, fxList)),
    [rowsRaw, accounts, fxList]
  );

  // актуализировать валюту формы по выбранному счёту
  useEffect(() => {
    if (!form.accountId) return;
    const acc = accounts.find((a) => a.id === form.accountId);
    if (acc && form.currency !== acc.currency) {
      setForm((prev) => ({ ...prev, currency: acc.currency as Currency }));
    }
  }, [form.accountId, accounts]); // eslint-disable-line

  /** отображаемый список с фильтрами */
  const displayed = useMemo(() => {
    const df = f.dateFrom ? new Date(f.dateFrom) : null;
    const dt = f.dateTo ? new Date(f.dateTo) : null;
    const q = f.search.trim().toLowerCase();

    return txs
      .filter((t) => {
        if (f.accountId !== "all" && t.accountId !== f.accountId) return false;
        if (f.side !== "all" && t.side !== (f.side as CategorySide)) return false;
        if (df && new Date(t.date) < df) return false;
        if (dt && new Date(t.date) > dt) return false;
        if (q) {
          const s = [
            t.note || "",
            t.accountName || "",
            t.categoryName || "",
            t.counterpartyName || "",
            t.bookingId || "",
          ]
            .join(" ")
            .toLowerCase();
          if (!s.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [txs, f]);

  /** итоги */
  const totals = useMemo(() => {
    let inc = 0,
      exp = 0;
    for (const t of displayed) {
      if (t.side === "income") inc += t.baseAmount;
      else exp += t.baseAmount;
    }
    return { income: +inc.toFixed(2), expense: +exp.toFixed(2), net: +(inc - exp).toFixed(2) };
  }, [displayed]);

  /** модалка: создать */
  const openCreate = () => {
    const firstAcc = accounts.find((a) => !a.archived);
    setEditingId(null);
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
      note: "",
      method: "bank",
      status: "actual",
    });
    setModalOpen(true);
  };

  /** модалка: редактировать */
  const openEdit = (t: TxRow) => {
    setEditingId(t.id);
    setForm({ ...t });
    setModalOpen(true);
  };

  /** удалить */
  const remove = async (t: TxRow) => {
    if (!confirm("Удалить транзакцию?")) return;
    await deleteDoc(doc(db, "finance_transactions", t.id));
  };

  /** payload для Firestore (канонический формат + обратная совместимость) */
  const buildPayload = (data: Partial<TxRow>, forId?: string) => {
    const acc = accounts.find((a) => a.id === data.accountId);
    const ccy = (acc?.currency || data.currency || "EUR") as Currency;
    const amt = Number(data.amount || 0);
    const eur =
      data.baseAmount != null
        ? Number(data.baseAmount)
        : eurFrom(amt, ccy, data.date || todayISO(), fxList);

    const cat = categories.find((c) => c.id === data.categoryId);
    const cp = counterparties.find((x) => x.id === data.counterpartyId);

    const side = (data.side || "income") as CategorySide;

    const payload: any = {
      date: data.date || todayISO(),
      status: data.status || "actual",
      accountId: data.accountId,
      accountName: acc?.name || null,
      currency: ccy,
      side,
      type: side === "income" ? "in" : "out", // совместимость
      amount: { value: amt, currency: ccy }, // совместимость с импортом
      baseAmount: eur,
      categoryId: data.categoryId ?? null,
      categoryName: cat?.name || null,
      counterpartyId: data.counterpartyId ?? null,
      counterpartyName: cp?.name || null,
      ownerWho: side === "expense" ? ((data.ownerWho ?? null) as OwnerWho) : null,
      bookingId: (data.bookingId ?? null) || null,
      note: (data.note || "").trim(),
      method: data.method || "bank",
      source: forId ? "manual_edit" : "manual",
      updatedAt: Timestamp.now(),
      ...(forId ? {} : { createdAt: Timestamp.now() }),
    };

    return payload;
  };

  /** сохранить из модалки */
  const saveModal = async () => {
    if (!form.date || !form.accountId || !form.side) {
      alert("Дата, счёт и тип обязательны");
      return;
    }
    const payload = buildPayload(form, editingId || undefined);

    if (editingId) {
      await updateDoc(doc(db, "finance_transactions", editingId), payload);
    } else {
      await addDoc(collection(db, "finance_transactions"), payload);
    }
    setModalOpen(false);
  };

  /** === Inline edit (dblclick) === */
  const startInline = (row: TxRow) => {
    setEditingRowId(row.id);
    setEditDraft({
      categoryId: row.categoryId ?? null,
      counterpartyId: row.counterpartyId ?? null,
      ownerWho: row.ownerWho ?? null,
    });
  };
  const cancelInline = () => {
    setEditingRowId(null);
    setEditDraft({});
  };
  const saveInline = async (row: TxRow) => {
    const patch: Partial<TxRow> = {
      categoryId: (editDraft.categoryId ?? row.categoryId) ?? null,
      counterpartyId: (editDraft.counterpartyId ?? row.counterpartyId) ?? null,
      ownerWho: (editDraft.ownerWho ?? row.ownerWho) ?? null,
    };
    const payload = buildPayload({ ...row, ...patch }, row.id);
    await updateDoc(doc(db, "finance_transactions", row.id), payload);
    cancelInline();
  };

  return (
    <ManagerLayout>
      <Head>
        <title>Транзакции — Финансы</title>
      </Head>

      <div className="max-w-7xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Банковские транзакции</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/finance/categories")}
              className="h-9 px-3"
            >
              Категории
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/finance/counterparties")}
              className="h-9 px-3"
            >
              Контрагенты
            </Button>
            <Button
              onClick={openCreate}
              className="bg-green-600 hover:bg-green-700 text-white h-9 px-3"
            >
              + Транзакция
            </Button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="p-3 border rounded-lg grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm">
          <div>
            <div className="text-xs text-gray-600 mb-1">С даты</div>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={f.dateFrom}
              onChange={(e) => setF((s) => ({ ...s, dateFrom: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">По дату</div>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={f.dateTo}
              onChange={(e) => setF((s) => ({ ...s, dateTo: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Счёт</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={f.accountId}
              onChange={(e) => setF((s) => ({ ...s, accountId: e.target.value }))}
            >
              <option value="all">Все</option>
              {accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Тип</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={f.side}
              onChange={(e) => setF((s) => ({ ...s, side: e.target.value }))}
            >
              <option value="all">Все</option>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Поиск</div>
            <input
              className="w-full border rounded px-2 py-1"
              placeholder="заметка / заявка / категория / контрагент / счёт"
              value={f.search}
              onChange={(e) => setF((s) => ({ ...s, search: e.target.value }))}
            />
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] border text-sm">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border px-2 py-1">Дата</th>
                <th className="border px-2 py-1">Счёт</th>
                <th className="border px-2 py-1">Тип</th>
                <th className="border px-2 py-1">Сумма (вал.)</th>
                <th className="border px-2 py-1">Сумма (EUR)</th>
                <th className="border px-2 py-1">Категория</th>
                <th className="border px-2 py-1">Контрагент</th>
                <th className="border px-2 py-1">Чей расход</th>
                <th className="border px-2 py-1">Заявка</th>
                <th className="border px-2 py-1">Заметка</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((t) => {
                const isEditing = editingRowId === t.id;
                return (
                  <tr key={t.id} className="text-center hover:bg-gray-50">
                    <td className="border px-2 py-1 whitespace-nowrap">{t.date}</td>
                    <td className="border px-2 py-1">{t.accountName || t.accountId}</td>
                    <td className="border px-2 py-1">
                      {t.side === "income" ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          Доход
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">
                          Расход
                        </span>
                      )}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {t.amount.toFixed(2)} {t.currency}
                    </td>
                    <td className="border px-2 py-1 text-right">{t.baseAmount.toFixed(2)} €</td>

                    {/* Категория — dblclick → select */}
                    <td className="border px-2 py-1" onDoubleClick={() => startInline(t)}>
                      {isEditing ? (
                        <select
                          className="w-full border rounded px-2 py-1"
                          value={editDraft.categoryId ?? t.categoryId ?? ""}
                          onChange={(e) =>
                            setEditDraft((s) => ({ ...s, categoryId: e.target.value || null }))
                          }
                        >
                          <option value="">— не задано —</option>
                         {categories
  .filter(c => !c.archived && c.side === t.side) // или form.side в модалке
  .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : (
                        t.categoryName || "—"
                      )}
                    </td>

                    {/* Контрагент — dblclick → select */}
                    <td className="border px-2 py-1" onDoubleClick={() => startInline(t)}>
                      {isEditing ? (
                        <select
                          className="w-full border rounded px-2 py-1"
                          value={editDraft.counterpartyId ?? t.counterpartyId ?? ""}
                          onChange={(e) =>
                            setEditDraft((s) => ({ ...s, counterpartyId: e.target.value || null }))
                          }
                        >
                          <option value="">— не задан —</option>
                          {counterparties
                            .filter((x) => !x.archived)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        t.counterpartyName || "—"
                      )}
                    </td>

                    {/* Чей расход — только для расхода (dblclick) */}
                    <td className="border px-2 py-1" onDoubleClick={() => startInline(t)}>
                      {t.side === "expense" ? (
                        isEditing ? (
                          <select
                            className="w-full border rounded px-2 py-1"
                            value={editDraft.ownerWho ?? t.ownerWho ?? ""}
                            onChange={(e) =>
                              setEditDraft((s) => ({
                                ...s,
                                ownerWho: (e.target.value || null) as OwnerWho,
                              }))
                            }
                          >
                            <option value="">— не указан —</option>
                            <option value="crocus">Крокус</option>
                            <option value="igor">Игорь</option>
                            <option value="evgeniy">Евгений</option>
                            <option value="split50">Крокус (50/50)</option>
                          </select>
                        ) : t.ownerWho ? (
                          t.ownerWho === "split50"
                            ? "Крокус 50/50"
                            : t.ownerWho === "crocus"
                            ? "Крокус"
                            : t.ownerWho === "igor"
                            ? "Игорь"
                            : t.ownerWho === "evgeniy"
                            ? "Евгений"
                            : "—"
                        ) : (
                          "—"
                        )
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="border px-2 py-1">{t.bookingId || "—"}</td>
                    <td className="border px-2 py-1 text-left">{t.note || "—"}</td>
                    <td className="border px-2 py-1">
                      {isEditing ? (
                        <div className="inline-flex gap-2">
                          <button
                            className="h-7 px-2 border rounded hover:bg-gray-100"
                            onClick={() => saveInline(t)}
                          >
                            ✔︎
                          </button>
                          <button
                            className="h-7 px-2 border rounded hover:bg-gray-100"
                            onClick={cancelInline}
                          >
                            ✖︎
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-2">
                          <button
                            className="h-7 px-2 border rounded hover:bg-gray-100"
                            onClick={() => openEdit(t)}
                          >
                            ✏️
                          </button>
                          <button
                            className="h-7 px-2 border rounded hover:bg-red-50"
                            onClick={() => remove(t)}
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={11} className="border px-2 py-4 text-center text-gray-500">
                    Нет транзакций
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>
                  Итого доходов (EUR):
                </td>
                <td className="border px-2 py-1 text-right">{totals.income.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={6}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>
                  Итого расходов (EUR):
                </td>
                <td className="border px-2 py-1 text-right">{totals.expense.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={6}></td>
              </tr>
              <tr>
                <td className="border px-2 py-1 text-right" colSpan={4}>
                  Чистый поток (EUR):
                </td>
                <td className="border px-2 py-1 text-right">{totals.net.toFixed(2)} €</td>
                <td className="border px-2 py-1" colSpan={6}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Модалка */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-2xl bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                {editingId ? "Редактировать транзакцию" : "Новая транзакция"}
              </h2>
              <button className="text-2xl leading-none" onClick={() => setModalOpen(false)}>
                ×
              </button>
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
                  <option value="" disabled>
                    — выберите счёт —
                  </option>
                  {accounts
                    .filter((a) => !a.archived)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Тип">
                <select
                  className="w-full border rounded px-2 py-1"
                  value={form.side || "income"}
                  onChange={(e) => setForm((s) => ({ ...s, side: e.target.value as CategorySide }))}
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
                  {categories
                    .filter((c) => !c.archived && c.side === form.side)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>

              <Field label={`Сумма (${form.currency})`}>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-2 py-1"
                  value={form.amount ?? 0}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, amount: Number(e.target.value || 0) }))
                  }
                />
              </Field>
              <Field label="Контрагент">
                <select
                  className="w-full border rounded px-2 py-1"
                  value={form.counterpartyId ?? ""}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, counterpartyId: e.target.value || null }))
                  }
                >
                  <option value="">— не задан —</option>
                  {counterparties
                    .filter((x) => !x.archived)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </Field>

              {form.side === "expense" && (
                <Field label="Чей расход">
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.ownerWho ?? ""}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, ownerWho: (e.target.value || null) as OwnerWho }))
                    }
                  >
                    <option value="">— не указан —</option>
                    <option value="crocus">Крокус</option>
                    <option value="igor">Игорь</option>
                    <option value="evgeniy">Евгений</option>
                    <option value="split50">Крокус (50/50)</option>
                  </select>
                </Field>
              )}

              {/* Неоплаченные заявки */}
              <Field label="Заявка (неоплаченные)">
                <select
                  className="w-full border rounded px-2 py-1"
                  value={form.bookingId || ""}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, bookingId: e.target.value || ("" as any) }))
                  }
                >
                  <option value="">— не выбрана —</option>
                  {unpaidBookings.map((b) => {
                    const total = Number(b.clientPrice || 0);
                    const paid = (b.payments || []).reduce(
                      (a, p) => a + Number(p?.amount || 0),
                      0
                    );
                    const left = Math.max(0, total - paid).toFixed(2);
                    const title = b.destination || b.id;
                    return (
                      <option key={b.id} value={b.id}>
                        {title} · осталось {left} €
                      </option>
                    );
                  })}
                </select>
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

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setModalOpen(false)} className="h-8 px-3 text-xs">
                Отмена
              </Button>
              <Button onClick={saveModal} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
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