// pages/manager/balances.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

type AgentDoc = {
  id: string;
  agentName?: string;
  agencyName?: string;
  role?: string;
  [k: string]: any;
};

type AgentWithBalance = AgentDoc & { balance: number };

type BookingRow = {
  agentId?: string;
  commission?: number;
  status?: string;
};

type PayoutRow = {
  agentId?: string;
  amount?: number;
  createdAt?: Timestamp;
};

export default function ManagerBalances() {
  const { user, isManager } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentWithBalance[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [finishInfo, setFinishInfo] = useState<{
    scanned: number;
    updated: number;
    threshold: string;
  } | null>(null);

  // Загружаем всех агентов (agent + olimpya_agent) и считаем баланс
  useEffect(() => {
    if (!user || !isManager) {
      router.replace("/login");
      return;
    }
    loadBalancesAll().catch((err) => {
      console.error("Ошибка при загрузке балансов:", err);
      setAgents([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isManager]);

  async function loadBalancesAll() {
    setLoading(true);

    // 1) все агенты двух ролей
    const usersSnap = await getDocs(
      query(
        collection(db, "users"),
        where("role", "in", ["agent", "olimpya_agent"])
      )
    );
    const allAgents: AgentDoc[] = usersSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    // 2) все завершённые заявки (для всех агентов разом)
    const bookingsSnap = await getDocs(
      query(
        collection(db, "bookings"),
        where("status", "in", ["finished", "Closed", "Завершено"])
      )
    );
    const commByAgent = new Map<string, number>();
    bookingsSnap.docs.forEach((doc) => {
      const b = doc.data() as BookingRow;
      const ag = b.agentId || "";
      if (!ag) return;
      const c = Number(b.commission || 0);
      if (!Number.isFinite(c)) return;
      commByAgent.set(ag, (commByAgent.get(ag) || 0) + c);
    });

    // 3) все выплаты (разом)
    const payoutsSnap = await getDocs(collection(db, "payouts"));
    const payByAgent = new Map<string, number>();
    payoutsSnap.docs.forEach((doc) => {
      const p = doc.data() as PayoutRow;
      const ag = p.agentId || "";
      if (!ag) return;
      const a = Number(p.amount || 0);
      if (!Number.isFinite(a)) return;
      payByAgent.set(ag, (payByAgent.get(ag) || 0) + a);
    });

    // 4) сводим
    const withBalance: AgentWithBalance[] = allAgents.map((a) => {
      const totalCom = commByAgent.get(a.id) || 0;
      const totalPay = payByAgent.get(a.id) || 0;
      return { ...a, balance: Math.round((totalCom - totalPay) * 100) / 100 };
    });

    // сортируем по балансу по убыванию
    withBalance.sort((x, y) => (y.balance || 0) - (x.balance || 0));

    setAgents(withBalance);
    setLoading(false);
  }

  // Ручной запуск завершения вчерашних броней
  const handleFinishYesterday = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const r = await fetch("/api/finish-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // можно передать { upTo: "dd.MM.yyyy" }
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.statusText);

      setFinishInfo({
        scanned: j.scanned,
        updated: j.updated,
        threshold: j.threshold,
      });

      // после изменения статусов пересчитаем балансы
      await loadBalancesAll();

      alert(
        `Готово: проверено ${j.scanned}, завершено ${j.updated}, порог ${j.threshold}`
      );
    } catch (e: any) {
      console.error(e);
      alert(`Ошибка: ${e.message}`);
    } finally {
      setFinishing(false);
    }
  };

  return (
    <ManagerLayout>
      <Card className="max-w-7xl mx-auto mt-6">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">Балансы агентов</h1>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleFinishYesterday}
                disabled={finishing}
                className="bg-blue-600 hover:bg-blue-700 rounded-lg shadow px-4"
              >
                {finishing ? "Завершаем…" : "Завершить брони"}
              </Button>
              <Button
                variant="outline"
                onClick={loadBalancesAll}
                className="rounded-lg"
              >
                Обновить
              </Button>
            </div>
          </div>

          {finishInfo && (
            <p className="text-sm text-neutral-600">
              Последний запуск: проверено{" "}
              <strong>{finishInfo.scanned}</strong>, завершено{" "}
              <strong>{finishInfo.updated}</strong>, порог{" "}
              <strong>{finishInfo.threshold}</strong>
            </p>
          )}

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
                        onClick={() =>
                          router.push(`/manager/payouts?agent=${a.id}`)
                        }
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