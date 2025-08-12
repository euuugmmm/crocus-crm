// pages/manager/payouts.tsx
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
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
import { getAllBalances, getAllPayouts } from "@/lib/finance";
import { AGENT_WITHHOLD_PCT, OLIMPIA_WITHHOLD_PCT } from "@/lib/constants/fees";
import dynamic from "next/dynamic";

// важный момент: отключаем SSR для layout, чтобы избежать гидрации
const ManagerLayout = dynamic(() => import("@/components/layouts/ManagerLayout"), { ssr: false });

type Booking = {
  id: string;
  bookingNumber: string;
  createdAt: Date;
  hotel: string;
  tourists: number;
  checkIn: string;
  checkOut: string;
  commissionGross: number;
  commissionNet: number;
  commissionPaidGrossAmount: number;
  commissionPaidNetAmount: number;
};

type PayoutItem = {
  bookingId: string;
  bookingNumber?: string;
  hotel?: string;
  checkIn?: string;
  checkOut?: string;
  amountGross: number;
  amountNet: number;
  closeFully?: boolean;
};

type Payout = {
  id: string;
  agentId: string;
  createdAt?: any;
  amount: number;
  totalGross?: number;
  totalNet?: number;
  transferFee?: number;
  comment?: string;
  annexLink?: string;
  items?: PayoutItem[];
};

