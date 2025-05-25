// pages/_app.tsx
import type { AppProps } from "next/app";
import { appWithTranslation } from "next-i18next";
import nextI18NextConfig from "../next-i18next.config.js";
import { AuthProvider } from "../context/AuthContext";
import Script from "next/script";
import "../styles/globals.css";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* 1️⃣ Подгружаем tag.js */}
      <Script
        src="https://mc.yandex.ru/metrika/tag.js"
        strategy="afterInteractive"
        /** ⬇️ инициализируем счётчик только ПОСЛЕ загрузки tag.js */
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

      {/* приложение */}
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </>
  );
}

export default appWithTranslation(MyApp, nextI18NextConfig);