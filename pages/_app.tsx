// pages/_app.tsx
import type { AppProps } from 'next/app';
import Script from 'next/script';
import { appWithTranslation } from 'next-i18next';
import nextI18NextConfig from '../next-i18next.config.js';
import { AuthProvider } from '../context/AuthContext';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* 1. Подключаем сам скрипт Яндекс.Метрики */}
      <Script
        strategy="afterInteractive"
        src="https://mc.yandex.ru/metrika/tag.js"
      />

      {/* 2. Инициализируем счётчик */}
      <Script
        id="yandex-metrika-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.ym = window.ym || function(){(window.ym.a = window.ym.a || []).push(arguments)};
            ym(102132289, 'init', {
              clickmap:true,
              trackLinks:true,
              accurateTrackBounce:true,
              webvisor:true
            });
          `,
        }}
      />

      {/* 3. Для пользователей без JavaScript */}
      <noscript>
        <div>
          <img
            src="https://mc.yandex.ru/watch/102132289"
            style={{ position: 'absolute', left: '-9999px' }}
            alt="Yandex.Metrika"
          />
        </div>
      </noscript>

      {/* 4. Остальная логика приложения */}
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </>
  );
}

// Передаём конфиг next-i18next вторым аргументом
export default appWithTranslation(MyApp, nextI18NextConfig);