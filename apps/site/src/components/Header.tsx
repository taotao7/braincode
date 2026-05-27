import { useI18n, type Lang } from "../i18n";
import logoUrl from "../assets/logo.png";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const switchLang = (l: Lang) => { setLang(l); };

  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <a href="#/" className="logo">
          <img src={logoUrl} alt="Braincode" />
          Braincode
        </a>
        <nav>
          <a href="#/#features">{t("nav_arch")}</a>
          <a href="#/#intent">{t("nav_intent")}</a>
          <a href="#/#output">{t("nav_output")}</a>
          <a href="#/#handoff">{t("nav_handoff")}</a>
          <a href="#/#modes">{t("nav_modes")}</a>
          <a href="#/#install">{t("nav_install")}</a>
          <a href="#/docs">{t("nav_docs")}</a>
          <a href="https://github.com/taotao7/braincode" target="_blank" rel="noopener noreferrer">
            {t("nav_github")}
          </a>
        </nav>
        <div className="lang-switch" role="group" aria-label="Language">
          <button type="button" className={lang === "en" ? "active" : ""} onClick={() => switchLang("en")}>EN</button>
          <button type="button" className={lang === "zh" ? "active" : ""} onClick={() => switchLang("zh")}>中</button>
          <button type="button" className={lang === "fr" ? "active" : ""} onClick={() => switchLang("fr")}>FR</button>
        </div>
      </div>
    </header>
  );
}