export default function ManagerPayoutsPage() {
  const { user, isManager, loading } = useAuth();
  const router = useRouter();

  // справочник
  const [agents, setAgents] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);

  // Фильтры выплат
  const [filters, setFilters] = useState({
    agentId: "all",
    from: "",
    to: "",
    min: "",
    max: "",
  });
  const [filterComment, setFilterComment] = useState("");
  const [filterHasAnnex, setFilterHasAnnex] = useState<"all" | "with" | "without">("all");

  // Ручная выплата
  const [manualForm, setManualForm] = useState({ agentId: "", amount: "", comment: "" });
  const [transferFee, setTransferFee] = useState<string>("");
  const [manualBalance, setManualBalance] = useState<number | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);

  // Невыплаченные по агенту
  const [manualUnpaid, setManualUnpaid] = useState<Booking[]>([]);
  const [manualChecked, setManualChecked] = useState<Set<string>>(new Set());
  const [manualAmountsGross, setManualAmountsGross] = useState<Record<string, string>>({});
  const [manualClose, setManualClose] = useState<Set<string>>(new Set());

  // Редактор выплаты
  const [editing, setEditing] = useState<Payout | null>(null);
  const [editTransferFee, setEditTransferFee] = useState<string>("");
  const [editComment, setEditComment] = useState<string>("");
  const [editItems, setEditItems] = useState<PayoutItem[]>([]);

  /* --------------------- охранник доступа --------------------- */
  useEffect(() => {
    if (loading) return;            // ждём, пока подтянется auth
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isManager) {
      router.replace("/agent/bookings");
      return;
    }
  }, [user, isManager, loading, router]);

  /* --------------------- загрузка данных --------------------- */
  useEffect(() => {
    if (loading) return;
    if (!user || !isManager) return;

    (async () => {
      const agsSnap = await getDocs(
        query(collection(db, "users"), where("role", "in", ["agent", "olimpya_agent"]))
      );
      setAgents(agsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

      const [bals, pays]: [any[], any[]] = await Promise.all([getAllBalances(), getAllPayouts()]);
      setBalances(bals);
      setPayouts(
        (pays as Payout[]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    })();
  }, [user, isManager, loading]);

  /* --------------------- утилиты --------------------- */
  const [withholdPct, setWithholdPct] = useState<number>(AGENT_WITHHOLD_PCT);
  const pct = withholdPct ?? AGENT_WITHHOLD_PCT;
  const toNet = (gross: number) => Math.max(0, Math.round(gross * (1 - pct) * 100) / 100);

  // Маппер Firestore → Booking
  const mapDocToBooking = (d: any): Booking => {
    const b = d.data() as any;
    const gross = Number(b.commission || 0);
    const paidNet = Number(b.commissionPaidNetAmount ?? b.commissionPaidAmount ?? 0);
    const paidGross =
      b.commissionPaidGrossAmount != null
        ? Number(b.commissionPaidGrossAmount)
        : paidNet > 0
        ? Math.round((paidNet / (1 - pct)) * 100) / 100
        : 0;

    return {
      id: d.id,
      bookingNumber: b.bookingNumber || d.id,
      createdAt: (b.createdAt as Timestamp)?.toDate?.() || new Date(),
      hotel: b.hotel || "—",
      tourists: Array.isArray(b.tourists) ? b.tourists.length : 0,
      checkIn: b.checkIn || "—",
      checkOut: b.checkOut || "—",
      commissionGross: gross,
      commissionNet: toNet(gross),
      commissionPaidGrossAmount: paidGross,
      commissionPaidNetAmount: paidNet,
    };
  };

  const remainingGross = (b: Booking) =>
    Math.max(0, (b.commissionGross || 0) - (b.commissionPaidGrossAmount || 0));

  /* ---------------- ручная выплата ---------------- */
  const handleManualAgentChange = async (agentId: string) => {
    setManualForm(f => ({ ...f, agentId }));
    const ag = balances.find(x => x.id === agentId);
    setManualBalance(ag?.balance ?? null);
    const meta = agents.find(a => a.id === agentId);
    const role = meta?.role || "agent";
    setWithholdPct(role === "olimpya_agent" ? OLIMPIA_WITHHOLD_PCT : AGENT_WITHHOLD_PCT);
    setManualChecked(new Set());
    setManualAmountsGross({});
    setManualClose(new Set());
    setTransferFee("");

    if (!agentId) {
      setManualUnpaid([]);
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
    setManualUnpaid(snap.docs.map(mapDocToBooking));
  };

  const toggleManualCheck = (id: string) => {
    setManualChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        const b = manualUnpaid.find(x => x.id === id);
        const remG = b ? remainingGross(b) : 0;
        setManualAmountsGross(m => ({ ...m, [id]: m[id] ?? remG.toFixed(2) }));
      }
      return next;
    });
  };

  const setGrossFor = (id: string, val: string) => {
    setManualAmountsGross(m => ({ ...m, [id]: val }));
  };

  const manualTotalGross = useMemo(() => {
    let sum = 0;
    manualChecked.forEach(id => {
      const b = manualUnpaid.find(x => x.id === id);
      if (!b) return;
      const rem = remainingGross(b);
      const n = parseFloat(manualAmountsGross[id] || "0");
      if (n > 0) sum += Math.min(n, rem);
    });
    return Math.round(sum * 100) / 100;
  }, [manualChecked, manualAmountsGross, manualUnpaid]);

  const manualTotalNet = useMemo(() => toNet(manualTotalGross), [manualTotalGross]);
  const transferFeeNum = useMemo(() => Math.max(0, parseFloat(transferFee || "0") || 0), [transferFee]);
  const toWire = useMemo(() => Math.max(0, manualTotalNet - transferFeeNum), [manualTotalNet, transferFeeNum]);

  // Создание выплаты
  const handleCreateManual = async () => {
    if (!manualForm.agentId) return;
    setCreatingManual(true);

    // Если выбраны брони
    if (manualChecked.size > 0) {
      const items: { bookingId: string; amountGross: number; closeFully?: boolean }[] =
        Array.from(manualChecked)
          .map(id => {
            const b = manualUnpaid.find(x => x.id === id)!;
            const remG = remainingGross(b);
            const payG = Math.min(remG, parseFloat(manualAmountsGross[id] || "0"));
            if (!(payG > 0)) return null;
            return manualClose.has(id)
              ? { bookingId: id, amountGross: Math.round(payG * 100) / 100, closeFully: true }
              : { bookingId: id, amountGross: Math.round(payG * 100) / 100 };
          })
          .filter(Boolean) as any[];

      if (!items.length) {
        alert("Укажите суммы для выбранных броней");
        setCreatingManual(false);
        return;
      }

      const res = await fetch("/api/create-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "byBookings",
          agentId: manualForm.agentId,
          items,
          withholdPct: pct,
          transferFee: transferFeeNum,
          comment: manualForm.comment,
        }),
      });

      if (res.ok) {
        const pays = await getAllPayouts();
        setPayouts(
          (pays as Payout[]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        );
        await handleManualAgentChange(manualForm.agentId);
        setManualForm(f => ({ ...f, amount: "", comment: f.comment }));
        setTransferFee("");
        alert("Выплата создана");
      } else {
        const { error } = await res.json().catch(() => ({ error: "" }));
        alert(`Ошибка: ${error || res.statusText}`);
      }

      setCreatingManual(false);
      return;
    }

    // Свободная сумма (брутто)
    if (!manualForm.amount) {
      alert("Укажите сумму или выберите брони");
      setCreatingManual(false);
      return;
    }

    const res = await fetch("/api/create-payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "free",
        agentId: manualForm.agentId,
        amountGross: parseFloat(manualForm.amount),
        withholdPct: pct,
        transferFee: transferFeeNum,
        comment: manualForm.comment,
      }),
    });

    if (res.ok) {
      setManualForm({ agentId: manualForm.agentId, amount: "", comment: manualForm.comment });
      setTransferFee("");
      const pays = await getAllPayouts();
      setPayouts(
        (pays as Payout[]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
      alert("Свободная выплата создана");
    } else {
      const { error } = await res.json().catch(() => ({ error: "" }));
      alert(`Ошибка: ${error || res.statusText}`);
    }

    setCreatingManual(false);
  };

  /* ------------------- удаление и anexa ------------------- */
  const handleDelete = async (id: string) => {
    if (!confirm(
      "Удалить выплату полностью?\n• Откатим отметки в бронях\n• Вернём баланс агенту\n• Удалим Anexa и откатим её счётчик"
    )) return;

    const r = await fetch("/api/delete-payout-deep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payoutId: id }),
    });

    if (r.ok) {
      const pays = await getAllPayouts();
      setPayouts(
        (pays as Payout[]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    } else {
      const { error } = await r.json().catch(() => ({ error: "" }));
      alert(`Ошибка удаления: ${error || r.statusText}`);
    }
  };

  const handleAnnex = async (id: string) => {
    if (!confirm("Сгенерировать Anexa (с суммами БРУТТО)?")) return;
    const r = await fetch("/api/generate-annex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payoutId: id }),
    });
    if (r.ok) {
      const pays = await getAllPayouts();
      setPayouts(
        (pays as Payout[]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    } else alert("Ошибка генерации Anexa");
  };

  /* ------------------- редактор выплаты ------------------- */
  const openEditor = async (p: Payout) => {
    setEditing(p);
    setEditTransferFee(p.transferFee != null ? String(p.transferFee) : "");
    setEditComment(p.comment || "");

    const meta = agents.find(a => a.id === p.agentId);
    const role = meta?.role || "agent";
    setWithholdPct(
      typeof (p as any).withholdPct === "number"
        ? (p as any).withholdPct
        : role === "olimpya_agent" ? OLIMPIA_WITHHOLD_PCT : AGENT_WITHHOLD_PCT
    );

    const baseItems = (p.items || []).map(it => ({
      ...it,
      amountGross: Number(it.amountGross || 0),
      amountNet: toNet(Number(it.amountGross || 0)),
    }));

    // Гидратация метаданных из bookings
    const ids = Array.from(new Set(baseItems.map(i => i.bookingId)));
    const metaById: Record<string, {bookingNumber?: string; hotel?: string; checkIn?: string; checkOut?: string}> = {};

    await Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(db, "bookings", id));
        if (snap.exists()) {
          const b = snap.data() as any;
          metaById[id] = {
            bookingNumber: b.bookingNumber || id,
            hotel: b.hotel || "—",
            checkIn: b.checkIn || "—",
            checkOut: b.checkOut || "—",
          };
        }
      })
    );

    setEditItems(
      baseItems.map(it => ({
        ...it,
        ...(metaById[it.bookingId] || {}),
      }))
    );
  };

  const editTotalGross = useMemo(
    () => Math.round(editItems.reduce((s, it) => s + (Number(it.amountGross) || 0), 0) * 100) / 100,
    [editItems]
  );
  const editTotalNet = useMemo(() => toNet(editTotalGross), [editTotalGross]);
  const editTransferFeeNum = useMemo(
    () => Math.max(0, parseFloat(editTransferFee || "0") || 0),
    [editTransferFee]
  );
  const editToWire = useMemo(
    () => Math.max(0, editTotalNet - editTransferFeeNum),
    [editTotalNet, editTransferFeeNum]
  );

  const setEditItemGross = (idx: number, val: string) => {
    const v = parseFloat(val || "0") || 0;
    setEditItems(items =>
      items.map((it, i) =>
        i === idx
          ? { ...it, amountGross: v, amountNet: toNet(v) }
          : it
      )
    );
  };

  const toggleEditItemClose = (idx: number) => {
    setEditItems(items =>
      items.map((it, i) => (i === idx ? { ...it, closeFully: !it.closeFully } : it))
    );
  };

  const saveEditor = async () => {
    if (!editing) return;
    const payload = {
      payoutId: editing.id,
      transferFee: editTransferFeeNum,
      comment: editComment,
      withholdPct: pct,
      items: editItems.map(it => ({
        bookingId: it.bookingId,
        amountGross: Math.round((it.amountGross || 0) * 100) / 100,
        closeFully: !!it.closeFully,
      })),
    };
    const r = await fetch("/api/update-payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const { error } = await r.json().catch(() => ({ error: "" }));
      alert(`Ошибка сохранения: ${error || r.statusText}`);
      return;
    }

    const resp = await r.json().catch(() => ({}));
    setEditing(null);

    // Автогенерация новой Anexa
    const ga = await fetch("/api/generate-annex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payoutId: resp.payoutId || editing.id }),
    });

    if (!ga.ok) {
      alert("Изменения сохранены, но Anexa не перегенерировалась.");
    }

    const pays = await getAllPayouts();
    setPayouts(
      (pays as Payout[]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    );
  };

  /* ------------------- фильтр выплат ------------------- */
  const filteredPayouts = payouts.filter(p => {
    if (filters.agentId !== "all" && p.agentId !== filters.agentId) return false;
    const d = p.createdAt?.toDate?.() ?? null;
    if (filters.from && d && d < parseISO(filters.from)) return false;
    if (filters.to && d && d > parseISO(filters.to)) return false;
    const amt = p.amount || 0;
    if (filters.min && amt < +filters.min) return false;
    if (filters.max && amt > +filters.max) return false;
    if (filterComment && !(p.comment || "").toLowerCase().includes(filterComment.toLowerCase()))
      return false;
    if (filterHasAnnex === "with" && !p.annexLink) return false;
    if (filterHasAnnex === "without" && p.annexLink) return false;
    return true;
  });

  /* ===================================================== */
  return (
    <>
      <Head>
        <title>Выплаты агентам — CrocusCRM</title>
      </Head>
    <ManagerLayout fullWidthHeader fullWidthMain>
        {/* Ручная выплата */}
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-bold">Ручная выплата</h2>
            <p className="text-sm text-neutral-600">
              Суммы в таблице — <b>БРУТТО</b>. Выплата сохраняет брутто и рассчитанное
              нетто (удержание {Math.round(pct * 100)}%). Комиссия перевода вычитается из
              итоговой суммы после удержания. В Anexa выгружаем <b>брутто</b>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
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
                <label className="text-sm">Свободная сумма (брутто), €</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Если не выбираете брони"
                  value={manualForm.amount}
                  onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm">Комиссия перевода, €</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="SWIFT / банк"
                  value={transferFee}
                  onChange={e => setTransferFee(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm">Комментарий</label>
                <Input
                  value={manualForm.comment}
                  onChange={e => setManualForm(f => ({ ...f, comment: e.target.value }))}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Для свободной суммы попадёт в Anexa. Для броней — комментарий выплаты.
                </p>
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
                          <th>Туристы</th>
                          <th>Check-in</th>
                          <th>Check-out</th>
                          <th className="text-right">Остаток (брутто), €</th>
                          <th className="text-right">Создать выплату (брутто), €</th>
                          <th>Закрыть полностью</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualUnpaid.map(b => {
                          const remG = remainingGross(b);
                          const checked = manualChecked.has(b.id);
                          const val = manualAmountsGross[b.id] ?? remG.toFixed(2);
                          const closed = manualClose.has(b.id);
                          return (
                            <tr key={b.id} className="border-t hover:bg-gray-50">
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleManualCheck(b.id)}
                                />
                              </td>
                              <td>{b.bookingNumber}</td>
                              <td>{format(b.createdAt, "dd.MM.yyyy")}</td>
                              <td>{b.hotel}</td>
                              <td>{b.tourists}</td>
                              <td>{b.checkIn}</td>
                              <td>{b.checkOut}</td>
                              <td className="text-right">{remG.toFixed(2)}</td>
                              <td className="text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  disabled={!checked}
                                  value={val}
                                  onChange={e => setGrossFor(b.id, e.target.value)}
                                  className="border rounded px-2 py-1 w-28 text-right"
                                />
                              </td>
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  checked={closed}
                                  disabled={!checked}
                                  onChange={() =>
                                    setManualClose(prev => {
                                      const next = new Set(prev);
                                      next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                                      return next;
                                    })
                                  }
                                  title="Отметить бронь как полностью выплаченную (закрыть)"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {manualChecked.size > 0 && (
                      <p className="text-sm mt-2">
                        Выбрано <strong>{manualChecked.size}</strong> броней. Итого БРУТТО{" "}
                        <strong>{manualTotalGross.toFixed(2)} €</strong>. Итого НЕТТО{" "}
                        <strong>{manualTotalNet.toFixed(2)} €</strong>. Комиссия перевода:{" "}
                        <strong>{transferFeeNum.toFixed(2)} €</strong>. К перечислению:{" "}
                        <strong>{toWire.toFixed(2)} €</strong>
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

        {/* Все выплаты */}
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-bold">Все выплаты</h2>

            <div className="grid grid-cols-1 sm:grid-cols-8 gap-3">
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
                placeholder="мин € (факт)"
                value={filters.min}
                onChange={e => setFilters(f => ({ ...f, min: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="макс € (факт)"
                value={filters.max}
                onChange={e => setFilters(f => ({ ...f, max: e.target.value }))}
              />
              <Input
                placeholder="Комментарий содержит…"
                value={filterComment}
                onChange={e => setFilterComment(e.target.value)}
              />
              <Select value={filterHasAnnex} onValueChange={v => setFilterHasAnnex(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Anexa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Любые</SelectItem>
                  <SelectItem value="with">С anexa</SelectItem>
                  <SelectItem value="without">Без anexa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-1 border">Дата</th>
                    <th className="px-2 py-1 border">Агент</th>
                    <th className="px-2 py-1 border text-right">Итого брутто (€)</th>
                    <th className="px-2 py-1 border text-right">Итого нетто (€)</th>
                    <th className="px-2 py-1 border text-right">Комиссия перевода (€)</th>
                    <th className="px-2 py-1 border text-right">К перечислению (факт, €)</th>
                    <th className="px-2 py-1 border">Комментарий</th>
                    <th className="px-2 py-1 border">Anexa</th>
                    <th className="px-2 py-1 border">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayouts.map((p: Payout) => (
                    <tr key={p.id} className="border-t align-top">
                      <td className="px-2 py-1 border whitespace-nowrap">
                        {p.createdAt?.toDate
                          ? format(p.createdAt.toDate(), "dd.MM.yyyy")
                          : "—"}
                      </td>
                      <td className="px-2 py-1 border">
                        {(() => {
                          const ag = agents.find(a => a.id === p.agentId);
                          return ag ? `${ag.agencyName} — ${ag.agentName}` : "—";
                        })()}
                      </td>
                      <td className="px-2 py-1 border text-right">
                        {typeof p.totalGross === "number" ? p.totalGross.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1 border text-right">
                        {typeof p.totalNet === "number" ? p.totalNet.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1 border text-right">
                        {typeof p.transferFee === "number" ? p.transferFee.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1 border text-right">
                        {typeof p.amount === "number" ? p.amount.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1 border">
                        {p.comment || "—"}
                      </td>
                      <td className="px-2 py-1 border text-center">
                        {p.annexLink ? (
                          <a
                            href={p.annexLink}
                            target="_blank"
                            className="underline text-sky-600"
                            rel="noreferrer"
                          >
                            FILE
                          </a>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleAnnex(p.id)}>
                            Создать
                          </Button>
                        )}
                      </td>
                      <td className="px-2 py-1 border text-center space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openEditor(p)}>
                          Ред.
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(p.id)}>
                          Удалить
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Редактор выбранной выплаты */}
            {editing && (
              <div className="mt-4 border rounded-md p-4 bg-white">
                <h3 className="text-lg font-semibold mb-2">Редактор выплаты</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="text-sm">Комиссия перевода, €</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editTransferFee}
                      onChange={e => setEditTransferFee(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm">Комментарий</label>
                    <Input
                      value={editComment}
                      onChange={e => setEditComment(e.target.value)}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2 py-1 border">Номер</th>
                        <th className="px-2 py-1 border">Отель</th>
                        <th className="px-2 py-1 border">Check-in</th>
                        <th className="px-2 py-1 border">Check-out</th>
                        <th className="px-2 py-1 border text-right">Брутто (€)</th>
                        <th className="px-2 py-1 border text-right">Нетто (€)</th>
                        <th className="px-2 py-1 border">Закрыть полностью</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editItems.map((it, idx) => (
                        <tr key={it.bookingId} className="border-t">
                          <td className="px-2 py-1 border">{it.bookingNumber || it.bookingId}</td>
                          <td className="px-2 py-1 border">{it.hotel || "—"}</td>
                          <td className="px-2 py-1 border">{it.checkIn || "—"}</td>
                          <td className="px-2 py-1 border">{it.checkOut || "—"}</td>
                          <td className="px-2 py-1 border text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={String(it.amountGross ?? 0)}
                              onChange={e => setEditItemGross(idx, e.target.value)}
                              className="border rounded px-2 py-1 w-28 text-right"
                            />
                          </td>
                          <td className="px-2 py-1 border text-right">
                            {(it.amountNet ?? 0).toFixed(2)}
                          </td>
                          <td className="px-2 py-1 border text-center">
                            <input
                              type="checkbox"
                              checked={!!it.closeFully}
                              onChange={() => toggleEditItemClose(idx)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 text-sm">
                  <p>
                    Итого БРУТТО: <b>{editTotalGross.toFixed(2)} €</b> · Итого НЕТТО:{" "}
                    <b>{editTotalNet.toFixed(2)} €</b> · Комиссия перевода:{" "}
                    <b>{editTransferFeeNum.toFixed(2)} €</b> · К перечислению:{" "}
                    <b>{editToWire.toFixed(2)} €</b>
                  </p>
                </div>

                <div className="mt-3 space-x-2">
                  <Button onClick={saveEditor} className="bg-green-600 hover:bg-green-700">
                    Сохранить изменения
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(null)}>
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </ManagerLayout>
    </>
  );
}