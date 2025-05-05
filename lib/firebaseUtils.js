// lib/firebaseUtils.js
import { getDoc, doc } from "firebase/firestore";
import { db } from "../firebase";

export async function getUserRole(uid) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data().role || "agent";
  } else {
    return "agent";
  }
}