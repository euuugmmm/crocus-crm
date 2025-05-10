/* components/UploadVouchers.tsx ------------------------------------------- */
"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc, arrayRemove, arrayUnion } from "firebase/firestore";
import { db } from "@/firebaseConfig";

interface Props {
  bookingDocId : string;       // Firestore id
  bookingNumber: string;
  links: string[];
}

export default function UploadVouchers({ bookingDocId, bookingNumber }: Props) {
  const [links, setLinks]       = useState<string[]>([]);
  const [files, setFiles]       = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);

  /* ---------- подписка на firestore ---------- */
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "bookings", bookingDocId), snap => {
      const arr = (snap.data()?.voucherLinks || []) as string[];
      setLinks(arr);
    });
    return unsub;
  }, [bookingDocId]);

  /* ---------- upload ---------- */
  async function handleUpload() {
    if (!files?.length) return;
    setUploading(true);

    const fd = new FormData();
    Array.from(files).forEach(f => fd.append("file", f));
    fd.append("bookingId", bookingNumber);

    const res  = await fetch("/api/upload-drive", { method: "POST", body: fd });
    const json = await res.json();           // { links: [ ... ] }
    setUploading(false);

    if (Array.isArray(json.links) && json.links.length) {
      await updateDoc(doc(db, "bookings", bookingDocId), {
        voucherLinks: arrayUnion(...json.links),
      });
      // локальное состояние обновится само через onSnapshot 👆
    }
    setFiles(null);
  }

  /* ---------- delete ---------- */
  async function handleDelete(link: string) {
    if (!confirm("Удалить этот ваучер?")) return;
    await updateDoc(doc(db, "bookings", bookingDocId), {
      voucherLinks: arrayRemove(link),
    });
    // onSnapshot сам уберёт ссылку из UI
  }

  return (
    <section className="my-6 space-y-3">
      <h2 className="font-semibold">Ваучеры / PDF</h2>

      {/* --- input & button --- */}
      <div>
        <input
          type="file"
          multiple
          accept="application/pdf"
          onChange={e => setFiles(e.target.files)}
        />
        <button
          onClick={handleUpload}
          disabled={!files?.length || uploading}
          className="ml-2 px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? "Загрузка…" : "Загрузить"}
        </button>
      </div>

      {/* --- list --- */}
      {links.length ? (
        <ul className="space-y-1">
          {links.map((l, i) => (
            <li key={l} className="flex items-center gap-3 text-sm">
              <a
                href={l}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-700 underline"
              >
                ↗ Ваучер #{i + 1}
              </a>
              <button
                onClick={() => handleDelete(l)}
                className="text-red-600 hover:underline"
              >
                удалить
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">ваучеры пока не загружены</p>
      )}
    </section>
  );
}