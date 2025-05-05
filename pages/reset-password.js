// pages/reset-password.js
import { useState } from "react";
import { useRouter } from "next/router";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebaseConfig";

export default function ResetPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email) {
      setError("Введите email.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Письмо для восстановления отправлено. Проверьте почту.");
    } catch (err) {
      console.error("Reset error:", err);
      setError("Ошибка при отправке письма. Проверьте email.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleReset} className="p-6 bg-white rounded shadow-md w-96">
        <h1 className="text-2xl font-bold mb-4 text-center">Восстановление пароля</h1>

        {message && <p className="text-green-600 text-sm mb-3">{message}</p>}
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          className="w-full mb-4 px-3 py-2 border rounded"
          placeholder="Введите ваш email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Отправить письмо
        </button>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-blue-600 text-sm hover:underline"
          >
            Назад ко входу
          </button>
        </div>
      </form>
    </div>
  );
}