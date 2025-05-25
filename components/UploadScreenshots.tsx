"use client";

import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useTranslation } from "next-i18next";

interface Props {
  bookingDocId: string;   // Firestore ID заявки
  bookingNumber: string;  // только для имён файлов
}

export default function UploadScreenshots({ bookingDocId, bookingNumber }: Props) {
  const { t } = useTranslation("common");
  if (!bookingDocId) return null;                   // ждём, пока появится id

  const [links, setLinks]   = useState<string[]>([]);
  const [files, setFiles]   = useState<FileList | null>(null);
  const [uploading, setUp]  = useState(false);

  /* live-подписка на скриншоты */
  useEffect(() => {
    const ref = doc(db, "bookings", bookingDocId);
    return onSnapshot(ref, snap => {
      setLinks((snap.data()?.screenshotLinks || []) as string[]);
    });
  }, [bookingDocId]);

  /* загрузка файлов */
  async function handleUpload() {
    if (!files?.length) return;
    setUp(true);

    const fd = new FormData();
    Array.from(files).forEach(f => fd.append("file", f));
    fd.append("bookingNumber", bookingNumber);

    const res   = await fetch("/api/upload-screenshots", { method: "POST", body: fd });
    const { links: newLinks = [] } = await res.json();
    setUp(false);

    if (newLinks.length) {
      const ref = doc(db, "bookings", bookingDocId);
      try {
        await updateDoc(ref, { screenshotLinks: arrayUnion(...newLinks) });
      } catch (e: any) {
        // если документа ещё нет — создаём с нужным полем
        await setDoc(ref, { screenshotLinks: newLinks }, { merge: true });
      }
    }
    setFiles(null);
  }

  /* удалить ссылку */
  async function handleDelete(link: string) {
    if (!confirm(t("confirmDelete"))) return;
    await updateDoc(doc(db, "bookings", bookingDocId), {
      screenshotLinks: arrayRemove(link),
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{t("screenshots")}</h2>

      {/* input + кнопка */}
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center px-3 py-1 bg-gray-200 rounded cursor-pointer">
          <span className="text-sm">{t("chooseFiles")}</span>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={e => setFiles(e.target.files)}
            className="hidden"
          />
        </label>

        <button
          type="button"
          onClick={handleUpload}
          disabled={!files?.length || uploading}
          className="px-4 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {uploading ? t("uploading") : t("addUpload")}
        </button>
      </div>

      {/* список ссылок */}
      {links.length ? (
        <ul className="space-y-1 text-sm">
          {links.map((l, i) => (
            <li key={l} className="flex items-center gap-3">
              <a
                href={l}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-700 underline"
              >
                ↗ {t("screenshot")} №{i + 1}
              </a>
              <button
                onClick={() => handleDelete(l)}
                className="text-red-600 hover:underline"
                type="button"
              >
                {t("delete")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">{t("noScreenshots")}</p>
      )}
    </section>
  );
}