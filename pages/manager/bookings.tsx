/* pages/manager/bookings.tsx */
"use client";

import { useEffect, useState, useRef } from "react";
import Link               from "next/link";
import { useRouter }       from "next/router";
import {
  collection,
  query,
  onSnapshot,
  deleteDoc,
  doc,
}                         from "firebase/firestore";
import { format }         from "date-fns";

import { db }             from "@/firebaseConfig";
import { useAuth }        from "@/context/AuthContext";
import { Button }         from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input }          from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue,
  SelectContent, SelectItem,
}                         from "@/components/ui/select";
import { Badge }          from "@/components/ui/badge";
import { DownloadTableExcel } from "react-export-table-to-excel";
import type { Booking }   from "@/lib/types";
import LinkTelegramButton from "@/components/LinkTelegramButton";

/* ---------- константы ---------- */
const statusOptions = [
  { value: "all",            label: "Все" },
  { value: "Новая",          label: "Новая" },
  { value: "Ожидание оплаты",label: "Ожидание оплаты" },
  { value: "Оплачено туристом",label: "Оплачено туристом" },
  { value: "Ожидает confirm",label: "Ожидает confirm" },
  { value: "Подтверждено",   label: "Подтверждено" },
  { value: "Завершено",      label: "Завершено" },
  { value: "Отменен",        label: "Отменен" },
];

const statusColors: Record<string,string> = {
  "Новая":              "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-yellow-50  text-yellow-800  ring-1 ring-inset ring-yellow-600/20  rounded-sm",
  "Ожидание оплаты":    "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-orange-50  text-orange-700  ring-1 ring-inset ring-orange-600/20 rounded-sm",
  "Оплачено туристом":  "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-blue-50    text-blue-700    ring-1 ring-inset ring-blue-700/10    rounded-sm",
  "Ожидает confirm":    "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-700/10 rounded-sm",
  "Подтверждено":       "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-green-50  text-green-700   ring-1 ring-inset ring-green-600/20  rounded-sm",
  "Завершено":          "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-green-700 text-white       ring-1 ring-inset ring-green-800/30  rounded-sm",
  "Отменен":            "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-red-50    text-red-700    ring-1 ring-inset ring-red-600/10    rounded-sm",
};

