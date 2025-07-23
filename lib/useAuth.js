/* lib/useAuth.js */
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

export default function useAuth() {
  const [user,  setUser]  = useState(null);
  const [role,  setRole]  = useState(null);   // ← новая переменная
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Получаем custom claims
        const tokenRes = await u.getIdTokenResult(true);
        setRole(tokenRes.claims.role || "guest");
      } else {
        setRole(null);
      }
      setUser(u);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { user, role, loading };
}