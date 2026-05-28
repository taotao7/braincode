import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { useI18n } from "../i18n";
import { createReveal } from "../animations";

export function Footer() {
  const { t } = useI18n();
  const footerRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    if (!footerRef.current) return;
    createReveal(footerRef.current, ".row-between > span, .row-between a", {
      y: 16,
      stagger: 0.06,
      duration: 0.5,
    }, { start: "top 95%" });
  }, { scope: footerRef });

  return (
    <footer className="pagefoot" ref={footerRef} style={{ background: "var(--fg)", color: "var(--bg)" }}>
      <div className="container row-between">
        <span style={{ fontWeight: "bold", textTransform: "uppercase" }}>© Braincode · 2026</span>
        <div style={{ display: "flex", gap: "16px" }}>
          <a href="https://github.com/taotao7/braincode#readme" className="meta" style={{ color: "var(--bg)" }}>{t("footer_docs")}</a>
          <a href="https://github.com/taotao7/braincode" className="meta" style={{ color: "var(--bg)" }}>{t("footer_github")}</a>
          <a href="https://github.com/taotao7/braincode/blob/main/LICENSE" className="meta" style={{ color: "var(--bg)" }}>{t("footer_license")}</a>
        </div>
      </div>
    </footer>
  );
}
