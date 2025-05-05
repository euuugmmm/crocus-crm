// pages/index.js
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const router = useRouter();
  const { user, loading, isManager, isAgent } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace("/login");
      } else if (isManager) {
        router.replace("/manager/bookings");
      } else if (isAgent) {
        router.replace("/agent/bookings");
      }
    }
  }, [user, loading, isManager, isAgent]);

  return <p className="text-center mt-10">Redirecting...</p>;
}