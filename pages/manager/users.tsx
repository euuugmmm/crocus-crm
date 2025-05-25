/* pages/manager/users.tsx */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link                            from "next/link";
import { useRouter }                   from "next/router";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
}                                      from "firebase/firestore";
import { db }                          from "@/firebaseConfig";
import { useAuth }                     from "@/context/AuthContext";
import LanguageSwitcher                from "@/components/LanguageSwitcher";
import { Button }                      from "@/components/ui/button";
import { useTranslation }              from "next-i18next";
import { serverSideTranslations }      from "next-i18next/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return { props: { ...(await serverSideTranslations(locale, ["common"])) } };
}

type UserDoc = {
  id: string;
  agentNo?: number;
  agencyName?: string;
  agentName?: string;
  email?: string;
  createdAt?: Timestamp;
  notifyLang?: string;
  tgChatId?: string;
  contractLinks?: string[];
  signedContractLink?: string;
};

type BookingDoc = {
  agentId: string;
};

export default function ManagerUsers() {
  const router                      = useRouter();
  const { t }                       = useTranslation("common");
  const { user, isManager, logout } = useAuth();

  /* ── state ── */
  const [users,    setUsers]    = useState<UserDoc[]>([]);
  const [bookings, setBookings] = useState<BookingDoc[]>([]);
  const [sortBy,   setSortBy]   = useState<keyof UserDoc | "bookingsCount">(
    "agentNo"
  );
  const [asc,      setAsc]      = useState<boolean>(true);

  /* ── guards + subscriptions ── */
  useEffect(() => {
    if (!user)        { router.replace("/login");            return; }
    if (!isManager)   { router.replace("/agent/bookings");   return; }

    const unsubUsers = onSnapshot(query(collection(db, "users")), snap => {
      setUsers(
        snap.docs.map(d => ({ id: d.id, ...(d.data() as UserDoc) }))
      );
    });

    const unsubBookings = onSnapshot(
      query(collection(db, "bookings")),
      snap => {
        setBookings(snap.docs.map(d => d.data() as BookingDoc));
      }
    );

    return () => {
      unsubUsers();
      unsubBookings();
    };
  }, [user, isManager]);

  /* ── derive counts map ── */
  const bookingCounts = useMemo(() => {
    const map = new Map<string, number>();
    bookings.forEach(b => {
      map.set(b.agentId, (map.get(b.agentId) || 0) + 1);
    });
    return map;
  }, [bookings]);

  /* ── combine + sort ── */
  const sorted = useMemo(() => {
    const list = users.map(u => ({
      ...u,
      bookingsCount: bookingCounts.get(u.id) || 0,
    }));

    return list.sort((a, b) => {
      const dir = asc ? 1 : -1;

      const av = a[sortBy] as any;
      const bv = b[sortBy] as any;

      // handle undefined/null → bottom
      if (av === undefined || av === null) return 1 * dir;
      if (bv === undefined || bv === null) return -1 * dir;

      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * dir;

      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [users, bookingCounts, sortBy, asc]);

  /* ── helpers ── */
  const toggleSort = (k: keyof UserDoc | "bookingsCount") => {
    setAsc(k === sortBy ? !asc : true);
    setSortBy(k);
  };
  const sortArrow = (k: string) =>
    sortBy === k ? (asc ? " ↑" : " ↓") : "";

  /* ── nav header like other manager pages ── */
  const nav = [
    { href: "/manager/bookings", label: t("navBookings") },
    { href: "/manager/balances", label: t("navBalance") },
    { href: "/manager/payouts",  label: t("navPayouts") },
    { href: "/manager/users",    label: t("navUsers") },
  ];
  const isActive = (h: string) => router.pathname.startsWith(h);

  return (
    <>
      <LanguageSwitcher />

      {/* HEADER */}
      <header className="w-full bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">CROCUS&nbsp;CRM</span>

          <nav className="flex gap-4">
            {nav.map(n => (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  isActive(n.href)
                    ? "border-indigo-600 text-black"
                    : "border-transparent text-gray-600 hover:text-black"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <Button size="sm" variant="destructive" onClick={logout}>
            {t("logout")}
          </Button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">
          {t("usersTitle")} ({sorted.length})
        </h1>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border text-sm">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border px-2 py-1 cursor-pointer"       onClick={()=>toggleSort("agentNo")}>
                  {t("agentNo")}{sortArrow("agentNo")}
                </th>
                <th className="border px-2 py-1 cursor-pointer"       onClick={()=>toggleSort("agencyName")}>
                  {t("agencyName")}{sortArrow("agencyName")}
                </th>
                <th className="border px-2 py-1 cursor-pointer"       onClick={()=>toggleSort("agentName")}>
                  {t("agentName")}{sortArrow("agentName")}
                </th>
                <th className="border px-2 py-1 cursor-pointer"       onClick={()=>toggleSort("email")}>
                  {t("email")}{sortArrow("email")}
                </th>
                <th className="border px-2 py-1 cursor-pointer"       onClick={()=>toggleSort("createdAt")}>
                  {t("createdAt")}{sortArrow("createdAt")}
                </th>
                <th className="border px-2 py-1 cursor-pointer"       onClick={()=>toggleSort("bookingsCount")}>
                  {t("bookingsCnt")}{sortArrow("bookingsCount")}
                </th>
                <th className="border px-2 py-1">{t("notifyLang")}</th>
                <th className="border px-2 py-1">{t("Telegram")}</th>
                <th className="border px-2 py-1">{t("contract")}</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map(u => {
                const created =
                  u.createdAt?.toDate
                    ? u.createdAt.toDate().toLocaleDateString()
                    : "—";
                const signedOk = !!u.signedContractLink;
                const lastContract =
                  (u.contractLinks && u.contractLinks.length)
                    ? u.contractLinks[u.contractLinks.length - 1]
                    : null;

                return (
                  <tr key={u.id} className="border-t text-center hover:bg-gray-50">
                    <td className="border px-2 py-1">{u.agentNo ?? "—"}</td>
                    <td className="border px-2 py-1">{u.agencyName || "—"}</td>
                    <td className="border px-2 py-1">{u.agentName  || "—"}</td>
                    <td className="border px-2 py-1">{u.email      || "—"}</td>
                    <td className="border px-2 py-1">{created}</td>
                    <td className="border px-2 py-1">{u.bookingsCount}</td>
                    <td className="border px-2 py-1 uppercase">{u.notifyLang || "ru"}</td>
                    <td className="border px-2 py-1">
                      {u.tgChatId ? "✓" : "—"}
                    </td>
                    <td className="border px-2 py-1">
                      {signedOk ? (
                        <a
                          href={u.signedContractLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-700 underline"
                        >
                          ✓
                        </a>
                      ) : lastContract ? (
                        <a
                          href={lastContract}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-600 underline"
                        >
                          {t("download")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}