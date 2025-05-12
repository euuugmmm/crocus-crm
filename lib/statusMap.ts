// lib/statusMap.ts

export const statusMap: Record<string, string> = {
  "Новая": "new",
  "Ожидание оплаты": "waiting_payment",
  "Оплачено туристом": "paid",
  "Ожидает confirm": "waiting_confirm",
  "Подтверждено": "confirmed",
  "Завершено": "completed",
  "Отменен": "cancelled",
  // fallback (если уже новый статус):
  "new": "new",
  "waiting_payment": "waiting_payment",
  "paid": "paid",
  "waiting_confirm": "waiting_confirm",
  "confirmed": "confirmed",
  "completed": "completed",
  "cancelled": "cancelled",
};