// lib/server/firebaseAdmin.ts
import * as admin from "firebase-admin";

/** Приводим приватный ключ в нормальный вид */
function normalizePrivateKey(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let v = String(raw).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  // заменить \n на реальные переводы строк
  v = v.replace(/\\n/g, "\n");
  return v;
}

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function getCredential(): admin.credential.Credential {
  // 0) Пусть Google сам найдёт ключ (файл/ADC)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.applicationDefault();
  }

  // 1) Base64 от service-account.json (поддержка разных имён)
  const b64 = firstEnv(
    "FIREBASE_SERVICE_ACCOUNT_BASE64",
    "FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64",
    "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64",
    "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
    "GCLOUD_SERVICE_KEY_BASE64"
  );
  if (b64) {
    const jsonStr = Buffer.from(b64, "base64").toString("utf8");
    const json = JSON.parse(jsonStr);
    if (json.private_key) json.private_key = normalizePrivateKey(json.private_key);
    return admin.credential.cert(json as admin.ServiceAccount);
  }

  // 2) Триплет переменных окружения
  const projectId =
    firstEnv("FIREBASE_PROJECT_ID", "FIREBASE_ADMIN_PROJECT_ID", "GOOGLE_PROJECT_ID") ||
    firstEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"); // допустим брать публичную как fallback

  const clientEmail = firstEnv(
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "GOOGLE_CLIENT_EMAIL"
  );

  const rawPrivateKey = firstEnv(
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_ADMIN_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY"
  );

  const privateKey = normalizePrivateKey(rawPrivateKey);

  if (projectId && clientEmail && privateKey) {
    return admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    });
  }

  // 3) Inline JSON в переменной (включая GOOGLE_SERVICE_ACCOUNT_JSON)
  const jsonInline = firstEnv(
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON",
    "GOOGLE_SERVICE_ACCOUNT_JSON"
  );
  if (jsonInline) {
    // некоторые .env содержат лишние переносы/кавычки — трогаем минимально
    const parsed = JSON.parse(jsonInline);
    if (parsed.private_key) parsed.private_key = normalizePrivateKey(parsed.private_key);
    return admin.credential.cert(parsed as admin.ServiceAccount);
  }

  // Если ничего из выше не подошло
  throw new Error(
    "[firebase-admin] Missing env. " +
      "Provide GOOGLE_APPLICATION_CREDENTIALS, or *_SERVICE_ACCOUNT_*_BASE64, " +
      "или три переменные (…PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY — GOOGLE_ или FIREBASE_), " +
      "или цельный *_SERVICE_ACCOUNT_JSON."
  );
}

// Инициализируем ровно один раз
if (!admin.apps.length) {
  admin.initializeApp({ credential: getCredential() });
}

export const adminDb = admin.firestore();
export const adminFs = admin.firestore;

// (опционально) Эмулятор Firestore
if (process.env.FIRESTORE_EMULATOR_HOST) {
  adminDb.settings({ host: process.env.FIRESTORE_EMULATOR_HOST, ssl: false } as any);
}