// lib/constants/statuses.ts

export const STATUS_KEYS = [
  "new",
  "created_dmc",
  "created_toco",
  "awaiting_payment",
  "paid",
  "awaiting_confirm",
  "confirmed_dmc",
  "confirmed_dmc_flight",
  "confirmed",
  "finished",
  "cancelled",
] as const;

export type StatusKey = typeof STATUS_KEYS[number];

// Цвета бейджей под каждый ключ статуса
export const STATUS_COLORS: Record<StatusKey, string> = {
  new: "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
  created_dmc: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  created_toco: "bg-blue-50 text-blue-700 ring-blue-600/20",
  awaiting_payment: "bg-orange-50 text-orange-700 ring-orange-600/20",
  paid: "bg-blue-100 text-blue-800 ring-blue-600/10",
  awaiting_confirm: "bg-purple-50 text-purple-700 ring-purple-600/20",
  confirmed_dmc: "bg-purple-100 text-purple-800 ring-purple-600/10",
  confirmed_dmc_flight: "bg-purple-100 text-purple-800 ring-purple-600/10",
  confirmed: "bg-green-50 text-green-700 ring-green-600/20",
  finished: "bg-green-700 text-white ring-green-800/30",
  cancelled: "bg-red-50 text-red-700 ring-red-600/10",
};