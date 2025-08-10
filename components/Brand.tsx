"use client";

import { useEffect, useState } from "react";

export default function Brand() {
  // Это увидит сервер и первый проход на клиенте — совпадёт с SSR
  const [name, setName] = useState("CROCUS CRM");

  useEffect(() => {
    // Любая ваша динамика (i18n, localStorage, запросы и т.п.)
    try {
      const fromLS = localStorage.getItem("brand");
      if (fromLS) setName(fromLS);
    } catch {}
  }, []);

  // Просим React не ругаться, если после hydration текст изменится
  return <span suppressHydrationWarning>{name}</span>;
}