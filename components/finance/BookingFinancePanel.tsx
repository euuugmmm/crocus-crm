"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Account, Category, Transaction } from "@/lib/finance/types";
import { createPlannedFromBooking, createTxForBooking, ensureSystemCategoryId, saveFinanceSnapshot, SYS_CATEGORIES } from "@/lib/finance/bookingFinance";

type Props = {
  bookingId: string;
  booking?: {
    bruttoClient?: number | string;
    internalNet?: number | string;
    agentCommission?: number | string;
    createdAt?: any;
    checkIn?: any;
  };
};

function toNum(v:any){ const n = Number(v); return Number.isFinite(n)?n:0; }

export default function BookingFinancePanel({ bookingId, booking }: Props) {
  const [tx, setTx] = useState<Transaction[]>([]);
  const [acc, setAcc] = useState<Account[]>([]);
  const [cat, setCat] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ut = onSnapshot(query(collection(db,"finance_transactions"), where("bookingId","==",bookingId), orderBy("date","asc")),
      snap => setTx(snap.docs.map(d=>({id:d.id, ...(d.data() as any)}))));
    const ua = onSnapshot(query(collection(db,"finance_accounts")), snap => setAcc(snap.docs.map(d=>({id:d.id, ...(d.data() as any)}))));
    const uc = onSnapshot(query(collection(db,"finance_categories")), snap => setCat(snap.docs.map(d=>({id:d.id, ...(d.data() as any)}))));
    return () => { ut(); ua(); uc(); };
  }, [bookingId]);

  // суммы по факту в EUR
  const totals = useMemo(() => {
    let inEUR = 0, cogsEUR = 0, expEUR = 0;
    for (const t of tx) {
      const isActual = t.status === "actual" || t.status === "reconciled";
      if (!isActual) continue;
      const amount = Number(t.baseAmount || 0);
      const category = cat.find(c=>c.id===t.categoryId);
      if (!category) continue;
      if (category.side === "income") inEUR += amount;
      else if (category.side === "cogs") cogsEUR += amount;
      else expEUR += amount;
    }
    return {
      incomeEUR: +inEUR.toFixed(2),
      cogsEUR: +cogsEUR.toFixed(2),
      expenseEUR: +expEUR.toFixed(2),
      marginEUR: +(inEUR - cogsEUR - expEUR).toFixed(2),
    };
  }, [tx, cat]);

  useEffect(() => {
    // сохраняем снапшот в заявке (только факт)
    saveFinanceSnapshot(bookingId, { actual: totals }).catch(console.error);
  }, [bookingId, totals]);

  const defAccEUR = useMemo(() => acc.find(a=>a.currency==="EUR" && a.isDefault)?.id || acc.find(a=>a.currency==="EUR")?.id, [acc]);

  async function addClientIn() {
    setBusy(true);
    try {
      const catId = await ensureSystemCategoryId(SYS_CATEGORIES.IN_CLIENT);
      await createTxForBooking({
        bookingId, type:"in", status:"actual",
        amountValue: booking?.bruttoClient ? toNum(booking.bruttoClient) : 0,
        currency:"EUR", categoryId: catId, accountId: defAccEUR, method:"bank",
        note:"Поступление от клиента",
      });
    } finally { setBusy(false); }
  }
  async function addOperatorOut() {
    setBusy(true);
    try {
      const catId = await ensureSystemCategoryId(SYS_CATEGORIES.COGS_OP);
      await createTxForBooking({
        bookingId, type:"out", status:"actual",
        amountValue: booking?.internalNet ? toNum(booking.internalNet) : 0,
        currency:"EUR", categoryId: catId, accountId: defAccEUR, method:"iban",
        note:"Оплата оператору",
      });
    } finally { setBusy(false); }
  }
  async function addAgentCommission() {
    setBusy(true);
    try {
      const catId = await ensureSystemCategoryId(SYS_CATEGORIES.EXP_AGENT);
      const v = booking?.agentCommission ? toNum(booking.agentCommission) : 0;
      await createTxForBooking({
        bookingId, type:"out", status:"actual",
        amountValue: v, currency:"EUR", categoryId: catId, accountId: defAccEUR, method:"bank",
        note:"Комиссия агенту",
      });
    } finally { setBusy(false); }
  }
  async function addAgentTax() {
    setBusy(true);
    try {
      const catId = await ensureSystemCategoryId(SYS_CATEGORIES.EXP_TAX);
      const base = booking?.agentCommission ? toNum(booking.agentCommission) : 0;
      const v = +(base * 0.112).toFixed(2); // 11.2%
      await createTxForBooking({
        bookingId, type:"out", status:"actual",
        amountValue: v, currency:"EUR", categoryId: catId, accountId: defAccEUR, method:"bank",
        note:"Налог ФЛ (11.2%)",
      });
    } finally { setBusy(false); }
  }
  async function addAcquiring() {
    setBusy(true);
    try {
      const catId = await ensureSystemCategoryId(SYS_CATEGORIES.EXP_ACQ);
      const base = booking?.bruttoClient ? toNum(booking.bruttoClient) : 0;
      const v = +(base * 0.0115).toFixed(2); // 1.15%
      await createTxForBooking({
        bookingId, type:"out", status:"actual",
        amountValue: v, currency:"EUR", categoryId: catId, accountId: defAccEUR, method:"card",
        note:"Эквайринг 1.15%",
      });
    } finally { setBusy(false); }
  }
  async function addRefund() {
    setBusy(true);
    try {
      const catId = await ensureSystemCategoryId(SYS_CATEGORIES.EXP_REF);
      await createTxForBooking({
        bookingId, type:"out", status:"actual",
        amountValue: 0, currency:"EUR", categoryId: catId, accountId: defAccEUR, method:"bank",
        note:"Возврат клиенту",
      });
    } finally { setBusy(false); }
  }
  async function makePlan() {
    setBusy(true);
    try {
      await createPlannedFromBooking(
        { id: bookingId, bruttoClient: toNum(booking?.bruttoClient), internalNet: toNum(booking?.internalNet), createdAt: booking?.createdAt, checkIn: booking?.checkIn },
        defAccEUR,
        "checkin"
      );
    } finally { setBusy(false); }
  }

  return (
    <div className="border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">Финансы заявки</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={makePlan} disabled={busy} className="h-8 px-3 rounded bg-amber-100 hover:bg-amber-200 text-amber-900">Сформировать план</button>
          <button onClick={addClientIn} disabled={busy} className="h-8 px-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white">Поступление клиента</button>
          <button onClick={addOperatorOut} disabled={busy} className="h-8 px-3 rounded bg-sky-600 hover:bg-sky-700 text-white">Оплата оператору</button>
          <button onClick={addAgentCommission} disabled={busy} className="h-8 px-3 rounded bg-indigo-600 hover:bg-indigo-700 text-white">Комиссия агенту</button>
          <button onClick={addAgentTax} disabled={busy} className="h-8 px-3 rounded bg-purple-600 hover:bg-purple-700 text-white">Налог 11.2%</button>
          <button onClick={addAcquiring} disabled={busy} className="h-8 px-3 rounded bg-orange-600 hover:bg-orange-700 text-white">Эквайринг 1.15%</button>
          <button onClick={addRefund} disabled={busy} className="h-8 px-3 rounded bg-red-600 hover:bg-red-700 text-white">Возврат</button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Kpi title="Доход (факт, EUR)" value={totals.incomeEUR} />
        <Kpi title="Себестоимость (факт, EUR)" value={totals.cogsEUR} />
        <Kpi title="Расходы (факт, EUR)" value={totals.expenseEUR} />
        <Kpi title="Маржа (EUR)" value={totals.marginEUR} emphasis />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border text-sm">
          <thead className="bg-gray-100 text-center">
            <tr>
              <th className="border px-2 py-1">Дата</th>
              <th className="border px-2 py-1">Статус</th>
              <th className="border px-2 py-1">Тип</th>
              <th className="border px-2 py-1">Категория</th>
              <th className="border px-2 py-1">Счёт / Перевод</th>
              <th className="border px-2 py-1">Сумма</th>
              <th className="border px-2 py-1">В EUR</th>
              <th className="border px-2 py-1">Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {tx.map(t=>{
              const category = cat.find(c=>c.id===t.categoryId)?.name || "—";
              const account =
                t.type==="transfer"
                  ? "перевод"
                  : "accountId" in t ? t.accountId : "—";
              return (
                <tr key={t.id} className="text-center border-t">
                  <td className="border px-2 py-1 whitespace-nowrap">{t.date}</td>
                  <td className="border px-2 py-1">{t.status}</td>
                  <td className="border px-2 py-1">{t.type}</td>
                  <td className="border px-2 py-1">{category}</td>
                  <td className="border px-2 py-1">{account}</td>
                  <td className="border px-2 py-1 whitespace-nowrap text-right">
                    {t.amount?.value?.toFixed?.(2)} {t.amount?.currency}
                  </td>
                  <td className="border px-2 py-1 whitespace-nowrap text-right">{t.baseAmount?.toFixed?.(2)} EUR</td>
                  <td className="border px-2 py-1 text-left">{t.note || "—"}</td>
                </tr>
              );
            })}
            {tx.length===0 && (
              <tr><td colSpan={8} className="border px-2 py-3 text-center text-gray-500">Нет движений</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ title, value, emphasis }:{title:string; value:number; emphasis?:boolean}) {
  return (
    <div className={`border rounded-lg p-3 ${emphasis ? "bg-emerald-50" : ""}`}>
      <div className="text-xs text-gray-600">{title}</div>
      <div className={`mt-1 text-lg font-semibold ${emphasis ? "text-emerald-800" : ""}`}>{value.toFixed(2)}</div>
    </div>
  );
}