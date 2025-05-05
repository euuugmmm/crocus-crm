// context/AuthContext.js
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/router";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);        // Firebase Auth user
  const [userData, setUserData] = useState(null); // Additional Firestore profile (role, name, agency)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) return; // if Firebase not initialized (server), skip
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        console.log("[Auth] Firebase user:", firebaseUser);

        // Fetch user profile from Firestore
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          console.log("[Auth] Firestore user data:", userDoc.data());
          setUserData(userDoc.data());
        } else {
          console.warn("[Auth] User profile not found for UID:", firebaseUser.uid);
          setUserData(null);
        }
        setUser(firebaseUser);
      } else {
        console.log("[Auth] No Firebase user");
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Auth actions
  const login = async (email, password) => {
    if (!auth) return;
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will handle setting user and redirecting
  };

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
    router.push("/login");
  };

  // Role helpers
  const isManager = userData?.role === "manager";
  const isAgent = userData?.role === "agent";

  return (
    <AuthContext.Provider value={{ user, userData, loading, isManager, isAgent, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);