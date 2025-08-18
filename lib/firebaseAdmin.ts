// lib/server/firebaseAdmin.ts
import * as admin from "firebase-admin";

let _app: admin.app.App | null = null;

function readServiceAccountFromBase64() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!b64) return null;
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
  } catch (e) {
    console.error("[firebaseAdmin] Parse base64 error:", e);
    return null;
  }
}

function resolveCreds() {
  const sa = readServiceAccountFromBase64();
  if (sa?.project_id && sa?.client_email && sa?.private_key) {
    return {
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    };
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT || "";

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL || "";

  const privateKeyRaw =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    process.env.GOOGLE_PRIVATE_KEY || "";
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

function init() {
  if (_app) return _app;

  const creds = resolveCreds();
  if (!creds) {
    const hint =
      "Missing Firebase Admin credentials. Provide FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 " +
      "or FIREBASE_ADMIN_PROJECT_ID/FIREBASE_ADMIN_CLIENT_EMAIL/FIREBASE_ADMIN_PRIVATE_KEY.";
    console.error("[firebaseAdmin] " + hint);
    throw new Error(hint);
  }

  _app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: creds.projectId,
      clientEmail: creds.clientEmail,
      privateKey: creds.privateKey,
    }),
  });

  return _app!;
}

export const adminApp = init();
export const adminDb = admin.firestore();
export const adminFs = admin.firestore;
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();