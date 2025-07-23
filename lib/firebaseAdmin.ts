/* lib/firebaseAdmin.ts */
import { initializeApp, cert, getApps, getApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

/* ——— инициализация из переменной окружения ——— */
const jsonB64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64!;
const creds    = JSON.parse(Buffer.from(jsonB64, "base64").toString("utf-8"));

let app: App;
if (getApps().length === 0) {
  app = initializeApp({ credential: cert(creds) });
} else {
  app = getApp();
}

export const adminDB   = getFirestore(app);
export const adminAuth = getAuth(app);          // 👈 экспорт для работы с custom-claims