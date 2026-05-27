import { en } from "./en";
import { zh } from "./zh";
import { fr } from "./fr";

export type Lang = "en" | "zh" | "fr";
export type I18nDict = typeof en;

export const dictionaries: Record<Lang, I18nDict> = { en, zh, fr };

export const SUPPORTED: Lang[] = ["en", "zh", "fr"];
export const STORAGE_KEY = "braincode-lang";

export function pickInitialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED.includes(stored as Lang)) return stored as Lang;
  return "en";
}

export function applyLang(lang: Lang): void {
  const dict = dictionaries[lang] ?? dictionaries.en;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key && key in dict) el.textContent = dict[key as keyof I18nDict];
  });
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLButtonElement>(".lang-switch button").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
  });
  localStorage.setItem(STORAGE_KEY, lang);
}
