// pages/finance/bookings.tsx
import React from "react";
import { useBookings } from "@/hooks/useBookings";
import BookingsTable from "@/components/finance/Accounting/BookingsTable";
import ManagerLayout from "@/components/layouts/ManagerLayout";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

export default function FinanceBookingsPage() {
  const { t } = useTranslation("common");
  const { data: bookings, loading, error } = useBookings();

  return (
    <ManagerLayout>
      <div className="max-w-6xl mx-auto py-10">
        <h1 className="text-2xl font-bold mb-6">
          {t("finance.bookings.title", "Заявки и бронирования")}
        </h1>
        <p className="mb-6 text-gray-500">
          {t(
            "finance.bookings.description",
            "Учёт заявок по направлениям, клиентам и агентам. Все заявки фиксируются по рынкам (Olimpya / Румыния / Субагентский канал)."
          )}
        </p>

        {error && (
          <p className="text-red-500">
            {t("error.generic", "Ошибка")}: {String(error)}
          </p>
        )}
        {loading && <p className="text-gray-400">{t("loading", "Загрузка...")}</p>}
        {!loading && bookings.length === 0 && (
          <p className="text-gray-500">
            {t("finance.bookings.empty", "Заявки не найдены.")}
          </p>
        )}

        <BookingsTable />
      </div>
    </ManagerLayout>
  );
}