import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Booking } from "@/types/BookingDTO";
import { calculateProfit } from "@/utils/calculateProfit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function BookingEditPage() {
  const router = useRouter();
  const { id } = router.query;
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/finance/bookings/${id}`)
      .then((res) => res.json())
      .then((data) => setBooking(data.booking))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (field: keyof Booking, value: any) => {
    if (!booking) return;
    setBooking({ ...booking, [field]: value });
  };

  const handleSave = async () => {
    if (!booking) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(booking),
      });
      if (!res.ok) throw new Error("Ошибка при сохранении заявки");
      alert("Заявка сохранена!");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  if (error || !booking) {
    return <div className="p-6 text-red-500">Ошибка: {error || "Заявка не найдена"}</div>;
  }

  const profit = calculateProfit(booking);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Редактирование заявки {booking.bookingNumber}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Клиент</label>
          <Input value={booking.clientName || ""} onChange={(e) => handleChange("clientName", e.target.value)} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Категория</label>
          <Input value={booking.category || ""} onChange={(e) => handleChange("category", e.target.value)} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Брутто клиента</label>
          <Input type="number" value={booking.bruttoClient || 0} onChange={(e) => handleChange("bruttoClient", parseFloat(e.target.value))} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Нетто оператора</label>
          <Input type="number" value={booking.nettoOperator || 0} onChange={(e) => handleChange("nettoOperator", parseFloat(e.target.value))} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Internal Net (для Игоря)</label>
          <Input type="number" value={booking.internalNet || 0} onChange={(e) => handleChange("internalNet", parseFloat(e.target.value))} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Комиссия агента</label>
          <Input type="number" value={booking.commission || 0} onChange={(e) => handleChange("commission", parseFloat(e.target.value))} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Банковская комиссия</label>
          <Input type="number" value={booking.bankFeeAmount || 0} onChange={(e) => handleChange("bankFeeAmount", parseFloat(e.target.value))} />
        </div>
      </div>

      <div className="bg-gray-100 p-4 rounded-lg">
        <h2 className="font-semibold mb-2">Прибыль и доли</h2>
        <p>Прибыль Crocus: <b>{profit.crocusProfit.toFixed(2)} €</b></p>
        <p>Доля Евгения (E): <b>{profit.evgeniyShare.toFixed(2)} €</b></p>
        <p>Доля Игоря (I): <b>{profit.igorShare.toFixed(2)} €</b></p>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Сохраняем..." : "Сохранить изменения"}
      </Button>
    </div>
  );
}