import "./styles/index.css";
import { applyLang, pickInitialLang } from "./i18n";

declare const __VERSION__: string;

document.querySelectorAll<HTMLButtonElement>(".lang-switch button").forEach((btn) => {
  btn.addEventListener("click", () => applyLang(btn.getAttribute("data-lang") as "en" | "zh" | "fr"));
});

document.querySelectorAll<HTMLInputElement>(".runtime-decision input[type='checkbox']").forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    document.querySelectorAll<HTMLInputElement>(".runtime-decision input[type='checkbox']").forEach((other) => {
      if (other !== input) other.checked = false;
    });
  });
});

// Inject version into the eyebrow
const versionEl = document.querySelector<HTMLElement>("[data-version]");
if (versionEl) {
  versionEl.textContent = __VERSION__;
}

applyLang(pickInitialLang());
