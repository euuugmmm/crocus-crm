require('dotenv').config({ path: '.env.local' });

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8")
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function patchBookings() {
  const batch = db.batch();
  const snap = await db
    .collection("bookings")
    .where("status", "==", "finished")
    .get();

  let count = 0;
  snap.forEach(doc => {
    const data = doc.data();
    if (data.commissionPaid === undefined) {
      batch.update(doc.ref, { commissionPaid: false });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`✅ Patched ${count} documents.`);
  } else {
    console.log("✅ No patching needed.");
  }
}

patchBookings().catch(err => console.error("❌ Error:", err));