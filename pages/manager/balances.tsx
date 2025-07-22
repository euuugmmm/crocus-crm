// pages/manager/balances.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getAllBalances, AgentDoc } from "@/lib/finance";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ManagerLayout from "@/components/layouts/ManagerLayout";

type AgentWithBalance = AgentDoc & { balance: number };

export default function ManagerBalances() {
  const { user, isManager, logout } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentWithBalance[]>([]);

  useEffect(() => {
    if (!user || !isManager) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    getAllBalances()
      .then(setAgents)
      .catch(err => {
        console.error("Ошибка при загрузке балансов:", err);
        setAgents([]);
      })
      .finally(() => setLoading(false));
  }, [user, isManager, router]);

  return (
    <ManagerLayout>
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
                    <td className="px-2 py-1 border">{a.agencyName || "—"}</td>
                    <td className="px-2 py-1 border">{a.agentName || "—"}</td>
                    <td className="px-2 py-1 border text-right">
                      {a.balance.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 border text-center">
                      <Button
                        size="sm"
                        variant="default"
                        className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow hover:bg-indigo-700 hover:shadow-lg transition-colors"
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
    </ManagerLayout>
  );
}