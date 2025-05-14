// pages/finance/reports.tsx

import ReportsDashboard from "@/components/finance/Accounting/ReportsDashboard";

export default function ReportsPage() {
  return (
    <div className="max-w-6xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Отчёты и дашборды</h1>
      <p className="text-gray-500 mb-4">
        Здесь отображаются сводные данные по транзакциям, заявкам и прибыльности по направлениям.
      </p>
      <ReportsDashboard />
    </div>
  );
}