// scripts/migrateOldBookings.ts
// Пример для Node.js (запускать вручную, если надо импортировать массив заявок из файла)

import { adminDB } from "@/lib/firebaseAdmin";
import bookingsData from "./oldBookings.json"; // Массив объектов-заявок

async function migrateOldBookings() {
  const batch = adminDB.batch();
  bookingsData.forEach((booking: any) => {
    const ref = adminDB.collection("bookings").doc(booking.bookingNumber || booking.id);
    batch.set(ref, booking, { merge: true });
  });
  await batch.commit();
  console.log("Старые заявки успешно загружены:", bookingsData.length);
}

// Запуск
migrateOldBookings().catch(console.error);