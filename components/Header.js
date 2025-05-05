import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/router";

export default function Header() {
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  if (!user) return null;

  return (
    <div className="bg-gray-100 p-4 flex justify-between items-center mb-4">
      <span className="text-sm text-gray-600">Вы вошли как: {user.email}</span>
      <button
        onClick={handleLogout}
        className="text-sm bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
      >
        Выйти
      </button>
    </div>
  );
}