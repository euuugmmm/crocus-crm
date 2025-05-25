// pages/api/next-agent-no.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/* helper: читаем JSON-ключ из ENV (plain или base64) */
function getCreds(plain: string, b64: string) {
  if (process.env[plain]) return JSON.parse(process.env[plain]!);
  if (process.env[b64])
    return JSON.parse(Buffer.from(process.env[b64]!, "base64").toString("utf8"));
  throw new Error(`ENV ${plain} / ${b64} not set`);
}

/* initialise Firebase-Admin один раз на весь сервер */
if (!getApps().length) {
  initializeApp({
    credential: cert(
      getCreds(
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64"
      )
    ),
  });
}
const adb = getFirestore();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end("Only POST allowed");

  try {
    /* берём/создаём документ counters/agentNo и инкрементируем value */
    const ref = adb.doc("counters/agentNo");
    const agentNo = await adb.runTransaction(async (tr) => {
      const snap = await tr.get(ref);
      const cur = snap.data()?.value ?? 0;
      tr.set(ref, { value: FieldValue.increment(1) }, { merge: true });
      return cur + 1;
    });

    return res.status(200).json({ agentNo });
  } catch (err: any) {
    console.error("[next-agent-no]", err);
    return res.status(500).json({ error: "Counter failed" });
  }
}