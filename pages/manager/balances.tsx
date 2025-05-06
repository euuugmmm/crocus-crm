"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getAgentBalances } from "@/lib/finance";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/* -------------------------------------------------- */

export default function ManagerBalances() {
  const { user, isManager, logout } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<any[]>([]);

  /* ---------- data load ---------- */
  useEffect(() => {
    if (!user || !isManager) return;
    setLoading(true);
    getAgentBalances()
      .then(setAgents)
      .finally(() => setLoading(false));
  }, [user, isManager]);

  /* ---------- top-nav ---------- */
  const nav = [
    { href: "/manager/bookings", label: "Заявки" },
    { href: "/manager/balances", label: "Балансы" },
    { href: "/manager/payouts",  label: "Выплаты" },
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
            {nav.map(n => (
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

      {/* content */}
      <Card className="max-w-7xl mx-auto mt-6">
        <CardContent className="p-6">
          <h1 className="text-2xl font-bold mb-4">Балансы агентов</h1>

          <table className="w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 py-1 border">Агентство</th>
                <th className="px-2 py-1 border">Имя</th>
                <th className="px-2 py-1 border text-right">Баланс (€)</th>
                <th className="px-2 py-1 border">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center">
                    Загрузка…
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center">
                    Нет агентов
                  </td>
                </tr>
              ) : (
                agents.map((a) => (
                  <tr key={a.id} className="border-t hover:bg-gray-50">
                    <td className="px-2 py-1 border">{a.agencyName || a.agency}</td>
                    <td className="px-2 py-1 border">{a.agentName || a.name}</td>
                    <td className="px-2 py-1 border text-right">
                      {a.balance?.toFixed(2) || "0.00"}
                    </td>
                    <td className="px-2 py-1 border text-center">
                      <Button
                        size="sm"
                        onClick={() => router.push(`/manager/payouts?agent=${a.id}`)}
                      >
                        Создать выплату
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}