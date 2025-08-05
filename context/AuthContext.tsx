// context/AuthContext.tsx

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth, db } from "@/firebaseConfig";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface UserData {
  role: "agent" | "olimpya_agent" | "manager" | "supermanager" | "admin";
  email: string;
  createdAt: number;
  // ...можно добавить agencyName, managerName и т.д.
}

interface AuthContextProps {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  isAgent: boolean;
  isOlimpya: boolean;
  isManager: boolean;
  isSuperManager: boolean;
  isAdmin: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextProps>({} as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const userRef = doc(db, "users", fbUser.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          // первый вход — создаём профиль с ролью agent по умолчанию
          const data: UserData = {
            role: "agent",
            email: fbUser.email || "",
            createdAt: Date.now(),
          };
          await setDoc(userRef, data);
          setUserData(data);
        } else {
          setUserData(snap.data() as UserData);
        }

        setUser(fbUser);
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  const role = userData?.role;
  const isAgent        = role === "agent";
  const isOlimpya      = role === "olimpya_agent";
  const isManager      = role === "manager";
  const isSuperManager = role === "supermanager";
  const isAdmin        = role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        loading,
        isAgent,
        isOlimpya,
        isManager,
        isSuperManager,
        isAdmin,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);