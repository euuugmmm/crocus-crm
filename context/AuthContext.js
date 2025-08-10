// context/AuthContext.js (или .jsx)
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { auth, db } from "../firebaseConfig";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/router";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);        // Firebase Auth user
  const [userData, setUserData] = useState(null); // Firestore profile (role, agency, etc.)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) return; // на сервере пропускаем
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          setUserData(userDoc.exists() ? userDoc.data() : null);
        } catch {
          setUserData(null);
        }
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
  const role = userData?.role;
  const isAgent        = role === "agent";
  const isOlimpya      = role === "olimpya_agent";
  const isManager      = role === "manager";
  const isSupermanager = role === "supermanager";
  const isAdmin        = role === "admin";

  // мягкий авто-редирект только с "хабов", чтобы F5 на внутренних страницах не уносил
  const hasAutoRoutedRef = useRef(false);
  useEffect(() => {
    if (loading) return;

    const { pathname } = router;

    // если не залогинен — /manager и /agent ведём на логин
    if (!user) {
      if (pathname === "/manager" || pathname === "/agent") {
        router.replace("/login");
      }
      return;
    }

    if (hasAutoRoutedRef.current) return;

    const isHub =
      pathname === "/" ||
      pathname === "/login" ||
      pathname === "/manager" ||
      pathname === "/agent";

    if (!isHub) return;

    if (isManager || isSupermanager || isAdmin) {
      hasAutoRoutedRef.current = true;
      router.replace("/manager/bookings");
      return;
    }
    if (isAgent || isOlimpya) {
      hasAutoRoutedRef.current = true;
      router.replace("/agent/bookings");
      return;
    }
  }, [user, role, isManager, isSupermanager, isAdmin, isAgent, isOlimpya, loading, router]);

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