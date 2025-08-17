// pages/_app.tsx
import type { AppProps } from "next/app";
import { appWithTranslation } from "next-i18next";
import nextI18NextConfig from "../next-i18next.config.js";
import Head from "next/head";
import Script from "next/script";
import React from "react";

import "@/styles/globals.css";
import { AuthProvider } from "@/context/AuthContext";

function MountedGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // До маунта клиента отдаём нейтральный плейсхолдер,
  // чтобы не было рассинхрона текста (i18n/таймзона) между SSR и клиентом.
  if (!mounted) {
    return (
      <div
        suppressHydrationWarning
        style={{ minHeight: "100vh", background: "white" }}
      />
    );
  }
  return <>{children}</>;
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
      </Head>

      {/* Яндекс.Метрика */}
      <Script
        src="https://mc.yandex.ru/metrika/tag.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (typeof window !== "undefined" && (window as any).ym) {
            (window as any).ym(102132289, "init", {
              clickmap: true,
              trackLinks: true,
              accurateTrackBounce: true,
              webvisor: true,
            });
          }
        }}
      />
      {/* noscript-пиксель (безопасно для Next) */}
      <noscript>
        <div>
          <img
            src="https://mc.yandex.ru/watch/102132289"
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>

      <AuthProvider>
        <MountedGate>
          <Component {...pageProps} />
        </MountedGate>
      </AuthProvider>
    </>
  );
}

export default appWithTranslation(MyApp, nextI18NextConfig);