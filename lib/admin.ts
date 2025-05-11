/* lib/admin.ts */
import admin from "firebase-admin";

if (!admin.apps.length) {
  const json = Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64!,
    "base64"
  ).toString("utf-8");

  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}
export const adminDB = admin.firestore();