/* ------------------------------------------------------------------ */
export default function ManagerBookings() {
  const router                     = useRouter();
  const { user, isManager, logout} = useAuth();

  const [bookings, setBookings]    = useState<Booking[]>([]);
  const [filters,  setFilters]     = useState({ operator:"", hotel:"", status:"all" });
  const tableRef                   = useRef<HTMLTableElement|null>(null);

  /* ---------- guards + подписка ---------- */
  useEffect(() => {
    if (!user)        { router.push("/login");         return; }
    if (!isManager)   { router.push("/agent/bookings");return; }

    const q   = query(collection(db,"bookings"));
    const off = onSnapshot(q, snap => {
      const arr = snap.docs.map(d => ({ id:d.id, ...(d.data() as Booking) }));
      arr.sort((a,b) => (b.bookingNumber||"").localeCompare(a.bookingNumber||""));
      setBookings(arr);
    });
    return () => off();
  }, [user, isManager]);

  /* ---------- фильтрация ---------- */
  const filtered = bookings.filter(b =>
    (b.operator||"").toLowerCase().includes(filters.operator.toLowerCase()) &&
    (b.hotel   ||"").toLowerCase().includes(filters.hotel.toLowerCase())   &&
    (filters.status==="all" || b.status===filters.status)
  );

  /* ---------- суммы ---------- */
  const totalBrutto     = filtered.reduce((s,b)=>s+(b.bruttoClient ||0),0);
  const totalCommission = filtered.reduce((s,b)=>s+(b.commission   ||0),0);
  const totalCrocus     = filtered.reduce((s,b)=>s+
      (b.bruttoClient||0)-(b.internalNet||0)-(b.commission||0)-
      ((b.commission||0)/0.9-(b.commission||0))-(b.bankFeeAmount||0),0);

  /* ---------- delete ---------- */
  const delBooking = async (id:string,num:string) => {
    if (!confirm(`Удалить заявку ${num}?`)) return;
    await deleteDoc(doc(db,"bookings",id));
  };

  /* ---------- helpers ---------- */
  const smallInp = "h-8 px-1 text-sm";
  const nav = [
    { href:"/manager/bookings", label:"Заявки" },
    { href:"/manager/balances", label:"Балансы"},
    { href:"/manager/payouts",  label:"Выплаты"},
  ];
  const isActive = (h:string)=>router.pathname.startsWith(h);

  /* ======================== JSX ======================== */
  return (
    <>
      {/* ---------- header ---------- */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>
          <nav className="flex gap-4">
            {nav.map(n=>(
              <Link key={n.href} href={n.href}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  isActive(n.href)? "border-indigo-600 text-black"
                                   : "border-transparent text-gray-600 hover:text-black"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
      <LinkTelegramButton />      {/* ← КНОПКА */}
      <Button size="sm" variant="destructive" onClick={logout}>Выйти</Button>
    </div>
  
        </div>
      </header>

      {/* ---------- card ---------- */}
      <Card className="w-full mx-auto mt-6">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Заявки менеджера</h1>
            <DownloadTableExcel
              filename="manager_bookings"
              sheet="Заявки"
              currentTableRef={tableRef.current}>
              <Button className="bg-green-600 hover:bg-green-700 text-white">
                Экспорт в Excel
              </Button>
            </DownloadTableExcel>
          </div>

          {/* ---------- table ---------- */}
          <div className="overflow-x-auto">
            <table ref={tableRef} className="min-w-[1400px] w-full border text-sm">
              {/* ===== head ===== */}
              <thead className="bg-gray-100 text-center">
                <tr>
                  <th className="px-2 py-1 border">Дата</th>
                  <th className="px-2 py-1 border">№</th>
                  <th className="px-2 py-1 border">Агент</th>
                  <th className="px-2 py-1 border">Оператор</th>
                  <th className="px-2 py-1 border">Отель</th>
                  <th className="px-2 py-1 border">Заезд</th>
                  <th className="px-2 py-1 border">Выезд</th>
                  <th className="px-2 py-1 border w-40">Клиент (€)</th>
                  <th className="px-2 py-1 border w-40">Комиссия (€)</th>
                  <th className="px-2 py-1 border w-40">Крокус (€)</th>
                  <th className="px-2 py-1 border">Статус</th>
                  <th className="px-2 py-1 border">Инвойс</th>
                  <th className="px-2 py-1 border">Ваучеры</th>{/* NEW */}
                  <th className="px-2 py-1 border">Комментарий</th>
                </tr>

                {/* ----- фильтры ----- */}
                <tr className="bg-white border-b text-center">
                  <td></td><td></td><td></td>
                  <td><Input className={smallInp}
                             value={filters.operator}
                             onChange={e=>setFilters({...filters,operator:e.target.value})}
                             placeholder="Фильтр"/></td>
                  <td><Input className={smallInp}
                             value={filters.hotel}
                             onChange={e=>setFilters({...filters,hotel:e.target.value})}
                             placeholder="Фильтр"/></td>
                  <td></td><td></td><td></td><td></td><td></td>
                  <td>
                    <Select value={filters.status}
                            onValueChange={v=>setFilters({...filters,status:v})}>
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue placeholder="Статус"/>
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map(o=>(
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td></td><td></td><td></td>
                </tr>
              </thead>

              {/* ===== body ===== */}
              <tbody>
                {filtered.map(b=>{
                  const created = b.createdAt?.toDate?.()
                    ? format(b.createdAt.toDate(),"dd.MM.yyyy") : "-";
                  const crocusProfit = (
                    (b.bruttoClient||0)-(b.internalNet||0)-(b.commission||0)-
                    ((b.commission||0)/0.9-(b.commission||0))-(b.bankFeeAmount||0)
                  ).toFixed(2);

                  return (
                    <tr key={b.id} className="border-t hover:bg-gray-50 text-center">
                      <td className="px-2 py-1 border whitespace-nowrap">{created}</td>
                      <td className="px-2 py-1 border whitespace-nowrap">{b.bookingNumber||"—"}</td>
                      <td className="px-2 py-1 border truncate max-w-[160px]">
                        {b.agentName||"—"} ({b.agentAgency||"—"})
                      </td>
                      <td className="px-2 py-1 border truncate max-w-[120px]">{b.operator}</td>
                      <td className="px-2 py-1 border truncate max-w-[160px]">{b.hotel}</td>
                      <td className="px-2 py-1 border whitespace-nowrap">
                        {b.checkIn ? format(new Date(b.checkIn),"dd.MM.yyyy") : "-"}
                      </td>
                      <td className="px-2 py-1 border whitespace-nowrap">
                        {b.checkOut? format(new Date(b.checkOut),"dd.MM.yyyy") : "-"}
                      </td>
                      <td className="px-2 py-1 border w-40 text-right">
                        {(b.bruttoClient||0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 border w-40 text-right">
                        {(b.commission||0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 border w-40 text-right">{crocusProfit}</td>

                      {/* статус */}
                      <td className="px-2 py-1 border">
                        <Badge className={statusColors[b.status]||"bg-gray-100 text-gray-800"}>
                          {statusOptions.find(s=>s.value===b.status)?.label||b.status||"—"}
                        </Badge>
                      </td>

                      {/* инвойс */}
                      <td className="px-2 py-1 border">
                        {b.invoiceLink
                          ? <a href={b.invoiceLink} target="_blank" rel="noreferrer"
                               className="text-indigo-600 hover:underline">Открыть</a>
                          : "—"}
                      </td>

                      {/* ваучеры */}
                      <td className="px-2 py-1 border min-w-[120px]">
                        {Array.isArray(b.voucherLinks)&&b.voucherLinks.length
                          ? b.voucherLinks.map((l,i)=>(
                              <div key={i}>
                                <a href={l} target="_blank" rel="noreferrer"
                                   className="text-sky-600 hover:underline">
                                  Ваучер&nbsp;{i+1}
                                </a>
                              </div>
                            ))
                          : "—"}
                      </td>

                      {/* действия */}
                      <td className="px-2 py-1 border">
                        <div className="flex gap-2 justify-center">
                          <button
                            title="Редактировать"
                            className="text-xl hover:scale-110 transition"
                            onClick={()=>router.push(`/manager/${b.id}`)}>
                            ✏️
                          </button>
                          <button
                            title="Удалить"
                            className="text-xl hover:scale-110 transition"
                            onClick={()=>delBooking(b.id,b.bookingNumber||"—")}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* ===== footer ===== */}
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td colSpan={7} className="px-2 py-2 text-right">Итого:</td>
                  <td className="px-2 py-2 text-right">{totalBrutto.toFixed(2)} €</td>
                  <td className="px-2 py-2 text-right">{totalCommission.toFixed(2)} €</td>
                  <td className="px-2 py-2 text-right">{totalCrocus.toFixed(2)} €</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}