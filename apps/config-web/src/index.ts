export const configWebHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BRAIN/CODE · Local AI Control Panel</title>
    <link rel="icon" href="/resources/logo.png" type="image/png" />
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f0e8;
        --surface: #faf8f4;
        --fg: #2d2a27;
        --muted: #6b6560;
        --border: #c4b8a8;
        --accent: #458588;
        --accent-soft: color-mix(in srgb, var(--accent) 15%, transparent);
        --fg-soft: color-mix(in srgb, var(--fg) 8%, transparent);
        --bg-hover: #ede8e0;
        --danger-fg: #9d0006;
        --danger-bg: color-mix(in srgb, var(--danger-fg) 10%, var(--surface));
        --danger-border: color-mix(in srgb, var(--danger-fg) 30%, var(--border));
        --pre-bg: #ede8e0;
        --pre-border: #d4c8b8;
        --pre-fg: #1f1d1b;
        --font-display: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif;
        --font-body: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif;
        --font-mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace;
        --fs-h1: clamp(32px, 5vw, 48px);
        --fs-h2: 20px;
        --fs-h3: 16px;
        --fs-lead: 15px;
        --fs-body: 14px;
        --fs-meta: 12px;
        --gap-xs: 6px;
        --gap-sm: 10px;
        --gap-md: 16px;
        --gap-lg: 24px;
        --gap-xl: 40px;
        --container: 1200px;
        --gutter: 24px;
        --radius: 4px;
        --radius-lg: 6px;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          color-scheme: dark;
          --bg: #1a1d21;
          --surface: #25292e;
          --fg: #d4d4d4;
          --muted: #8a8f96;
          --border: #3a3f45;
          --accent: #8be9fd;
          --accent-soft: color-mix(in srgb, var(--accent) 15%, transparent);
          --fg-soft: color-mix(in srgb, var(--fg) 8%, transparent);
          --bg-hover: #2d3238;
          --danger-fg: #ff5555;
          --danger-bg: color-mix(in srgb, var(--danger-fg) 15%, var(--surface));
          --danger-border: color-mix(in srgb, var(--danger-fg) 40%, var(--border));
          --pre-bg: #1f2327;
          --pre-border: #3a3f45;
          --pre-fg: #f8f8f2;
        }
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--fg);
        background: var(--bg);
        font-family: var(--font-body);
        font-size: var(--fs-body);
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
      }
      .page {
        min-height: 100vh;
      }
      header {
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        padding-block: 16px;
      }
      .container { max-width: var(--container); margin-inline: auto; padding-inline: var(--gutter); }
      .hero-split { display: flex; align-items: center; justify-content: space-between; gap: var(--gap-lg); }
      .kicker {
        margin: 0 0 4px;
        color: var(--muted);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        color: var(--fg);
        font-family: var(--font-mono);
        font-size: var(--fs-h1);
        font-weight: 600;
        line-height: 1.1;
        letter-spacing: -0.02em;
      }
      h2, h3 {
        margin: 0;
        color: var(--fg);
        font-family: var(--font-display);
        font-weight: 600;
        text-wrap: balance;
      }
      h2 {
        margin-bottom: var(--gap-md);
        padding-bottom: var(--gap-sm);
        border-bottom: 1px solid var(--border);
        font-size: var(--fs-h2);
        line-height: 1.2;
      }
      h3 { font-size: var(--fs-h3); }
      p { text-wrap: pretty; }
      main { padding-block: 0 var(--gap-lg); }
      section {
        padding-block: var(--gap-lg);
        border-bottom: 1px solid var(--border);
      }
      label { display: block; margin-bottom: 4px; color: var(--fg); font-size: 13px; font-weight: 500; }
      input, select, textarea {
        width: 100%;
        padding: 6px 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        outline: none;
        background: var(--surface);
        color: var(--fg);
        font: 13px var(--font-mono);
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      input:focus, select:focus, textarea:focus, .combo-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
      pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      pre {
        margin: 0;
        padding: 16px;
        overflow: auto;
        border: 1px solid var(--pre-border);
        border-radius: var(--radius-lg);
        background: var(--pre-bg);
        color: var(--pre-fg);
        font-size: 12px;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        cursor: pointer;
        background: var(--surface);
        color: var(--fg);
        font: 500 13px var(--font-body);
        transition: background 0.1s, border-color 0.1s;
      }
      button:hover { background: var(--bg-hover); border-color: color-mix(in srgb, var(--border) 80%, var(--fg)); }
      button.primary { border-color: var(--fg); background: var(--fg); color: var(--surface); }
      button.primary:hover { background: color-mix(in srgb, var(--fg) 80%, black); }
      button.danger { border-color: var(--danger-border); background: var(--danger-bg); color: var(--danger-fg); }
      .poster-copy { margin: 8px 0 0; color: var(--muted); font-size: var(--fs-lead); }
      .language-bar { display: flex; gap: 10px; align-items: center; justify-content: flex-end; font: 12px var(--font-mono); color: var(--muted); }
      .logo-card { display: flex; align-items: center; gap: var(--gap-md); }
      .logo-card::before { content: ""; display: block; width: 1px; height: 40px; background: var(--border); }
      .logo-card img { width: 40px; height: 40px; border-radius: var(--radius-lg); object-fit: cover; }
      .row { display: flex; gap: var(--gap-md); align-items: center; flex-wrap: wrap; }
      .row-between { display: flex; align-items: center; justify-content: space-between; gap: var(--gap-md); }
      .status-section { padding-block: 8px; background: var(--surface); font-family: var(--font-mono); font-size: 12px; }
      .runtime-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); display: inline-block; }
      .muted { color: var(--muted); font-size: var(--fs-meta); }
      .status-text { color: var(--accent); }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--gap-md); }
      .panel-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap-lg); }
      .card { padding: var(--gap-md); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
      .stack { display: flex; flex-direction: column; gap: var(--gap-md); }
      .field { display: flex; flex-direction: column; gap: 4px; }
      .list { display: grid; gap: 8px; }
      .item { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 12px; font: 12px/1.45 var(--font-mono); white-space: pre-line; }
      .item-header { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
      .item-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
      .test-result { margin-top: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-hover); }
      .test-result.ok { color: var(--accent); box-shadow: inset 4px 0 0 var(--accent); }
      .test-result.fail { color: var(--danger-fg); box-shadow: inset 4px 0 0 var(--danger-fg); }
      .routing-toolbar { margin-bottom: var(--gap-md); padding: var(--gap-md); border-radius: var(--radius-lg); background: var(--bg-hover); }
      #role-models { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--gap-md); }
      .role-row { display: grid; gap: var(--gap-sm); margin-bottom: 10px; }
      .role-card { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
      .role-note { flex-grow: 1; color: var(--muted); font-size: 12px; }
      select.enhanced-select { display: none; }
      .combo { position: relative; width: 100%; }
      .combo-input { width: 100%; padding-right: 28px; cursor: pointer; }
      .combo-list { display: none; position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); max-height: 220px; overflow: auto; padding: 4px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: 0 4px 12px color-mix(in srgb, var(--fg) 10%, transparent); }
      .combo.open .combo-list { display: block; }
      .combo-option { padding: 6px 10px; border-radius: 3px; cursor: pointer; font: 13px/1.3 var(--font-mono); }
      .combo-option:hover, .combo-option.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
      .combo-empty { padding: 6px 10px; color: var(--muted); font: 12px var(--font-mono); }
      @media (max-width: 900px) { .panel-grid, #role-models { grid-template-columns: 1fr; } .hero-split { align-items: flex-start; flex-direction: column; } .logo-card::before { display: none; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <div class="container hero-split">
          <div>
            <p class="kicker" data-i18n="kicker">LOCAL AI CONTROL PANEL</p>
            <h1 data-i18n="title">BRAIN / CODE</h1>
            <p class="poster-copy" data-i18n="subtitle">Brutalist configuration surface for brains, agents, models, tools, and local runtime policy.</p>
          </div>
          <div class="logo-card">
            <img src="/resources/logo.png" alt="Braincode logo" />
            <div class="language-bar">
              <span data-i18n="language">LANG</span>
              <select id="language"><option value="en">EN</option><option value="zh">中文</option></select>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section class="status-section">
          <div class="container row-between">
            <div class="row"><button id="refresh" data-i18n="refresh">Refresh</button><span id="status" class="muted status-text">Loading...</span></div>
            <div class="row muted"><span class="runtime-dot" aria-hidden="true"></span><span data-i18n="runtimeActive">Runtime Active</span></div>
          </div>
        </section>

        <section>
          <div class="container stack">
          <h2 data-i18n="settingsTitle">Settings</h2>
          <form id="settings-form" class="stack">
            <div class="grid">
              <div class="field"><label for="host" data-i18n="host">Config server host</label><input id="host" autocomplete="off" /></div>
              <div class="field"><label for="port" data-i18n="port">Config server port</label><input id="port" type="number" min="1" max="65535" /></div>
              <div class="field"><label for="defaultBrainId" data-i18n="defaultBrain">Default brain id</label><select id="defaultBrainId"></select></div>
              <div class="field"><label for="mode" data-i18n="mode">Mode</label><select id="mode"><option value="auto" data-i18n="modeAuto">auto — plan and route agents automatically</option><option value="radical" data-i18n="modeRadical">radical — more aggressive autonomous execution</option></select></div>
            </div>
            <div class="row-between">
              <p class="muted" data-i18n="restartHint">Changing host or port affects the next config server start.</p>
              <button class="primary" type="submit" data-i18n="saveSettings">Save settings</button>
            </div>
          </form>
          </div>
        </section>

        <section>
          <div class="container stack">
          <h2 data-i18n="modelsTitle">Model selection</h2>
          <p class="muted" data-i18n="modelsHint">Choose models from the provider catalog. The UI stores selected models in ~/.braincode/models.json.</p>
          <div class="panel-grid">
            <form id="model-form" class="card stack">
              <h3 data-i18n="addFromCatalog">Add from catalog</h3>
              <div class="field"><label for="saved-provider-select" data-i18n="savedProviders">Saved providers</label><select id="saved-provider-select"></select></div>
              <div class="grid">
                <div class="field"><label for="custom-provider" data-i18n="provider">Provider</label><input id="custom-provider" autocomplete="off" placeholder="openai" /></div>
                <div class="field"><label for="custom-base-url" data-i18n="baseUrl">Base URL</label><input id="custom-base-url" autocomplete="off" placeholder="https://api.openai.com/v1" /></div>
              </div>
              <div class="field"><label for="custom-api-key" data-i18n="apiKey">API key</label><input id="custom-api-key" type="password" autocomplete="off" placeholder="sk-..." /></div>
              <button id="load-provider-models" type="button" data-i18n="loadProviderModels">Load /v1/models</button>
              <div class="field"><label for="provider-select" data-i18n="providerCatalog">Provider catalog</label><select id="provider-select"></select></div>
              <div class="field"><label for="catalog-model-select" data-i18n="catalogModel">Model</label><select id="catalog-model-select"></select></div>
              <div class="field"><label for="catalog-api-key" data-i18n="apiKey">API key</label><input id="catalog-api-key" type="password" autocomplete="off" placeholder="Optional token saved for the selected provider" /></div>
              <button class="primary" type="submit" data-i18n="addSelectedModel">Add selected model</button>
            </form>
            <form id="manual-model-form" class="card stack">
              <h3 data-i18n="addManualModel">Add custom model manually</h3>
              <p class="muted" data-i18n="manualModelHint">Use this when a provider cannot list /v1/models. The API key is optional and will be saved for the provider.</p>
              <div class="grid">
                <div class="field"><label for="manual-provider" data-i18n="provider">Provider</label><input id="manual-provider" autocomplete="off" placeholder="openrouter" required /></div>
                <div class="field"><label for="manual-model-id" data-i18n="modelId">Model ID</label><input id="manual-model-id" autocomplete="off" placeholder="anthropic/claude-sonnet-4.5" required /></div>
                <div class="field"><label for="manual-name" data-i18n="modelName">Name</label><input id="manual-name" autocomplete="off" placeholder="Claude Sonnet 4.5" /></div>
                <div class="field"><label for="manual-base-url" data-i18n="baseUrl">Base URL</label><input id="manual-base-url" autocomplete="off" placeholder="https://openrouter.ai/api/v1" /></div>
                <div class="field"><label for="manual-api-key" data-i18n="apiKey">API key</label><input id="manual-api-key" type="password" autocomplete="off" placeholder="Optional token saved for this provider" /></div>
                <div class="field"><label for="manual-api" data-i18n="apiType">API type</label><select id="manual-api"><option value="openai-responses">openai-responses</option><option value="openai-chat-completions">openai-chat-completions</option><option value="anthropic">anthropic</option><option value="google">google</option></select></div>
                <div class="field"><label for="manual-context-window" data-i18n="contextWindow">Context window</label><input id="manual-context-window" type="number" min="1" value="128000" /></div>
                <div class="field"><label for="manual-thinking" data-i18n="thinkingLevel">Thinking level</label><select id="manual-thinking"><option value="off">off</option><option value="minimal">minimal</option><option value="low">low</option><option value="medium" selected>medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></div>
              </div>
              <div class="row-between">
                <button id="test-manual-model" type="button" data-i18n="testConnection">Test connection</button>
                <button class="primary" type="submit" data-i18n="addManualModelButton">Add custom model</button>
              </div>
              <div id="manual-test-result" class="test-result" hidden></div>
            </form>
            <div class="stack"><h3 data-i18n="configuredModels">Configured models</h3><div id="configured-models" class="list"></div></div>
          </div>
          </div>
        </section>

        <section>
          <div class="container stack">
          <h2 data-i18n="brainRoutingTitle">Brain routing</h2>
          <p class="muted" data-i18n="brainRoutingHint">Select which configured model each agent role should use. No JSON editing required.</p>
          <form id="brain-form" class="stack">
            <div class="routing-toolbar row-between">
              <div class="field"><label for="brain-select" data-i18n="brain">Brain</label><select id="brain-select"></select></div>
              <div class="row">
                <div class="field"><label for="apply-all-model" data-i18n="applyAllModel">Apply model to all roles</label><select id="apply-all-model"></select></div>
                <button id="apply-all-roles" type="button" data-i18n="applyAllRoles">Apply to all roles</button>
              </div>
            </div>
            <div id="role-models"></div>
            <button class="primary" type="submit" data-i18n="saveBrainRouting">Save brain routing</button>
          </form>
          </div>
        </section>

        <section>
          <div class="container stack">
          <h2 data-i18n="toolsAuthTitle">Tools and auth</h2>
          <div class="panel-grid">
            <div class="stack"><h3 data-i18n="tools">Tools</h3><p class="muted" data-i18n="toolsHint">Tool toggles will appear here when coding tools are implemented.</p><div id="configured-tools" class="list"></div></div>
            <div class="stack"><h3 data-i18n="authStatus">Auth status</h3><p class="muted" data-i18n="authHint">Secrets are not shown here. They belong in ~/.braincode/auth.json or a future secure store.</p><pre id="auth-status">{}</pre></div>
          </div>
          </div>
        </section>
      </main>
    </div>

    <script type="module">
      const translations = {
        en: {
          kicker: "LOCAL AI CONTROL PANEL", title: "BRAIN / CODE", subtitle: "Brutalist configuration surface for brains, agents, models, tools, and local runtime policy.", language: "LANG", refresh: "Refresh", runtimeActive: "Runtime Active",
          settingsTitle: "Settings", host: "Config server host", port: "Config server port", defaultBrain: "Default brain id", mode: "Mode", modeAuto: "auto — plan and route agents automatically", modeRadical: "radical — more aggressive autonomous execution", restartHint: "Changing host or port affects the next config server start.", saveSettings: "Save settings",
          modelsTitle: "Model selection", modelsHint: "Add models from the built-in catalog, load OpenAI-compatible /v1/models, or enter model metadata manually.", addModel: "Add model", addFromCatalog: "Add from catalog", addManualModel: "Add custom model manually", manualModelHint: "Use this when a provider cannot list /v1/models. The API key is optional and will be saved for the provider.", savedProviders: "Saved providers", provider: "Provider", baseUrl: "Base URL", apiKey: "API key", modelId: "Model ID", modelName: "Name", apiType: "API type", contextWindow: "Context window", thinkingLevel: "Thinking level", loadProviderModels: "Load /v1/models", providerCatalog: "Provider catalog", catalogModel: "Model", addSelectedModel: "Add selected model", addManualModelButton: "Add custom model", configuredModels: "Configured models",
          brainRoutingTitle: "Brain routing", brainRoutingHint: "Select which configured model each agent role should use. No JSON editing required.", brain: "Brain", applyAllModel: "Apply model to all roles", applyAllRoles: "Apply to all roles", saveBrainRouting: "Save brain routing",
          toolsAuthTitle: "Tools and auth", tools: "Tools", toolsHint: "Tool toggles will appear here when coding tools are implemented.", authStatus: "Auth status", authHint: "Secrets are not shown here. They belong in ~/.braincode/auth.json or a future secure store.",
          loading: "Loading...", loaded: "Loaded", loadingCatalog: "Loading model catalog...", catalogFailed: "Model catalog failed to load", saving: "Saving", saved: "Saved", failed: "Failed", none: "None configured", remove: "Remove", testConnection: "Test connection", testing: "Testing", testOk: "Connection ok",
          thinking: "Thinking", fallbackModel: "Fallback model",
          roleLabel_routeBrain: "Router Brain", roleLabel_coding: "Coding", roleLabel_frontend: "Frontend", roleLabel_backend: "Backend", roleLabel_designer: "Designer", roleLabel_dba: "DBA", roleLabel_devops: "DevOps", roleLabel_security: "Security", roleLabel_qa: "QA", roleLabel_research: "Research", roleLabel_review: "Review", roleLabel_summarize: "Summarize", roleLabel_fastReply: "Fast reply", roleLabel_oracle: "Oracle", roleLabel_librarian: "Librarian",
          roleDesc_routeBrain: "Main router: reads user intent and decides which role handles the task. Best for the strongest reasoning model, default GPT-5.5 xhigh.",
          roleDesc_coding: "Code execution: handles code edits, bug fixes, and verification. Best for strong coding models with stable tool-calling.",
          roleDesc_frontend: "Frontend: UI, browser behavior, CSS, components, accessibility, and user-facing polish.",
          roleDesc_backend: "Backend: APIs, services, validation, persistence boundaries, and server behavior.",
          roleDesc_designer: "Designer: UX flows, visual direction, interaction design, and implementable product layout guidance.",
          roleDesc_dba: "DBA: schema design, migrations, indexes, query plans, data integrity, and database performance.",
          roleDesc_devops: "DevOps: CI/CD, deployment, containers, infrastructure, observability, and operations.",
          roleDesc_security: "Security: auth, permissions, secrets, vulnerabilities, threat models, and secure defaults.",
          roleDesc_qa: "QA: focused tests, edge cases, regression checks, reproducible bugs, and quality strategy.",
          roleDesc_research: "Fast retrieval: looks up references, locates code, and gathers facts. Best for fast, cheap, large-context models.",
          roleDesc_review: "Audit and review: handles code review, risk auditing, and regression hunting. Best for rigorous reasoning and long-context models.",
          roleDesc_summarize: "Summary and handoff: compresses context, generates handoffs, and consolidates results. Best for cheap, fast models.",
          roleDesc_fastReply: "Quick reply: handles greetings, short questions, and lightweight responses. Best for the fastest, cheapest model.",
          roleDesc_oracle: "Deep reasoning: handles complex architecture, hard bugs, and major decisions. Best for the strongest reasoning model, usually xhigh.",
          roleDesc_librarian: "Large codebase comprehension: reads external repos and broad architecture. Best for long-context, code-savvy models."
        },
        zh: {
          kicker: "本地 AI 控制台", title: "BRAIN / CODE", subtitle: "用于配置 brain、agent、模型、工具和本地运行策略的高密度技术界面。", language: "语言", refresh: "刷新", runtimeActive: "运行时活跃",
          settingsTitle: "基础设置", host: "配置服务主机", port: "配置服务端口", defaultBrain: "默认 Brain ID", mode: "模式", modeAuto: "auto — 根据意图自动规划并路由 agent", modeRadical: "radical — 更激进的自治执行", restartHint: "修改主机或端口会在下次启动配置服务时生效。", saveSettings: "保存设置",
          modelsTitle: "模型选择", modelsHint: "可以从内置目录添加模型、加载 OpenAI-compatible /v1/models，或手动填写模型元数据。", addModel: "添加模型", addFromCatalog: "从目录添加", addManualModel: "手动添加自定义模型", manualModelHint: "当 provider 无法列出 /v1/models 时使用。API key 可选，会保存到该 provider。", savedProviders: "已保存 Provider", provider: "Provider", baseUrl: "Base URL", apiKey: "API key", modelId: "模型 ID", modelName: "名称", apiType: "API 类型", contextWindow: "上下文窗口", thinkingLevel: "思考等级", loadProviderModels: "加载 /v1/models", providerCatalog: "Provider 目录", catalogModel: "模型", addSelectedModel: "添加选中模型", addManualModelButton: "添加自定义模型", configuredModels: "已配置模型",
          brainRoutingTitle: "Brain 路由", brainRoutingHint: "为每个 agent 角色选择已配置模型，不需要手写 JSON。", brain: "Brain", applyAllModel: "应用模型到全部角色", applyAllRoles: "应用到全部角色", saveBrainRouting: "保存 Brain 路由",
          toolsAuthTitle: "工具与认证", tools: "工具", toolsHint: "编码工具实现后，这里会显示工具开关。", authStatus: "认证状态", authHint: "这里不会展示密钥。密钥应放在 ~/.braincode/auth.json 或未来的安全存储中。",
          loading: "加载中...", loaded: "已加载", loadingCatalog: "正在加载模型目录...", catalogFailed: "模型目录加载失败", saving: "正在保存", saved: "已保存", failed: "失败", none: "暂无配置", remove: "移除", testConnection: "联通测试", testing: "测试中", testOk: "联通正常",
          thinking: "思考", fallbackModel: "备用模型",
          roleLabel_routeBrain: "路由大脑", roleLabel_coding: "代码", roleLabel_frontend: "前端", roleLabel_backend: "后端", roleLabel_designer: "设计师", roleLabel_dba: "DBA", roleLabel_devops: "DevOps", roleLabel_security: "安全", roleLabel_qa: "QA", roleLabel_research: "研究", roleLabel_review: "审查", roleLabel_summarize: "总结", roleLabel_fastReply: "快速回复", roleLabel_oracle: "Oracle", roleLabel_librarian: "Librarian",
          roleDesc_routeBrain: "主控路由：先读用户意图，决定交给哪个角色处理。适合最强推理模型，默认 GPT-5.5 xhigh。",
          roleDesc_coding: "代码实现：负责改代码、修 bug、跑验证。适合强代码模型，优先稳定和工具调用能力。",
          roleDesc_frontend: "前端：负责 UI、浏览器行为、CSS、组件、可访问性和用户侧打磨。",
          roleDesc_backend: "后端：负责 API、服务、校验、持久化边界和服务端行为。",
          roleDesc_designer: "设计师：负责 UX 流程、视觉方向、交互设计和可落地的产品布局建议。",
          roleDesc_dba: "DBA：负责表结构、迁移、索引、查询计划、数据完整性和数据库性能。",
          roleDesc_devops: "DevOps：负责 CI/CD、部署、容器、基础设施、可观测性和运维。",
          roleDesc_security: "安全：负责认证、权限、密钥、漏洞、威胁建模和安全默认值。",
          roleDesc_qa: "QA：负责测试计划、边界场景、回归检查、可复现 bug 和质量策略。",
          roleDesc_research: "快速检索：负责查资料、查代码位置、整理事实。适合速度快、成本低、上下文大的模型。",
          roleDesc_review: "审查检查：负责 code review、风险审计、找回归。适合严谨推理和长上下文模型。",
          roleDesc_summarize: "总结交接：负责压缩上下文、生成 handoff、整理结果。适合便宜快速模型。",
          roleDesc_fastReply: "简单回复：负责问候、短问题、轻量响应。适合最快最低成本模型。",
          roleDesc_oracle: "深度推理：负责复杂架构、疑难 bug、重大决策。适合最强推理模型，通常 xhigh。",
          roleDesc_librarian: "大型代码库理解：负责外部仓库/大范围架构阅读。适合长上下文和代码理解强的模型。"
        }
      }

      const roles = ["routeBrain", "coding", "frontend", "backend", "designer", "dba", "devops", "security", "qa", "research", "review", "summarize", "fastReply", "oracle", "librarian"]
      const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh"]
      function roleLabel(role) { return t("roleLabel_" + role) }
      function roleDescription(role) { return t("roleDesc_" + role) }
      const status = document.querySelector("#status")
      const authStatus = document.querySelector("#auth-status")
      const refresh = document.querySelector("#refresh")
      const language = document.querySelector("#language")
      const settingsForm = document.querySelector("#settings-form")
      const modelForm = document.querySelector("#model-form")
      const manualModelForm = document.querySelector("#manual-model-form")
      const brainForm = document.querySelector("#brain-form")
      const hostInput = document.querySelector("#host")
      const portInput = document.querySelector("#port")
      const defaultBrainIdInput = document.querySelector("#defaultBrainId")
      const modeInput = document.querySelector("#mode")
      const savedProviderSelect = document.querySelector("#saved-provider-select")
      const customProviderInput = document.querySelector("#custom-provider")
      const customBaseUrlInput = document.querySelector("#custom-base-url")
      const customApiKeyInput = document.querySelector("#custom-api-key")
      const loadProviderModelsButton = document.querySelector("#load-provider-models")
      const providerSelect = document.querySelector("#provider-select")
      const catalogModelSelect = document.querySelector("#catalog-model-select")
      const catalogApiKeyInput = document.querySelector("#catalog-api-key")
      const manualProviderInput = document.querySelector("#manual-provider")
      const manualModelIdInput = document.querySelector("#manual-model-id")
      const manualNameInput = document.querySelector("#manual-name")
      const manualBaseUrlInput = document.querySelector("#manual-base-url")
      const manualApiKeyInput = document.querySelector("#manual-api-key")
      const manualApiInput = document.querySelector("#manual-api")
      const manualContextWindowInput = document.querySelector("#manual-context-window")
      const manualThinkingInput = document.querySelector("#manual-thinking")
      const testManualModelButton = document.querySelector("#test-manual-model")
      const manualTestResult = document.querySelector("#manual-test-result")
      const configuredModels = document.querySelector("#configured-models")
      const brainSelect = document.querySelector("#brain-select")
      const applyAllModel = document.querySelector("#apply-all-model")
      const applyAllRoles = document.querySelector("#apply-all-roles")
      const roleModels = document.querySelector("#role-models")
      const configuredTools = document.querySelector("#configured-tools")

      let currentSettings = null
      let currentBrains = { brains: [] }
      let currentModels = { models: [] }
      let currentTools = { tools: [] }
      let catalog = { providers: [] }
      let currentLang = localStorage.getItem("braincode-config-lang") || "en"
      language.value = currentLang

      function t(key) { return translations[currentLang][key] || translations.en[key] || key }
      function option(value, label) { const item = document.createElement("option"); item.value = value; item.textContent = label; return item }
      function applyLanguage() { document.documentElement.lang = currentLang; for (const element of document.querySelectorAll("[data-i18n]")) { const key = element.getAttribute("data-i18n"); if (key) element.innerHTML = t(key) } }
      async function getJson(path) { const response = await fetch(path); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Request failed"); return body.data }
      async function postJson(path, value) { const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Request failed"); return body.data }
      async function putJson(path, value) { const response = await fetch(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Request failed"); return body.data }

      const enhancedSelects = new WeakMap()
      function fuzzyMatches(text, query) {
        const normalizedText = text.toLowerCase()
        const normalizedQuery = query.toLowerCase().trim()
        if (!normalizedQuery) return true
        let index = 0
        for (const char of normalizedQuery) {
          index = normalizedText.indexOf(char, index)
          if (index === -1) return false
          index += 1
        }
        return true
      }
      function selectLabel(select) { return select.selectedOptions[0]?.textContent || "" }
      function enhanceSelect(select) {
        if (enhancedSelects.has(select)) { enhancedSelects.get(select).refresh(); return }
        select.classList.add("enhanced-select")
        const combo = document.createElement("div")
        combo.className = "combo"
        const input = document.createElement("input")
        input.className = "combo-input"
        input.type = "text"
        input.autocomplete = "off"
        const list = document.createElement("div")
        list.className = "combo-list"
        combo.append(input, list)
        select.after(combo)
        function close() { combo.classList.remove("open"); input.value = selectLabel(select) }
        function choose(optionElement) { select.value = optionElement.dataset.value; select.dispatchEvent(new Event("change", { bubbles: true })); close() }
        function render(query = "") {
          const options = Array.from(select.options).filter((item) => fuzzyMatches(item.textContent || item.value, query))
          list.replaceChildren(...(options.length ? options.map((item) => {
            const row = document.createElement("div")
            row.className = "combo-option" + (item.value === select.value ? " active" : "")
            row.dataset.value = item.value
            row.textContent = item.textContent || item.value
            row.addEventListener("mousedown", (event) => { event.preventDefault(); choose(row) })
            return row
          }) : [Object.assign(document.createElement("div"), { className: "combo-empty", textContent: t("none") })]))
        }
        function refresh() { input.value = selectLabel(select); render("") }
        input.addEventListener("focus", () => { combo.classList.add("open"); input.select(); render("") })
        input.addEventListener("input", () => { combo.classList.add("open"); render(input.value) })
        input.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); if (event.key === "Enter") { const first = list.querySelector(".combo-option"); if (first) { event.preventDefault(); choose(first) } } })
        document.addEventListener("mousedown", (event) => { if (!combo.contains(event.target)) close() })
        select.addEventListener("change", refresh)
        new MutationObserver(refresh).observe(select, { childList: true, attributes: true, subtree: true })
        enhancedSelects.set(select, { refresh })
        refresh()
      }
      function enhanceSelects(root = document) { for (const select of root.querySelectorAll("select")) enhanceSelect(select) }

      function renderSettings() {
        hostInput.value = currentSettings.configServer.host
        portInput.value = String(currentSettings.configServer.port)
        modeInput.value = currentSettings.mode
        defaultBrainIdInput.replaceChildren(...currentBrains.brains.map((brain) => option(brain.id, brain.name ? brain.id + " — " + brain.name : brain.id)))
        defaultBrainIdInput.value = currentSettings.defaultBrainId
        enhanceSelects(settingsForm)
      }

      function renderCatalogProviders() {
        providerSelect.disabled = catalog.providers.length === 0
        catalogModelSelect.disabled = catalog.providers.length === 0
        providerSelect.replaceChildren(...catalog.providers.map((entry) => option(entry.provider, entry.provider)))
        enhanceSelect(providerSelect)
        renderCatalogModels()
      }

      function renderCatalogModels() {
        const entry = catalog.providers.find((candidate) => candidate.provider === providerSelect.value)
        catalogModelSelect.replaceChildren(...(entry?.models || []).map((model) => option(model.id, model.name + " / " + model.modelId)))
        enhanceSelect(catalogModelSelect)
      }

      function renderSavedProviders() {
        const providers = currentModels.providers || []
        savedProviderSelect.replaceChildren(option("", t("none")), ...providers.map((entry) => option(entry.provider, entry.provider + " / " + entry.baseUrl)))
        enhanceSelect(savedProviderSelect)
      }

      function applySavedProvider() {
        const provider = (currentModels.providers || []).find((entry) => entry.provider === savedProviderSelect.value)
        if (!provider) return
        customProviderInput.value = provider.provider
        customBaseUrlInput.value = provider.baseUrl || ""
      }

      function selectedCatalogModel() {
        const provider = catalog.providers.find((entry) => entry.provider === providerSelect.value)
        return provider?.models.find((candidate) => candidate.id === catalogModelSelect.value)
      }

      function normalizeBaseUrl(value) {
        const trimmed = value.trim().replace(new RegExp("/+$"), "")
        if (!trimmed) return ""
        return trimmed.endsWith("/v1") ? trimmed : trimmed + "/v1"
      }

      function manualModelFromForm() {
        const provider = manualProviderInput.value.trim()
        const modelId = manualModelIdInput.value.trim()
        const name = manualNameInput.value.trim() || modelId
        const baseUrl = normalizeBaseUrl(manualBaseUrlInput.value)
        const contextWindow = Number(manualContextWindowInput.value) || 128000
        return {
          id: provider + "/" + modelId,
          provider,
          modelId,
          name,
          api: manualApiInput.value,
          ...(baseUrl ? { baseUrl } : {}),
          contextWindow,
          supportsTools: true,
          defaultThinkingLevel: manualThinkingInput.value,
        }
      }

      function mergeConfiguredModel(model) {
        return currentModels.models.some((candidate) => candidate.id === model.id) ? currentModels.models : [...currentModels.models, model]
      }

      function renderConfiguredModels() {
        if (currentModels.models.length === 0) { configuredModels.innerHTML = '<div class="item">' + t("none") + '</div>'; return }
        configuredModels.replaceChildren(...currentModels.models.map((model) => {
          const item = document.createElement("div")
          item.className = "item"
          const header = document.createElement("div")
          header.className = "item-header"
          const text = document.createElement("div")
          text.textContent = model.name + "\\n" + model.id + "\\n" + model.provider
          const button = document.createElement("button")
          button.type = "button"
          button.className = "danger"
          button.textContent = t("remove")
          button.addEventListener("click", () => removeModel(model.id))
          const testButton = document.createElement("button")
          testButton.type = "button"
          testButton.textContent = t("testConnection")
          const result = document.createElement("div")
          result.className = "test-result"
          result.hidden = true
          testButton.addEventListener("click", () => testModel(model.id, testButton, result))
          const actions = document.createElement("div")
          actions.className = "item-actions"
          actions.append(testButton, button)
          header.append(text, actions)
          item.append(header, result)
          return item
        }))
      }

      function renderBrainRouting() {
        brainSelect.replaceChildren(...currentBrains.brains.map((brain) => option(brain.id, brain.name ? brain.id + " — " + brain.name : brain.id)))
        applyAllModel.replaceChildren(...currentModels.models.map((model) => option(model.id, model.name + " / " + model.id)))
        enhanceSelect(brainSelect)
        enhanceSelect(applyAllModel)
        if (!brainSelect.value && currentBrains.brains[0]) brainSelect.value = currentBrains.brains[0].id
        const brain = currentBrains.brains.find((candidate) => candidate.id === brainSelect.value)
        roleModels.replaceChildren()
        if (!brain) { roleModels.innerHTML = '<div class="item">' + t("none") + '</div>'; return }
        for (const role of roles) {
          const policy = role === "routeBrain" ? (brain.planner || brain.roles?.routeBrain) : brain.roles?.[role]
          const card = document.createElement("div")
          card.className = "role-card"
          const row = document.createElement("div")
          row.className = "role-row"
          const label = document.createElement("label")
          label.textContent = roleLabel(role) || role
          const select = document.createElement("select")
          select.dataset.role = role
          select.replaceChildren(...currentModels.models.map((model) => option(model.id, model.name + " / " + model.id)))
          select.value = policy?.modelId || brain.roles?.coding?.modelId || currentModels.models[0]?.id || ""
          const fallbackLabel = document.createElement("label")
          fallbackLabel.textContent = t("fallbackModel")
          const fallback = document.createElement("select")
          fallback.dataset.roleFallback = role
          fallback.replaceChildren(option("", t("none")), ...currentModels.models.map((model) => option(model.id, model.name + " / " + model.id)))
          fallback.value = policy?.fallbackModelIds?.[0] || ""
          const thinkingLabel = document.createElement("label")
          thinkingLabel.textContent = t("thinking")
          const thinking = document.createElement("select")
          thinking.dataset.roleThinking = role
          thinking.replaceChildren(...thinkingLevels.map((level) => option(level, level)))
          thinking.value = policy?.thinkingLevel || (role === "routeBrain" || role === "oracle" ? "xhigh" : "medium")
          row.append(label, select, fallbackLabel, fallback, thinkingLabel, thinking)
          const note = document.createElement("div")
          note.className = "role-note"
          note.textContent = roleDescription(role) || ""
          card.append(row, note)
          roleModels.append(card)
          enhanceSelect(select)
          enhanceSelect(fallback)
          enhanceSelect(thinking)
        }
      }

      function renderTools() {
        configuredTools.innerHTML = currentTools.tools.length ? "" : '<div class="item">' + t("none") + '</div>'
        for (const tool of currentTools.tools) {
          const item = document.createElement("div")
          item.className = "item"
          item.textContent = tool.name || JSON.stringify(tool)
          configuredTools.append(item)
        }
      }

      async function loadAll() {
        status.textContent = t("loading")
        const [settingsData, brainsData, modelsData, toolsData, authStatusData] = await Promise.all([
          getJson("/api/settings"), getJson("/api/brains"), getJson("/api/models"), getJson("/api/tools"), getJson("/api/auth/status")
        ])
        currentSettings = settingsData
        currentBrains = brainsData
        currentModels = modelsData
        currentTools = toolsData
        authStatus.textContent = JSON.stringify(authStatusData, null, 2)
        renderSettings(); renderSavedProviders(); renderCatalogProviders(); renderConfiguredModels(); renderBrainRouting(); renderTools()
        status.textContent = t("loaded")
        loadCatalog().catch(showCatalogError)
        loadSavedProviderModels().catch(showCatalogError)
      }

      async function loadCatalog() {
        status.textContent = t("loadingCatalog")
        const builtInCatalog = await getJson("/api/model-catalog")
        const customProviders = catalog.providers.filter((entry) => !builtInCatalog.providers.some((candidate) => candidate.provider === entry.provider))
        catalog = { providers: [...customProviders, ...builtInCatalog.providers] }
        renderCatalogProviders()
        status.textContent = t("loaded")
      }

      function mergeCatalogProvider(provider, models) {
        const existing = catalog.providers.filter((entry) => entry.provider !== provider)
        catalog = { providers: [{ provider, models }, ...existing] }
      }

      async function loadSavedProviderModels() {
        const providers = currentModels.providers || []
        if (providers.length === 0) return
        status.textContent = t("loadingCatalog")
        for (const entry of providers) {
          const data = await postJson("/api/provider-models", { provider: entry.provider, baseUrl: entry.baseUrl })
          currentModels = { ...currentModels, providers: data.providers }
          mergeCatalogProvider(entry.provider, data.models)
        }
        renderSavedProviders()
        renderCatalogProviders()
        status.textContent = t("loaded")
      }

      async function loadProviderModels() {
        status.textContent = t("loadingCatalog")
        const provider = customProviderInput.value.trim()
        const baseUrl = customBaseUrlInput.value.trim().replace(new RegExp("/+$"), "")
        const apiKey = customApiKeyInput.value.trim()
        const data = await postJson("/api/provider-models", { provider, baseUrl, apiKey })
        currentModels = { ...currentModels, providers: data.providers }
        mergeCatalogProvider(provider, data.models)
        renderSavedProviders()
        renderCatalogProviders()
        providerSelect.value = provider
        renderCatalogModels()
        status.textContent = t("loaded")
      }

      async function removeModel(modelId) {
        currentModels = await putJson("/api/models", { ...currentModels, models: currentModels.models.filter((model) => model.id !== modelId) })
        renderConfiguredModels(); renderBrainRouting(); status.textContent = t("saved") + " models"
      }

      async function testModel(modelId, button, resultElement) {
        const previous = button.textContent
        button.disabled = true
        button.textContent = t("testing") + "..."
        resultElement.hidden = false
        resultElement.className = "test-result"
        resultElement.textContent = t("testing") + " " + modelId + "..."
        status.textContent = t("testing") + " " + modelId
        try {
          const result = await postJson("/api/models/test", { modelId })
          const message = t("testOk") + ": " + result.message
          resultElement.className = "test-result ok"
          resultElement.textContent = message
          status.textContent = message
        } catch (error) {
          const message = t("failed") + ": " + String(error?.message || error)
          resultElement.className = "test-result fail"
          resultElement.textContent = message
          showError(error)
        } finally {
          button.disabled = false
          button.textContent = previous
        }
      }

      async function testManualModel() {
        const model = manualModelFromForm()
        if (!model.provider || !model.modelId) return
        const previous = testManualModelButton.textContent
        testManualModelButton.disabled = true
        testManualModelButton.textContent = t("testing") + "..."
        manualTestResult.hidden = false
        manualTestResult.className = "test-result"
        manualTestResult.textContent = t("testing") + " " + model.id + "..."
        status.textContent = t("testing") + " " + model.id
        try {
          const result = await postJson("/api/models/test-config", { model, apiKey: manualApiKeyInput.value.trim() })
          const message = t("testOk") + ": " + result.message
          manualTestResult.className = "test-result ok"
          manualTestResult.textContent = message
          status.textContent = message
        } catch (error) {
          const message = t("failed") + ": " + String(error?.message || error)
          manualTestResult.className = "test-result fail"
          manualTestResult.textContent = message
          showError(error)
        } finally {
          testManualModelButton.disabled = false
          testManualModelButton.textContent = previous
        }
      }

      refresh.addEventListener("click", () => loadAll().catch(showError))
      language.addEventListener("change", () => { currentLang = language.value; localStorage.setItem("braincode-config-lang", currentLang); applyLanguage(); renderConfiguredModels(); renderBrainRouting(); renderTools() })
      savedProviderSelect.addEventListener("change", applySavedProvider)
      loadProviderModelsButton.addEventListener("click", () => loadProviderModels().catch(showError))
      testManualModelButton.addEventListener("click", () => testManualModel().catch(showError))
      providerSelect.addEventListener("change", renderCatalogModels)
      brainSelect.addEventListener("change", renderBrainRouting)
      applyAllRoles.addEventListener("click", () => {
        for (const select of roleModels.querySelectorAll("select[data-role]")) {
          select.value = applyAllModel.value
          select.dispatchEvent(new Event("change", { bubbles: true }))
        }
      })

      settingsForm.addEventListener("submit", (event) => {
        event.preventDefault()
        const nextSettings = { ...currentSettings, configServer: { host: hostInput.value, port: Number(portInput.value) }, defaultBrainId: defaultBrainIdInput.value, mode: modeInput.value }
        status.textContent = t("saving") + " settings..."
        putJson("/api/settings", nextSettings).then((savedSettings) => { currentSettings = savedSettings; renderSettings(); status.textContent = t("saved") + " settings" }).catch(showError)
      })

      modelForm.addEventListener("submit", (event) => {
        event.preventDefault()
        const model = selectedCatalogModel()
        if (!model) return
        status.textContent = t("saving") + " models..."
        const saveKey = catalogApiKeyInput.value.trim() ? postJson("/api/provider-api-key", { provider: model.provider, apiKey: catalogApiKeyInput.value.trim() }) : Promise.resolve(null)
        saveKey.then((auth) => {
          if (auth) authStatus.textContent = JSON.stringify(auth, null, 2)
          return putJson("/api/models", { ...currentModels, models: mergeConfiguredModel(model) })
        }).then((savedModels) => { currentModels = savedModels; catalogApiKeyInput.value = ""; renderSavedProviders(); renderConfiguredModels(); renderBrainRouting(); status.textContent = t("saved") + " models" }).catch(showError)
      })

      manualModelForm.addEventListener("submit", (event) => {
        event.preventDefault()
        const model = manualModelFromForm()
        if (!model.provider || !model.modelId) return
        status.textContent = t("saving") + " models..."
        const saveKey = manualApiKeyInput.value.trim() ? postJson("/api/provider-api-key", { provider: model.provider, apiKey: manualApiKeyInput.value.trim() }) : Promise.resolve(null)
        saveKey.then((auth) => {
          if (auth) authStatus.textContent = JSON.stringify(auth, null, 2)
          return putJson("/api/models", { ...currentModels, models: mergeConfiguredModel(model) })
        }).then((savedModels) => { currentModels = savedModels; manualModelForm.reset(); manualContextWindowInput.value = "128000"; manualThinkingInput.value = "medium"; renderConfiguredModels(); renderBrainRouting(); status.textContent = t("saved") + " models" }).catch(showError)
      })

      brainForm.addEventListener("submit", (event) => {
        event.preventDefault()
        const brain = currentBrains.brains.find((candidate) => candidate.id === brainSelect.value)
        if (!brain) return
        const nextBrain = structuredClone(brain)
        nextBrain.roles = nextBrain.roles || {}
        for (const select of roleModels.querySelectorAll("select[data-role]")) {
          const role = select.dataset.role
          const thinking = roleModels.querySelector('select[data-role-thinking="' + role + '"]')
          const fallback = roleModels.querySelector('select[data-role-fallback="' + role + '"]')
          const previous = nextBrain.roles[role] || { thinkingLevel: role === "routeBrain" || role === "oracle" ? "xhigh" : "medium" }
          const thinkingLevel = thinking?.value || previous.thinkingLevel || "medium"
          const fallbackModelIds = fallback?.value ? [fallback.value] : []
          const { systemPrompt: _roleSystemPrompt, ...previousWithoutPrompt } = previous
          nextBrain.roles[role] = { ...previousWithoutPrompt, modelId: select.value, fallbackModelIds, thinkingLevel }
          if (role === "routeBrain") {
            const { systemPrompt: _plannerSystemPrompt, ...plannerWithoutPrompt } = nextBrain.planner || previous
            nextBrain.planner = { ...plannerWithoutPrompt, modelId: select.value, fallbackModelIds, thinkingLevel }
          }
        }
        const nextBrains = currentBrains.brains.map((candidate) => candidate.id === nextBrain.id ? nextBrain : candidate)
        status.textContent = t("saving") + " brain..."
        putJson("/api/brains", { brains: nextBrains }).then((savedBrains) => { currentBrains = savedBrains; renderBrainRouting(); status.textContent = t("saved") + " brain" }).catch(showError)
      })

      function showCatalogError(error) { status.textContent = t("catalogFailed"); authStatus.textContent = String(error) }
      function showError(error) { status.textContent = t("failed"); authStatus.textContent = String(error) }
      applyLanguage(); enhanceSelects(); loadAll().catch(showError)
    </script>
  </body>
</html>`
