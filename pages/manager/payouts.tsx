// pages/manager/payouts.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { format, parseISO } from "date-fns";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { getAllBalances, getAllPayouts, createSimplePayout } from "@/lib/finance";
import ManagerLayout from "@/components/layouts/ManagerLayout";

type Booking = {
  id: string;
  bookingNumber: string;
  createdAt: Date;
  hotel: string;
  tourists: number;
  checkIn: string;
  checkOut: string;
  commission: number;
  commissionPaidAmount?: number;
};

export default function ManagerPayoutsPage() {
  const { user, isManager } = useAuth();
  const router = useRouter();

  // Shared state
  const [agents, setAgents] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    agentId: "all",
    from: "",
    to: "",
    min: "",
    max: "",
  });

  // 1️⃣ Payout by selecting bookings
  const [unpaid, setUnpaid] = useState<Booking[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selAgentForBookings, setSelAgentForBookings] = useState<string>("");
  const [creatingByBooking, setCreatingByBooking] = useState(false);

  // 2️⃣ Manual payout (with partial items)
  const [manualForm, setManualForm] = useState({ agentId: "", amount: "", comment: "" });
  const [manualBalance, setManualBalance] = useState<number | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);
  const [manualUnpaid, setManualUnpaid] = useState<Booking[]>([]);
  const [manualChecked, setManualChecked] = useState<Set<string>>(new Set());
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});

  // Guard + load agents, balances & payouts
  useEffect(() => {
    if (!user || !isManager) {
      router.replace("/login");
      return;
    }
    (async () => {
      // include both "agent" and "olimpya_agent"
      const agsSnap = await getDocs(
        query(collection(db, "users"), where("role", "in", ["agent", "olimpya_agent"]))
      );
      setAgents(agsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

      const [bals, pays] = await Promise.all([getAllBalances(), getAllPayouts()]);
      setBalances(bals);
      setPayouts(pays.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    })();
  }, [user, isManager, router]);

  // Load unpaid for "by bookings" block
  useEffect(() => {
    if (!selAgentForBookings) {
      setUnpaid([]);
      setSelected(new Set());
      return;
    }
    (async () => {
      const snap = await getDocs(
        query(
          collection(db, "bookings"),
          where("agentId", "==", selAgentForBookings),
          where("status", "in", ["finished", "Завершено"]),
          where("commissionPaid", "==", false)
        )
      );
      setUnpaid(
        snap.docs.map(d => {
          const b = d.data() as any;
          return {
            id: d.id,
            bookingNumber: b.bookingNumber || d.id,
            createdAt: (b.createdAt as Timestamp).toDate() || new Date(),
            hotel: b.hotel || "—",
            tourists: Array.isArray(b.tourists) ? b.tourists.length : 0,
            checkIn: b.checkIn || "—",
            checkOut: b.checkOut || "—",
            commission: Number(b.commission || 0),
            commissionPaidAmount: Number(b.commissionPaidAmount || 0),
          };
        })
      );
      setSelected(new Set());
    })();
  }, [selAgentForBookings]);

  const remaining = (b: Booking) =>
    Math.max(0, b.commission - (b.commissionPaidAmount || 0));

  // Total for by-bookings block
  const totalByBooking = Array.from(selected).reduce((sum, id) => {
    const b = unpaid.find(x => x.id === id);
    return sum + (b ? remaining(b) : 0);
  }, 0);

  const handleCreateByBooking = async () => {
    if (!selAgentForBookings || selected.size === 0) {
      alert("Выберите агента и хотя бы одну бронь");
      return;
    }
    setCreatingByBooking(true);
    const res = await fetch("/api/create-payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: selAgentForBookings,
        bookings: Array.from(selected),
      }),
    });
    if (res.ok) {
      // refresh payouts & unpaid
      const pays = await getAllPayouts();
      setPayouts(pays.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setSelAgentForBookings(prev => prev);
      alert("Выплата создана");
    } else {
      const { error } = await res.json().catch(() => ({ error: "" }));
      alert(`Ошибка: ${error || res.statusText}`);
    }
    setCreatingByBooking(false);
  };

  // Manual payout: select agent → load balance & unpaid
  const handleManualAgentChange = async (agentId: string) => {
    setManualForm(f => ({ ...f, agentId }));
    const ag = balances.find(x => x.id === agentId);
    setManualBalance(ag?.balance ?? null);
    if (!agentId) {
      setManualUnpaid([]);
      setManualChecked(new Set());
      setManualAmounts({});
      return;
    }
    const snap = await getDocs(
      query(
        collection(db, "bookings"),
        where("agentId", "==", agentId),
        where("status", "in", ["finished", "Завершено"]),
        where("commissionPaid", "==", false)
      )
    );
    const list = snap.docs.map(d => {
      const b = d.data() as any;
      return {
        id: d.id,
        bookingNumber: b.bookingNumber || d.id,
        createdAt: (b.createdAt as Timestamp).toDate() || new Date(),
        hotel: b.hotel || "—",
        tourists: Array.isArray(b.tourists) ? b.tourists.length : 0,
        checkIn: b.checkIn || "—",
        checkOut: b.checkOut || "—",
        commission: Number(b.commission || 0),
        commissionPaidAmount: Number(b.commissionPaidAmount || 0),
      } as Booking;
    });
    setManualUnpaid(list);
    setManualChecked(new Set());
    setManualAmounts({});
  };

  const handleToggle = (id: string) => {
    setManualChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        setManualAmounts(m => ({
          ...m,
          [id]: m[id] ?? remaining(manualUnpaid.find(b => b.id === id)!)!.toFixed(2),
        }));
      }
      return next;
    });
  };

  const handleAmtChange = (id: string, val: string) => {
    setManualAmounts(m => ({ ...m, [id]: val }));
  };

  const manualTotal = useMemo(() => {
    let sum = 0;
    manualChecked.forEach(id => {
      const b = manualUnpaid.find(x => x.id === id);
      if (!b) return;
      const rem = remaining(b);
      const n = parseFloat(manualAmounts[id] || "0");
      if (n > 0) sum += Math.min(n, rem);
    });
    return sum;
  }, [manualChecked, manualAmounts, manualUnpaid]);

  const handleCreateManual = async () => {
    if (!manualForm.agentId) return;

    // if any bookings selected → partial
    if (manualChecked.size > 0) {
      const items = Array.from(manualChecked)
        .map(id => {
          const b = manualUnpaid.find(x => x.id === id)!;
          const rem = remaining(b);
          const pay = Math.min(rem, parseFloat(manualAmounts[id] || "0"));
          return pay > 0 ? { bookingId: id, amount: pay } : null;
        })
        .filter(Boolean);

      if (!items.length) {
        alert("Укажите суммы для выбранных броней");
        return;
      }
      setCreatingManual(true);
      const res = await fetch("/api/create-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: manualForm.agentId,
          items,
          comment: manualForm.comment,
        }),
      });
      if (res.ok) {
        const pays = await getAllPayouts();
        setPayouts(pays.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        await handleManualAgentChange(manualForm.agentId);
        alert("Частичная выплата создана");
      } else {
        const { error } = await res.json().catch(() => ({ error: "" }));
        alert(`Ошибка: ${error || res.statusText}`);
      }
      setCreatingManual(false);
      return;
    }

    // else free amount
    if (!manualForm.amount) {
      alert("Укажите сумму или выберите брони");
      return;
    }
    setCreatingManual(true);
    await createSimplePayout(
      manualForm.agentId,
      parseFloat(manualForm.amount),
      manualForm.comment
    );
    setManualForm({ agentId: manualForm.agentId, amount: "", comment: "" });
    const pays = await getAllPayouts();
    setPayouts(pays.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    setCreatingManual(false);
  };

  // Delete payout
  const handleDelete = async (id: string) => {
    if (!confirm("Удалить выплату?")) return;
    await deleteDoc(doc(db, "payouts", id));
    const pays = await getAllPayouts();
    setPayouts(pays.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  };

  // Generate annex
  const handleAnnex = async (id: string) => {
    if (!confirm("Сгенерировать аннекс?")) return;
    const r = await fetch("/api/generate-annex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payoutId: id }),
    });
    if (r.ok) {
      const pays = await getAllPayouts();
      setPayouts(pays.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } else alert("Ошибка генерации аннекса");
  };

  // Filter existing payouts
  const filteredPayouts = payouts.filter(p => {
    if (filters.agentId !== "all" && p.agentId !== filters.agentId) return false;
    const d = p.createdAt?.toDate() ?? null;
    if (filters.from && d < parseISO(filters.from)) return false;
    if (filters.to && d > parseISO(filters.to)) return false;
    const amt = p.amount || 0;
    if (filters.min && amt < +filters.min) return false;
    if (filters.max && amt > +filters.max) return false;
    return true;
  });

  return (
    <ManagerLayout>
      {/* 1. By bookings */}
      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-xl font-bold">Выплата по бронированиям</h2>
          <label className="block mb-1 text-sm font-medium">Агент</label>
          <select
            value={selAgentForBookings}
            onChange={e => setSelAgentForBookings(e.target.value)}
            className="border p-2 rounded w-full sm:w-80"
          >
            <option value="">— выберите агента —</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.agencyName} — {a.agentName}
              </option>
            ))}
          </select>
          {selAgentForBookings && (
            <>
              <h3 className="font-medium">Невыплаченные брони</h3>
              {unpaid.length === 0 ? (
                <p className="text-sm text-gray-600">У этого агента всё выплачено.</p>
              ) : (
                <table className="w-full border text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="w-8" />
                      <th>Номер</th>
                      <th>Дата</th>
                      <th>Отель</th>
                      <th>Туристы</th>
                      <th>Check-in</th>
                      <th>Check-out</th>
                      <th className="text-right">Остаток, €</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaid.map(b => (
                      <tr key={b.id} className="border-t hover:bg-gray-50">
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={selected.has(b.id)}
                            onChange={() => {
                              const nxt = new Set(selected);
                              nxt.has(b.id) ? nxt.delete(b.id) : nxt.add(b.id);
                              setSelected(nxt);
                            }}
                          />
                        </td>
                        <td>{b.bookingNumber}</td>
                        <td>{format(b.createdAt, "dd.MM.yyyy")}</td>
                        <td>{b.hotel}</td>
                        <td>{b.tourists}</td>
                        <td>{b.checkIn}</td>
                        <td>{b.checkOut}</td>
                        <td className="text-right">{remaining(b).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {selected.size > 0 && (
                <p className="text-sm">
                  Выбрано <strong>{selected.size}</strong> броней. Итого{" "}
                  <strong>{totalByBooking.toFixed(2)} €</strong>
                </p>
              )}
              <Button
                onClick={handleCreateByBooking}
                disabled={creatingByBooking || selected.size === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {creatingByBooking ? "Сохраняем…" : "Создать выплату"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* 2. Manual payout */}
      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-xl font-bold">Ручная выплата</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-sm">Агент</label>
              <Select value={manualForm.agentId} onValueChange={handleManualAgentChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.agencyName} — {a.agentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {manualBalance !== null && (
                <p className="text-sm mt-1 text-neutral-600">
                  Баланс: <strong>{manualBalance.toFixed(2)} €</strong>
                </p>
              )}
            </div>
            <div>
              <label className="text-sm">Свободная сумма (€)</label>
              <Input
                type="number"
                min="0"
                placeholder="Если не выбираете брони"
                value={manualForm.amount}
                onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm">Комментарий</label>
              <Input
                value={manualForm.comment}
                onChange={e => setManualForm(f => ({ ...f, comment: e.target.value }))}
              />
            </div>
          </div>

          {manualForm.agentId && (
            <>
              <h3 className="font-medium">Невыплаченные брони выбранного агента</h3>
              {manualUnpaid.length === 0 ? (
                <p className="text-sm text-gray-600">У этого агента всё выплачено.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="w-8" />
                        <th>Номер</th>
                        <th>Дата</th>
                        <th>Отель</th>
                        <th>Остаток, €</th>
                        <th>Выплатить, €</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualUnpaid.map(b => {
                        const rem = remaining(b);
                        const checked = manualChecked.has(b.id);
                        const val = manualAmounts[b.id] ?? rem.toFixed(2);
                        return (
                          <tr key={b.id} className="border-t hover:bg-gray-50">
                            <td className="text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggle(b.id)}
                              />
                            </td>
                            <td>{b.bookingNumber}</td>
                            <td>{format(b.createdAt, "dd.MM.yyyy")}</td>
                            <td>{b.hotel}</td>
                            <td className="text-right">{rem.toFixed(2)}</td>
                            <td className="text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                disabled={!checked}
                                value={val}
                                onChange={e => handleAmtChange(b.id, e.target.value)}
                                className="border rounded px-2 py-1 w-28 text-right"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {manualChecked.size > 0 && (
                    <p className="text-sm mt-2">
                      Выбрано <strong>{manualChecked.size}</strong> броней. Итого к выплате{" "}
                      <strong>{manualTotal.toFixed(2)} €</strong>
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <Button
            onClick={handleCreateManual}
            disabled={creatingManual || !manualForm.agentId}
            className="bg-green-600 hover:bg-green-700"
          >
            {creatingManual ? "Сохраняем…" : "Сделать выплату"}
          </Button>
        </CardContent>
      </Card>

      {/* 3. All payouts */}
      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-xl font-bold">Все выплаты</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <Select
              value={filters.agentId}
              onValueChange={v => setFilters(f => ({ ...f, agentId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Агент" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все агенты</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.agencyName} — {a.agentName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
            />
            <Input
              type="date"
              value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            />
            <Input
              type="number"
              placeholder="мин €"
              value={filters.min}
              onChange={e => setFilters(f => ({ ...f, min: e.target.value }))}
            />
            <Input
              type="number"
              placeholder="макс €"
              value={filters.max}
              onChange={e => setFilters(f => ({ ...f, max: e.target.value }))}
            />
          </div>
          <table className="w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 py-1 border">Дата</th>
                <th className="px-2 py-1 border">Агент</th>
                <th className="px-2 py-1 border text-right">Сумма (€)</th>
                <th className="px-2 py-1 border">Комментарий</th>
                <th className="px-2 py-1 border">Annex</th>
                <th className="px-2 py-1 border">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayouts.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-2 py-1 border whitespace-nowrap">
                    {p.createdAt?.toDate
                      ? format(p.createdAt.toDate(), "dd.MM.yyyy")
                      : "—"}
                  </td>
                  <td className="px-2 py-1 border">{p.agentName}</td>
                  <td className="px-2 py-1 border text-right">
                    {p.amount?.toFixed(2) || "—"}
                  </td>
                  <td className="px-2 py-1 border">{p.comment || "—"}</td>
                  <td className="px-2 py-1 border text-center">
                    {p.annexLink ? (
                      <a
                        href={p.annexLink}
                        target="_blank"
                        className="underline text-sky-600"
                      >
                        PDF
                      </a>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleAnnex(p.id)}>
                        Создать
                      </Button>
                    )}
                  </td>
                  <td className="px-2 py-1 border text-center">
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(p.id)}>
                      Удалить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </ManagerLayout>
  );
}