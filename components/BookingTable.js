// components/BookingTable.js
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";  // for date formatting

export default function BookingTable({ bookings }) {
  const router = useRouter();
  const { isManager } = useAuth();

  // Format date from "YYYY-MM-DD" to "DD.MM.YYYY"
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      return format(new Date(year, month - 1, day), "dd.MM.yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border text-sm">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2 text-left">Code</th>
            <th className="p-2 text-left">Operator</th>
            <th className="p-2 text-left">Hotel</th>
            <th className="p-2 text-left">Check-In</th>
            <th className="p-2 text-left">Check-Out</th>
            <th className="p-2 text-right">Client €</th>
            <th className="p-2 text-right">Commission €</th>
            {isManager && <th className="p-2 text-left">Agent</th>}
            <th className="p-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr 
              key={b.id} 
              className="border-b hover:bg-gray-50"
              onClick={() => isManager && router.push(`/manager/${b.id}`)}
            >
              <td className="p-2">{b.bookingCode}</td>
              <td className="p-2">{b.operator}</td>
              <td className="p-2">{b.hotel}</td>
              <td className="p-2">{formatDate(b.checkIn)}</td>
              <td className="p-2">{formatDate(b.checkOut)}</td>
              <td className="p-2 text-right">{b.bruttoClient?.toFixed(2)}</td>
              <td className="p-2 text-right">{b.commission?.toFixed(2)}</td>
              {isManager && (
                <td className="p-2">
                  {b.agentName} ({b.agentAgency})
                </td>
              )}
              <td className="p-2">{b.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}