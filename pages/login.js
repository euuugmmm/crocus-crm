// pages/login.js
import { useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const router = useRouter();
  const { login, user, loading, userData } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError("Ошибка входа. Проверьте email и пароль.");
      console.error("Login error:", err);
    }
  };

  if (typeof window !== "undefined" && user && !loading) {
    if (userData?.role === "manager") {
      router.replace("/manager/bookings");
    } else {
      router.replace("/agent/bookings");
    }
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="p-6 bg-white rounded shadow-md w-80">
        <h1 className="text-2xl font-bold mb-4 text-center">Crocus CRM Login</h1>
        
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        
        <label className="block text-sm font-medium mb-1">Email</label>
        <input 
          type="email" 
          value={email} 
          onChange={e => setEmail(e.target.value)} 
          className="w-full mb-4 px-3 py-2 border rounded" 
          required 
        />

        <label className="block text-sm font-medium mb-1">Пароль</label>
        <input 
          type="password" 
          value={password} 
          onChange={e => setPassword(e.target.value)} 
          className="w-full mb-4 px-3 py-2 border rounded" 
          required 
        />

        <button 
          type="submit" 
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          {loading ? "Вход..." : "Войти"}
        </button>

        <div className="mt-4 flex flex-col items-center text-sm space-y-2">
          <button 
            type="button"
            onClick={() => router.push("/reset-password")}
            className="text-blue-600 hover:underline"
          >
            Забыли пароль?
          </button>
          <button 
            type="button"
            onClick={() => router.push("/register")}
            className="text-blue-600 hover:underline"
          >
            Зарегистрироваться
          </button>
        </div>
      </form>
    </div>
  );
}