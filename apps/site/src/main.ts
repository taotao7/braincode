import "./styles/index.css";
import { applyLang, pickInitialLang } from "./i18n";

declare const __VERSION__: string;

document.querySelectorAll<HTMLButtonElement>(".lang-switch button").forEach((btn) => {
  btn.addEventListener("click", () => applyLang(btn.getAttribute("data-lang") as "en" | "zh" | "fr"));
});

// Inject version into the eyebrow
const versionEl = document.querySelector<HTMLElement>("[data-od-id='hero-split'] .eyebrow");
if (versionEl) {
  const text = versionEl.textContent ?? "";
  versionEl.textContent = text.replace("__VERSION__", __VERSION__);
}

applyLang(pickInitialLang());
