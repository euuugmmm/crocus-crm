"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  getAllPayouts,
  getAgentBalances,
  createPayout,
} from "@/lib/finance";
import { db } from "@/firebaseConfig";
import { deleteDoc, doc } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/context/AuthContext";

/* -------------------------------------------------- */

export default function ManagerPayoutsPage() {
  const { user, isManager, logout } = useAuth();
  const router = useRouter();

  /* ---------- state ---------- */
  const [agents, setAgents] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [form, setForm] = useState({ agentId: "", amount: "", comment: "" });
  const [selectedBalance, setSelectedBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flt, setFlt] = useState({
    agentId: "all",
    from: "",
    to: "",
    min: "",
    max: "",
  });

  /* ---------- data load ---------- */
  useEffect(() => {
    if (!user || !isManager) return;
    Promise.all([getAgentBalances(), getAllPayouts()]).then(
      ([ag, pay]) => {
        setAgents(ag);
        setPayouts(
          pay.sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          )
        );
      }
    );
  }, [user, isManager]);

  const refreshPayouts = async () => {
    const upd = await getAllPayouts();
    setPayouts(
      upd.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      )
    );
  };

  /* ---------- create payout ---------- */
  const handleCreate = async () => {
    if (!form.agentId || !form.amount) return;
    setSubmitting(true);
    await createPayout({
      agentId: form.agentId,
      amount: parseFloat(form.amount),
      comment: form.comment,
    });
    setForm({ agentId: "", amount: "", comment: "" });
    setSelectedBalance(null);
    await refreshPayouts();
    setSubmitting(false);
  };

  /* ---------- delete payout ---------- */
  const handleDelete = async (id: string) => {
    if (!confirm("Удалить выплату?")) return;
    await deleteDoc(doc(db, "payouts", id));
    await refreshPayouts();
  };

  /* ---------- helpers ---------- */
  const selectAgentForForm = (id: string) => {
    setForm({ ...form, agentId: id });
    const ag = agents.find((a) => a.id === id);
    setSelectedBalance(ag?.balance ?? null);
  };

  const filtered = payouts.filter((p) => {
    if (flt.agentId !== "all" && p.agentId !== flt.agentId) return false;
    const d = p.createdAt?.toDate?.() ?? null;
    if (flt.from && d && d < parseISO(flt.from)) return false;
    if (flt.to && d && d > parseISO(flt.to)) return false;
    const amt = p.amount || 0;
    if (flt.min && amt < parseFloat(flt.min)) return false;
    if (flt.max && amt > parseFloat(flt.max)) return false;
    return true;
  });

  /* ---------- top-nav ---------- */
  const nav = [
    { href: "/manager/bookings", label: "Заявки" },
    { href: "/manager/balances", label: "Балансы" },
    { href: "/manager/payouts", label: "Выплаты" },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  /* ---------- render ---------- */
  return (
    <>
      {/* header */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>
          <nav className="flex gap-4">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  isActive(n.href)
                    ? "border-indigo-600 text-black"
                    : "border-transparent text-gray-600 hover:text-black"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Button size="sm" variant="destructive" onClick={logout}>
            Выйти
          </Button>
        </div>
      </header>

      <Card className="max-w-7xl mx-auto mt-6">
        <CardContent className="p-6 space-y-6">

          {/* filters */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <Select
              value={flt.agentId}
              onValueChange={(v) => setFlt({ ...flt, agentId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Агент" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все агенты</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.agencyName || a.agency} — {a.agentName || a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={flt.from}
              onChange={(e) => setFlt({ ...flt, from: e.target.value })}
            />
            <Input
              type="date"
              value={flt.to}
              onChange={(e) => setFlt({ ...flt, to: e.target.value })}
            />
            <Input
              type="number"
              placeholder="мин €"
              value={flt.min}
              onChange={(e) => setFlt({ ...flt, min: e.target.value })}
            />
            <Input
              type="number"
              placeholder="макс €"
              value={flt.max}
              onChange={(e) => setFlt({ ...flt, max: e.target.value })}
            />
          </div>

          {/* create form */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-sm">Агент</label>
              <Select value={form.agentId} onValueChange={selectAgentForForm}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите агента" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.agencyName || a.agency} — {a.agentName || a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBalance !== null && (
                <p className="text-sm mt-1 text-neutral-600">
                  Текущий баланс:{" "}
                  <span className="font-semibold">
                    {selectedBalance.toFixed(2)} €
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="text-sm">Сумма (€)</label>
              <Input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) =>
                  setForm({ ...form, amount: e.target.value })
                }
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="text-sm">Комментарий</label>
              <Input
                value={form.comment}
                onChange={(e) =>
                  setForm({ ...form, comment: e.target.value })
                }
                placeholder="Необязательно"
              />
            </div>
          </div>

          <Button
            className="bg-green-600 hover:bg-green-700"
            disabled={submitting}
            onClick={handleCreate}
          >
            {submitting ? "Сохраняем…" : "Сделать выплату"}
          </Button>

          {/* table */}
          <table className="w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 py-1 border">Дата</th>
                <th className="px-2 py-1 border">Агент</th>
                <th className="px-2 py-1 border text-right">Сумма (€)</th>
                <th className="px-2 py-1 border">Комментарий</th>
                <th className="px-2 py-1 border">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-2 py-1 border whitespace-nowrap">
                    {p.createdAt?.toDate?.()
                      ? format(p.createdAt.toDate(), "dd.MM.yyyy")
                      : "—"}
                  </td>
                  <td className="px-2 py-1 border">{p.agentName || "—"}</td>
                  <td className="px-2 py-1 border text-right">
                    {p.amount?.toFixed(2) || "—"}
                  </td>
                  <td className="px-2 py-1 border">{p.comment || "—"}</td>
                  <td className="px-2 py-1 border text-center">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(p.id)}
                    >
                      Удалить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}