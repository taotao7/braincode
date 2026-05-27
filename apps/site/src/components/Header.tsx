import { useNavigate, useLocation } from "react-router-dom";
import { useI18n, type Lang } from "../i18n";
import logoUrl from "../assets/logo.png";

function ScrollLink({ to, section, children }: { to: string; section: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const scroll = () => {
      const el = document.getElementById(section);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (location.pathname !== to) {
      navigate(to);
      requestAnimationFrame(() => setTimeout(scroll, 50));
    } else {
      scroll();
    }
  };

  return <a href={`#/${section}`} onClick={handleClick}>{children}</a>;
}

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
          <ScrollLink to="/" section="features">{t("nav_arch")}</ScrollLink>
          <ScrollLink to="/" section="intent">{t("nav_intent")}</ScrollLink>
          <ScrollLink to="/" section="output">{t("nav_output")}</ScrollLink>
          <ScrollLink to="/" section="handoff">{t("nav_handoff")}</ScrollLink>
          <ScrollLink to="/" section="modes">{t("nav_modes")}</ScrollLink>
          <ScrollLink to="/" section="install">{t("nav_install")}</ScrollLink>
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
