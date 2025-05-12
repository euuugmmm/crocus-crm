// components/LanguageSwitcher.tsx
import { useRouter } from "next/router";

const LanguageSwitcher = () => {
  const router = useRouter();
  const { locale, locales, asPath } = router;

  const changeLanguage = (lang: string) => {
    router.push(asPath, asPath, { locale: lang });
  };

  return (
    <div className="mb-4 text-center space-x-2">
      {locales?.map((lang) => (
        <button
          key={lang}
          onClick={() => changeLanguage(lang)}
          className={`px-2 py-1 border rounded ${
            lang === locale ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;