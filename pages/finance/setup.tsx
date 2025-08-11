"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useAuth } from "@/context/AuthContext";
import { seedFinanceDefaults } from "@/scripts/seedFinanceDefaults";
import { Button } from "@/components/ui/button";

export default function FinanceSetupPage() {
  const { user, isManager, isSuperManager, isAdmin } = useAuth();
  const can = isManager || isSuperManager || isAdmin;
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string>("");

  useEffect(() => {
    if (!user) router.replace("/login");
    if (!can) router.replace("/agent/bookings");
  }, [user, can, router]);

  const runSeed = async () => {
    setRunning(true);
    setLog("Выполняю инициализацию…");
    try {
      await seedFinanceDefaults();
      setLog("Готово: системные категории и счёт BT EUR созданы (если их не было).");
    } catch (e:any) {
      console.error(e);
      setLog("Ошибка: " + (e?.message || String(e)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <ManagerLayout>
      <main className="max-w-2xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Настройка финансового модуля</h1>
        <p className="text-gray-600">
          Нажми одну кнопку — и мы создадим системные категории и дефолтный счёт <b>BT EUR</b>.
        </p>
        <Button onClick={runSeed} disabled={running} className="bg-green-600 hover:bg-green-700">
          {running ? "Выполняю…" : "Создать системные категории и счёт BT EUR"}
        </Button>
        {log && <pre className="p-3 bg-gray-50 border rounded text-sm whitespace-pre-wrap">{log}</pre>}
      </main>
    </ManagerLayout>
  );
}