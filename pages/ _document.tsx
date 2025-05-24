// pages/_document.tsx
import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentContext,
} from "next/document";

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps };
  }

  render() {
    return (
      <Html lang="ru">
        <Head>
          {/* Yandex.Metrika: асинхронный загрузчик */}
          <script
            async
            src="https://mc.yandex.ru/metrika/tag.js"
          />
          {/* Инициализация счётчика */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
                window.ym = window.ym || function() {
                  (window.ym.a = window.ym.a || []).push(arguments);
                };
                ym(102132289, "init", {
                  clickmap:true,
                  trackLinks:true,
                  accurateTrackBounce:true,
                  webvisor:true
                });
              `,
            }}
          />
        </Head>
        <body>
          {/* Для случаев без JS */}
          <noscript>
            <div>
              <img
                src="https://mc.yandex.ru/watch/102132289"
                style={{ position: "absolute", left: "-9999px" }}
                alt="yandex metrika"
              />
            </div>
          </noscript>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;