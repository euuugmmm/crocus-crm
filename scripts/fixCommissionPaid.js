/**
 * scripts/fixCommissionPaid.js
 *
 * Запускается обычным `node scripts/fixCommissionPaid.js`
 * – прочитает .env.local, инициализирует Firebase Admin
 * – сбросит commissionPaid=false у всех документов в коллекции bookings
 */

const fs = require("fs");
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// ─── 1) Ручное чтение .env.local ────────────────────────────────────────────
const envFile = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf-8").split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([\w]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let [, key, val] = m;
    // убираем обрамляющие кавычки
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// ─── 2) Загрузка ключа сервис-аккаунта ───────────────────────────────────────
function getCred(plainEnv, b64Env) {
  if (process.env[plainEnv]) {
    try { return JSON.parse(process.env[plainEnv]); }
    catch (e) { throw new Error(`${plainEnv} содержит некорректный JSON`); }
  }
  if (process.env[b64Env]) {
    try {
      const decoded = Buffer.from(process.env[b64Env], "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch {
      throw new Error(`${b64Env} содержит некорректный base64 JSON`);
    }
  }
  throw new Error(`Ни ${plainEnv}, ни ${b64Env} не заданы в окружении`);
}

// ─── 3) Инициализация Firebase Admin ────────────────────────────────────────
if (!getApps().length) {
  initializeApp({
    credential: cert(
      getCred(
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64"
      )
    ),
  });
}
const db = getFirestore();

// ─── 4) Основная логика ─────────────────────────────────────────────────────
async function fixCommissionPaid() {
  console.log("🔍 Читаем все документы из коллекции bookings…");
  const snapshot = await db.collection("bookings").get();
  console.log(`Найдено ${snapshot.size} документов.`);

  const BATCH_SIZE = 500;
  let batch = db.batch();
  let count = 0;

  for (const docSnap of snapshot.docs) {
    // обновляем commissionPaid = false
    batch.update(docSnap.ref, {
      commissionPaid: false,
      // если нужно также обнулить сумму, раскомментируйте:
      // commissionPaidAmount: 0,
    });
    count++;

    // каждые BATCH_SIZE сделаем commit
    if (count % BATCH_SIZE === 0) {
      await batch.commit();
      console.log(`✅ Обновлено ${count} записей…`);
      batch = db.batch();
    }
  }

  // остаточные
  if (count % BATCH_SIZE !== 0) {
    await batch.commit();
    console.log(`✅ Обновлено всего ${count} записей.`);
  }

  console.log("🎉 Скрипт завершён успешно!");
}

fixCommissionPaid().catch((err) => {
  console.error("❌ Ошибка в скрипте:", err);
  process.exit(1);
});