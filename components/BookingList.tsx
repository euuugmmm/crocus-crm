// components/BookingList.tsx
"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ColumnDef } from "@tanstack/react-table";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";

import { Booking } from "@/lib/types";
import { getBookingsForAgent } from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";

const statusMap: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  new: { label: "Новая", variant: "default" },
  confirmed: { label: "Подтверждено", variant: "secondary" },
  cancelled: { label: "Отменено", variant: "destructive" },
  paid: { label: "Оплачено", variant: "default" },
};

export default function BookingList() {
  const { currentUser } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const fetchData = async () => {
      const data = await getBookingsForAgent(currentUser.uid);
      setBookings(data);
    };
    fetchData();
  }, [currentUser?.uid]);

  const columns: ColumnDef<Booking>[] = [
    {
      accessorKey: "index",
      header: "№",
      cell: ({ row }) => (row.index + 1).toString(),
    },
    {
      accessorKey: "destination",
      header: "Направление",
    },
    {
      accessorKey: "startDate",
      header: "Даты тура",
      cell: ({ row }) => {
        const start = row.original.startDate
          ? format(new Date(row.original.startDate), "dd.MM.yyyy")
          : "-";
        const end = row.original.endDate
          ? format(new Date(row.original.endDate), "dd.MM.yyyy")
          : "-";
        return `${start} – ${end}`;
      },
    },
    {
      accessorKey: "clientPrice",
      header: "Стоимость (€)",
      cell: ({ row }) => `${Number(row.original.clientPrice || 0).toFixed(2)} €`,
    },
    {
      accessorKey: "agentCommission",
      header: "Комиссия (€)",
      cell: ({ row }) => `${Number(row.original.agentCommission || 0).toFixed(2)} €`,
    },
    {
      accessorKey: "payments",
      header: "Оплачено",
      cell: ({ row }) => {
        const total = Number(row.original.clientPrice || 0);
        const paid = Array.isArray(row.original.payments)
          ? row.original.payments.reduce((acc, p) => acc + (p.amount || 0), 0)
          : 0;
        return `${paid.toFixed(2)} / ${total.toFixed(2)} €`;
      },
    },
    {
      accessorKey: "status",
      header: "Статус",
      cell: ({ row }) => {
        const status = row.original.status || "new";
        const { label, variant } = statusMap[status] || {
          label: status,
          variant: "default",
        };
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
  ];

  return (
    <Card className="shadow-sm border">
      <CardContent className="p-6">
        <h2 className="text-2xl font-semibold mb-6">Мои заявки</h2>
        <DataTable columns={columns} data={bookings} filterableFields={["destination", "status"]} />
      </CardContent>
    </Card>
  );
}