/* pages/agent/bookings.tsx */
"use client";

import { useEffect, useState, useRef } from "react";
import Link         from "next/link";
import { useRouter } from "next/router";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { format }    from "date-fns";

import { db }        from "@/firebaseConfig";
import { useAuth }   from "@/context/AuthContext";
import { Button }    from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input }     from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
}                    from "@/components/ui/select";
import { Badge }     from "@/components/ui/badge";
import LinkTelegramButton from "@/components/LinkTelegramButton";

/* ---------- цвета статусов ---------- */
const statusColors: Record<string,string> = {
  "Новая":             "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-yellow-50  text-yellow-800  ring-1 ring-inset ring-yellow-600/20  rounded-sm",
  "Ожидание оплаты":   "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20  rounded-sm",
  "Оплачено туристом": "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-blue-50   text-blue-700   ring-1 ring-inset ring-blue-700/10    rounded-sm",
  "Ожидает confirm":   "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-700/10 rounded-sm",
  "Подтверждено":      "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-green-50 text-green-700  ring-1 ring-inset ring-green-600/20  rounded-sm",
  "Завершено":         "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-green-700 text-white      ring-1 ring-inset ring-green-800/30  rounded-sm",
  "Отменен":           "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-red-50   text-red-700    ring-1 ring-inset ring-red-600/10    rounded-sm",
};

