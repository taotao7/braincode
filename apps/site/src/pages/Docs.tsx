import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { useI18n, type I18nKey } from "../i18n";
import { createReveal, createDocsReveal } from "../animations";

const TOC_IDS = [
  "docs_setup",
  "docs_home",
  "docs_brain",
  "docs_modes",
  "docs_mcp",
  "docs_skills",
  "docs_agents",
  "docs_hooks",
  "docs_config_ui",
  "docs_cli",
  "docs_troubleshoot",
] as const;

function H2({ id, k }: { id: string; k: I18nKey }) {
  const { t } = useI18n();
  return <h2 id={id}>{t(k)}</h2>;
}

function P({ k }: { k: I18nKey }) {
  const { t } = useI18n();
  return <p>{t(k)}</p>;
}

function TocLink({ id, children }: { id: string; children: React.ReactNode }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return <a href={`#${id}`} onClick={handleClick}>{children}</a>;
}

function FileEntry({ title, body }: { title: I18nKey; body: I18nKey }) {
  const { t } = useI18n();
  return (
    <div className="file-entry">
      <h4><code>{t(title)}</code></h4>
      <p>{t(body)}</p>
    </div>
  );
}

export function Docs() {
  const { t } = useI18n();
  const mainRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    if (!mainRef.current) return;

    // Docs page entrance
    createReveal(mainRef.current, ".docs-back", { y: 16 });
    createReveal(mainRef.current, ".docs-toc", {
      x: -20,
      autoAlpha: 0,
      duration: 0.5,
    });

    // Body sections — staggered by element type
    createDocsReveal(mainRef.current, ".docs-body > h2");
    createDocsReveal(mainRef.current, ".docs-body > h3");
    createDocsReveal(mainRef.current, ".docs-body > p");
    createDocsReveal(mainRef.current, ".docs-body > pre");
    createDocsReveal(mainRef.current, ".docs-body > .code-block");
    createDocsReveal(mainRef.current, ".docs-body > .file-entry");
    createDocsReveal(mainRef.current, ".docs-body > .grid-2");
    createDocsReveal(mainRef.current, ".docs-body > .role-grid");
  }, { scope: mainRef });

  return (
    <main id="content" ref={mainRef}>
      <section className="section">
        <div className="container">
          <a href="#/" className="docs-back">{t("docs_back_home")}</a>

          <div className="docs-layout">
            {/* Sidebar TOC */}
            <nav className="docs-toc">
              <h3>{t("docs_toc_title")}</h3>
              {TOC_IDS.map((id) => (
                <TocLink id={id} key={id}>{t(id + "_title" as I18nKey)}</TocLink>
              ))}
            </nav>

            {/* Main docs body */}
            <div className="docs-body">
              <h2>{t("docs_page_title")}</h2>
              <p>{t("docs_page_lead")}</p>

              {/* 1. Setup */}
              <H2 id="docs_setup" k="docs_setup_title" />
              <P k="docs_setup_intro" />
              <h3>{t("docs_setup_npm_title")}</h3>
              <div className="code-block" style={{ margin: "8px 0 16px", justifyContent: "flex-start", gap: 16 }}>
                <span style={{ color: "var(--muted)" }}>#</span>
                <code>npm i -g @taotao7/braincode</code>
              </div>
              <P k="docs_setup_npm_body" />
              <h3>{t("docs_setup_brew_title")}</h3>
              <div className="code-block" style={{ margin: "8px 0 16px", justifyContent: "flex-start", gap: 16 }}>
                <span style={{ color: "var(--muted)" }}>#</span>
                <code>brew install taotao7/tap/braincode</code>
              </div>
              <P k="docs_setup_brew_body" />
              <h3>{t("docs_setup_source_title")}</h3>
              <pre>{"git clone https://github.com/taotao7/braincode.git\ncd braincode\nbun install\nbun run braincode"}</pre>
              <P k="docs_setup_source_body" />
              <h3>{t("docs_setup_first_run_title")}</h3>
              <pre>{"braincode          # launch interactive TUI\nbraincode config   # start local config server"}</pre>
              <P k="docs_setup_first_run_body" />

              {/* 2. ~/.braincode/ */}
              <H2 id="docs_home" k="docs_home_title" />
              <P k="docs_home_intro" />
              <h3>{t("docs_home_files_title")}</h3>
              <FileEntry title="docs_home_settings_title" body="docs_home_settings_body" />
              <FileEntry title="docs_home_auth_title" body="docs_home_auth_body" />
              <FileEntry title="docs_home_brains_title" body="docs_home_brains_body" />
              <FileEntry title="docs_home_models_title" body="docs_home_models_body" />
              <FileEntry title="docs_home_tools_title" body="docs_home_tools_body" />
              <FileEntry title="docs_home_hooks_title" body="docs_home_hooks_body" />
              <FileEntry title="docs_home_sessions_title" body="docs_home_sessions_body" />
              <FileEntry title="docs_home_logs_title" body="docs_home_logs_body" />

              {/* 3. Brain Models */}
              <H2 id="docs_brain" k="docs_brain_title" />
              <P k="docs_brain_intro" />
              <h3>{t("docs_brain_example_title")}</h3>
              <pre dangerouslySetInnerHTML={{ __html: "<span class=\"p\">{</span>\n  <span class=\"k\">\"id\"</span>: <span class=\"s\">\"default\"</span>,\n  <span class=\"k\">\"name\"</span>: <span class=\"s\">\"Default Brain\"</span>,\n  <span class=\"k\">\"planner\"</span>: <span class=\"s\">\"cliproxyapi/claude-opus-4-7\"</span>,\n  <span class=\"k\">\"roles\"</span>: <span class=\"p\">{</span>\n    <span class=\"k\">\"routeBrain\"</span>:  <span class=\"s\">\"cliproxyapi/claude-sonnet-4-5\"</span>,\n    <span class=\"k\">\"frontend\"</span>:   <span class=\"s\">\"cliproxyapi/claude-sonnet-4-5\"</span>,\n    <span class=\"k\">\"backend\"</span>:    <span class=\"s\">\"cliproxyapi/claude-opus-4-7\"</span>,\n    <span class=\"k\">\"review\"</span>:     <span class=\"s\">\"cliproxyapi/claude-sonnet-4-5\"</span>,\n    <span class=\"k\">\"security\"</span>:   <span class=\"s\">\"cliproxyapi/claude-opus-4-7\"</span>,\n    <span class=\"k\">\"librarian\"</span>:  <span class=\"s\">\"cliproxyapi/claude-sonnet-4-5\"</span>,\n    <span class=\"k\">\"rush\"</span>:       <span class=\"s\">\"cliproxyapi/claude-haiku-3-5\"</span>\n  <span class=\"p\">}</span>,\n  <span class=\"k\">\"fallback\"</span>: <span class=\"s\">\"cliproxyapi/claude-sonnet-4-5\"</span>,\n  <span class=\"k\">\"escalation\"</span>: <span class=\"s\">\"cost &gt; 0.05 ⇒ switch to sonnet\"</span>\n<span class=\"p\">}</span>" }} />
              <h3>{t("docs_brain_roles_title")}</h3>
              <P k="docs_brain_roles_body" />
              <div className="role-grid" style={{ marginTop: 12 }}>
                {["Frontend","Backend","Designer","DBA","DevOps","Security","QA","Rush","Librarian","Review","Oracle","Summarize","routeBrain","BrainPet"].map(r => <div className="role-tag" key={r}>{r}</div>)}
              </div>

              {/* 4. Execution Modes */}
              <H2 id="docs_modes" k="docs_modes_title" />
              <P k="docs_modes_intro" />
              <div className="grid-2" style={{ gap: 24, margin: "16px 0" }}>
                <div className="card">
                  <h3>Auto</h3>
                  <hr className="rule-strong" style={{ marginBlock: 12 }} />
                  <p>{t("docs_modes_auto_body")}</p>
                </div>
                <div className="card" style={{ background: "var(--accent)", color: "var(--bg)", borderColor: "var(--fg)", boxShadow: "6px 6px 0px var(--fg)" }}>
                  <h3>Radical</h3>
                  <hr className="rule-strong" style={{ marginBlock: 12, borderColor: "var(--bg)" }} />
                  <p>{t("docs_modes_radical_body")}</p>
                </div>
              </div>
              <P k="docs_modes_switch_hint" />

              {/* 5. MCP */}
              <H2 id="docs_mcp" k="docs_mcp_title" />
              <P k="docs_mcp_intro" />
              <h3>{t("docs_mcp_file_title")}</h3>
              <pre dangerouslySetInnerHTML={{ __html: "<span class=\"p\">{</span>\n  <span class=\"k\">\"mcpServers\"</span>: <span class=\"p\">{</span>\n    <span class=\"k\">\"my-db\"</span>: <span class=\"p\">{</span>\n      <span class=\"k\">\"transport\"</span>: <span class=\"s\">\"stdio\"</span>,\n      <span class=\"k\">\"command\"</span>:   <span class=\"s\">\"npx\"</span>,\n      <span class=\"k\">\"args\"</span>:     <span class=\"p\">[</span><span class=\"s\">\"-y\"</span>, <span class=\"s\">\"@modelcontextprotocol/server-postgres\"</span><span class=\"p\">]</span>,\n      <span class=\"k\">\"env\"</span>:      <span class=\"p\">{</span> <span class=\"k\">\"DATABASE_URL\"</span>: <span class=\"s\">\"$POSTGRES_URI\"</span> <span class=\"p\">}</span>\n    <span class=\"p\">}</span>\n  <span class=\"p\">}</span>\n<span class=\"p\">}</span>" }} />
              <P k="docs_mcp_file_body" />
              <h3>{t("docs_mcp_security_title")}</h3>
              <P k="docs_mcp_security_body" />

              {/* 6. Skills */}
              <H2 id="docs_skills" k="docs_skills_title" />
              <P k="docs_skills_intro" />
              <h3>{t("docs_skills_file_title")}</h3>
              <pre>{".agents/skill/\n  run-qa/\n    SKILL.md          ← prompt + workflow\n    reference.md      ← optional supporting docs\n  deploy-staging/\n    SKILL.md"}</pre>
              <P k="docs_skills_file_body" />
              <h3>{t("docs_skills_use_title")}</h3>
              <P k="docs_skills_use_body" />

              {/* 7. AGENTS.md */}
              <H2 id="docs_agents" k="docs_agents_title" />
              <P k="docs_agents_intro" />

              {/* 8. Hooks */}
              <H2 id="docs_hooks" k="docs_hooks_title" />
              <P k="docs_hooks_intro" />
              <pre dangerouslySetInnerHTML={{ __html: "<span class=\"c\">// .agents/hooks.json</span>\n<span class=\"p\">{</span>\n  <span class=\"k\">\"hooks\"</span>: <span class=\"p\">[</span>\n    <span class=\"p\">{</span>\n      <span class=\"k\">\"event\"</span>: <span class=\"s\">\"post-tool\"</span>,\n      <span class=\"k\">\"tool\"</span>:  <span class=\"s\">\"write\"</span>,\n      <span class=\"k\">\"command\"</span>: <span class=\"s\">\"npx prettier --write $FILE\"</span>,\n      <span class=\"k\">\"trusted\"</span>: <span class=\"s\">true</span>\n    <span class=\"p\">}</span>\n  <span class=\"p\">]</span>\n<span class=\"p\">}</span>" }} />

              {/* 9. Config UI */}
              <H2 id="docs_config_ui" k="docs_config_ui_title" />
              <P k="docs_config_ui_intro" />

              {/* 10. CLI Reference */}
              <H2 id="docs_cli" k="docs_cli_title" />
              <P k="docs_cli_intro" />
              <div className="file-entry">
                <h4><code>braincode</code></h4>
                <p>{t("docs_cli_cmd_default")}</p>
              </div>
              <div className="file-entry">
                <h4><code>braincode config</code></h4>
                <p>{t("docs_cli_cmd_config")}</p>
              </div>
              <div className="file-entry">
                <h4><code>braincode run &lt;task&gt;</code></h4>
                <p>{t("docs_cli_cmd_run")}</p>
              </div>
              <div className="file-entry">
                <h4><code>braincode run --dry-run &lt;task&gt;</code></h4>
                <p>{t("docs_cli_cmd_dry")}</p>
              </div>
              <div className="file-entry">
                <h4><code>braincode run --dry-run --heuristic &lt;task&gt;</code></h4>
                <p>{t("docs_cli_cmd_dry_heuristic")}</p>
              </div>
              <div className="file-entry">
                <h4><code>/plan &lt;task&gt;</code></h4>
                <p>{t("docs_cli_cmd_plan")}</p>
              </div>
              <div className="file-entry">
                <h4><code>/plan --heuristic &lt;task&gt;</code></h4>
                <p>{t("docs_cli_cmd_plan_heuristic")}</p>
              </div>
              <div className="file-entry">
                <h4><code>/intent</code> / <code>Ctrl+O</code></h4>
                <p>{t("docs_cli_cmd_intent")}</p>
              </div>
              <div className="file-entry">
                <h4><code>braincode daemon</code></h4>
                <p>{t("docs_cli_cmd_daemon")}</p>
              </div>

              {/* 11. Troubleshooting */}
              <H2 id="docs_troubleshoot" k="docs_troubleshoot_title" />
              <h3>{t("docs_troubleshoot_keys_title")}</h3>
              <P k="docs_troubleshoot_keys_body" />
              <h3>{t("docs_troubleshoot_models_title")}</h3>
              <P k="docs_troubleshoot_models_body" />
              <h3>{t("docs_troubleshoot_reset_title")}</h3>
              <P k="docs_troubleshoot_reset_body" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
