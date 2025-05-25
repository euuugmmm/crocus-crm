// pages/_app.tsx
import type { AppProps } from "next/app";
import { appWithTranslation } from "next-i18next";
import nextI18NextConfig from "../next-i18next.config.js";
import { AuthProvider } from "../context/AuthContext";
import "../styles/globals.css";
import Script from "next/script";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      {/*
        Подключаем tag.js Яндекс.Метрики сразу после того,
        как Next.js перешёл в клиентский режим
      */}
      <Script
        src="https://mc.yandex.ru/metrika/tag.js"
        strategy="afterInteractive"
      />
      {/*
        Инициализируем счётчик — тоже послеInteractive,
        чтобы DOM уже был доступен
      */}
      <Script id="yandex-init" strategy="afterInteractive">
        {`
          ym(102132289, "init", {
            clickmap:true,
            trackLinks:true,
            accurateTrackBounce:true,
            webvisor:true
          });
        `}
      </Script>

      <Component {...pageProps} />
    </AuthProvider>
  );
}

// Оборачиваем в next-i18next
export default appWithTranslation(MyApp, nextI18NextConfig);