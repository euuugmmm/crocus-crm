/* pages/manager/users.tsx */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import ManagerLayout from "@/components/layouts/ManagerLayout";

type UserDoc = {
  id: string;
  agentNo?: number;
  agencyName?: string;
  agentName?: string;
  email?: string;
  role?: string;              // "agent" | "olimpya_agent" | "manager" | "supermanager" | "admin"
  createdAt?: Timestamp;
  notifyLang?: string;        // "ru" | "ro" | "en" | "ua"
  tgChatId?: string;
  contractLinks?: string[];
  signedContractLink?: string;
  isArchived?: boolean;
  archivedAt?: Timestamp | null;
};

type BookingDoc = {
  agentId: string;
};

const LANGS = ["ru", "ro", "en", "ua"] as const;
const ROLE_OPTIONS = ["agent", "olimpya_agent", "manager", "supermanager", "admin"] as const;

export default function ManagerUsers() {
  const router = useRouter();
  const { user, loading, isManager, isSuperManager, isAdmin } = useAuth();

  const canView = isManager || isSuperManager || isAdmin;
  const canChangeRole = isSuperManager || isAdmin;
  const canHardDelete = isSuperManager || isAdmin;

  const [users, setUsers] = useState<UserDoc[]>([]);
  const [bookings, setBookings] = useState<BookingDoc[]>([]);
  const [sortBy, setSortBy] = useState<keyof UserDoc | "bookingsCount">("agentNo");
  const [asc, setAsc] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  // editor modal
  const emptyForm: UserDoc = {
    id: "",
    agentNo: undefined,
    agencyName: "",
    agentName: "",
    email: "",
    role: "agent",
    notifyLang: "ru",
    tgChatId: "",
    signedContractLink: "",
    isArchived: false,
    archivedAt: null,
  };
  const [editOpen, setEditOpen] = useState(false);
  const [isCreate, setIsCreate] = useState(false);
  const [form, setForm] = useState<UserDoc>(emptyForm);

  // delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserDoc | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteMode, setDeleteMode] = useState<"archive" | "hard">("archive");

  useEffect(() => {
    if (loading) return; // ждём инициализации auth
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canView) {
      router.replace("/agent/bookings");
      return;
    }

    const unsubUsers = onSnapshot(query(collection(db, "users")), snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });

    const unsubBookings = onSnapshot(query(collection(db, "bookings")), snap => {
      setBookings(snap.docs.map(d => d.data() as BookingDoc));
    });

    return () => {
      unsubUsers();
      unsubBookings();
    };
  }, [user, canView, loading, router]);

  const bookingCounts = useMemo(() => {
    const map = new Map<string, number>();
    bookings.forEach(b => {
      map.set(b.agentId, (map.get(b.agentId) || 0) + 1);
    });
    return map;
  }, [bookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let res = users.filter(u => (showArchived ? true : !u.isArchived));

    if (roleFilter !== "all") {
      res = res.filter(u => (u.role || "agent") === roleFilter);
    }

    if (!q) return res;

    return res.filter(u => {
      const parts = [
        u.agentNo?.toString() || "",
        u.agencyName || "",
        u.agentName || "",
        u.email || "",
        u.role || "",
        u.notifyLang || "",
      ]
        .join(" ")
        .toLowerCase();
      return parts.includes(q);
    });
  }, [users, search, roleFilter, showArchived]);

  const sorted = useMemo(() => {
    const list = filtered.map(u => ({
      ...u,
      bookingsCount: bookingCounts.get(u.id) || 0,
    }));

    return list.sort((a: any, b: any) => {
      const dir = asc ? 1 : -1;
      const av = a[sortBy];
      const bv = b[sortBy];

      if (sortBy === "createdAt") {
        const at = (av?.toDate ? av.toDate().getTime() : 0) as number;
        const bt = (bv?.toDate ? bv.toDate().getTime() : 0) as number;
        return (at - bt) * dir;
      }
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [filtered, bookingCounts, sortBy, asc]);

  const toggleSort = (k: keyof UserDoc | "bookingsCount") => {
    setAsc(k === sortBy ? !asc : true);
    setSortBy(k);
  };
  const sortArrow = (k: string) => (sortBy === k ? (asc ? " ↑" : " ↓") : "");

  // create/edit
  const openCreate = () => {
    setIsCreate(true);
    setForm({ ...emptyForm, id: "" });
    setEditOpen(true);
  };
  const openEdit = (u: UserDoc) => {
    setIsCreate(false);
    setForm({
      id: u.id,
      agentNo: u.agentNo,
      agencyName: u.agencyName,
      agentName: u.agentName,
      email: u.email,
      role: u.role ?? "agent",
      createdAt: u.createdAt,
      notifyLang: u.notifyLang ?? "ru",
      tgChatId: u.tgChatId,
      contractLinks: u.contractLinks,
      signedContractLink: u.signedContractLink,
      isArchived: !!u.isArchived,
      archivedAt: u.archivedAt ?? null,
    });
    setEditOpen(true);
  };
  const saveEdit = async () => {
    const payload: any = {
      agentNo: form.agentNo ?? null,
      agencyName: form.agencyName?.trim() || "",
      agentName: form.agentName?.trim() || "",
      email: form.email?.trim() || "",
      notifyLang: form.notifyLang || "ru",
      tgChatId: form.tgChatId?.trim() || "",
      signedContractLink: form.signedContractLink?.trim() || "",
    };
    if (canChangeRole) payload.role = form.role || "agent";

    if (isCreate) {
      await addDoc(collection(db, "users"), {
        ...payload,
        role: payload.role || "agent",
        isArchived: false,
        archivedAt: null,
        createdAt: Timestamp.now(),
      });
    } else {
      if (!form.id) return;
      await updateDoc(doc(db, "users", form.id), payload);
    }
    setEditOpen(false);
  };

  // archive / unarchive
  const archiveUser = async (u: UserDoc) => {
    await updateDoc(doc(db, "users", u.id), {
      isArchived: true,
      archivedAt: Timestamp.now(),
    });
  };
  const unarchiveUser = async (u: UserDoc) => {
    await updateDoc(doc(db, "users", u.id), {
      isArchived: false,
      archivedAt: null,
    });
  };

  // delete flow
  const openDelete = (u: UserDoc) => {
    setDeleteTarget(u);
    setDeleteConfirmEmail("");
    setDeleteMode("archive");
    setDeleteOpen(true);
  };
  const canDeletePermanarily = (u: UserDoc, bookingsCount: number) => {
    if (!canHardDelete) return false;
    if (!u.id || u.id === user?.uid) return false; // себя нельзя
    if (bookingsCount > 0) return false;           // если есть брони — нельзя
    if (["manager", "supermanager", "admin"].includes(u.role || "agent")) {
      return isAdmin; // только админ может удалять менеджерские роли
    }
    return true;
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const bookingsCount = bookingCounts.get(deleteTarget.id) || 0;

    if (deleteConfirmEmail.trim().toLowerCase() !== (deleteTarget.email || "").toLowerCase()) return;

    if (deleteMode === "archive") {
      await archiveUser(deleteTarget);
      setDeleteOpen(false);
      return;
    }

    if (!canDeletePermanarily(deleteTarget, bookingsCount)) return;
    await deleteDoc(doc(db, "users", deleteTarget.id));
    // удаление из Firebase Auth НЕ выполняется отсюда
    setDeleteOpen(false);
  };

  // password reset
  const resetPassword = async (email?: string) => {
    if (!email) return;
    const auth = getAuth();
    await sendPasswordResetEmail(auth, email).catch(console.error);
    alert("Ссылка для сброса пароля отправлена (если email существует).");
  };

  return (
    <ManagerLayout>
      <main className="max-w-7xl mx-auto p-4">
        {/* Шапка и инструменты */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h1 className="text-xl font-bold whitespace-nowrap">Пользователи ({sorted.length})</h1>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск…"
              className="border rounded px-2 py-1 text-xs w-56"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
              title="Роль"
            >
              <option value="all">Все роли</option>
              {ROLE_OPTIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <span>Показывать архивных</span>
            </label>
            <Button onClick={openCreate} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">
              Добавить
            </Button>
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full border text-xs">
            <thead className="bg-gray-100 text-center">
              <tr className="whitespace-nowrap">
                <Th onClick={() => toggleSort("agentNo")} label={`№ агента${sortArrow("agentNo")}`} />
                <Th onClick={() => toggleSort("agencyName")} label={`Агентство${sortArrow("agencyName")}`} />
                <Th onClick={() => toggleSort("agentName")} label={`Имя агента${sortArrow("agentName")}`} />
                <Th onClick={() => toggleSort("email")} label={`Email${sortArrow("email")}`} />
                <Th onClick={() => toggleSort("role" as any)} label={`Роль${sortArrow("role")}`} />
                <Th onClick={() => toggleSort("createdAt")} label={`Создан${sortArrow("createdAt")}`} />
                <Th onClick={() => toggleSort("bookingsCount")} label={`Заявок${sortArrow("bookingsCount")}`} />
                <th className="border px-2 py-1">Язык уведомл.</th>
                <th className="border px-2 py-1">Telegram</th>
                <th className="border px-2 py-1">Договор</th>
                <th className="border px-2 py-1">Статус</th>
                <th className="border px-2 py-1">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(u => {
                const created = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : "—";
                const signedOk = !!u.signedContractLink;
                const lastContract = (u.contractLinks && u.contractLinks.length) ? u.contractLinks[u.contractLinks.length - 1] : null;
                const cnt = bookingCounts.get(u.id) || 0;

                return (
                  <tr
                    key={u.id}
                    className={`border-t text-center hover:bg-gray-50 ${u.isArchived ? "opacity-60" : ""}`}
                  >
                    <Td>{u.agentNo ?? "—"}</Td>
                    <Td className="max-w-[180px] truncate" title={u.agencyName || ""}>{u.agencyName || "—"}</Td>
                    <Td className="max-w-[160px] truncate" title={u.agentName || ""}>{u.agentName || "—"}</Td>
                    <Td className="max-w-[200px] truncate">
                      {u.email ? (
                        <a className="text-sky-700 underline" href={`mailto:${u.email}`} title={u.email}>
                          {u.email}
                        </a>
                      ) : "—"}
                    </Td>
                    <Td>
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100">{u.role || "agent"}</span>
                    </Td>
                    <Td>{created}</Td>
                    <Td>{cnt}</Td>
                    <Td className="uppercase">{u.notifyLang || "ru"}</Td>
                    <Td>{u.tgChatId ? "✓" : "—"}</Td>
                    <Td>
                      {signedOk ? (
                        <a href={u.signedContractLink} target="_blank" rel="noreferrer" className="text-emerald-700 underline" title="Подписанный договор">
                          ✓
                        </a>
                      ) : lastContract ? (
                        <a href={lastContract} target="_blank" rel="noreferrer" className="text-sky-600 underline" title="Скачать договор">
                          Скачать
                        </a>
                      ) : ("—")}
                    </Td>
                    <Td>{u.isArchived ? "архив" : "активен"}</Td>
                    <Td className="whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          className="h-7 px-2 border rounded hover:bg-gray-100"
                          title="Редактировать"
                          onClick={() => openEdit(u)}
                        >
                          ✏️
                        </button>
                        <Link
                          href={{ pathname: "/manager/bookings", query: { agentId: u.id } }}
                          target="_blank"
                          className="h-7 px-2 border rounded hover:bg-gray-100 inline-flex items-center"
                          title="Открыть заявки в новом окне"
                        >
                          📄
                        </Link>
                        <button
                          className="h-7 px-2 border rounded hover:bg-gray-100 disabled:opacity-50"
                          title="Сброс пароля"
                          onClick={() => resetPassword(u.email)}
                          disabled={!u.email}
                        >
                          🔑
                        </button>
                        {u.isArchived ? (
                          <button
                            className="h-7 px-2 border rounded hover:bg-gray-100"
                            title="Разархивировать"
                            onClick={() => unarchiveUser(u)}
                          >
                            ♻️
                          </button>
                        ) : (
                          <button
                            className="h-7 px-2 border rounded hover:bg-red-50"
                            title="Удалить / Архивировать"
                            onClick={() => openDelete(u)}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Модалка: Редактор пользователя */}
        {editOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">
                  {isCreate ? "Новый пользователь" : "Редактирование пользователя"}
                </h2>
                <button className="text-2xl leading-none" onClick={() => setEditOpen(false)}>×</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label="№ агента">
                  <input
                    type="number"
                    value={form.agentNo ?? ""}
                    onChange={e => setForm(f => ({ ...f, agentNo: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full border rounded px-2 py-1"
                  />
                </Field>

                <Field label="Агентство">
                  <input
                    value={form.agencyName || ""}
                    onChange={e => setForm(f => ({ ...f, agencyName: e.target.value }))}
                    className="w-full border rounded px-2 py-1"
                  />
                </Field>

                <Field label="Имя агента">
                  <input
                    value={form.agentName || ""}
                    onChange={e => setForm(f => ({ ...f, agentName: e.target.value }))}
                    className="w-full border rounded px-2 py-1"
                  />
                </Field>

                <Field label="Email">
                  <input
                    type="email"
                    value={form.email || ""}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border rounded px-2 py-1"
                  />
                </Field>

                <Field label="Роль">
                  <select
                    value={form.role || "agent"}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    disabled={!canChangeRole}
                    className="w-full border rounded px-2 py-1 disabled:bg-gray-100"
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {!canChangeRole && (
                    <p className="text-[11px] text-gray-500 mt-1">Изменять роль могут только суперменеджер или админ.</p>
                  )}
                </Field>

                <Field label="Язык уведомлений">
                  <select
                    value={form.notifyLang || "ru"}
                    onChange={e => setForm(f => ({ ...f, notifyLang: e.target.value }))}
                    className="w-full border rounded px-2 py-1"
                  >
                    {LANGS.map(l => (
                      <option key={l} value={l}>{l.toUpperCase()}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Telegram Chat ID" full>
                  <input
                    value={form.tgChatId || ""}
                    onChange={e => setForm(f => ({ ...f, tgChatId: e.target.value }))}
                    className="w-full border rounded px-2 py-1"
                  />
                </Field>

                <Field label="Подписанный договор (ссылка)" full>
                  <input
                    value={form.signedContractLink || ""}
                    onChange={e => setForm(f => ({ ...f, signedContractLink: e.target.value }))}
                    className="w-full border rounded px-2 py-1"
                    placeholder="https://..."
                  />
                </Field>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)} className="h-8 px-3 text-xs">
                  Отмена
                </Button>
                <Button onClick={saveEdit} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700">
                  Сохранить
                </Button>
              </div>

              {isCreate && (
                <p className="mt-3 text-[11px] text-gray-500">
                  Внимание: здесь создаётся только профиль в Firestore. Учетная запись в Firebase Auth должна быть создана отдельно (через админ-панель или серверную функцию).
                </p>
              )}
            </div>
          </div>
        )}

        {/* Модалка: Удаление / Архив */}
        {deleteOpen && deleteTarget && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
            <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Удаление пользователя</h2>
                <button className="text-2xl leading-none" onClick={() => setDeleteOpen(false)}>×</button>
              </div>

              <div className="text-sm">
                <p><strong>{deleteTarget.agentName || "—"}</strong> ({deleteTarget.email || "—"})</p>
                <p>Роль: {deleteTarget.role || "agent"}</p>
                <p>Заявок: {bookingCounts.get(deleteTarget.id) || 0}</p>
              </div>

              <div className="p-3 bg-amber-50 text-amber-900 rounded text-sm">
                <p className="font-medium mb-1">Важно:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Если у пользователя есть заявки — разрешено только архивирование.</li>
                  <li>Жёсткое удаление доступно лишь supermanager/admin; себя удалить нельзя.</li>
                  <li>Удаление из Firebase Auth не выполняется отсюда (лучше через Cloud Function).</li>
                </ul>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={deleteMode === "archive"}
                    onChange={() => setDeleteMode("archive")}
                  />
                  <span>Архивировать пользователя</span>
                </label>
                <label
                  className={`flex items-center gap-2 ${canDeletePermanarily(deleteTarget, bookingCounts.get(deleteTarget.id) || 0) ? "" : "opacity-50"}`}
                  title={canDeletePermanarily(deleteTarget, bookingCounts.get(deleteTarget.id) || 0) ? "" : "Нет прав или у пользователя есть заявки"}
                >
                  <input
                    type="radio"
                    disabled={!canDeletePermanarily(deleteTarget, bookingCounts.get(deleteTarget.id) || 0)}
                    checked={deleteMode === "hard"}
                    onChange={() => setDeleteMode("hard")}
                  />
                  <span>Удалить безвозвратно (Firestore)</span>
                </label>
              </div>

              <div>
                <label className="text-xs text-gray-600">Для подтверждения введите email пользователя</label>
                <input
                  value={deleteConfirmEmail}
                  onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                  placeholder={deleteTarget.email || ""}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteOpen(false)} className="h-8 px-3 text-xs">
                  Отмена
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  className="h-8 px-3 text-xs"
                  disabled={
                    !deleteTarget.email ||
                    deleteConfirmEmail.trim().toLowerCase() !== (deleteTarget.email || "").toLowerCase()
                  }
                >
                  {deleteMode === "archive" ? "Архивировать" : "Удалить"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </ManagerLayout>
  );
}

/** Узкие ячейки и заголовки */
function Th({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <th
      className="border px-2 py-1 cursor-pointer select-none whitespace-nowrap text-center"
      onClick={onClick}
      title="Сортировать"
    >
      {label}
    </th>
  );
}
function Td({ children, className = "", title }: { children: any; className?: string; title?: string }) {
  return (
    <td className={`border px-2 py-1 align-middle whitespace-nowrap ${className}`} title={title}>
      {children}
    </td>
  );
}
function Field({ label, children, full }: { label: string; children: any; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="text-[11px] text-gray-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}