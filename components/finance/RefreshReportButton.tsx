"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";

export default function RefreshReportButton({
  onRefresh,
  label = "Обновить отчёт",
}: {
  onRefresh: () => Promise<void>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    if (busy) return;
    setBusy(true);
    try { await onRefresh(); }
    catch (e:any) { alert(e?.message || "Не удалось обновить"); }
    finally { setBusy(false); }
  };
  return (
    <Button onClick={click} disabled={busy} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white">
      {busy ? "Обновляю…" : label}
    </Button>
  );
}
