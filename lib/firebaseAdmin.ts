/* lib/firebaseAdmin.ts */
import { initializeApp, cert, getApps, getApp, App } from "firebase-admin/app";
import { getFirestore }                              from "firebase-admin/firestore";

const jsonB64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64!;
const creds    = JSON.parse(Buffer.from(jsonB64,"base64").toString("utf-8"));

let app: App;
if (getApps().length === 0) {
  app = initializeApp({ credential: cert(creds) });
} else {
  app = getApp();
}

export const adminDB = getFirestore(app);