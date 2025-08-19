// pages/finance/rates.tsx
"use client";

import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FxRates } from "@/lib/finance/types";
import { today } from "@/lib/finance/db";

type FxMeta = {
  lastSyncAt?: string;
  lastBnrDate?: string;
  source?: string;
};

export default function RatesPage() {
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const router = useRouter();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [date, setDate] = useState<string>(today());
  const [rates, setRates] = useState<FxRates | null>(null);
  const [list, setList] = useState<FxRates[]>([]);
  const [meta, setMeta] = useState<FxMeta | null>(null);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [rowActionLoading, setRowActionLoading] = useState<string | null>(null); // id обрабатываемой строки

  const editBlockRef = useRef<HTMLDivElement | null>(null);

  // --- guards & subscriptions ---
  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canEdit) {
      router.replace("/agent/bookings");
      return;
    }

    // последние 200 по времени публикации
    const qFx = query(
      collection(db, "finance_fxRates"),
      orderBy("publishedAt", "desc"),
      limit(200)
    );
    const unsubFx = onSnapshot(qFx, (snap) => {
      setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    const unsubMeta = onSnapshot(doc(db, "finance_fxMeta", "bnr"), (snap) => {
      setMeta(snap.exists() ? (snap.data() as FxMeta) : null);
    });

    return () => {
      unsubFx();
      unsubMeta();
    };
  }, [user, canEdit, router]);

  useEffect(() => {
    if (date) void load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function load(d: string) {
    const snap = await getDoc(doc(db, "finance_fxRates", d));
    if (snap.exists()) setRates({ id: d, ...(snap.data() as any) });
    else setRates({ id: d, base: "EUR", rates: { RON: 4.97, USD: 1.08 } });
  }

  async function save() {
    if (!rates) return;
    await setDoc(
      doc(db, "finance_fxRates", rates.id),
      {
        base: "EUR",
        rates: {
          RON: Number(rates.rates.RON || 0) || 0,
          USD: Number(rates.rates.USD || 0) || 0,
        },
        publishedAt: new Date().toISOString(), // строка ISO для сортировки
        manual: true,
      },
      { merge: true }
    );
    alert("Сохранено");
  }

  // --- single-button sync (последние ~10 дней BNR + today) ---
  async function syncLast10() {
    try {
      setSyncLoading(true);
      setSyncMsg("");

      const res = await fetch(`/api/finance/fx/bnr-sync?mode=latest`, { method: "POST" });
      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(typeof payload === "string" ? payload : payload?.message || `HTTP ${res.status}`);
      }

      const j = payload as any;
      setSyncMsg(
        `Синхронизация последних 10 дней: добавлено ${j.inserted ?? 0}, пропущено ${j.skipped ?? 0}, исправлено ${j.fixed ?? 0}, проверено ${j.checked ?? 0}. ` +
        `Интервал кандидатов: ${j.fromDate || "-"} → ${j.toDate || "-"}; BNR до ${j.lastBnrDate || "-"}.`
      );
    } catch (e: any) {
      setSyncMsg(`Ошибка: ${String(e?.message || e)}`);
    } finally {
      setSyncLoading(false);
    }
  }

  // --- per-row actions ---
  function handleEditRow(r: FxRates) {
    setDate(r.id);
    setRates({ ...r });
    // плавно прокрутим к блоку редактирования
    setTimeout(() => editBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function handleDeleteRow(id: string) {
    const ok = confirm(`Удалить курс за ${id}? Это действие необратимо.`);
    if (!ok) return;
    try {
      setRowActionLoading(id);
      await deleteDoc(doc(db, "finance_fxRates", id));
    } catch (e: any) {
      alert(`Не удалось удалить: ${String(e?.message || e)}`);
    } finally {
      setRowActionLoading(null);
    }
  }

  // --- computed/status ---
  const latestInsertedDate = useMemo(() => list[0]?.id ?? null, [list]); // по publishedAt
  const maxDateById = useMemo(
    () => (list.length ? list.reduce((m, r) => (m && m > r.id ? m : r.id), "" as string) : null),
    [list]
  );
  const lastBnrDate = meta?.lastBnrDate ?? null;
  const isLagging = useMemo(
    () => !!lastBnrDate && !!maxDateById && maxDateById < lastBnrDate,
    [maxDateById, lastBnrDate]
  );

  return (
    <ManagerLayout>
      <Head>
        <title>Курсы валют — Финансы</title>
      </Head>

      <div className="max-w-4xl mx-auto py-8">
        <h1 className="text-2xl font-bold mb-4">Курсы валют (к EUR)</h1>

        {/* Статус + одна кнопка синка */}
        <div className="p-4 border rounded-lg mb-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="px-2 py-1 rounded border bg-gray-50">
              <b>Последняя вставка:</b> {latestInsertedDate || "—"}
            </div>
            <div className="px-2 py-1 rounded border bg-gray-50">
              <b>Последняя дата в БД (по id):</b> {maxDateById || "—"}
            </div>
            <div
              className={`px-2 py-1 rounded border ${
                isLagging ? "bg-amber-50 border-amber-400 text-amber-800" : "bg-gray-50"
              }`}
              title="Последняя доступная дата на стороне BNR"
            >
              <b>Доступно у BNR:</b> {lastBnrDate || "—"}
              {isLagging && <span className="ml-2">(отстаём)</span>}
            </div>
            <div className="px-2 py-1 rounded border bg-gray-50">
              <b>Последняя синхронизация:</b>{" "}
              {meta?.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString() : "—"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={syncLast10}
              className="h-9 px-3 rounded bg-emerald-600 text-white disabled:opacity-50"
              disabled={syncLoading}
              title="Подтянуть последние ~10 банковских дней из BNR (включая сегодня, если доступно)"
            >
              Синхронизировать последние 10 дней (BNR)
            </button>
            {syncLoading && <span className="text-sm text-gray-600">Обновляем…</span>}
          </div>

          {syncMsg && <div className="text-sm text-emerald-700">{syncMsg}</div>}

          <div className="text-xs text-gray-500">
            Источник: BNR XML (curs.bnr.ro). Данные публикуются в банковские дни после ~13:00 по Бухаресту.
            Храним в базе EUR: <code>rates[CCY] = CCY per 1 EUR</code>. Для RON — официальное значение BNR <code>RON/EUR</code>.
          </div>
        </div>

        {/* Ручная правка конкретного дня */}
        <div ref={editBlockRef} className="p-4 border rounded-lg mb-6 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs text-gray-600 mb-1">Дата</div>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">1 EUR = RON</div>
            <input
              className="border rounded px-2 py-1 w-28"
              value={rates?.rates.RON ?? ""}
              onChange={(e) =>
                setRates((r) =>
                  r ? { ...r, rates: { ...r.rates, RON: e.target.value as any } } : r
                )
              }
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">1 EUR = USD</div>
            <input
              className="border rounded px-2 py-1 w-28"
              value={rates?.rates.USD ?? ""}
              onChange={(e) =>
                setRates((r) =>
                  r ? { ...r, rates: { ...r.rates, USD: e.target.value as any } } : r
                )
              }
            />
          </div>
          <button onClick={save} className="h-9 px-3 rounded bg-green-600 text-white">
            Сохранить
          </button>
        </div>

        {/* Таблица последних записей */}
        <div className="border rounded-lg">
          <div className="px-3 py-2 bg-gray-50 font-semibold">Последние записи</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">Дата</th>
                <th className="border px-2 py-1">1 EUR = RON</th>
                <th className="border px-2 py-1">1 EUR = USD</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {list.length > 0 &&
                list.slice(0, 30).map((r) => (
                  <tr key={r.id} className="text-center">
                    <td className="border px-2 py-1">{r.id}</td>
                    <td className="border px-2 py-1">{r.rates.RON ?? "—"}</td>
                    <td className="border px-2 py-1">{r.rates.USD ?? "—"}</td>
                    <td className="border px-2 py-1">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditRow(r)}
                          className="px-2 py-1 rounded border hover:bg-gray-50"
                          title="Редактировать этот день"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteRow(r.id)}
                          className="px-2 py-1 rounded border hover:bg-red-50 disabled:opacity-50"
                          disabled={rowActionLoading === r.id}
                          title="Удалить этот день"
                        >
                          {rowActionLoading === r.id ? "…" : "🗑️"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} className="border px-2 py-2 text-center text-gray-500">
                    Пусто — нажми «Синхронизировать последние 10 дней (BNR)».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ManagerLayout>
  );
}