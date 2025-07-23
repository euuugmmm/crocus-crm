// pages/api/users/set-role.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adminAuth, adminDB } from "@/lib/firebaseAdmin";

/** допустимые значения поля role */
const ALLOWED_ROLES = ["agent", "manager", "supermanager", "admin"] as const;
type Role = (typeof ALLOWED_ROLES)[number];

/**
 * Проверяем, имеет ли вызывающий пользователь право присваивать указанную роль
 *
 * 1. Саморегистрация агента:
 *    – если вызывающий = тот же uid, а роль = 'agent' → разрешаем
 * 2. Админ или супер-менеджер может присвоить ЛЮБУЮ роль
 */
function canAssign(
  callerUid: string,
  callerRole: Role | undefined,
  targetUid: string,
  targetRole: Role
) {
  if (callerUid === targetUid && targetRole === "agent") return true;
  if (callerRole === "admin" || callerRole === "supermanager") return true;
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.setHeader("Allow", "POST").status(405).end("Method Not Allowed");

  try {
    /* ➊ вытаскиваем Bearer-токен */
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    /* ➋ декодируем и проверяем подлинность */
    const decoded = await adminAuth.verifyIdToken(token);
    const callerUid = decoded.uid;
    const callerRole: Role | undefined = (decoded.role as Role) || undefined;

    /* ➌ проверяем body */
    const { uid, role } = req.body as { uid?: string; role?: Role };
    if (!uid || !role) {
      return res.status(400).json({ error: "uid and role are required" });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: "invalid role value" });
    }

    /* ➍ авторизация */
    if (!canAssign(callerUid, callerRole, uid, role)) {
      return res.status(403).json({ error: "forbidden" });
    }

    /* ➎ ставим кастом-клейм */
    await adminAuth.setCustomUserClaims(uid, { role });

    /* ➏ синхронизируем поле role в Firestore (по желанию) */
    await adminDB.doc(`users/${uid}`).set({ role }, { merge: true });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("set-role error", err);
    return res.status(500).json({ error: err.message || "internal error" });
  }
}