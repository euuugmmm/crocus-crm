// pages/register.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function Register() {
  const router = useRouter();

  const [agencyName, setAgencyName] = useState('');
  const [agentName, setAgentName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Сохраняем доп. информацию об агенте в Firestore
      await setDoc(doc(db, 'users', user.uid), {
        agencyName,
        agentName,
        email,
        role: 'agent',
        createdAt: new Date(),
      });

      // Обновляем профиль в Firebase Auth (необязательно)
      await updateProfile(user, { displayName: agentName });

      router.push('/my'); // Переход на страницу агента
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Регистрация агента</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={handleRegister} className="space-y-4">
        <input
          type="text"
          placeholder="Название агентства"
          value={agencyName}
          onChange={(e) => setAgencyName(e.target.value)}
          required
          className="w-full border p-2 rounded"
        />
        <input
          type="text"
          placeholder="Имя агента"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          required
          className="w-full border p-2 rounded"
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full border p-2 rounded"
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border p-2 rounded"
        />
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded">
          Зарегистрироваться
        </button>
      </form>
    </div>
  );
}