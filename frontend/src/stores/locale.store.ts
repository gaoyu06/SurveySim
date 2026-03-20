import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppLocale = "zh-CN" | "en-US";

type LocaleState = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

export const localeStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "zh-CN",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "formagents-locale" },
  ),
);
