// lib/statusColors.ts

export const statusColors: Record<string, string> = {
  new:               "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-600/20 rounded-sm",
  waiting_payment:   "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20 rounded-sm",
  paid:              "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10 rounded-sm",
  waiting_confirm:   "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-700/10 rounded-sm",
  confirmed:         "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20 rounded-sm",
  completed:         "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-green-700 text-white ring-1 ring-inset ring-green-800/30 rounded-sm",
  cancelled:         "inline-flex justify-center items-center min-w-[110px] text-center px-2 py-1 text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10 rounded-sm",
};