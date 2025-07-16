import { adminDB } from "@/lib/firebaseAdmin";
import rawData from "./oldBookings.json";

interface Booking {
  bookingNumber: string;
  [key: string]: any;
}

const bookingsData = rawData as Booking[];

async function migrateOldBookings() {
  const batch = adminDB.batch();

  bookingsData.forEach((booking) => {
    const ref = adminDB.collection("bookings").doc(booking.bookingNumber || booking.id);
    batch.set(ref, booking, { merge: true });
  });

  await batch.commit();
  console.log("Старые заявки успешно загружены:", bookingsData.length);
}

migrateOldBookings().catch(console.error);