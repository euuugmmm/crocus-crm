"use client";
import React from "react";

/** Рендерит детей только после маунта клиента (SSR отдаёт пусто). */
export default function ClientOnly({
  children,
  placeholder = null,
}: {
  children: React.ReactNode;
  placeholder?: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <>{placeholder}</>;
}