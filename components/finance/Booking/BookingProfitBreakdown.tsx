// components/finance/Booking/BookingProfitBreakdown.tsx

import { Booking } from "@/types/BookingDTO";
import { calculateProfit } from "@/utils/calculateProfit";

interface Props {
  booking: Booking;
}

export default function BookingProfitBreakdown({ booking }: Props) {
  const {
    bruttoClient = 0,
    nettoOperator = 0,
    agentCommission = 0,
    bankFees = 0,
  } = booking;

  const netProfit = bruttoClient - nettoOperator - agentCommission - bankFees;
  const { evgeniyShare, igorShare } = calculateProfit(booking);

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <h3 className="text-lg font-semibold mb-2">Финансовая разбивка</h3>
      <ul className="space-y-1 text-sm">
        <li>Доход от клиента: <strong>{bruttoClient} €</strong></li>
        <li>Стоимость оператора: <strong>{nettoOperator} €</strong></li>
        <li>Комиссия агента: <strong>{agentCommission || 0} €</strong></li>
        <li>Банковские сборы: <strong>{bankFees || 0} €</strong></li>
        <li>Чистая прибыль Crocus: <strong className="text-green-600">{netProfit.toFixed(2)} €</strong></li>
        <li className="pt-2">Прибыль Евгения (E): <strong>{evgeniyShare.toFixed(2)} €</strong></li>
        <li>Прибыль Игоря (I): <strong>{igorShare.toFixed(2)} €</strong></li>
      </ul>
    </div>
  );
}