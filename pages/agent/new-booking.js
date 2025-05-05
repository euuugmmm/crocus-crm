// pages/agent/new-booking.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import { collection, addDoc, Timestamp, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import BookingForm from "../../components/BookingFormAgent";

export default function NewBooking() {
  const { user, userData, loading, isAgent } = useAuth();
  const router = useRouter();
  const [bookingNumber, setBookingNumber] = useState('');

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (!isAgent) router.replace("/manager/bookings");
    }
  }, [user, loading, isAgent, router]);

  useEffect(() => {
    generateBookingNumber();
  }, []);

  const generateBookingNumber = async () => {
    const bookingsSnap = await getDocs(collection(db, "bookings"));
    const nextNumber = 1000 + (bookingsSnap.size * 7);
    setBookingNumber(`CRT-${nextNumber.toString().padStart(5, '0')}`);
  };

  const calculateCommission = ({ operator, bruttoClient, internalNet, bruttoOperator }) => {
    let commission = 0;

    if (operator === "TOCO TOUR RO" || operator === "TOCO TOUR MD") {
      commission = (bruttoClient - internalNet) * 0.8;
    } else if (["KARPATEN", "DERTOUR", "CHRISTIAN"].includes(operator)) {
      const baseCommission = bruttoOperator * 0.03;
      const extraCommission = bruttoClient - bruttoOperator;
      commission = baseCommission + (extraCommission > 0 ? extraCommission * 0.8 : 0);
    }

    return parseFloat(commission.toFixed(2));
  };

  const handleCreate = async (formData) => {
    try {
      const commission = calculateCommission(formData);

      const bookingData = {
        bookingNumber,
        ...formData,
        commission,
        agentId: user.uid,
        agentName: userData?.agentName || 'Имя агента не указано',
        agentAgency: userData?.agencyName || 'Агентство не указано',
        status: "Новая",
        createdAt: Timestamp.now(),
      };

      await addDoc(collection(db, "bookings"), bookingData);
      router.push("/agent/bookings");
    } catch (err) {
      console.error("Ошибка при создании заявки:", err);
    }
  };

  if (loading) return <p className="text-center mt-4">Загрузка...</p>;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Новая заявка</h1>
      <BookingForm
        onSubmit={handleCreate}
        isManager={false}
        agentName={userData?.agentName || ""}
        agentAgency={userData?.agencyName || ""}
        bookingNumber={bookingNumber}
      />
    </div>
  );
}
