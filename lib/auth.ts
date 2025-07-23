// lib/auth.ts

import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";

const jsonB64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64!;
const creds = JSON.parse(Buffer.from(jsonB64, "base64").toString());

if (!getApps().length) {
  initializeApp({ credential: cert(creds) });
}

export async function verifyIdToken(idToken: string) {
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    // decoded содержит customClaims, в том числе decoded.role
    return {
      uid: decoded.uid,
      role: decoded.role as string || "agent",
      email: decoded.email,
    };
  } catch (e) {
    console.error("verifyIdToken failed:", e);
    return null;
  }
}