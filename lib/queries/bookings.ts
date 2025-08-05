// lib/queries/bookings.ts
import {
  collection,
  query,
  where,
  Firestore,
  Query as FSQuery,
} from "firebase/firestore";

export const queryForAgent = (db: Firestore, userId: string): FSQuery =>
  query(collection(db, "bookings"), where("agentId", "==", userId));

export const queryForOlimpya = (db: Firestore, userId: string): FSQuery =>
  query(
    collection(db, "bookings"),
    where("bookingType", "==", "olimpya_base"),
    where("agentId", "==", userId)
  );

export const queryForManager = (db: Firestore): FSQuery =>
  query(collection(db, "bookings"));