import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/router";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);        // Firebase Auth user
  const [userData, setUserData] = useState(null); // Firestore profile (role, agency, etc.)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) return; // на сервере пропускаем
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // берём профиль
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        setUserData(userDoc.exists() ? userDoc.data() : null);
        setUser(firebaseUser);
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // действия
  const login = async (email, password) => {
    if (!auth) return;
    await signInWithEmailAndPassword(auth, email, password);
  };
  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
    router.push("/login");
  };

  // роли
  const isAgent        = userData?.role === "agent";
  const isManager      = userData?.role === "manager";
  const isSupermanager = userData?.role === "supermanager";
  const isAdmin        = userData?.role === "admin";
  const isOlimpya      = userData?.role === "olimpya_agent";

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        loading,
        isAgent,
        isManager,
        isSupermanager,
        isAdmin,
        isOlimpya,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);