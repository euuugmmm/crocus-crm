// pages/api/getBookingNumber.js
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../firebase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const counterRef = doc(db, 'counters', 'bookingNumber');
    const counterSnap = await getDoc(counterRef);

    let current = 1000;

    if (!counterSnap.exists()) {
      await setDoc(counterRef, { current });
    } else {
      current = counterSnap.data().current + 7;
      await updateDoc(counterRef, { current });
    }

    const bookingNumber = `CRT-${String(current).padStart(5, '0')}`;
    res.status(200).json({ bookingNumber });
  } catch (error) {
    console.error('Error generating booking number:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}