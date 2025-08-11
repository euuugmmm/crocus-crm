"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type {
  Account,
  Category,
  Currency,
  FxRates,
  Transaction,
} from "@/lib/finance/types";

// ── helpers ─────────────────────────────────────────
type ParsedRow = {
  id: string;
  date: string;              // YYYY-MM-DD
  sign: "C" | "D";           // C=credit (вход), D=debit (исход)
  amount: number;            // в валюте счёта
  description: string;
  note?: string;
};

const toISO = (yyMMdd: string): string => {
  // yyMMdd → YYYY-MM-DD (берём 20xx, т.к. выписки текущих лет)
  const yy = yyMMdd.slice(0, 2);
  const mm = yyMMdd.slice(2, 4);
  const dd = yyMMdd.slice(4, 6);
  const year = Number(yy) + 2000;
  return `${year}-${mm}-${dd}`;
};

function parseMT940(text: string): ParsedRow[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const rows: ParsedRow[] = [];

  let current: Partial<ParsedRow> | null = null;

  const flush = () => {
    if (!current) return;
    if (!current.date || !current.sign || typeof current.amount !== "number") {
      current = null;
      return;
    }
    rows.push({
      id: `${current.date}-${rows.length + 1}`,
      date: current.date,
      sign: current.sign,
      amount: current.amount!,
      description: (current.description || "").trim(),
      note: current.note || "",
    });
    current = null;
  };

  const tagStart = (s: string) => /^:\d{2}/.test(s);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    if (raw.startsWith(":61:")) {
      // сбрасываем предыдущий
      flush();

      // Пример: :61:2507240724C123,45NTRFNONREF
      // Иногда может быть ...D... для расхода
      const after = raw.slice(4);
      const dateMatch = after.match(/^(\d{6})/); // yyMMdd
      const signMatch = after.match(/[CD]/);     // первый C/D
      const amtMatch = after.match(/([0-9]+,\d{0,2})/); // 123,45

      const date = dateMatch ? toISO(dateMatch[1]) : "";
      const sign = (signMatch ? signMatch[0] : "C") as "C" | "D";
      const amount = amtMatch ? Number(amtMatch[1].replace(",", ".")) : 0;

      current = {
        date,
        sign,
        amount,
        description: "",
        note: "",
      };
      continue;
    }

    if (raw.startsWith(":86:")) {
      if (!current) continue;
      let desc = raw.slice(4).trim();
      // собрать многострочный :86:
      let j = i + 1;
      while (j < lines.length && !tagStart(lines[j])) {
        desc += " " + lines[j].trim();
        j++;
      }
      i = j - 1;
      current.description = (current.description || "") + (desc ? ` ${desc}` : "");
      continue;
    }

    // другие теги — если начинается новый тег, возможно запись закончилась
    if (tagStart(raw)) {
      flush();
      continue;
    }
  }
  flush();

  return rows;
}

const pickRateDoc = (rates: FxRates[], isoDate: string): FxRates | null => {
  if (!rates.length) return null;
  const exact = rates.find((r) => r.id === isoDate);
  if (exact) return exact;
  // найдём ближайший не-новее (<= date)
  const sorted = [...rates].sort((a, b) => (a.id < b.id ? 1 : -1));
  const candidate = sorted.find((r) => r.id <= isoDate);
  return candidate || sorted[sorted.length - 1] || null;
};

const eurRateFor = (doc: FxRates | null | undefined, currency: Currency): number => {
  if (!doc || currency === "EUR") return 1;
  const r = doc.rates?.[currency];
  if (!r || r <= 0) return 1;
  // rates: 1 EUR = r CCY → 1 CCY = 1/r EUR
  return 1 / r;
};

