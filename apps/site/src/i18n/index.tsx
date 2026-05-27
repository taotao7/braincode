import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { en } from "./en";
import { zh } from "./zh";
import { fr } from "./fr";

export type Lang = "en" | "zh" | "fr";
export type I18nKey = keyof typeof en;
export type I18nDict = Record<I18nKey, string>;

export const dictionaries: Record<Lang, I18nDict> = { en, zh, fr };
export const SUPPORTED: Lang[] = ["en", "zh", "fr"];
const STORAGE_KEY = "braincode-lang";

export function pickInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED.includes(stored as Lang)) return stored as Lang;
  return "en";
}

interface I18nContextValue {
  lang: Lang;
  t: (key: I18nKey) => string;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(pickInitialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.documentElement.lang = next;
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: I18nKey): string => {
      const dict = dictionaries[lang] ?? dictionaries.en;
      return dict[key] ?? key;
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, t, setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
