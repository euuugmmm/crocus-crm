"use client";

import Head from "next/head";
import { useEffect, useState } from "react";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/router";
import { collection, doc, getDoc, onSnapshot, query, setDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FxRates } from "@/lib/finance/types";
import { today } from "@/lib/finance/db";

export default function RatesPage() {
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const router = useRouter();
  const canEdit = isManager || isSuperManager || isAdmin;

  const [date, setDate] = useState<string>(today());
  const [rates, setRates] = useState<FxRates | null>(null);
  const [list, setList] = useState<FxRates[]>([]);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    if (!canEdit) { router.replace("/agent/bookings"); return; }

    const q = query(collection(db, "finance_fxRates"));
    const unsub = onSnapshot(q, snap => {
      setList(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [user, canEdit, router]);

  useEffect(() => { load(date); }, [date]);

  async function load(d: string) {
    const snap = await getDoc(doc(db,"finance_fxRates", d));
    if (snap.exists()) setRates({ id:d, ...(snap.data() as any) });
    else setRates({ id:d, base:"EUR", rates:{ RON: 4.97, USD:1.08 } });
  }

  async function save() {
    if (!rates) return;
    await setDoc(doc(db,"finance_fxRates", rates.id), {
      base: "EUR",
      rates: { RON: Number(rates.rates.RON || 0) || 0, USD: Number(rates.rates.USD || 0) || 0 },
      createdAt: new Date()
    }, { merge:true });
    alert("Сохранено");
  }

  return (
    <ManagerLayout>
      <Head><title>Курсы валют — Финансы</title></Head>
      <div className="max-w-4xl mx-auto py-8">
        <h1 className="text-2xl font-bold mb-4">Курсы валют (к EUR)</h1>

        <div className="p-4 border rounded-lg mb-6 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs text-gray-600 mb-1">Дата</div>
            <input type="date" className="border rounded px-2 py-1" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">1 EUR = RON</div>
            <input className="border rounded px-2 py-1 w-28" value={rates?.rates.RON ?? ""} onChange={e=>setRates(r=>r?{...r, rates:{...r.rates, RON:e.target.value as any}}:r)} />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">1 EUR = USD</div>
            <input className="border rounded px-2 py-1 w-28" value={rates?.rates.USD ?? ""} onChange={e=>setRates(r=>r?{...r, rates:{...r.rates, USD:e.target.value as any}}:r)} />
          </div>
          <button onClick={save} className="h-9 px-3 rounded bg-green-600 text-white">Сохранить</button>
        </div>

        <div className="border rounded-lg">
          <div className="px-3 py-2 bg-gray-50 font-semibold">Последние записи</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">Дата</th>
                <th className="border px-2 py-1">1 EUR = RON</th>
                <th className="border px-2 py-1">1 EUR = USD</th>
              </tr>
            </thead>
            <tbody>
              {list.sort((a,b)=>a.id<b.id?1:-1).slice(0,30).map(r=>(
                <tr key={r.id} className="text-center">
                  <td className="border px-2 py-1">{r.id}</td>
                  <td className="border px-2 py-1">{r.rates.RON ?? "—"}</td>
                  <td className="border px-2 py-1">{r.rates.USD ?? "—"}</td>
                </tr>
              ))}
              {list.length===0 && <tr><td colSpan={3} className="border px-2 py-2 text-center text-gray-500">Пусто</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </ManagerLayout>
  );
}