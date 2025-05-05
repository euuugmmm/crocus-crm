// components/StatusBadge.js
import React from 'react';

/** Цвета бейджа по статусу */
const COLORS = {
  'Новый':            'bg-gray-200 text-gray-800',
  'В процессе':       'bg-blue-100 text-blue-800',
  'Ожидание оплаты':  'bg-orange-100 text-orange-800',
  'Подтверждено':     'bg-green-100 text-green-800',
  'Вернулись':        'bg-indigo-100 text-indigo-800',
  'Готов к выплате':  'bg-purple-100 text-purple-800',
  'Выплачен':         'bg-teal-100 text-teal-800',
  'Отменено':         'bg-red-100 text-red-800',
};

export default function StatusBadge({ status = '' }) {
  const cls = COLORS[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`${cls} px-2 py-0.5 rounded text-xs whitespace-nowrap`}>
      {status || '—'}
    </span>
  );
}