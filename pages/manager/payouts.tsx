// pages/manager/payouts.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { format, parseISO } from "date-fns";
import {
  getAllBalances,
  getAllPayouts,
  createSimplePayout,
} from "@/lib/finance";

type Booking = {
  id: string;
  bookingNumber: string;
  createdAt: Date;
  hotel: string;
  tourists: number;
  checkIn: string;
  checkOut: string;
  commission: number;
};

export default function ManagerPayoutsPage() {
  const { user, isManager, logout } = useAuth();
  const router = useRouter();

  // ——— shared state ———
  const [agents, setAgents]     = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [payouts, setPayouts]   = useState<any[]>([]);
  const [filters, setFilters]   = useState({
    agentId: "all",
    from: "",
    to: "",
    min: "",
    max: "",
  });

  // ——— for booking-selection payout ———
  const [unpaid, setUnpaid]         = useState<Booking[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [selAgentForBookings, setSelAgentForBookings] = useState<string>("");
  const [creatingByBooking, setCreatingByBooking]     = useState(false);

  // ——— for manual payout form ———
  const [manualForm, setManualForm] = useState({
    agentId: "",
    amount: "",
    comment: "",
  });
  const [manualBalance, setManualBalance] = useState<number|null>(null);
  const [creatingManual, setCreatingManual] = useState(false);

  // guard + load agents, balances & payouts
  useEffect(() => {
    if (!user || !isManager) {
      router.replace("/login");
      return;
    }
    (async () => {
      const [ags, bals, pays] = await Promise.all([
        getDocs(query(collection(db, "users"), where("role","==","agent"))),
        getAllBalances(),
        getAllPayouts(),
      ]);
      setAgents(ags.docs.map(d=>({id:d.id, ...(d.data() as any)})));
      setBalances(bals);
      setPayouts(pays.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    })();
  }, [user, isManager, router]);

  // when selAgentForBookings changes, load that agent’s unpaid
  useEffect(() => {
    if (!selAgentForBookings) {
      setUnpaid([]); setSelected(new Set());
      return;
    }
    (async () => {
      const snap = await getDocs(
        query(
          collection(db,"bookings"),
          where("agentId","==",selAgentForBookings),
          where("status","==","finished"),
          where("commissionPaid","==",false)
        )
      );
      setUnpaid(
        snap.docs.map(d=>{
          const dta = d.data() as any;
          return {
            id: d.id,
            bookingNumber: dta.bookingNumber||d.id,
            createdAt: (dta.createdAt as Timestamp).toDate(),
            hotel: dta.hotel,
            tourists: Array.isArray(dta.tourists)?dta.tourists.length:0,
            checkIn: dta.checkIn,
            checkOut: dta.checkOut,
            commission: dta.commission||0,
          };
        })
      );
      setSelected(new Set());
    })();
  }, [selAgentForBookings]);

  // create by bookings
  const totalByBooking = Array.from(selected).reduce((sum,id)=>{
    const b = unpaid.find(x=>x.id===id);
    return sum + (b?.commission||0);
  },0);
  const handleCreateByBooking = async () => {
    if (!selAgentForBookings || selected.size===0) {
      alert("Выберите агента и хотя бы одну бронь");
      return;
    }
    setCreatingByBooking(true);
    const res = await fetch("/api/create-payout", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        agentId: selAgentForBookings,
        bookings: Array.from(selected),
      })
    });
    if (res.ok) {
      setUnpaid(prev=>prev.filter(b=>!selected.has(b.id)));
      setSelected(new Set());
      // refresh payouts
      const pays = await getAllPayouts();
      setPayouts(pays.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      alert("Выплата создана");
    } else {
      const {error} = await res.json().catch(()=>({error:""}));
      alert(`Ошибка: ${error||res.statusText}`);
    }
    setCreatingByBooking(false);
  };

  // create manual
  const handleManualAgentChange = (id:string) => {
    setManualForm(f=>({ ...f, agentId:id }));
    const ag = balances.find(x=>x.id===id);
    setManualBalance(ag?.balance ?? null);
  };
  const handleCreateManual = async () => {
    if (!manualForm.agentId || !manualForm.amount) return;
    setCreatingManual(true);
    await createSimplePayout(
      manualForm.agentId,
      parseFloat(manualForm.amount),
      manualForm.comment
    );
    setManualForm({agentId:"",amount:"",comment:""});
    setManualBalance(null);
    const pays = await getAllPayouts();
    setPayouts(pays.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    setCreatingManual(false);
  };

  // delete payout
  const handleDelete = async(id:string)=>{
    if(!confirm("Удалить выплату?"))return;
    await deleteDoc(doc(db,"payouts",id));
    const pays = await getAllPayouts();
    setPayouts(pays.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
  };

  // generate annex
  const handleAnnex = async(id:string)=>{
    if(!confirm("Сгенерировать аннекс?")) return;
    const r = await fetch("/api/generate-annex",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({payoutId:id})
    });
    if(r.ok){
      const pays = await getAllPayouts();
      setPayouts(pays.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    } else alert("Ошибка генерации аннекса");
  };

  // filter existing payouts
  const filteredPayouts = payouts.filter(p=>{
    if(filters.agentId!=="all" && p.agentId!==filters.agentId) return false;
    const d = p.createdAt?.toDate?.() ?? null;
    if(filters.from && d<parseISO(filters.from)) return false;
    if(filters.to   && d>parseISO(filters.to))   return false;
    const amt = p.amount||0;
    if(filters.min && amt<+filters.min) return false;
    if(filters.max && amt>+filters.max) return false;
    return true;
  });

  // nav
  const nav = [
    {href:"/manager/bookings", label:"Заявки"},
    {href:"/manager/balances", label:"Балансы"},
    {href:"/manager/payouts",  label:"Выплаты"},
  ];
  const isActive = (h:string)=>router.pathname.startsWith(h);

  return (
    <>
      {/* header */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS CRM</span>
          <nav className="flex gap-4">
            {nav.map(n=>(
              <Link key={n.href} href={n.href}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  isActive(n.href)
                    ? "border-indigo-600 text-black"
                    : "border-transparent text-gray-600 hover:text-black"
                }`}
              >{n.label}</Link>
            ))}
          </nav>
          <Button size="sm" variant="destructive" onClick={logout}>
            Выйти
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto space-y-8 p-6">
        {/* ——— 1. Create payout by selecting bookings ——— */}
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-bold">Выплата по бронированиям</h2>
            <div>
              <label className="block mb-1 text-sm font-medium">
                Агент
              </label>
              <select
                value={selAgentForBookings}
                onChange={e=>setSelAgentForBookings(e.target.value)}
                className="border p-2 rounded w-full sm:w-80"
              >
                <option value="">— выберите агента —</option>
                {agents.map(a=>(
                  <option key={a.id} value={a.id}>
                    {a.agencyName} — {a.agentName}
                  </option>
                ))}
              </select>
            </div>
            {selAgentForBookings && (
              <>
                <h3 className="font-medium">Невыплаченные брони</h3>
                {unpaid.length===0 ? (
                  <p className="text-sm text-gray-600">
                    Для этого агента всё выплачено.
                  </p>
                ):(
                  <table className="w-full border text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="w-8"/>
                        <th>Номер</th><th>Дата</th><th>Отель</th>
                        <th>Туристы</th><th>Check-in</th>
                        <th>Check-out</th><th className="text-right">Комиссия, €</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unpaid.map(b=>(
                        <tr key={b.id} className="border-t hover:bg-gray-50">
                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={selected.has(b.id)}
                              onChange={()=> {
                                const nxt=new Set(selected);
                                nxt.has(b.id)?nxt.delete(b.id):nxt.add(b.id);
                                setSelected(nxt);
                              }}
                            />
                          </td>
                          <td>{b.bookingNumber}</td>
                          <td>{format(b.createdAt,"dd.MM.yyyy")}</td>
                          <td>{b.hotel}</td>
                          <td>{b.tourists}</td>
                          <td>{b.checkIn}</td>
                          <td>{b.checkOut}</td>
                          <td className="text-right">{b.commission.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {selected.size>0 && (
                  <p className="text-sm">
                    Выбрано <strong>{selected.size}</strong> брони. Итого <strong>{totalByBooking.toFixed(2)} €</strong>
                  </p>
                )}
                <Button
                  onClick={handleCreateByBooking}
                  disabled={creatingByBooking||selected.size===0}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {creatingByBooking? "Сохраняем…":"Создать выплату"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ——— 2. Manual payout form ——— */}
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-bold">Ручная выплата</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-sm">Агент</label>
                <Select
                  value={manualForm.agentId}
                  onValueChange={handleManualAgentChange}
                >
                  <SelectTrigger><SelectValue placeholder="Выберите"/></SelectTrigger>
                  <SelectContent>
                    {agents.map(a=>(
                      <SelectItem key={a.id} value={a.id}>
                        {a.agencyName} — {a.agentName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {manualBalance!==null && (
                  <p className="text-sm mt-1 text-neutral-600">
                    Баланс: <strong>{manualBalance.toFixed(2)} €</strong>
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm">Сумма (€)</label>
                <Input
                  type="number" min="0"
                  value={manualForm.amount}
                  onChange={e=>setManualForm(f=>({...f,amount:e.target.value}))}
                />
              </div>
              <div>
                <label className="text-sm">Комментарий</label>
                <Input
                  value={manualForm.comment}
                  onChange={e=>setManualForm(f=>({...f,comment:e.target.value}))}
                />
              </div>
            </div>
            <Button
              onClick={handleCreateManual}
              disabled={creatingManual}
              className="bg-green-600 hover:bg-green-700"
            >
              {creatingManual? "Сохраняем…":"Сделать выплату"}
            </Button>
          </CardContent>
        </Card>

        {/* ——— 3. Existing payouts table ——— */}
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-bold">Все выплаты</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <Select
                value={filters.agentId}
                onValueChange={v=>setFilters(f=>({...f,agentId:v}))}
              >
                <SelectTrigger><SelectValue placeholder="Агент"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все агенты</SelectItem>
                  {agents.map(a=>(
                    <SelectItem key={a.id} value={a.id}>
                      {a.agencyName} — {a.agentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date" value={filters.from}
                onChange={e=>setFilters(f=>({...f,from:e.target.value}))}
              />
              <Input
                type="date" value={filters.to}
                onChange={e=>setFilters(f=>({...f,to:e.target.value}))}
              />
              <Input
                type="number" placeholder="мин €" value={filters.min}
                onChange={e=>setFilters(f=>({...f,min:e.target.value}))}
              />
              <Input
                type="number" placeholder="макс €" value={filters.max}
                onChange={e=>setFilters(f=>({...f,max:e.target.value}))}
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
                {filteredPayouts.map(p=>(
                  <tr key={p.id} className="border-t">
                    <td className="px-2 py-1 border whitespace-nowrap">
                      {p.createdAt?.toDate
                        ? format(p.createdAt.toDate(),"dd.MM.yyyy")
                        :"—"}
                    </td>
                    <td className="px-2 py-1 border">{p.agentName}</td>
                    <td className="px-2 py-1 border text-right">
                      {p.amount?.toFixed(2)||"—"}
                    </td>
                    <td className="px-2 py-1 border">
                      {p.comment||"—"}
                    </td>
                    <td className="px-2 py-1 border text-center">
                      {p.annexLink
                        ? <a href={p.annexLink} target="_blank" className="underline text-sky-600">PDF</a>
                        : <Button size="sm" variant="outline" onClick={()=>handleAnnex(p.id)}>Создать</Button>
                      }
                    </td>
                    <td className="px-2 py-1 border text-center">
                      <Button size="sm" variant="destructive" onClick={()=>handleDelete(p.id)}>
                        Удалить
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}