export default function AgentBookingsPage() {
  const router                      = useRouter();
  const { user, isAgent, logout }   = useAuth();

  const [bookings,setBookings]      = useState<any[]>([]);
  const [filters,setFilters]        = useState({ number:"", operator:"", hotel:"", status:"all" });
  const tableRef                    = useRef<HTMLTableElement|null>(null);

  /* ---------- подписка на свои заявки ---------- */
  useEffect(() => {
    if (!user || !isAgent) return;
    const q   = query(collection(db,"bookings"), where("agentId","==",user.uid));
    const off = onSnapshot(q, snap=>{
      const list = snap.docs.map(d=>({ id:d.id, ...(d.data() as { bookingNumber?:string }) }));
      list.sort((a,b)=>{
        const nA = parseInt((a.bookingNumber||"").replace(/\D/g,""),10)||0;
        const nB = parseInt((b.bookingNumber||"").replace(/\D/g,""),10)||0;
        return nB - nA;
      });
      setBookings(list);
    });
    return ()=>off();
  },[user,isAgent]);

  /* ---------- фильтрация ---------- */
  const filtered = bookings.filter(b=>{
    const st  = filters.status==="all" || b.status===filters.status;
    const num = (b.bookingNumber||"").toLowerCase().includes(filters.number.toLowerCase());
    const op  = (b.operator     ||"").toLowerCase().includes(filters.operator.toLowerCase());
    const hot = (b.hotel        ||"").toLowerCase().includes(filters.hotel.toLowerCase());
    return st && num && op && hot;
  });

  /* ---------- итоги ---------- */
  const totalBr = filtered.reduce((s,b)=>s+(b.bruttoClient||0),0);
  const totalCm = filtered.reduce((s,b)=>s+(b.commission  ||0),0);

  /* ---------- helpers ---------- */
  const nav = [
    { href:"/agent/bookings", label:"Мои заявки" },
    { href:"/agent/balance",  label:"Баланс" },
    { href:"/agent/history",  label:"История операций" },
  ];
  const isActive = (h:string)=>router.pathname.startsWith(h);
  const smallInp = "h-8 px-1 text-sm";

  /* ======================== JSX ======================== */
  return (
    <>
      {/* ---------- header ---------- */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>

          <nav className="flex gap-4">
            {nav.map(n=>(
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

          <div className="flex items-center gap-4">
            <LinkTelegramButton />
            <Button size="sm" variant="destructive" onClick={logout}>
              Выйти
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- content ---------- */}
      <Card className="w-full mx-auto mt-6">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Мои заявки</h1>

            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={()=>router.push("/agent/new-booking")}
            >
              + Новая заявка
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table ref={tableRef} className="min-w-[1500px] w-full border text-sm">
              {/* ===== head ===== */}
              <thead className="bg-gray-100 text-center">
                <tr>
                  <th className="px-2 py-1 w-28">№</th>
                  <th className="px-2 py-1 w-32">Дата</th>
                  <th className="px-2 py-1">Оператор</th>
                  <th className="px-2 py-1">Отель</th>
                  <th className="px-2 py-1">Заезд</th>
                  <th className="px-2 py-1">Выезд</th>
                  <th className="px-2 py-1 w-40">Клиент&nbsp;(€)</th>
                  <th className="px-2 py-1 w-40">Комиссия&nbsp;(€)</th>
                  <th className="px-2 py-1">Статус</th>
                  <th className="px-2 py-1">Инвойс</th>
                  <th className="px-2 py-1">Ваучеры</th>
                  <th className="px-2 py-1">Комментарий</th>
                </tr>

                {/* фильтры */}
                <tr className="bg-white border-b text-center">
                  <td>
                    <Input
                      className={smallInp}
                      value={filters.number}
                      onChange={e=>setFilters({...filters,number:e.target.value})}
                      placeholder="№"
                    />
                  </td>
                  <td></td>
                  <td>
                    <Input
                      className={smallInp}
                      value={filters.operator}
                      onChange={e=>setFilters({...filters,operator:e.target.value})}
                      placeholder="Фильтр"
                    />
                  </td>
                  <td>
                    <Input
                      className={smallInp}
                      value={filters.hotel}
                      onChange={e=>setFilters({...filters,hotel:e.target.value})}
                      placeholder="Фильтр"
                    />
                  </td>
                  <td></td><td></td><td></td><td></td>
                  <td>
                    <Select
                      value={filters.status}
                      onValueChange={v=>setFilters({...filters,status:v})}
                    >
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue placeholder="Статус" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все</SelectItem>
                        {Object.keys(statusColors).map(k=>(
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td></td><td></td><td></td>
                </tr>
              </thead>

              {/* ===== body ===== */}
              <tbody>
                {filtered.map(b=>(
                  <tr key={b.id} className="border-t hover:bg-gray-50 text-center">
                    <td className="px-2 py-1 font-medium whitespace-nowrap">
                      {b.bookingNumber || b.bookingCode || "—"}
                    </td>
                    <td className="px-2 py-1">
                      {b.createdAt?.toDate
                        ? format(b.createdAt.toDate(), "dd.MM.yyyy")
                        : "-"}
                    </td>
                    <td className="px-2 py-1">{b.operator}</td>
                    <td className="px-2 py-1">{b.hotel}</td>
                    <td className="px-2 py-1">
                      {b.checkIn ? format(new Date(b.checkIn), "dd.MM.yyyy") : "-"}
                    </td>
                    <td className="px-2 py-1">
                      {b.checkOut ? format(new Date(b.checkOut), "dd.MM.yyyy") : "-"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {(b.bruttoClient || 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {(b.commission || 0).toFixed(2)}
                    </td>

                    <td className="px-2 py-1">
                      <Badge className={statusColors[b.status] || "bg-gray-100 text-gray-800"}>
                        {b.status || "—"}
                      </Badge>
                    </td>

                    {/* ------- invoice ------- */}
                    <td className="px-2 py-1">
                      {b.invoiceLink ? (
                        <a
                          href={b.invoiceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          Открыть
                        </a>
                      ) : "—"}
                    </td>

                    {/* ------- vouchers ------- */}
                    <td className="px-2 py-1 min-w-[110px]">
                      {Array.isArray(b.voucherLinks) && b.voucherLinks.length
                        ? b.voucherLinks.map((l,i)=>(
                            <div key={i}>
                              <a
                                href={l}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-600 hover:underline"
                              >
                                Ваучер&nbsp;{i+1}
                              </a>
                            </div>
                          ))
                        : "—"}
                    </td>

                    <td className="px-2 py-1">{b.comment || "—"}</td>
                  </tr>
                ))}
              </tbody>

              {/* ===== footer ===== */}
              <tfoot className="bg-gray-100 font-semibold text-center">
                <tr>
                  <td colSpan={6} className="px-2 py-2 text-right">Итого:</td>
                  <td className="px-2 py-2 text-center">{totalBr.toFixed(2)} €</td>
                  <td className="px-2 py-2 text-center">{totalCm.toFixed(2)} €</td>
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