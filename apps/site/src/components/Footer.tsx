import { useI18n } from "../i18n";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="pagefoot" style={{ background: "var(--fg)", color: "var(--bg)" }}>
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
