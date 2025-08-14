// pages/manager/payouts.tsx
"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  collection, query, where, getDocs, getDoc, doc, Timestamp,
} from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { getAllBalances, getAllPayouts } from "@/lib/finance";
import { AGENT_WITHHOLD_PCT, OLIMPIA_WITHHOLD_PCT } from "@/lib/constants/fees";
import dynamic from "next/dynamic";

const ManagerLayout = dynamic(() => import("@/components/layouts/ManagerLayout"), { ssr: false });

/* ───────── helpers ───────── */
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (x: number) => Math.round(x * 100) / 100;
const toISO = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const next25th = (base = new Date()): string => {
  const d = new Date(base);
  d.setMonth(d.getMonth() + 1);
  const target = new Date(d.getFullYear(), d.getMonth(), 25);
  return toISO(target);
};

/* ───────── types ───────── */
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
  commissionIgor?: number;
  commissionEvgeniy?: number;
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
  kind?: "agent";
  mode?: string;
  agentId?: string;
  createdAt?: any;
  amount: number;
  totalGross?: number;
  totalNet?: number;
  transferFee?: number;
  comment?: string;
  annexLink?: string;
  withholdPct?: number;
  items?: PayoutItem[];
  foundersDistribution?: Array<{
    owner: "igor"|"evgeniy";
    amountGross: number;
    amountNet: number;
    taxPlannedDate?: string;
    txNetId?: string;
    txTaxPlanId?: string;
  }>;
};

