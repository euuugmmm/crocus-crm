// pages/payouts.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext.js';
import { db } from '../firebase';

export default function Payouts() {
  const router = useRouter();
  const { currentUser, role, loading } = useAuth();
  const [balances, setBalances] = useState([]);

  // Protect route for managers
  useEffect(() => {
    if (!loading) {
      if (!currentUser) {
        router.replace('/login');
      } else if (role !== 'manager') {
        router.replace('/my');
      }
    }
  }, [currentUser, role, loading, router]);

  useEffect(() => {
    if (currentUser && role === 'manager') {
      const loadBalances = async () => {
        // Fetch all completed bookings
        const q = query(collection(db, 'bookings'), where('status', '==', 'Завершено'));
        const snap = await getDocs(q);
        const completedBookings = snap.docs.map(doc => doc.data());
        // Fetch all agents (to get their info and potential tax status)
        const qAgents = query(collection(db, 'users'), where('role', '==', 'agent'));
        const agentSnap = await getDocs(qAgents);
        const agents = agentSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

        // Calculate total commission per agent
        const balanceMap = {}; // { agentId: { name, gross: X, net: Y } }
        completedBookings.forEach(booking => {
          const aId = booking.agentId;
          const agent = agents.find(u => u.uid === aId);
          if (!aId || !agent) return;
          const agentName = agent.name || agent.email || 'Агент';
          const grossCommission = booking.commission || 0;  // stored commission is agent's gross commission (before deductions)
          // Determine tax rate for this agent
          let taxRate = 0;
          // If agent is marked as non-resident, apply 10% tax
          if (agent.isNonResident) {
            taxRate = 0.10;
          }
          // Bank commission rate (1.15%)
          const bankRate = 0.0115;
          // Net commission after deductions for this booking
          const netCommission = grossCommission * (1 - taxRate) * (1 - bankRate);
          if (!balanceMap[aId]) {
            balanceMap[aId] = { agentName: agentName, grossTotal: 0, netTotal: 0 };
          }
          balanceMap[aId].grossTotal += grossCommission;
          balanceMap[aId].netTotal += netCommission;
        });

        // Round totals to 2 decimals and convert to array for display
        const balancesList = Object.keys(balanceMap).map(agentId => {
          return {
            agentName: balanceMap[agentId].agentName,
            grossTotal: Math.round(balanceMap[agentId].grossTotal * 100) / 100,
            netTotal: Math.round(balanceMap[agentId].netTotal * 100) / 100
          };
        });
        setBalances(balancesList);
      };
      loadBalances();
    }
  }, [currentUser, role]);

  if (!currentUser || role !== 'manager') {
    return null;
  }

  return (
    <div className="p-4 max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">Выплаты агентам</h1>
      <table className="min-w-full border border-gray-300">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-3 py-2 text-left">Агент</th>
            <th className="border px-3 py-2 text-right">Комиссия (gross)</th>
            <th className="border px-3 py-2 text-right">К выплате (net)</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((item, idx) => (
            <tr key={idx}>
              <td className="border px-3 py-1">{item.agentName}</td>
              <td className="border px-3 py-1 text-right">{item.grossTotal.toFixed(2)}</td>
              <td className="border px-3 py-1 text-right font-semibold">{item.netTotal.toFixed(2)}</td>
            </tr>
          ))}
          {balances.length === 0 && (
            <tr>
              <td colSpan="3" className="border px-3 py-2 text-center text-gray-500">
                Нет завершенных заявок.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="text-sm text-gray-600 mt-2">
        * Комиссия (gross) &ndash; общая начисленная комиссия агента. <br/>
        ** К выплате (net) &ndash; сумма к выплате после вычета банковской комиссии 1.15% 
        {` ${''}`}и налога 10% для нерезидентов (если применимо).
      </p>
    </div>
  );
}