// ── page component ──────────────────────────────────
export default function ImportMt940Page() {
  const router = useRouter();
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const canEdit = isManager || isSuperManager || isAdmin;

  const { accountId: accountIdParam } = router.query as { accountId?: string };

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fxList, setFxList] = useState<FxRates[]>([]);

  const [selectedAcc, setSelectedAcc] = useState<string>("");
  const [defaultCatId, setDefaultCatId] = useState<string>(""); // опциональная категория для всех строк
  const [status, setStatus] = useState<Transaction["status"]>("actual");
  const [method, setMethod] = useState<"bank" | "card" | "cash" | "iban" | "other">("bank");

  const [fileName, setFileName] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [chosen, setChosen] = useState<Record<string, boolean>>({}); // id → выбран ли

  // загрузка справочников
  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canEdit) {
      router.replace("/agent/bookings");
      return;
    }

    const ua = onSnapshot(
      query(collection(db, "finance_accounts"), orderBy("name", "asc")),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Account[];
        setAccounts(list);

        // preselect из query
        if (accountIdParam && list.some((a) => a.id === accountIdParam)) {
          setSelectedAcc(accountIdParam);
        } else if (!selectedAcc) {
          const eur = list.find((a) => a.currency === "EUR" && !a.archived);
          if (eur) setSelectedAcc(eur.id);
        }
      }
    );

    const uc = onSnapshot(
      query(collection(db, "finance_categories"), orderBy("side", "asc"), orderBy("name", "asc")),
      (snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Category[])
    );

    const ur = onSnapshot(query(collection(db, "finance_fxRates")), (snap) =>
      setFxList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as FxRates[])
    );

    return () => {
      ua();
      uc();
      ur();
    };
  }, [user, canEdit, router, accountIdParam, selectedAcc]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAcc) || null,
    [accounts, selectedAcc]
  );
  const accCurrency = selectedAccount?.currency || "EUR";

  const toggleAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.id] = val;
    setChosen(next);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const txt = await file.text();
    setRawText(txt);
    const parsed = parseMT940(txt);
    setRows(parsed);
    const def: Record<string, boolean> = {};
    for (const r of parsed) def[r.id] = true;
    setChosen(def);
  };

  const importSelected = async () => {
    if (!selectedAccount) {
      alert("Выберите счёт");
      return;
    }
    const currency = selectedAccount.currency as Currency;

    const picked = rows.filter((r) => chosen[r.id]);
    if (!picked.length) {
      alert("Не выбрано ни одной операции");
      return;
    }

    let count = 0;
    for (const r of picked) {
      const fxDoc = pickRateDoc(fxList, r.date);
      const fxRateToBase = eurRateFor(fxDoc, currency);
      const baseAmount = +(r.amount * fxRateToBase).toFixed(2);

      const payload: Omit<Transaction, "id"> = {
        date: r.date,
        status,
        type: r.sign === "C" ? "in" : "out",
        amount: { value: r.amount, currency },
        fxRateToBase,
        baseAmount,
        accountId: selectedAccount.id,
        categoryId: defaultCatId || undefined,
        method,
        note: r.description?.slice(0, 500) || undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "finance_transactions"), payload as any);
      count++;
    }

    alert(`Импортировано операций: ${count}`);
    // опционально — перейти в список транзакций
    router.push("/finance/transactions");
  };

  return (
    <ManagerLayout>
      <Head>
        <title>Импорт MT940 — Финансы</title>
      </Head>

      <div className="max-w-5xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Импорт MT940</h1>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/finance/accounts")}
              className="h-9 px-3 rounded border"
            >
              ← К счетам
            </button>
            <button
              onClick={() => router.push("/finance/transactions")}
              className="h-9 px-3 rounded border"
            >
              Транзакции
            </button>
          </div>
        </div>

        {/* настройки импорта */}
        <div className="p-4 border rounded-lg grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Счёт</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={selectedAcc}
              onChange={(e) => setSelectedAcc(e.target.value)}
            >
              <option value="">— выберите счёт —</option>
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
            <div className="text-[11px] text-gray-600 mb-1">Статус загружаемых операций</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={status}
              onChange={(e) => setStatus(e.target.value as Transaction["status"])}
            >
              <option value="actual">Факт</option>
              <option value="planned">План</option>
              <option value="reconciled">Сверено</option>
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">Метод платежа</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
            >
              <option value="bank">Банк</option>
              <option value="card">Карта (эквайринг)</option>
              <option value="cash">Наличные</option>
              <option value="iban">IBAN</option>
              <option value="other">Другое</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <div className="text-[11px] text-gray-600 mb-1">Категория по умолчанию (опционально)</div>
            <select
              className="w-full border rounded px-2 py-1"
              value={defaultCatId}
              onChange={(e) => setDefaultCatId(e.target.value)}
            >
              <option value="">— не задавать —</option>
              {categories
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* загрузка файла */}
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".txt,.sta,.mt940"
              onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            />
            {fileName && <div className="text-sm text-gray-600">Файл: {fileName}</div>}
            {rows.length > 0 && (
              <>
                <button
                  className="h-8 px-3 rounded border"
                  onClick={() => toggleAll(true)}
                >
                  Выбрать все
                </button>
                <button
                  className="h-8 px-3 rounded border"
                  onClick={() => toggleAll(false)}
                >
                  Снять все
                </button>
              </>
            )}
            {rows.length > 0 && (
              <button
                className="ml-auto h-9 px-3 rounded bg-green-600 hover:bg-green-700 text-white"
                onClick={importSelected}
              >
                Импортировать выбранные ({Object.values(chosen).filter(Boolean).length})
              </button>
            )}
          </div>

          {/* превью */}
          {rows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] border text-sm">
                <thead className="bg-gray-100 text-center">
                  <tr>
                    <th className="border px-2 py-1">✓</th>
                    <th className="border px-2 py-1">Дата</th>
                    <th className="border px-2 py-1">Тип</th>
                    <th className="border px-2 py-1">Сумма ({accCurrency})</th>
                    <th className="border px-2 py-1">Описание</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="text-center hover:bg-gray-50">
                      <td className="border px-2 py-1">
                        <input
                          type="checkbox"
                          checked={!!chosen[r.id]}
                          onChange={(e) =>
                            setChosen((c) => ({ ...c, [r.id]: e.target.checked }))
                          }
                        />
                      </td>
                      <td className="border px-2 py-1 whitespace-nowrap">{r.date}</td>
                      <td className="border px-2 py-1">
                        {r.sign === "C" ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            Поступление
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20">
                            Выплата
                          </span>
                        )}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {r.amount.toFixed(2)} {accCurrency}
                      </td>
                      <td className="border px-2 py-1 text-left">{r.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : rawText ? (
            <div className="mt-4 text-sm text-red-600">
              Не удалось распарсить файл. Проверь формат MT940.
            </div>
          ) : (
            <div className="mt-3 text-sm text-gray-500">
              Загрузите текстовый файл MT940 от банка (например, BT).
            </div>
          )}
        </div>
      </div>
    </ManagerLayout>
  );
}