/* ───────── component ───────── */
export default function ManagerPayoutsPage() {
  const { user, isManager, loading } = useAuth();
  const router = useRouter();

  // справочники
  const [agents, setAgents] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);

  // фильтры
  const [filters, setFilters] = useState({ agentId: "all" });
  const [filterComment, setFilterComment] = useState("");

  // ручная выплата агенту
  const [manualForm, setManualForm] = useState({ agentId: "", amount: "", comment: "" });
  const [transferFee, setTransferFee] = useState<string>("");
  const [manualBalance, setManualBalance] = useState<number | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);

  // невыплаченные по агенту
  const [manualUnpaid, setManualUnpaid] = useState<Booking[]>([]);
  const [manualChecked, setManualChecked] = useState<Set<string>>(new Set());
  const [manualAmountsGross, setManualAmountsGross] = useState<Record<string, string>>({});
  const [manualClose, setManualClose] = useState<Set<string>>(new Set());

  // редактор выплаты (агент)
  const [editing, setEditing] = useState<Payout | null>(null);
  const [editTransferFee, setEditTransferFee] = useState<string>("");
  const [editComment, setEditComment] = useState<string>("");
  const [editItems, setEditItems] = useState<(PayoutItem & {__b?:Booking})[]>([]);

  // модалка распределения учредителям
  const [showFoundersModal, setShowFoundersModal] = useState(false);
  const [fdIgorGross, setFdIgorGross] = useState<string>("");
  const [fdIgorNet, setFdIgorNet] = useState<string>("");
  const [fdIgorDate, setFdIgorDate] = useState<string>(next25th());
  const [fdEvgGross, setFdEvgGross] = useState<string>("");
  const [fdEvgNet, setFdEvgNet] = useState<string>("");
  const [fdEvgDate, setFdEvgDate] = useState<string>(next25th());
  const [savingFD, setSavingFD] = useState(false);

  // удержания
  const [withholdPct, setWithholdPct] = useState<number>(AGENT_WITHHOLD_PCT);
  const toNet = (gross: number) => Math.max(0, Math.round(gross * (1 - withholdPct) * 100) / 100);

  /* ───── охрана ───── */
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (!isManager) { router.replace("/agent/bookings"); return; }
  }, [user, isManager, loading, router]);

  /* ───── загрузка ───── */
  useEffect(() => {
    if (loading) return;
    if (!user || !isManager) return;
    (async () => {
      const agsSnap = await getDocs(query(collection(db, "users"), where("role", "in", ["agent", "olimpya_agent"])));
      const ags = agsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setAgents(ags);

      const [bals, pays] = await Promise.all([getAllBalances(), getAllPayouts()]);
      setBalances(bals as any[]);
      setPayouts(
        (pays as Payout[]).map(p => ({ id: (p as any).id || (p as any).payoutId || "", ...(p as any) }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    })();
  }, [user, isManager, loading]);

  /* ───── ручная выплата ───── */
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

    if (!agentId) { setManualUnpaid([]); return; }
    const snap = await getDocs(
      query(
        collection(db, "bookings"),
        where("agentId", "==", agentId),
        where("status", "in", ["finished", "Завершено"]),
        where("commissionPaid", "==", false)
      )
    );
    setManualUnpaid(
      snap.docs.map(d => {
        const b = d.data() as any;
        const gross = Number(b.commission || 0);
        const paidNet = Number(b.commissionPaidNetAmount ?? b.commissionPaidAmount ?? 0);
        const paidGross = b.commissionPaidGrossAmount != null
          ? Number(b.commissionPaidGrossAmount)
          : paidNet > 0 ? Math.round((paidNet / (1 - withholdPct)) * 100) / 100 : 0;
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
          commissionIgor: Number(b.commissionIgor || 0),
          commissionEvgeniy: Number(b.commissionEvgeniy || 0),
        } as Booking;
      })
    );
  };

  const remainingGross = (b: Booking) =>
    Math.max(0, (b.commissionGross || 0) - (b.commissionPaidGrossAmount || 0));

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
  const setGrossFor = (id: string, val: string) => setManualAmountsGross(m => ({ ...m, [id]: val }));

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

  const handleCreateManual = async () => {
    if (!manualForm.agentId) return;
    setCreatingManual(true);

    // по броням
    if (manualChecked.size > 0) {
      const items: { bookingId: string; amountGross: number; closeFully?: boolean }[] =
        Array.from(manualChecked)
          .map(id => {
            const b = manualUnpaid.find(x => x.id === id)!;
            const remG = remainingGross(b);
            const payG = Math.min(remG, parseFloat(manualAmountsGross[id] || "0"));
            if (!(payG > 0)) return null;
            return manualClose.has(id)
              ? { bookingId: id, amountGross: r2(payG), closeFully: true }
              : { bookingId: id, amountGross: r2(payG) };
          })
          .filter(Boolean) as any[];

      const res = await fetch("/api/create-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "byBookings",
          agentId: manualForm.agentId,
          items,
          withholdPct: withholdPct,
          transferFee: transferFeeNum,
          comment: manualForm.comment,
        }),
      });

      if (res.ok) {
        const pays = await getAllPayouts();
        setPayouts((pays as Payout[]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
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

    // свободная
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
        withholdPct: withholdPct,
        transferFee: transferFeeNum,
        comment: manualForm.comment,
      }),
    });

    if (res.ok) {
      setManualForm({ agentId: manualForm.agentId, amount: "", comment: manualForm.comment });
      setTransferFee("");
      const pays = await getAllPayouts();
      setPayouts((pays as Payout[]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      alert("Свободная выплата создана");
    } else {
      const { error } = await res.json().catch(() => ({ error: "" }));
      alert(`Ошибка: ${error || res.statusText}`);
    }
    setCreatingManual(false);
  };

  /* ───── список выплат ───── */
  const filteredPayouts = payouts.filter(p => {
    if (filters.agentId !== "all" && p.agentId !== filters.agentId) return false;
    if (filterComment && !(p.comment || "").toLowerCase().includes(filterComment.toLowerCase())) return false;
    return true;
  });

  /* ───── редактор выплаты ───── */
  const openEditor = async (p: Payout) => {
    setEditing(p);
    setEditTransferFee(p.transferFee != null ? String(p.transferFee) : "");
    setEditComment(p.comment || "");

    // установить удержание для расчёта НЕТТО в модалке
    const agMeta = agents.find(a => a.id === p.agentId);
    const role = agMeta?.role || "agent";
    setWithholdPct(
      typeof p.withholdPct === "number"
        ? p.withholdPct
        : role === "olimpya_agent"
          ? OLIMPIA_WITHHOLD_PCT
          : AGENT_WITHHOLD_PCT
    );

    // подтянем метаданные по броням
    const baseItems = (p.items || []);
    const ids = Array.from(new Set(baseItems.map(i => i.bookingId)));
    const metaById: Record<string, Booking> = {};

    await Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(db, "bookings", id));
        if (snap.exists()) {
          const b = snap.data() as any;
          metaById[id] = {
            id,
            bookingNumber: b.bookingNumber || id,
            createdAt: (b.createdAt as Timestamp)?.toDate?.() || new Date(),
            hotel: b.hotel || "—",
            tourists: Array.isArray(b.tourists) ? b.tourists.length : 0,
            checkIn: b.checkIn || "—",
            checkOut: b.checkOut || "—",
            commissionGross: Number(b.commission || 0),
            commissionNet: 0,
            commissionPaidGrossAmount: Number(b.commissionPaidGrossAmount || 0),
            commissionPaidNetAmount: Number(b.commissionPaidNetAmount || 0),
            commissionIgor: Number(b.commissionIgor || 0),
            commissionEvgeniy: Number(b.commissionEvgeniy || 0),
          };
        }
      })
    );

    setEditItems(
      baseItems.map(it => ({
        ...it,
        __b: metaById[it.bookingId],
      }))
    );

    // заполнить модалку, если уже есть распределение
    const fd = p.foundersDistribution || [];
    const ig = fd.find(x => x.owner === "igor");
    const ev = fd.find(x => x.owner === "evgeniy");
    setFdIgorGross(ig ? String(ig.amountGross) : "");
    setFdIgorNet(ig ? String(ig.amountNet) : "");
    setFdIgorDate(ig?.taxPlannedDate || next25th());
    setFdEvgGross(ev ? String(ev.amountGross) : "");
    setFdEvgNet(ev ? String(ev.amountNet) : "");
    setFdEvgDate(ev?.taxPlannedDate || next25th());
  };

  const editTotalGross = useMemo(
    () => Math.round(editItems.reduce((s, it) => s + (Number(it.amountGross) || 0), 0) * 100) / 100,
    [editItems]
  );

  // База модалки: что надо распределить
  const modalBaseGross = editTotalGross;
  const modalBaseNet = useMemo(() => r2(Math.max(0, modalBaseGross * (1 - withholdPct))), [modalBaseGross, withholdPct]);

  // Суммы, введённые в модалке
  const fdGrossSum = useMemo(
    () => r2(num(fdIgorGross) + num(fdEvgGross)),
    [fdIgorGross, fdEvgGross]
  );
  const fdNetSum = useMemo(
    () => r2(num(fdIgorNet || fdIgorGross) + num(fdEvgNet || fdEvgGross)),
    [fdIgorGross, fdIgorNet, fdEvgGross, fdEvgNet]
  );

  // Остатки (могут быть отрицательные => перераспределили больше базы)
  const fdGrossLeft = useMemo(() => r2(modalBaseGross - fdGrossSum), [modalBaseGross, fdGrossSum]);
  const fdNetLeft   = useMemo(() => r2(modalBaseNet   - fdNetSum),   [modalBaseNet,   fdNetSum]);

  // при первом открытии модалки — если поля пустые, заполним 50/50 от базы
  useEffect(() => {
    if (!showFoundersModal) return;
    const bothGrossEmpty = !fdIgorGross && !fdEvgGross;
    const bothNetEmpty   = !fdIgorNet && !fdEvgNet;
    if (bothGrossEmpty) {
      const gHalf = r2(modalBaseGross / 2);
      setFdIgorGross(String(gHalf));
      setFdEvgGross(String(r2(modalBaseGross - gHalf))); // на всякий случай добьём до базы
    }
    if (bothNetEmpty) {
      const nHalf = r2(modalBaseNet / 2);
      setFdIgorNet(String(nHalf));
      setFdEvgNet(String(r2(modalBaseNet - nHalf)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFoundersModal]);

  // Быстрые действия в модалке
  const split5050 = () => {
    const gHalf = r2(modalBaseGross / 2);
    const nHalf = r2(modalBaseNet / 2);
    setFdIgorGross(String(gHalf)); setFdEvgGross(String(r2(modalBaseGross - gHalf)));
    setFdIgorNet(String(nHalf));   setFdEvgNet(String(r2(modalBaseNet - nHalf)));
  };
  const netEqualsGross = () => {
    setFdIgorNet(fdIgorGross || "0");
    setFdEvgNet(fdEvgGross || "0");
  };
  const fillRemainderTo = (who: "igor"|"evgeniy") => {
    if (who === "igor") {
      setFdIgorGross(String(r2(num(fdIgorGross) + fdGrossLeft)));
      setFdIgorNet(String(r2(num(fdIgorNet || fdIgorGross) + fdNetLeft)));
    } else {
      setFdEvgGross(String(r2(num(fdEvgGross) + fdGrossLeft)));
      setFdEvgNet(String(r2(num(fdEvgNet || fdEvgGross) + fdNetLeft)));
    }
  };

  const setEditItemGross = (idx: number, val: string) => {
    const v = parseFloat(val || "0") || 0;
    setEditItems(items =>
      items.map((it, i) => i === idx ? { ...it, amountGross: v, amountNet: v } : it)
    );
  };
  const toggleEditItemClose = (idx: number) => {
    setEditItems(items => items.map((it, i) => (i === idx ? { ...it, closeFully: !it.closeFully } : it)));
  };

  const saveEditor = async () => {
    if (!editing) return;
    const payload = {
      payoutId: editing.id,
      transferFee: parseFloat(editTransferFee || "0") || 0,
      comment: editComment,
      items: editItems.map(it => ({
        bookingId: it.bookingId,
        amountGross: r2(num(it.amountGross)),
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
    setEditing(null);
    const pays = await getAllPayouts();
    setPayouts((pays as Payout[]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  };

  /* ───── авто-подбор распределения по броням ───── */
  const suggestFoundersSplit = () => {
    let ig = 0, ev = 0;
    for (const it of editItems) {
      const g = num(it.amountGross);
      const b = it.__b;
      if (!b || g <= 0) continue;
      const baseG = num(b.commissionGross);
      const factor = baseG > 0 ? Math.min(1, g / baseG) : 1;
      const bi = num(b.commissionIgor);
      const be = num(b.commissionEvgeniy);
      if (bi + be > 0) {
        ig += r2(bi * factor);
        ev += r2(be * factor);
      } else {
        ig += r2(g * 0.5);
        ev += r2(g * 0.5);
      }
    }
    setFdIgorGross(String(r2(ig)));
    setFdEvgGross(String(r2(ev)));
    // по умолчанию нетто = брутто
    setFdIgorNet(String(r2(ig)));
    setFdEvgNet(String(r2(ev)));
    setFdIgorDate(next25th());
    setFdEvgDate(next25th());
    setShowFoundersModal(true);
  };

  const saveFounders = async () => {
    if (!editing) return;
    setSavingFD(true);
    const payload = {
      payoutId: editing.id,
      foundersDistribution: [
        { owner: "igor",    amountGross: r2(num(fdIgorGross)), amountNet: r2(num(fdIgorNet || fdIgorGross)), taxPlannedDate: fdIgorDate || next25th() },
        { owner: "evgeniy", amountGross: r2(num(fdEvgGross)),  amountNet: r2(num(fdEvgNet || fdEvgGross)),  taxPlannedDate: fdEvgDate  || next25th() },
      ],
      comment: editComment,
    };
    const r = await fetch("/api/update-payout", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload),
    });
    setSavingFD(false);
    if (!r.ok) {
      const { error } = await r.json().catch(()=>({error:""}));
      alert(`Ошибка сохранения распределения: ${error || r.statusText}`);
      return;
    }
    setShowFoundersModal(false);
    const pays = await getAllPayouts();
    setPayouts((pays as Payout[]).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  };

  /* ───── UI ───── */
  return (
    <>
      <Head><title>Выплаты агентам — CrocusCRM</title></Head>
      <ManagerLayout fullWidthHeader fullWidthMain>

        {/* Ручная выплата */}
        <Card>
          <div className="p-4 space-y-4">
            <h2 className="text-xl font-bold">Ручная выплата</h2>
            <p className="text-sm text-neutral-600">
              Суммы — <b>БРУТТО</b>. Удержание применяется автоматически к нетто.
              Налог (брутто−нетто) планируется на <b>25-е</b> следующего месяца.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-sm">Агент</label>
                <Select value={manualForm.agentId} onValueChange={handleManualAgentChange}>
                  <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
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
                <Input type="number" min="0" placeholder="Если не выбираете брони"
                  value={manualForm.amount} onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}/>
              </div>
              <div>
                <label className="text-sm">Комиссия перевода, €</label>
                <Input type="number" min="0" step="0.01"
                  value={transferFee} onChange={e => setTransferFee(e.target.value)} />
              </div>
              <div>
                <label className="text-sm">Комментарий</label>
                <Input value={manualForm.comment} onChange={e => setManualForm(f => ({ ...f, comment: e.target.value }))}/>
              </div>
            </div>

            {manualForm.agentId && (
              <>
                <h3 className="font-medium">Невыплаченные брони</h3>
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
                                <input type="checkbox" checked={checked} onChange={() => toggleManualCheck(b.id)} />
                              </td>
                              <td>{b.bookingNumber}</td>
                              <td>{format(b.createdAt, "dd.MM.yyyy")}</td>
                              <td>{b.hotel}</td>
                              <td>{b.tourists}</td>
                              <td>{b.checkIn}</td>
                              <td>{b.checkOut}</td>
                              <td className="text-right">{remG.toFixed(2)}</td>
                              <td className="text-right">
                                <input type="number" min="0" step="0.01" disabled={!checked}
                                  value={val} onChange={e => setGrossFor(b.id, e.target.value)}
                                  className="border rounded px-2 py-1 w-28 text-right" />
                              </td>
                              <td className="text-center">
                                <input type="checkbox" checked={closed} disabled={!checked}
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
                        Выбрано <strong>{manualChecked.size}</strong> броней. Итого БРУТТО <strong>{manualTotalGross.toFixed(2)} €</strong>. Итого НЕТТО <strong>{toNet(manualTotalGross).toFixed(2)} €</strong>. Комиссия перевода: <strong>{(parseFloat(transferFee||"0")||0).toFixed(2)} €</strong>. К перечислению: <strong>{(Math.max(0, toNet(manualTotalGross)-(parseFloat(transferFee||"0")||0))).toFixed(2)} €</strong>
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            <Button onClick={handleCreateManual} disabled={creatingManual || !manualForm.agentId}
              className="bg-green-600 hover:bg-green-700">
              {creatingManual ? "Сохраняем…" : "Сделать выплату"}
            </Button>
          </div>
        </Card>

        {/* Все выплаты */}
        <Card>
          <div className="p-4 space-y-4">
            <h2 className="text-xl font-bold">Все выплаты</h2>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <Select value={filters.agentId} onValueChange={v => setFilters({ agentId: v })}>
                <SelectTrigger><SelectValue placeholder="Агент" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все агенты</SelectItem>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.agencyName} — {a.agentName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Комментарий содержит…" value={filterComment} onChange={e => setFilterComment(e.target.value)} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-1 border">Дата</th>
                    <th className="px-2 py-1 border">Агент</th>
                    <th className="px-2 py-1 border text-right">Брутто (€)</th>
                    <th className="px-2 py-1 border text-right">Нетто (€)</th>
                    <th className="px-2 py-1 border text-right">Комиссия перевода (€)</th>
                    <th className="px-2 py-1 border text-right">К перечислению (€)</th>
                    <th className="px-2 py-1 border">Anexa</th>
                    <th className="px-2 py-1 border">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayouts
                    .filter(p => !filterComment || (p.comment || "").toLowerCase().includes(filterComment.toLowerCase()))
                    .map((p) => (
                    <tr key={p.id} className="border-t align-top">
                      <td className="px-2 py-1 border whitespace-nowrap">
                        {p.createdAt?.toDate ? format(p.createdAt.toDate(), "dd.MM.yyyy") : "—"}
                      </td>
                      <td className="px-2 py-1 border">
                        {(() => {
                          const ag = agents.find(a => a.id === p.agentId);
                          return ag ? `${ag.agencyName} — ${ag.agentName}` : "—";
                        })()}
                      </td>
                      <td className="px-2 py-1 border text-right">{typeof p.totalGross === "number" ? p.totalGross.toFixed(2) : "—"}</td>
                      <td className="px-2 py-1 border text-right">{typeof p.totalNet === "number" ? p.totalNet.toFixed(2) : "—"}</td>
                      <td className="px-2 py-1 border text-right">{typeof p.transferFee === "number" ? p.transferFee.toFixed(2) : "—"}</td>
                      <td className="px-2 py-1 border text-right">{typeof p.amount === "number" ? p.amount.toFixed(2) : "—"}</td>
                      <td className="px-2 py-1 border text-center">
                        {p.annexLink ? (
                          <a href={p.annexLink} target="_blank" className="underline text-sky-600" rel="noreferrer">FILE</a>
                        ) : (
                          <Button size="sm" variant="outline" onClick={async () => {
                            if (!confirm("Сгенерировать Anexa (брутто)?")) return;
                            const r = await fetch("/api/generate-annex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payoutId: p.id }) });
                            if (!r.ok) alert("Ошибка генерации Anexa");
                            else {
                              const pays = await getAllPayouts();
                              setPayouts((pays as Payout[]).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
                            }
                          }}>
                            Создать
                          </Button>
                        )}
                      </td>
                      <td className="px-2 py-1 border text-center space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openEditor(p)}>Ред.</Button>
                        <Button size="sm" variant="destructive" onClick={async () => {
                          if (!confirm("Удалить выплату полностью?\nОткатим отметки в бронях, удалим Anexa и связанные файлы.")) return;
                          const r = await fetch("/api/delete-payout-deep", {
                            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payoutId: p.id }),
                          });
                          if (!r.ok) {
                            const { error } = await r.json().catch(()=>({error:""}));
                            alert(`Ошибка удаления: ${error || r.statusText}`);
                          } else {
                            const pays = await getAllPayouts();
                            setPayouts((pays as Payout[]).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
                          }
                        }}>
                          Удалить
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Редактор выплаты */}
            {editing && (
              <div className="mt-4 border rounded-md p-4 bg-white">
                <h3 className="text-lg font-semibold mb-2">Редактор выплаты</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="text-sm">Комиссия перевода, €</label>
                    <Input type="number" min="0" step="0.01" value={editTransferFee} onChange={e => setEditTransferFee(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm">Комментарий</label>
                    <Input value={editComment} onChange={e => setEditComment(e.target.value)} />
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
                          <td className="px-2 py-1 border">{it.hotel || it.__b?.hotel || "—"}</td>
                          <td className="px-2 py-1 border">{it.checkIn || it.__b?.checkIn || "—"}</td>
                          <td className="px-2 py-1 border">{it.checkOut || it.__b?.checkOut || "—"}</td>
                          <td className="px-2 py-1 border text-right">
                            <input type="number" min="0" step="0.01" value={String(it.amountGross ?? 0)}
                              onChange={e => setEditItemGross(idx, e.target.value)}
                              className="border rounded px-2 py-1 w-28 text-right" />
                          </td>
                          <td className="px-2 py-1 border text-right">{(it.amountNet ?? it.amountGross ?? 0).toFixed(2)}</td>
                          <td className="px-2 py-1 border text-center">
                            <input type="checkbox" checked={!!it.closeFully} onChange={() => toggleEditItemClose(idx)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-2 py-1 border text-right" colSpan={4}>Итого БРУТТО к распределению:</td>
                        <td className="px-2 py-1 border text-right">{modalBaseGross.toFixed(2)}</td>
                        <td className="px-2 py-1 border" colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button onClick={saveEditor} className="bg-green-600 hover:bg-green-700">Сохранить</Button>

                  {/* Кнопка модалки распределения */}
                  <Button variant="outline" onClick={() => setShowFoundersModal(true)}>
                    Распределение учредителям
                  </Button>
                  <Button variant="outline" onClick={suggestFoundersSplit}>
                    Автоподбор распределения
                  </Button>

                  <Button variant="outline" onClick={() => setEditing(null)}>Закрыть</Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* МОДАЛКА: Распределение учредителям */}
        {showFoundersModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={()=>setShowFoundersModal(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-[min(920px,92vw)] p-5">
              <h3 className="text-lg font-semibold mb-2">Распределение учредителям</h3>
              <p className="text-sm text-neutral-600">
                На день сохранения создадим <b>actual</b> расход (нетто) по каждому учредителю. Разницу <i>(брутто−нетто)</i> создадим как <b>planned</b> налог на указанную дату (по умолчанию — 25-е следующего месяца).
              </p>

              {/* Сквозные суммы */}
              <div className="mt-3 grid sm:grid-cols-4 gap-2 text-sm">
                <div className="p-2 rounded bg-neutral-50 border">
                  <div className="text-neutral-500">К распределению БРУТТО</div>
                  <div className="font-semibold">{modalBaseGross.toFixed(2)} €</div>
                </div>
                <div className="p-2 rounded bg-neutral-50 border">
                  <div className="text-neutral-500">К распределению НЕТТО</div>
                  <div className="font-semibold">{modalBaseNet.toFixed(2)} €</div>
                </div>
                <div className="p-2 rounded bg-neutral-50 border">
                  <div className="text-neutral-500">Распределено БРУТТО</div>
                  <div className="font-semibold">{fdGrossSum.toFixed(2)} €</div>
                </div>
                <div className="p-2 rounded bg-neutral-50 border">
                  <div className="text-neutral-500">Распределено НЕТТО</div>
                  <div className="font-semibold">{fdNetSum.toFixed(2)} €</div>
                </div>
              </div>

              <div className="mt-2 grid sm:grid-cols-2 gap-2 text-sm">
                <div className={`p-2 rounded border ${fdGrossLeft < 0 ? "bg-red-50 border-red-300 text-red-700" : fdGrossLeft > 0 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-emerald-50 border-emerald-300 text-emerald-700"}`}>
                  Осталось/перераспределено БРУТТО: <b>{fdGrossLeft.toFixed(2)} €</b>
                </div>
                <div className={`p-2 rounded border ${fdNetLeft < 0 ? "bg-red-50 border-red-300 text-red-700" : fdNetLeft > 0 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-emerald-50 border-emerald-300 text-emerald-700"}`}>
                  Осталось/перераспределено НЕТТО: <b>{fdNetLeft.toFixed(2)} €</b>
                </div>
              </div>

              {/* Быстрые действия */}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={split5050}>50/50 от базы</Button>
                <Button size="sm" variant="outline" onClick={netEqualsGross}>Нетто = Брутто</Button>
                <Button size="sm" variant="outline" onClick={() => fillRemainderTo("igor")}>Остаток → Игорю</Button>
                <Button size="sm" variant="outline" onClick={() => fillRemainderTo("evgeniy")}>Остаток → Евгению</Button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-1 border">Учредитель</th>
                      <th className="px-2 py-1 border text-right">Брутто (€)</th>
                      <th className="px-2 py-1 border text-right">Нетто (€)</th>
                      <th className="px-2 py-1 border">Дата налога (план)</th>
                      <th className="px-2 py-1 border text-right">Налог (расчёт)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key:"igor", label:"Игорь", g: fdIgorGross, n: fdIgorNet, d: fdIgorDate,
                        setG:setFdIgorGross, setN:setFdIgorNet, setD:setFdIgorDate },
                      { key:"evg",  label:"Евгений", g: fdEvgGross, n: fdEvgNet, d: fdEvgDate,
                        setG:setFdEvgGross,  setN:setFdEvgNet,  setD:setFdEvgDate  },
                    ].map(row=>{
                      const gross = r2(num(row.g));
                      const net   = r2(num(row.n || row.g));
                      const tax   = r2(Math.max(0, gross - net));
                      return (
                        <tr key={row.key} className="border-t">
                          <td className="px-2 py-1 border">{row.label}</td>
                          <td className="px-2 py-1 border text-right">
                            <Input type="number" step="0.01" className="text-right" value={row.g}
                                   onChange={e=>row.setG(e.target.value)} />
                          </td>
                          <td className="px-2 py-1 border text-right">
                            <Input type="number" step="0.01" className="text-right" value={row.n}
                                   onChange={e=>row.setN(e.target.value)} />
                          </td>
                          <td className="px-2 py-1 border">
                            <Input type="date" value={row.d} onChange={e=>row.setD(e.target.value)} />
                          </td>
                          <td className="px-2 py-1 border text-right">{tax.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-2 py-1 border text-right">Итого:</td>
                      <td className="px-2 py-1 border text-right">{fdGrossSum.toFixed(2)}</td>
                      <td className="px-2 py-1 border text-right">{fdNetSum.toFixed(2)}</td>
                      <td className="px-2 py-1 border" />
                      <td className="px-2 py-1 border text-right">
                        {(r2(Math.max(0, num(fdIgorGross)-num(fdIgorNet||fdIgorGross)) + Math.max(0, num(fdEvgGross)-num(fdEvgNet||fdEvgGross)))).toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 border text-right">Нераспределено:</td>
                      <td className={`px-2 py-1 border text-right ${fdGrossLeft !== 0 ? "text-amber-700" : ""}`}>{fdGrossLeft.toFixed(2)}</td>
                      <td className={`px-2 py-1 border text-right ${fdNetLeft !== 0 ? "text-amber-700" : ""}`}>{fdNetLeft.toFixed(2)}</td>
                      <td className="px-2 py-1 border" />
                      <td className="px-2 py-1 border" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="outline" onClick={()=>setShowFoundersModal(false)}>Отмена</Button>
                <Button onClick={saveFounders} disabled={savingFD} className="bg-green-600 hover:bg-green-700">
                  {savingFD ? "Сохраняем…" : "Сохранить распределение"}
                </Button>
              </div>
            </div>
          </div>
        )}

      </ManagerLayout>
    </>
  );
}