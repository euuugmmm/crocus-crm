// pages/manager/[id].js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import BookingForm from "../../components/BookingFormManager";

export default function EditBooking() {
  const router = useRouter();
  const { id } = router.query;  // booking ID from URL
  const { user, loading, isManager } = useAuth();
  const [bookingData, setBookingData] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace("/login");
      } else if (!isManager) {
        router.replace("/agent/bookings");
      }
    }
  }, [user, loading, isManager]);

  useEffect(() => {
    const fetchBooking = async () => {
      if (id && isManager) {
        try {
          const docRef = doc(db, "bookings", id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setBookingData({ id: docSnap.id, ...docSnap.data() });
          } else {
            console.error("Booking not found");
          }
        } catch (err) {
          console.error("Error fetching booking:", err);
        } finally {
          setLoadingData(false);
        }
      }
    };
    fetchBooking();
  }, [id, isManager]);

  const handleUpdate = async (updatedData) => {
    try {
      updatedData.updatedAt = Timestamp.now();
      const docRef = doc(db, "bookings", id);
      await updateDoc(docRef, updatedData);
      router.push("/manager/bookings");
    } catch (err) {
      console.error("Error updating booking:", err);
      // Handle error (show message) if needed
    }
  };

  if (loading || loadingData) return <p className="text-center mt-4">Loading...</p>;
  if (!bookingData) return <p className="text-center mt-4 text-red-500">Booking not found.</p>;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">
        Edit Booking: {bookingData.bookingCode}
      </h1>
      <BookingForm 
        initialData={bookingData} 
        onSubmit={handleUpdate} 
        isManager={true} 
        agentName={bookingData.agentName} 
        agentAgency={bookingData.agentAgency}
      />
    </div>
  );
}