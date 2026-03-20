import { createContext, useContext, useMemo, type ReactNode } from "react";
import { localeStore, type AppLocale } from "@/stores/locale.store";
import { messages } from "./messages";

type TranslateParams = Record<string, string | number>;

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, params?: TranslateParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function formatMessage(template: string, params?: TranslateParams) {
  if (!params) return template;
  return Object.entries(params).reduce((current, [key, value]) => current.replaceAll(`{{${key}}}`, String(value)), template);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = localeStore((state) => state.locale);
  const setLocale = localeStore((state) => state.setLocale);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => {
        const catalog = messages[locale];
        const fallback = messages["en-US"];
        return formatMessage(catalog[key] ?? fallback[key] ?? key, params);
      },
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
