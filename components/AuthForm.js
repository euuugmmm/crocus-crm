import { useState } from "react";
import { auth } from "../firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

export default function AuthForm({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [isLogin, setIsLogin] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = isLogin
        ? await signInWithEmailAndPassword(auth, email, pass)
        : await createUserWithEmailAndPassword(auth, email, pass);

      onLogin(res.user);
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-10 p-4 border rounded shadow bg-white">
      <h2 className="text-xl mb-4 text-center">{isLogin ? "Вход" : "Регистрация"}</h2>
      <input className="p-2 border mb-2 w-full" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="p-2 border mb-2 w-full" type="password" placeholder="Пароль" value={pass} onChange={(e) => setPass(e.target.value)} />
      <button type="submit" className="bg-blue-600 text-white py-2 w-full rounded">
        {isLogin ? "Войти" : "Зарегистрироваться"}
      </button>
      <p className="text-sm mt-2 text-center text-blue-500 cursor-pointer" onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "Нет аккаунта? Зарегистрируйтесь" : "Уже есть аккаунт? Войти"}
      </p>
    </form>
  );
}