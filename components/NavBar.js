// components/NavBar.js
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

export default function NavBar() {
  const { currentUser, role } = useAuth();
  if (!currentUser) return null;  // No nav if not logged in

  const handleLogout = async () => {
    await signOut(auth);
    // After signOut, AuthContext will update and redirect to login
  };

  return (
    <nav className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between">
      <span className="font-semibold">Tour CRM</span>
      <div className="flex items-center space-x-4">
        {role === 'agent' && (
          <>
            <Link href="/my" legacyBehavior><a className="hover:underline">Мои заявки</a></Link>
            <Link href="/new" legacyBehavior><a className="hover:underline">Новая заявка</a></Link>
          </>
        )}
        {role === 'manager' && (
          <>
            <Link href="/manager" legacyBehavior><a className="hover:underline">Все заявки</a></Link>
            <Link href="/new" legacyBehavior><a className="hover:underline">Новая заявка</a></Link>
            <Link href="/payouts" legacyBehavior><a className="hover:underline">Выплаты</a></Link>
          </>
        )}
        <button onClick={handleLogout} className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded">
          Выйти
        </button>
      </div>
    </nav>
  );
}