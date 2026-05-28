import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { useI18n } from "../i18n";
import { createHeroTimeline, createReveal, createScaleReveal } from "../animations";
import routingUrl from "../assets/routing-diagram.png";

declare const __VERSION__: string;

const ROLES = [
  "Frontend", "Backend", "Designer", "DBA", "DevOps",
  "Security", "QA", "Rush", "Librarian", "Review",
  "Oracle", "Summarize", "routeBrain", "BrainPet",
];

export function Home() {
  const { t } = useI18n();
  const mainRef = useRef<HTMLElement>(null);

  const copyInstall = () => navigator.clipboard.writeText("npm i -g @taotao7/braincode");

  useGSAP(() => {
    if (!mainRef.current) return;

    // Hero cascade
    const heroTl = createHeroTimeline(mainRef.current, [
      ".hero .eyebrow",
      ".hero h1",
      ".hero .hero-tagline",
      ".hero .lead",
      ".hero .hero-cta",
      ".hero .code-block",
      ".hero .workflow-strip span",
    ]);
    if (heroTl) {
      heroTl.from(".hero-img", {
        x: 60,
        autoAlpha: 0,
        duration: 1,
        ease: "power3.out",
      }, "-=0.5");
    }

    // Features
    createReveal(mainRef.current, "#features .eyebrow, #features h2", { y: 24, stagger: 0.1 });
    createReveal(mainRef.current, "#features .feature", {
      y: 36,
      stagger: 0.12,
      duration: 0.7,
    }, { start: "top 85%" });

    // Intent Graph
    createReveal(mainRef.current, "#intent .eyebrow, #intent h2, #intent .lead", {
      y: 24,
      stagger: 0.1,
    });
    createScaleReveal(mainRef.current, "#intent .intent-graph-frame", {
      y: 40,
      duration: 0.8,
    }, { start: "top 85%" });
    createReveal(mainRef.current, "#intent .pillar", {
      y: 30,
      stagger: 0.1,
    }, { start: "top 88%" });

    // Runtime Output
    createReveal(mainRef.current, "#output .eyebrow, #output h2, #output .lead", {
      y: 24,
      stagger: 0.1,
    });
    createScaleReveal(mainRef.current, "#output .runtime-frame", {
      y: 40,
      duration: 0.8,
    }, { start: "top 85%" });
    createReveal(mainRef.current, "#output .pillar", {
      y: 30,
      stagger: 0.1,
    }, { start: "top 88%" });

    // Modes
    createReveal(mainRef.current, "#modes .eyebrow, #modes h2", {
      y: 24,
      stagger: 0.1,
    });
    createScaleReveal(mainRef.current, "#modes .card", {
      y: 30,
      scale: 0.95,
      stagger: 0.15,
      duration: 0.7,
    }, { start: "top 85%" });

    // Handoff
    createReveal(mainRef.current, "#handoff .eyebrow, #handoff h2, #handoff .lead", {
      y: 24,
      stagger: 0.1,
    });
    createScaleReveal(mainRef.current, "#handoff .handoff-packet", {
      y: 40,
      duration: 0.8,
    }, { start: "top 85%" });
    createReveal(mainRef.current, "#handoff .feature", {
      y: 28,
      stagger: 0.12,
    }, { start: "top 88%" });

    // Roles
    createReveal(mainRef.current, "#roles .eyebrow, #roles h2, #roles .lead", {
      y: 24,
      stagger: 0.1,
    });
    createReveal(mainRef.current, "#roles .role-tag", {
      y: 20,
      scale: 0.95,
      stagger: { amount: 0.4, from: "random" },
      duration: 0.5,
      ease: "back.out(1.4)",
    }, { start: "top 88%" });
    createReveal(mainRef.current, "#roles .ph-img", {
      y: 30,
      stagger: 0.15,
    }, { start: "top 85%" });

    // Install CTA
    createScaleReveal(mainRef.current, "#install h2, #install .lead, #install .code-block, #install .btn", {
      y: 24,
      stagger: 0.1,
      duration: 0.6,
    }, { start: "top 88%" });
  }, { scope: mainRef });

  return (
    <main id="content" ref={mainRef}>
      {/* Hero Split */}
      <section className="section hero">
        <div className="container hero-split">
          <div>
            <p className="eyebrow"><span>{__VERSION__}</span> <span>{t("release_label")}</span></p>
            <h1><span>{t("hero_title_1")}</span></h1>
            <p className="hero-tagline">{t("hero_title_2")}</p>
            <p className="lead" style={{ marginTop: 20 }}>{t("hero_lead")}</p>
            <div className="hero-cta" style={{ marginTop: 40 }}>
              <button className="btn btn-primary" onClick={copyInstall}>{t("btn_npm_install")}</button>
              <a href="#/docs" className="btn btn-secondary btn-arrow">{t("btn_docs")}</a>
            </div>
            <div className="code-block">
              <code>$ <span>braincode run</span> "add login validation"</code>
            </div>
            <div className="workflow-strip" aria-label={t("workflow_label")}>
              <span>{t("workflow_step_1")}</span>
              <span>{t("workflow_step_2")}</span>
              <span>{t("workflow_step_3")}</span>
              <span>{t("workflow_step_4")}</span>
              <span>{t("workflow_step_5")}</span>
            </div>
          </div>
          <div className="ph-img wide hero-img" aria-label="Woodcut diagram of a brain routing tasks to multiple models">
            <img src={routingUrl} alt="Braincode routing diagram" />
          </div>
        </div>
      </section>

      {/* Features Triplet */}
      <section className="section" id="features">
        <div className="container stack" style={{ gap: 56 }}>
          <div style={{ maxWidth: "48ch" }}>
            <p className="eyebrow">{t("section_arch_eyebrow")}</p>
            <h2>{t("section_arch_title")}</h2>
          </div>
          <div className="grid-3">
            <div className="feature">
              <div className="feature-mark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v18M3 12h18"/></svg>
              </div>
              <h3>{t("feature_1_title")}</h3>
              <p>{t("feature_1_body")}</p>
            </div>
            <div className="feature">
              <div className="feature-mark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              </div>
              <h3>{t("feature_2_title")}</h3>
              <p>{t("feature_2_body")}</p>
            </div>
            <div className="feature">
              <div className="feature-mark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 16V7a2 2 0 00-2-2H6a2 2 0 00-2 2v9m16 0H4m16 0l1.28 2.55a1 1 0 01-.9 1.45H3.62a1 1 0 01-.9-1.45L4 16"/></svg>
              </div>
              <h3>{t("feature_3_title")}</h3>
              <p>{t("feature_3_body")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Intent Graph */}
      <section className="section" id="intent">
        <div className="container stack" style={{ gap: 48 }}>
          <div className="grid-1-2" style={{ alignItems: "end" }}>
            <div>
              <p className="eyebrow">{t("section_intent_eyebrow")}</p>
              <h2>{t("section_intent_title")}</h2>
            </div>
            <p className="lead" style={{ border: "none", padding: 0 }}>{t("section_intent_lead")}</p>
          </div>
          <div className="intent-graph-frame">
            <div className="intent-graph-bar">
              <span><span className="pill">▮</span> &nbsp;INTENT GRAPH &nbsp;·&nbsp; PRIMARY = BACKEND &nbsp;·&nbsp; ROUTING = routeBrain</span>
              <span>{t("intent_refresh_hint")}</span>
            </div>
            <div className="intent-graph-scroll">
              <pre className="intent-graph" dangerouslySetInnerHTML={{ __html: "Intent · <span class=\"key\">Default Brain</span> (brain)\nMode · radical — broader specialist decomposition\nPrimary · <span class=\"role\">backend</span>\nRouting · routeBrain\nConfidence · 86%\nReason · auth, API, and schema changes need specialist support\nWorkers · <span class=\"role\">backend</span> (primary), <span class=\"role\">librarian</span>, <span class=\"role\">security</span>, <span class=\"role\">dba</span>, <span class=\"role\">review</span>, <span class=\"role\">qa</span>\nBudget · workers 4, parallel 4, todos 8\nModel · <span class=\"key\">cliproxyapi/claude-opus-4-7</span>\nTools · parallel\n\nTodo Graph:\n                            <span class=\"line\">┌─▶</span> <span class=\"ok\">☑</span> <span class=\"role\">librarian</span>: map auth flow  <span class=\"line\">─┐</span>\n                            <span class=\"line\">├─▶</span> <span class=\"ok\">☑</span> <span class=\"role\">security</span>:  auth risks    <span class=\"line\">─┤</span>\n <span class=\"ok\">●</span> brain root (<span class=\"role\">backend</span>) <span class=\"line\">────┼─▶</span> <span class=\"ok\">☑</span> <span class=\"role\">dba</span>:       data contract <span class=\"line\">─┼─▶</span> <span class=\"active\">◐</span> <span class=\"role\">backend</span>: implement API <span class=\"line\">─┐</span>\n                            <span class=\"line\">└─▶</span> <span class=\"pending\">☐</span> <span class=\"role\">devops</span>:    check script   <span class=\"line\">─┘</span>                             <span class=\"line\">│</span>\n                                                                                            <span class=\"line\">▼</span>\n                                                                                            <span class=\"pending\">☐</span> <span class=\"role\">review</span>: verify diff\n                                                                                            <span class=\"line\">│</span>\n                                                                                            <span class=\"line\">▼</span>\n                                                                                            <span class=\"pending\">☐</span> <span class=\"role\">qa</span>: regression checks\n\n<span class=\"dim\">Notes:\n  <span class=\"role\">librarian</span> → <span class=\"role\">backend</span>  codebase map feeds implementation\n  <span class=\"role\">security</span>  → <span class=\"role\">backend</span>  auth risk notes constrain the API\n  <span class=\"role\">dba</span>       → <span class=\"role\">backend</span>  data contract pins request/response shape\n  <span class=\"role\">backend</span>   → <span class=\"role\">review</span>   review runs after implementation output exists\n  <span class=\"role\">review</span>    → <span class=\"role\">qa</span>       focused regression checks follow review</span>" }} />
            </div>
          </div>
          <div className="grid-3" style={{ gap: 16 }}>
            <div className="pillar">
              <span className="pillar-num">01</span>
              <h4>{t("intent_pillar_1_title")}</h4>
              <p>{t("intent_pillar_1_body")}</p>
            </div>
            <div className="pillar">
              <span className="pillar-num">02</span>
              <h4>{t("intent_pillar_2_title")}</h4>
              <p>{t("intent_pillar_2_body")}</p>
            </div>
            <div className="pillar">
              <span className="pillar-num">03</span>
              <h4>{t("intent_pillar_3_title")}</h4>
              <p>{t("intent_pillar_3_body")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Runtime Output */}
      <section className="section" id="output">
        <div className="container stack" style={{ gap: 48 }}>
          <div className="grid-1-2" style={{ alignItems: "end" }}>
            <div>
              <p className="eyebrow">{t("section_output_eyebrow")}</p>
              <h2>{t("section_output_title")}</h2>
            </div>
            <p className="lead" style={{ border: "none", padding: 0 }}>{t("section_output_lead")}</p>
          </div>
          <div className="runtime-frame" aria-label="Braincode runtime transcript">
            <div className="runtime-bar">
              <span>{t("output_frame_title")}</span>
              <span>{t("output_frame_hint")}</span>
            </div>
            <div className="runtime-body">
              <div className="runtime-line runtime-line-web">
                <span className="runtime-label">TOOL CALL</span>
                <span className="runtime-type">[WEB SEARCH]</span>
                <span className="runtime-text">web.search · args {"{query=\"Vite GitHub Pages base path\"}"}</span>
              </div>
              <div className="runtime-line runtime-line-exec">
                <span className="runtime-label">TOOL CALL</span>
                <span className="runtime-type">[EXECUTE]</span>
                <span className="runtime-text">shell · args {"{cmd=\"bun run build:site\"}"}</span>
              </div>
              <div className="runtime-line runtime-line-read">
                <span className="runtime-label">TOOL RESULT</span>
                <span className="runtime-type">[READ]</span>
                <span className="runtime-text">get_code_snippet · completed (42ms) · result 18 lines</span>
              </div>
              <div className="runtime-decision">
                <div className="runtime-decision-head">
                  <span className="runtime-label">ASK USER</span>
                  <span className="runtime-type">[EXECUTE]</span>
                  <span className="runtime-text">{t("output_decision_copy")}</span>
                </div>
                <label className="decision-row">
                  <input type="checkbox" defaultChecked />
                  <span>{t("output_decision_approve")}</span>
                </label>
                <label className="decision-row">
                  <input type="checkbox" />
                  <span>{t("output_decision_block")}</span>
                </label>
              </div>
            </div>
          </div>
          <div className="grid-3" style={{ gap: 16 }}>
            <div className="pillar">
              <span className="pillar-num">01</span>
              <h4>{t("output_pillar_1_title")}</h4>
              <p>{t("output_pillar_1_body")}</p>
            </div>
            <div className="pillar">
              <span className="pillar-num">02</span>
              <h4>{t("output_pillar_2_title")}</h4>
              <p>{t("output_pillar_2_body")}</p>
            </div>
            <div className="pillar">
              <span className="pillar-num">03</span>
              <h4>{t("output_pillar_3_title")}</h4>
              <p>{t("output_pillar_3_body")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Execution Modes */}
      <section className="section" id="modes" style={{ background: "var(--fg)", color: "var(--bg)" }}>
        <div className="container stack" style={{ gap: 48 }}>
          <div>
            <p className="eyebrow" style={{ color: "var(--bg)", borderColor: "var(--bg)" }}>{t("section_modes_eyebrow")}</p>
            <h2 style={{ color: "var(--bg)" }}>{t("section_modes_title")}</h2>
          </div>
          <div className="grid-2">
            <div className="card" style={{ background: "var(--bg)", color: "var(--fg)" }}>
              <h3>{t("auto_title")}</h3>
              <hr className="rule-strong" style={{ marginBlock: 16 }} />
              <p style={{ fontWeight: "bold", marginBottom: 24 }}>{t("auto_tagline")}</p>
              <p>{t("auto_body")}</p>
              <div className="meta" style={{ marginTop: 24 }}>{t("auto_meta")}</div>
            </div>
            <div className="card" style={{ background: "var(--accent)", color: "var(--bg)", borderColor: "var(--bg)", boxShadow: "6px 6px 0px var(--bg)" }}>
              <h3>{t("radical_title")}</h3>
              <hr className="rule-strong" style={{ marginBlock: 16, borderColor: "var(--bg)" }} />
              <p style={{ fontWeight: "bold", marginBottom: 24 }}>{t("radical_tagline")}</p>
              <p>{t("radical_body")}</p>
              <div className="meta" style={{ marginTop: 24, color: "var(--bg)", opacity: 0.8 }}>{t("radical_meta")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Handoff Packets */}
      <section className="section" id="handoff">
        <div className="container stack" style={{ gap: 48 }}>
          <div className="grid-1-2" style={{ alignItems: "end" }}>
            <div>
              <p className="eyebrow">{t("section_handoff_eyebrow")}</p>
              <h2>{t("section_handoff_title")}</h2>
            </div>
            <p className="lead" style={{ border: "none", padding: 0 }}>{t("section_handoff_lead")}</p>
          </div>
          <div className="grid-2" style={{ gap: 32, alignItems: "start" }}>
            <div className="handoff-packet">
              <div className="bar">
                <span>{t("handoff_pkt_title")}</span>
                <span>{t("handoff_pkt_phase")}</span>
              </div>
              <pre dangerouslySetInnerHTML={{ __html: "<span class=\"c\">// Brain → agent context transfer</span>\n<span class=\"p\">{</span>\n  <span class=\"k\">\"id\"</span>: <span class=\"s\">\"3b8e…-c4a1\"</span>,\n  <span class=\"k\">\"task\"</span>: <span class=\"p\">{</span>\n    <span class=\"k\">\"id\"</span>:        <span class=\"s\">\"7f12…-19de\"</span>,\n    <span class=\"k\">\"parentId\"</span>:  <span class=\"s\">\"brain-root\"</span>,\n    <span class=\"k\">\"layer\"</span>:     <span class=\"s\">\"agent\"</span>,\n    <span class=\"k\">\"agentRole\"</span>: <span class=\"s\">\"librarian\"</span>,\n    <span class=\"k\">\"goal\"</span>:      <span class=\"s\">\"Map the auth flow\"</span>,\n    <span class=\"k\">\"progress\"</span>:  <span class=\"p\">{</span> <span class=\"k\">\"status\"</span>: <span class=\"s\">\"pending\"</span> <span class=\"p\">}</span>\n  <span class=\"p\">}</span>,\n  <span class=\"k\">\"constraints\"</span>: <span class=\"p\">[</span>\n    <span class=\"s\">\"Run as librarian only.\"</span>,\n    <span class=\"s\">\"No access to other workers' chains.\"</span>,\n    <span class=\"s\">\"Echo taskId and parentId exactly.\"</span>,\n    <span class=\"s\">\"Return concise structured findings.\"</span>\n  <span class=\"p\">]</span>,\n  <span class=\"k\">\"expectedResult\"</span>: <span class=\"s\">\"JSON with summary,\"</span>\n                  <span class=\"s\">\"artifacts, risks, nextQuestions.\"</span>\n<span class=\"p\">}</span>" }} />
            </div>
            <div className="stack" style={{ gap: 20 }}>
              <div className="feature" style={{ boxShadow: "6px 6px 0px var(--fg)" }}>
                <div className="feature-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 16.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z"/></svg>
                </div>
                <h3>{t("handoff_card_1_title")}</h3>
                <p>{t("handoff_card_1_body")}</p>
              </div>
              <div className="feature" style={{ boxShadow: "6px 6px 0px var(--fg)" }}>
                <div className="feature-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>
                </div>
                <h3>{t("handoff_card_2_title")}</h3>
                <p>{t("handoff_card_2_body")}</p>
              </div>
              <div className="feature" style={{ boxShadow: "6px 6px 0px var(--fg)" }}>
                <div className="feature-mark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </div>
                <h3>{t("handoff_card_3_title")}</h3>
                <p>{t("handoff_card_3_body")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="section" id="roles">
        <div className="container grid-2-1">
          <div>
            <p className="eyebrow">{t("section_roles_eyebrow")}</p>
            <h2>{t("section_roles_title")}</h2>
            <p className="lead" style={{ marginBlock: 24 }}>{t("section_roles_lead")}</p>
            <div className="role-grid">
              {ROLES.map((r) => <div className="role-tag" key={r}>{r}</div>)}
            </div>
            <p className="meta" style={{ marginTop: 16 }}>{t("section_roles_removed")}</p>
          </div>
          <div className="stack" style={{ gap: 24 }}>
            <div className="ph-img portrait" aria-label="Terminal TUI showing BrainPet">
              <span style={{ fontSize: 12 }}>[ Terminal TUI &amp; BrainPet ]</span>
            </div>
            <div className="ph-img wide" aria-label="Browser config interface">
              <span style={{ fontSize: 12 }}>[ Browser Config UI ]</span>
            </div>
          </div>
        </div>
      </section>

      {/* Install CTA */}
      <section className="section" id="install" style={{ textAlign: "center", borderTop: "4px solid var(--fg)" }}>
        <div className="container stack" style={{ alignItems: "center", maxWidth: 600 }}>
          <h2>{t("section_cta_title")}</h2>
          <p className="lead" style={{ margin: "16px auto 32px", border: "none", textAlign: "center" }}>{t("section_cta_lead")}</p>
          <div className="stack" style={{ width: "100%", gap: 16 }}>
            <div className="code-block" style={{ margin: 0, justifyContent: "flex-start", gap: 16 }}>
              <span style={{ color: "var(--muted)" }}># npm</span>
              <code>npm i -g @taotao7/braincode</code>
            </div>
            <div className="code-block" style={{ margin: 0, justifyContent: "flex-start", gap: 16 }}>
              <span style={{ color: "var(--muted)" }}># homebrew</span>
              <code>brew install taotao7/tap/braincode</code>
            </div>
          </div>
          <a href="https://github.com/taotao7/braincode#readme" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ marginTop: 32 }}>{t("cta_docs")}</a>
        </div>
      </section>
    </main>
  );
}
