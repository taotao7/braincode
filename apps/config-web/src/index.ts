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
      [hidden] { display: none !important; }
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
      .tab-section { position: sticky; top: 0; z-index: 10; padding-block: 10px; background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(12px); }
      .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
      .tab-button { min-height: 34px; padding-inline: 14px; font-family: var(--font-mono); }
      .tab-button.active { border-color: var(--fg); background: var(--fg); color: var(--surface); }
      .tab-panel { display: none; }
      .tab-panel.active { display: block; }
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
      input[type="checkbox"] {
        width: auto;
        min-width: 16px;
        height: 16px;
        padding: 0;
        accent-color: var(--accent);
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
      a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
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
      .tools-layout { grid-template-columns: minmax(0, 1.3fr) minmax(360px, 1fr); align-items: start; }
      .card { padding: var(--gap-md); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
      .stack { display: flex; flex-direction: column; gap: var(--gap-md); }
      .field { display: flex; flex-direction: column; gap: 4px; }
      .field-hint { color: var(--muted); font: 11px/1.35 var(--font-mono); overflow-wrap: anywhere; }
      .field-hint.credential-ok { color: var(--accent); }
      .field-hint.credential-missing { color: var(--danger-fg); }
      .checkbox-field label {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        margin: 0;
      }
      .subscription-strip {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--gap-sm);
        align-items: end;
        padding-block: 10px;
        border-block: 1px solid var(--border);
      }
      .list { display: grid; gap: 8px; }
      .item { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 12px; font: 12px/1.45 var(--font-mono); white-space: pre-line; }
      .item-header { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
      .item-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
      .model-item-header { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
      .model-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .model-actions button { flex: 0 0 auto; min-height: 30px; padding: 4px 10px; font-size: 12px; white-space: nowrap; }
      .model-summary { min-width: 0; overflow-wrap: anywhere; }
      .tool-item-header { display: flex; gap: var(--gap-md); align-items: flex-start; justify-content: space-between; }
      .tool-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; flex: 0 0 auto; max-width: 50%; }
      .tool-actions button { flex: 0 0 auto; min-width: 92px; min-height: 32px; padding: 5px 10px; font-size: 12px; white-space: nowrap; }
      .tool-summary { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
      .usage-chip { display: inline-flex; align-items: center; max-width: 100%; width: fit-content; margin-top: 8px; padding: 2px 6px; border: 1px solid var(--border); border-radius: var(--radius); color: var(--muted); font: 11px var(--font-mono); white-space: normal; overflow-wrap: anywhere; }
      .model-edit-form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--gap-md);
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
        white-space: normal;
        font-family: var(--font-body);
      }
      .model-edit-form .test-result,
      .model-edit-actions { grid-column: 1 / -1; }
      .model-edit-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
      .test-result { margin-top: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-hover); }
      .test-result.ok { color: var(--accent); box-shadow: inset 4px 0 0 var(--accent); }
      .test-result.fail { color: var(--danger-fg); box-shadow: inset 4px 0 0 var(--danger-fg); }
      .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--gap-md); }
      .metric { padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
      .metric-label { color: var(--muted); font: 11px var(--font-mono); text-transform: uppercase; }
      .metric-value { margin-top: 4px; color: var(--fg); font: 600 22px var(--font-mono); line-height: 1.15; overflow-wrap: anywhere; }
      .chart-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gap-md); }
      .chart-card { min-height: 260px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
      .chart-card h3 { margin-bottom: 8px; }
      .chart-frame { width: 100%; height: 210px; }
      .chart-empty { display: grid; height: 100%; place-items: center; color: var(--muted); font: 12px var(--font-mono); text-align: center; }
      .fallback-bars { display: grid; align-content: center; gap: 10px; height: 100%; }
      .fallback-bar-row { display: grid; grid-template-columns: minmax(80px, 1fr) minmax(0, 2fr) auto; gap: 8px; align-items: center; font: 11px var(--font-mono); color: var(--muted); }
      .fallback-bar-track { height: 8px; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--bg-hover); }
      .fallback-bar-fill { height: 100%; background: var(--accent); }
      .stats-board { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr); gap: var(--gap-lg); align-items: start; }
      .stats-row { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr) auto; gap: var(--gap-sm); align-items: center; justify-content: stretch; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); font: 12px var(--font-mono); text-align: left; }
      .stats-row-main { min-width: 0; overflow-wrap: anywhere; }
      .stats-row-meta { color: var(--muted); }
      .stats-lists { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gap-md); }
      .detail-list { display: grid; gap: 8px; max-height: 560px; overflow: auto; }
      .detail-item { padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); font: 12px/1.45 var(--font-mono); white-space: pre-line; overflow-wrap: anywhere; }
      .routing-toolbar { margin-bottom: var(--gap-md); padding: var(--gap-md); border-radius: var(--radius-lg); background: var(--bg-hover); }
      #role-models { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--gap-md); }
      .role-row { display: grid; gap: var(--gap-sm); margin-bottom: 10px; }
      .role-card { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
      .role-card--full { grid-column: 1 / -1; border-style: dashed; }
      .role-card-title { margin: 0; font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--accent); letter-spacing: 0.04em; text-transform: uppercase; }
      .role-note { flex-grow: 1; color: var(--muted); font-size: 12px; }
      .role-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      select.enhanced-select { display: none; }
      .combo { position: relative; width: 100%; }
      .combo-input { width: 100%; padding-right: 28px; cursor: pointer; }
      .combo-list { display: none; position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); max-height: 220px; overflow: auto; padding: 4px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: 0 4px 12px color-mix(in srgb, var(--fg) 10%, transparent); }
      .combo.open .combo-list { display: block; }
      .combo-option { padding: 6px 10px; border-radius: 3px; cursor: pointer; font: 13px/1.3 var(--font-mono); }
      .combo-option:hover, .combo-option.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
      .combo-empty { padding: 6px 10px; color: var(--muted); font: 12px var(--font-mono); }
      @media (max-width: 900px) { .panel-grid, .chart-grid, .stats-board, .stats-lists, #role-models, .subscription-strip, .model-item-header, .tool-item-header { grid-template-columns: 1fr; } .model-actions, .tool-actions { justify-self: stretch; max-width: none; } .hero-split { align-items: flex-start; flex-direction: column; } .logo-card::before { display: none; } .tab-section { position: static; } }
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

        <section class="tab-section">
          <div class="container tabs" role="tablist" aria-label="Configuration sections">
            <button class="tab-button" type="button" data-tab="models" data-i18n="tabModels">Models</button>
            <button class="tab-button" type="button" data-tab="settings" data-i18n="tabSettings">Settings</button>
            <button class="tab-button" type="button" data-tab="routing" data-i18n="tabRouting">Routing</button>
            <button class="tab-button" type="button" data-tab="usage" data-i18n="tabUsage">Statistics</button>
            <button class="tab-button" type="button" data-tab="tools" data-i18n="tabTools">Tools</button>
            <button class="tab-button" type="button" data-tab="health" data-i18n="tabHealth">Health</button>
          </div>
        </section>

        <section class="tab-panel" data-tab-panel="settings">
          <div class="container stack">
          <h2 data-i18n="settingsTitle">Settings</h2>
          <form id="settings-form" class="stack">
            <div class="grid">
              <div class="field"><label for="host" data-i18n="host">Config server host</label><input id="host" autocomplete="off" /></div>
              <div class="field"><label for="port" data-i18n="port">Config server port</label><input id="port" type="number" min="1" max="65535" /></div>
              <div class="field"><label for="mode" data-i18n="mode">Mode</label><select id="mode"><option value="auto" data-i18n="modeAuto">auto — plan and route agents automatically</option><option value="radical" data-i18n="modeRadical">radical — more aggressive autonomous execution</option></select></div>
            </div>
            <div class="row-between">
              <p class="muted" data-i18n="restartHint">Changing host or port affects the next config server start.</p>
              <button class="primary" type="submit" data-i18n="saveSettings">Save settings</button>
            </div>
          </form>
          </div>
        </section>

        <section class="tab-panel" data-tab-panel="models">
          <div class="container stack">
          <h2 data-i18n="modelsTitle">Model selection</h2>
          <p class="muted" data-i18n="modelsHint">Choose models from the provider catalog. The UI stores selected models in ~/.braincode/models.json.</p>
          <div class="panel-grid tools-layout">
            <form id="model-form" class="card stack">
              <h3 data-i18n="addModel">Add model</h3>
              <p class="muted" data-i18n="addModelHint">Add an agent model from Pi's built-in providers, a saved provider, a /models endpoint, or manual OpenAI/Anthropic/Images API metadata.</p>
              <div class="field"><label for="model-source" data-i18n="modelSource">Add from</label><select id="model-source"><option value="catalog" data-i18n="modelSourceCatalog">Provider catalog</option><option value="provider" data-i18n="modelSourceProvider">Provider /models endpoint</option><option value="manual" data-i18n="modelSourceManual">Manual compatible API</option></select><span id="model-source-hint" class="field-hint"></span></div>
              <div class="field" data-sources="provider"><label for="saved-provider-select" data-i18n="savedProviders">Saved providers</label><select id="saved-provider-select"></select></div>
              <div id="model-connection-grid" class="grid">
                <div class="field"><label for="model-kind" data-i18n="modelKind">Model use</label><select id="model-kind"><option value="agent" data-i18n="modelKindAgent">Text or vision agent</option><option value="image" data-i18n="modelKindImage">Image generation / Image Maker</option></select></div>
                <div class="field" data-sources="provider manual"><label for="custom-provider" data-i18n="provider">Provider</label><input id="custom-provider" autocomplete="off" placeholder="openai" /></div>
                <div class="field" data-sources="provider manual"><label for="manual-api" data-i18n="apiType">API type</label><select id="manual-api"><option value="openai">openai</option><option value="anthropic">anthropic</option><option value="openai-images">openai-images</option></select></div>
                <div class="field" data-sources="provider manual"><label for="custom-base-url" data-i18n="baseUrl">Base URL</label><input id="custom-base-url" autocomplete="off" placeholder="https://api.openai.com/v1" /></div>
                <div id="provider-key-field" class="field"><label for="custom-api-key" data-i18n="apiKey">API key</label><input id="custom-api-key" type="password" autocomplete="off" placeholder="Optional token saved for this provider" /><span id="provider-key-hint" class="field-hint"></span></div>
              </div>
              <button id="load-provider-models" type="button" data-i18n="loadProviderModels" data-sources="provider">Load /v1/models</button>
              <div id="subscription-models-panel" class="subscription-strip" data-sources="catalog" hidden>
                <div class="field"><label for="subscription-provider-select" data-i18n="subscriptionModels">Authenticated subscriptions</label><select id="subscription-provider-select"></select></div>
                <button id="use-subscription-provider" type="button" data-i18n="useSubscriptionProvider">Use subscription</button>
              </div>
              <div class="field" data-sources="catalog provider"><label for="provider-select" data-i18n="providerCatalog">Provider catalog</label><select id="provider-select"></select></div>
              <div class="field" data-sources="catalog provider"><label for="catalog-model-select" data-i18n="catalogModel">Model</label><select id="catalog-model-select"></select></div>
              <div class="grid" data-sources="manual">
                <div class="field"><label for="manual-model-id" data-i18n="modelId">Model ID</label><input id="manual-model-id" autocomplete="off" placeholder="anthropic/claude-sonnet-4.5" required /></div>
                <div class="field"><label for="manual-name" data-i18n="modelName">Name</label><input id="manual-name" autocomplete="off" placeholder="Claude Sonnet 4.5" /></div>
                <div class="field"><label for="manual-context-window" data-i18n="contextWindow">Context window</label><input id="manual-context-window" type="number" min="1" value="128000" /></div>
                <div class="field"><label for="manual-thinking" data-i18n="thinkingLevel">Thinking level</label><select id="manual-thinking"><option value="off">off</option><option value="minimal">minimal</option><option value="low">low</option><option value="medium" selected>medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></div>
                <div class="field checkbox-field"><label for="manual-vision"><input id="manual-vision" type="checkbox" /> <span data-i18n="supportsVision">Vision (image input)</span></label></div>
              </div>
              <div class="row-between">
                <button id="test-manual-model" type="button" data-i18n="testConnection">Test connection</button>
                <button class="primary" type="submit" data-i18n="addModelButton">Add model</button>
              </div>
              <div id="manual-test-result" class="test-result" hidden></div>
            </form>
            <div class="stack"><h3 data-i18n="configuredModels">Configured models</h3><div id="configured-models" class="list"></div></div>
          </div>
          <div class="panel-grid">
            <div class="stack">
              <h3 data-i18n="subscriptionAuth">Subscription OAuth</h3>
              <p class="muted" data-i18n="subscriptionAuthHint">Connect subscription-backed providers through Pi OAuth. Tokens are saved in ~/.braincode/auth.json.</p>
              <div class="field"><label for="oauth-provider-select" data-i18n="oauthProvider">OAuth provider</label><select id="oauth-provider-select"></select></div>
              <div id="oauth-enterprise-toggle-field" class="field checkbox-field" hidden><label for="oauth-use-enterprise"><input id="oauth-use-enterprise" type="checkbox" /> <span data-i18n="useGithubEnterprise">Use GitHub Enterprise</span></label><span class="field-hint" data-i18n="githubCopilotDefaultHint">GitHub Copilot uses github.com by default; no domain is needed.</span></div>
              <div id="oauth-enterprise-domain-field" class="field" hidden><label for="oauth-enterprise-domain" data-i18n="githubEnterpriseDomain">GitHub Enterprise domain</label><input id="oauth-enterprise-domain" autocomplete="off" placeholder="company.ghe.com" /></div>
              <div class="row"><button id="start-oauth-login" type="button" data-i18n="startOAuthLogin">Start login</button><button id="cancel-oauth-login" type="button" data-i18n="cancelOAuthLogin">Cancel</button></div>
              <div id="oauth-login-state" class="test-result" hidden></div>
              <div class="field"><label for="oauth-manual-code" data-i18n="authorizationCode">Authorization code or redirect URL</label><input id="oauth-manual-code" autocomplete="off" /></div>
              <button id="submit-oauth-code" type="button" data-i18n="submitOAuthCode">Submit code</button>
            </div>
            <div class="stack"><h3 data-i18n="authStatus">Auth status</h3><p class="muted" data-i18n="authHint">Secrets are not shown here. They belong in ~/.braincode/auth.json or a future secure store.</p><pre id="auth-status">{}</pre></div>
          </div>
          </div>
        </section>

        <section id="usage-section" class="tab-panel" data-tab-panel="usage">
          <div class="container stack">
          <h2 data-i18n="usageStatsTitle">Usage statistics</h2>
          <p class="muted" data-i18n="usageStatsHint">Token usage collected from local session records, grouped by model, agent role, and runtime phase.</p>
          <div id="usage-summary" class="metric-grid"></div>
          <div class="chart-grid">
            <div class="chart-card">
              <h3 data-i18n="usageChartModels">Model token chart</h3>
              <div id="usage-chart-models" class="chart-frame"></div>
            </div>
            <div class="chart-card">
              <h3 data-i18n="usageChartRoles">Role token chart</h3>
              <div id="usage-chart-roles" class="chart-frame"></div>
            </div>
            <div class="chart-card">
              <h3 data-i18n="usageChartPhases">Phase share</h3>
              <div id="usage-chart-phases" class="chart-frame"></div>
            </div>
          </div>
          <div class="stats-board">
            <div class="stack">
              <div class="row-between">
                <h3 data-i18n="usageByModel">By model</h3>
                <button id="usage-show-all" type="button" data-i18n="usageShowAll">Show all details</button>
              </div>
              <div id="usage-models" class="list"></div>
            </div>
            <div class="stack">
              <h3 id="usage-detail-title" data-i18n="usageRecent">Recent details</h3>
              <div id="usage-details" class="detail-list"></div>
            </div>
          </div>
          <div class="stats-lists">
            <div class="stack"><h3 data-i18n="usageByRole">By role</h3><div id="usage-roles" class="list"></div></div>
            <div class="stack"><h3 data-i18n="usageByPhase">By phase</h3><div id="usage-phases" class="list"></div></div>
            <div class="stack"><h3 data-i18n="usageDetails">Details</h3><div id="usage-filter-note" class="item"></div></div>
          </div>
          </div>
        </section>

        <section class="tab-panel" data-tab-panel="routing">
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

        <section class="tab-panel" data-tab-panel="tools">
          <div class="container stack">
          <h2 data-i18n="toolsAuthTitle">Tools</h2>
          <div class="panel-grid">
            <div class="stack"><h3 data-i18n="tools">Tools</h3><p class="muted" data-i18n="toolsHint">Enabled tools are allowed by default; only extremely dangerous operations should require confirmation.</p><div id="configured-tools" class="list"></div></div>
            <div class="card stack">
              <h3 data-i18n="tavilyQuickConfig">Tavily web search</h3>
              <p class="muted" data-i18n="tavilyQuickConfigHint">Configure Tavily MCP for web search. The API key is saved in ~/.braincode/auth.json; ~/.braincode/mcp.json only stores a Braincode auth reference.</p>
              <div class="field"><label for="tavily-api-key" data-i18n="tavilyApiKey">Tavily API key</label><input id="tavily-api-key" type="password" autocomplete="off" placeholder="tvly-..." /></div>
              <div class="row"><button id="configure-tavily" class="primary" type="button" data-i18n="configureTavily">Configure Tavily</button><a href="https://app.tavily.com/home" target="_blank" rel="noreferrer" data-i18n="tavilyGetApiKey">Get API key</a></div>
              <div id="tavily-status" class="test-result" hidden></div>
            </div>
          </div>
          </div>
        </section>

        <section class="tab-panel" data-tab-panel="health">
          <div class="container stack">
          <h2 data-i18n="healthTitle">Health check</h2>
          <div class="row-between">
            <p class="muted" data-i18n="healthHint">One place to see whether providers, models, the package manager, MCP servers, and permission rules are usable.</p>
            <button id="health-refresh" type="button" data-i18n="healthRefresh">Refresh health</button>
          </div>
          <div class="panel-grid">
            <div class="stack"><h3 data-i18n="healthProviders">Provider key status</h3><p class="muted" data-i18n="healthProvidersHint"></p><div id="health-providers" class="list"></div></div>
            <div class="stack"><h3 data-i18n="healthModels">Model capabilities</h3><p class="muted" data-i18n="healthModelsHint"></p><div id="health-models" class="list"></div></div>
          </div>
          <div class="panel-grid">
            <div class="stack"><h3 data-i18n="healthPackageManager">Package manager</h3><p class="muted" data-i18n="healthPackageManagerHint"></p><div id="health-package-manager" class="list"></div></div>
            <div class="stack">
              <h3 data-i18n="healthMcp">MCP connection status</h3>
              <p class="muted" data-i18n="healthMcpHint"></p>
              <div class="row"><button id="health-run-mcp" type="button" data-i18n="healthRunMcp">Run MCP check</button></div>
              <div id="health-mcp" class="list"></div>
            </div>
          </div>
          <div class="card stack">
            <h3 data-i18n="permPreviewTitle">Permission preview</h3>
            <p class="muted" data-i18n="permPreviewHint"></p>
            <div class="grid">
              <div class="field"><label for="perm-tool" data-i18n="permTool">Tool</label><select id="perm-tool"><option value="edit_file">edit_file</option><option value="apply_patch">apply_patch</option><option value="exec_command">exec_command</option><option value="run_script">run_script</option></select></div>
              <div class="field"><label for="perm-path" data-i18n="permPath">Target path</label><input id="perm-path" autocomplete="off" placeholder="src/auth/login.ts" /></div>
              <div class="field"><label for="perm-command" data-i18n="permCommand">Command</label><input id="perm-command" autocomplete="off" placeholder="git push" /></div>
            </div>
            <div class="row-between"><span></span><button id="perm-evaluate" class="primary" type="button" data-i18n="permEvaluate">Preview decision</button></div>
            <div id="perm-result" class="test-result" hidden></div>
          </div>
          </div>
        </section>
      </main>
    </div>

    <script type="module">
      const translations = {
        en: {
          kicker: "LOCAL AI CONTROL PANEL", title: "BRAIN / CODE", subtitle: "Brutalist configuration surface for brains, agents, models, tools, and local runtime policy.", language: "LANG", refresh: "Refresh", runtimeActive: "Runtime Active",
          tabSettings: "Settings", tabModels: "Models", tabUsage: "Statistics", tabRouting: "Routing", tabTools: "Tools", tabHealth: "Health",
          settingsTitle: "Settings", host: "Config server host", port: "Config server port", mode: "Mode", modeAuto: "auto — plan and route agents automatically", modeRadical: "radical — more aggressive autonomous execution", restartHint: "Changing host or port affects the next config server start.", saveSettings: "Save settings",
          modelsTitle: "Model selection", modelsHint: "Add text, vision, and image-generation models from Pi's built-in providers, saved providers, /models endpoints, or manual OpenAI/Anthropic/Images API metadata.", addModel: "Add model", addModelHint: "Choose one add mode first, then only fill the fields needed for that source.", modelSource: "Add from", modelSourceCatalog: "Provider catalog", modelSourceProvider: "Provider /models endpoint", modelSourceManual: "Manual compatible API", modelSourceHintCatalog: "Use Pi's built-in catalog or authenticated subscriptions. Credentials are not bundled with catalog models.", modelSourceHintProvider: "Connect an OpenAI/Anthropic-compatible provider that can list /models, then pick one returned model.", modelSourceHintManual: "Use this when the provider cannot list /models or you need an image-generation model/proxy entry.", addFromCatalog: "Add from catalog", addManualModel: "Add custom model manually", manualModelHint: "Use this when a provider cannot list /models. The API key is optional and will be saved for the provider.", savedProviders: "Saved providers", provider: "Provider", baseUrl: "Base URL", apiKey: "API key", modelId: "Model ID", modelName: "Name", modelKind: "Model use", modelKindAgent: "Text or vision agent", modelKindImage: "Image generation / Image Maker", apiType: "API type", contextWindow: "Context window", thinkingLevel: "Thinking level", supportsVision: "Vision (image input)", visionBadge: "vision", imageBadge: "image", loadProviderModels: "Load /models", subscriptionModels: "Authenticated subscriptions", useSubscriptionProvider: "Use subscription", subscriptionProviderApplied: "Subscription provider selected", apiKeyOptional: "Optional token saved for the selected provider", apiKeySaved: "Saved key is available; leave empty to reuse it", apiKeyOptionalAuthenticated: "Optional; authenticated subscription token is used if empty", providerKeyHintSaved: "saved API key found; leave empty to reuse it, or enter a new key to replace it.", providerKeyHintOAuth: "authenticated subscription token found; leave empty to reuse it.", providerKeyHintMissing: "no saved credential yet; enter a key here to save it for this provider id.", providerKeyHintWillSave: "typed key will be saved for this provider id.", providerKeyStore: "Runtime reads credentials from ~/.braincode/auth.json.", providerCatalog: "Provider catalog", catalogModel: "Model", addSelectedModel: "Add selected model", addManualModelButton: "Add custom model", addModelButton: "Add model", configuredModels: "Configured models",
          usageStatsTitle: "Usage statistics", usageStatsHint: "Token usage collected from local session records, grouped by model, agent role, and runtime phase.", usageByModel: "By model", usageByRole: "By role", usageByPhase: "By phase", usageDetails: "Details", usageRecent: "Recent details", usageShowAll: "Show all details", usageCalls: "Calls", usageTokens: "Tokens", usageInput: "Input", usageOutput: "Output", usageCache: "Cache", usageSessions: "Sessions", usageForModel: "Model details", usageForRole: "Role details", usageForPhase: "Phase details", usageNoData: "No token usage collected yet.", usageClickHint: "Click a model, role, or phase row to filter recent detail records.", usageChartModels: "Model token chart", usageChartRoles: "Role token chart", usageChartPhases: "Phase share",
          brainRoutingTitle: "Brain routing", brainRoutingHint: "Select which configured model each agent role should use. Image Maker uses models marked with the openai-images API.", brain: "Brain", applyAllModel: "Apply model to all text roles", applyAllRoles: "Apply to text roles", saveBrainRouting: "Save brain routing", imageMakerConfigTitle: "Image Maker model", imageMakerConfigHint: "Image Maker uses an OpenAI-compatible Images API model from the Models tab. Vision-capable text models are still configured separately.", imageModelName: "Image model name", noImageModels: "No image-generation models configured. Add one on the Models tab with API type openai-images.",
          toolsAuthTitle: "Tools and auth", tools: "Tools", toolsHint: "Enabled tools are allowed by default; only extremely dangerous operations should require confirmation.", authStatus: "Auth status", authHint: "Secrets are not shown here. They belong in ~/.braincode/auth.json or a future secure store.", tavilyQuickConfig: "Tavily web search", tavilyQuickConfigHint: "Configure Tavily MCP for web search. The API key is saved in ~/.braincode/auth.json; ~/.braincode/mcp.json only stores a Braincode auth reference.", tavilyApiKey: "Tavily API key", configureTavily: "Configure Tavily", tavilyGetApiKey: "Get API key", tavilyConfigured: "Tavily MCP configured", tavilyNotConfigured: "Tavily MCP is not configured", tavilyNeedsApiKey: "Add a Tavily API key to finish setup", tavilyServerReady: "MCP server ready", tavilyAuthReady: "API key saved", tavilyApiKeyRequired: "Tavily API key is required", tavilyRestartHint: "Start a new agent run or use /mcp to recheck the server.", subscriptionAuth: "Subscription OAuth", subscriptionAuthHint: "Connect Claude Pro/Max, ChatGPT Plus/Pro Codex, and GitHub Copilot through Pi OAuth. ChatGPT subscription OAuth is not recommended for reliable calls; if you want to use subscription models, try ClIProxy API or another compatible proxy.", oauthProvider: "OAuth provider", useGithubEnterprise: "Use GitHub Enterprise", githubCopilotDefaultHint: "GitHub Copilot uses github.com by default; no domain is needed.", githubEnterpriseDomain: "GitHub Enterprise domain", githubEnterpriseDomainRequired: "GitHub Enterprise domain is required when that option is enabled.", startOAuthLogin: "Start login", cancelOAuthLogin: "Cancel", authorizationCode: "Authorization code or redirect URL", submitOAuthCode: "Submit code", oauthState: "OAuth", openAuthPage: "Open authorization page", oauthPending: "Waiting for browser/device authorization", oauthCompleted: "OAuth login saved", oauthFailed: "OAuth login failed",
          loading: "Loading...", loaded: "Loaded", loadingCatalog: "Loading model catalog...", catalogFailed: "Model catalog failed to load", saving: "Saving", saved: "Saved", failed: "Failed", none: "None configured", edit: "Edit", save: "Save", cancel: "Cancel", duplicateModel: "A configured model with this ID already exists.", remove: "Remove", testConnection: "Test connection", testing: "Testing", testOk: "Connection ok", testFailure_missingApiKey: "Missing API key for this provider.", testFailure_unsupportedLocation: "The provider rejected this request because the API account or request location is not supported. Use a provider or base URL available in your region, or route this provider through a supported OpenAI-compatible proxy.", testFailure_unsupportedClient: "The provider rejected this request because this model endpoint only accepts specific coding-agent clients. Choose another model/provider for Braincode, or remove this model from Brain role fallbacks.", testFailure_subscriptionBlocked: "The ChatGPT subscription endpoint was blocked by a browser or Cloudflare challenge. OAuth is saved, but ChatGPT subscription OAuth is not recommended for reliable local calls; try ClIProxy API, an OpenAI API key, or another compatible proxy/provider.", testFailure_auth: "The provider rejected the request. Check the API key, account permissions, and model access.", testFailure_rateLimit: "The provider rejected the request due to rate limit or quota. Try again later or use a different key/model.", testFailure_invalidResponse: "The provider responded, but the test response was empty or malformed.", testFailure_network: "The provider could not be reached. Check the base URL, network, and local proxy settings.", enabled: "Enabled", disabled: "Disabled", allowedByDefault: "Allowed by default", confirmDangerous: "Confirm extremely dangerous operations", allowWithoutPrompt: "Allow without prompt", askForDangerous: "Ask for dangerous ops",
          thinking: "Thinking", fallbackModel: "Fallback model",
          healthTitle: "Health check", healthHint: "One place to see whether providers, models, the package manager, MCP servers, and permission rules are actually usable.", healthRefresh: "Refresh health", healthProviders: "Provider key status", healthProvidersHint: "Which providers have a saved credential. Models from a provider without a key cannot run.", healthModels: "Model capabilities", healthModelsHint: "Tools, vision, and image generation per configured model. An image prompt needs a model with image generation; a screenshot prompt needs vision.", healthPackageManager: "Package manager", healthPackageManagerHint: "Detected from lockfiles in the current project. Checks and run_script use this.", healthMcp: "MCP connection status", healthMcpHint: "Live connection attempt against configured MCP servers. Shows which connected, which failed, and which were skipped (blocked).", healthRunMcp: "Run MCP check", healthMcpRunning: "Connecting to MCP servers...", capTools: "tools", capVision: "vision", capImage: "image", keyPresent: "key present", keyMissing: "no key", pmDetected: "Detected", pmNotDetected: "No lockfile detected — defaulting to npm", mcpConnected: "Connected", mcpFailed: "Failed", mcpSkipped: "Skipped / blocked", mcpNone: "No MCP servers configured", mcpToolCount: "tools",
          permPreviewTitle: "Permission preview", permPreviewHint: "Check how the permission policy would judge a file edit or command before an agent runs it.", permTool: "Tool", permPath: "Target path", permCommand: "Command", permEvaluate: "Preview decision", permAction: "Decision", permReviewRequired: "review required", permReviewNot: "no review required", permNoMatch: "No rule matched — falls back to tool default approval.", permActionAllow: "allow", permActionAsk: "ask", permActionDeny: "deny", permActionNone: "no match",

          petCardTitle: "BrainPet model — used when the pet panel calls a model to summarize the live agent run",
          roleLabel_routeBrain: "Router Brain", roleLabel_frontend: "Frontend", roleLabel_backend: "Backend", roleLabel_designer: "Designer", roleLabel_imageMaker: "Image Maker", roleLabel_dba: "DBA", roleLabel_devops: "DevOps", roleLabel_security: "Security", roleLabel_qa: "QA", roleLabel_review: "Review", roleLabel_summarize: "Summarize", roleLabel_oracle: "Oracle", roleLabel_librarian: "Librarian", roleLabel_rush: "Rush", roleLabel_pet: "BrainPet",
          roleDesc_routeBrain: "Main router: reads user intent, creates the todo/dependency plan, and decides which role handles the task.",
          roleDesc_frontend: "Frontend: UI, browser behavior, CSS, components, accessibility, and user-facing polish. There is no generic coding role — code work is split by domain.",
          roleDesc_backend: "Backend: APIs, services, validation, persistence boundaries, and server behavior.",
          roleDesc_designer: "Designer: UX flows, visual direction, interaction design, and implementable product layout guidance.",
          roleDesc_imageMaker: "Image Maker: generates raster image assets through a configured OpenAI-compatible Images API provider, such as OpenAI, Minimax, or a compatible proxy.",
          roleDesc_dba: "DBA: schema design, migrations, indexes, query plans, data integrity, and database performance.",
          roleDesc_devops: "DevOps: CI/CD, deployment, containers, infrastructure, observability, and operations.",
          roleDesc_security: "Security: auth, permissions, secrets, vulnerabilities, threat models, and secure defaults.",
          roleDesc_qa: "QA: focused tests, edge cases, regression checks, reproducible bugs, and quality strategy.",
          roleDesc_review: "Audit and review: handles code review, risk auditing, and regression hunting.",
          roleDesc_summarize: "Summary and handoff: compresses context, generates handoffs, and consolidates results.",
          roleDesc_oracle: "Deep reasoning: handles complex architecture, hard bugs, and major decisions.",
          roleDesc_librarian: "Codebase comprehension and fact finding: reads repos, locates symbols, gathers references and external facts. Absorbs what used to be a separate research role.",
          roleDesc_rush: "Rush: small one-off chores AND short conversational replies. Absorbs what used to be a separate fast-reply role.",
          roleDesc_pet: "BrainPet status reporter: watches the live agent run and produces short progress lines for the TUI pet panel. Read-only, never routes work."
        },
        zh: {
          kicker: "本地 AI 控制台", title: "BRAIN / CODE", subtitle: "用于配置 brain、agent、模型、工具和本地运行策略的高密度技术界面。", language: "语言", refresh: "刷新", runtimeActive: "运行时活跃",
          tabSettings: "基础设置", tabModels: "模型", tabUsage: "数据统计", tabRouting: "路由", tabTools: "工具", tabHealth: "健康检查",
          settingsTitle: "基础设置", host: "配置服务主机", port: "配置服务端口", mode: "模式", modeAuto: "auto — 根据意图自动规划并路由 agent", modeRadical: "radical — 更激进的自治执行", restartHint: "修改主机或端口会在下次启动配置服务时生效。", saveSettings: "保存设置",
          modelsTitle: "模型选择", modelsHint: "添加文本、视觉和图片生成模型：Pi 内置 provider、已保存 provider、/models 端点，或手动填写 OpenAI/Anthropic/Images API 元数据。", addModel: "添加模型", addModelHint: "先选择添加方式，再只填写这个来源需要的字段。", modelSource: "添加方式", modelSourceCatalog: "Provider 目录", modelSourceProvider: "Provider /models 端点", modelSourceManual: "手动填写兼容 API", modelSourceHintCatalog: "使用 Pi 内置模型目录或已认证订阅；目录模型本身不携带凭证。", modelSourceHintProvider: "连接能列出 /models 的 OpenAI/Anthropic-compatible provider，再从返回模型里选择。", modelSourceHintManual: "当 provider 不能列出 /models，或需要添加图片生成模型 / 代理模型时使用。", addFromCatalog: "从目录添加", addManualModel: "手动添加自定义模型", manualModelHint: "当 provider 无法列出 /models 时使用。API key 可选，会保存到该 provider。", savedProviders: "已保存 Provider", provider: "Provider", baseUrl: "Base URL", apiKey: "API key", modelId: "模型 ID", modelName: "名称", modelKind: "模型用途", modelKindAgent: "文本或视觉 agent", modelKindImage: "图片生成 / 图片制造者", apiType: "API 类型", contextWindow: "上下文窗口", thinkingLevel: "思考等级", supportsVision: "视觉（图像输入）", visionBadge: "视觉", imageBadge: "图片", loadProviderModels: "加载 /models", subscriptionModels: "已认证订阅", useSubscriptionProvider: "使用订阅", subscriptionProviderApplied: "已选择订阅 Provider", apiKeyOptional: "可选；会保存到选中的 Provider", apiKeySaved: "已有保存的 key；留空会复用", apiKeyOptionalAuthenticated: "可选；留空会使用已认证订阅 token", providerKeyHintSaved: "已有保存的 API key；留空会复用，填写新 key 会替换。", providerKeyHintOAuth: "已有认证订阅 token；留空会复用。", providerKeyHintMissing: "还没有保存的凭证；在这里填写会按这个 provider id 保存。", providerKeyHintWillSave: "已输入的 key 会按这个 provider id 保存。", providerKeyStore: "运行时按 provider id 从 ~/.braincode/auth.json 读取凭证。", providerCatalog: "Provider 目录", catalogModel: "模型", addSelectedModel: "添加选中模型", addManualModelButton: "添加自定义模型", addModelButton: "添加模型", configuredModels: "已配置模型",
          usageStatsTitle: "数据统计", usageStatsHint: "从本地 session 记录收集 token 用量，并按模型、agent 角色和运行阶段汇总。", usageByModel: "按模型", usageByRole: "按角色", usageByPhase: "按阶段", usageDetails: "详情", usageRecent: "最近详情", usageShowAll: "显示全部详情", usageCalls: "调用", usageTokens: "Tokens", usageInput: "输入", usageOutput: "输出", usageCache: "缓存", usageSessions: "Session", usageForModel: "模型详情", usageForRole: "角色详情", usageForPhase: "阶段详情", usageNoData: "还没有收集到 token 用量。", usageClickHint: "点击模型、角色或阶段行可以过滤最近的明细记录。", usageChartModels: "模型 token 图表", usageChartRoles: "角色 token 图表", usageChartPhases: "阶段占比",
          brainRoutingTitle: "Brain 路由", brainRoutingHint: "为每个 agent 角色选择已配置模型；图片制造者使用标记为 openai-images API 的模型。", brain: "Brain", applyAllModel: "应用模型到全部文本角色", applyAllRoles: "应用到文本角色", saveBrainRouting: "保存 Brain 路由", imageMakerConfigTitle: "图片制造者模型", imageMakerConfigHint: "图片制造者使用模型页里添加的 OpenAI-compatible Images API 模型；视觉文本模型仍单独配置。", imageModelName: "图片模型名称", noImageModels: "还没有图片生成模型。请先在模型页添加一个 API 类型为 openai-images 的模型。",
          toolsAuthTitle: "工具与认证", tools: "工具", toolsHint: "启用的工具默认允许执行；只有极高危险操作才需要确认。", authStatus: "认证状态", authHint: "这里不会展示密钥。密钥应放在 ~/.braincode/auth.json 或未来的安全存储中。", tavilyQuickConfig: "Tavily 网页搜索", tavilyQuickConfigHint: "为 web_search 配置 Tavily MCP。API key 会保存到 ~/.braincode/auth.json；~/.braincode/mcp.json 只保存 Braincode 认证引用。", tavilyApiKey: "Tavily API key", configureTavily: "配置 Tavily", tavilyGetApiKey: "获取 API key", tavilyConfigured: "Tavily MCP 已配置", tavilyNotConfigured: "Tavily MCP 尚未配置", tavilyNeedsApiKey: "添加 Tavily API key 才能完成配置", tavilyServerReady: "MCP server 已就绪", tavilyAuthReady: "API key 已保存", tavilyApiKeyRequired: "需要 Tavily API key", tavilyRestartHint: "开始新的 agent run，或用 /mcp 重新检查 server。", subscriptionAuth: "订阅 OAuth", subscriptionAuthHint: "通过 Pi OAuth 连接 Claude Pro/Max、ChatGPT Plus/Pro Codex 和 GitHub Copilot。不推荐用 ChatGPT 订阅 OAuth 做稳定调用；如果要使用订阅模型，请尝试 ClIProxy API 或其他兼容代理。", oauthProvider: "OAuth Provider", useGithubEnterprise: "使用 GitHub Enterprise", githubCopilotDefaultHint: "GitHub Copilot 默认使用 github.com，不需要填写域名。", githubEnterpriseDomain: "GitHub Enterprise 域名", githubEnterpriseDomainRequired: "启用 GitHub Enterprise 时必须填写域名。", startOAuthLogin: "开始登录", cancelOAuthLogin: "取消", authorizationCode: "授权码或回调 URL", submitOAuthCode: "提交授权码", oauthState: "OAuth", openAuthPage: "打开授权页面", oauthPending: "等待浏览器或设备授权", oauthCompleted: "OAuth 登录已保存", oauthFailed: "OAuth 登录失败",
          loading: "加载中...", loaded: "已加载", loadingCatalog: "正在加载模型目录...", catalogFailed: "模型目录加载失败", saving: "正在保存", saved: "已保存", failed: "失败", none: "暂无配置", edit: "编辑", save: "保存", cancel: "取消", duplicateModel: "已存在相同 ID 的已配置模型。", remove: "移除", testConnection: "连通测试", testing: "测试中", testOk: "连通正常", testFailure_missingApiKey: "这个 Provider 缺少 API key。", testFailure_unsupportedLocation: "Provider 拒绝了这次请求：当前账号或请求位置不支持 API 使用。请换用当前地区可用的 Provider / Base URL，或通过可用的 OpenAI-compatible 代理转发。", testFailure_unsupportedClient: "Provider 拒绝了这次请求：这个模型端点只接受特定 coding-agent 客户端。请为 Braincode 换用其他模型 / Provider，或从 Brain 角色的 fallback 中移除这个模型。", testFailure_subscriptionBlocked: "ChatGPT 订阅端点被浏览器或 Cloudflare 校验拦截。OAuth 已保存，但不推荐用 ChatGPT 订阅 OAuth 做稳定本地调用；请尝试 ClIProxy API、OpenAI API key 或其他兼容代理 / Provider。", testFailure_auth: "Provider 拒绝了这次请求。请检查 API key、账号权限和模型访问权限。", testFailure_rateLimit: "Provider 因限流或额度不足拒绝了这次请求。稍后重试，或换用其他 key / 模型。", testFailure_invalidResponse: "Provider 有响应，但测试返回为空或格式不符合预期。", testFailure_network: "无法连到 Provider。请检查 Base URL、网络和本地代理设置。", enabled: "已启用", disabled: "已禁用", allowedByDefault: "默认允许", confirmDangerous: "极高危险操作需确认", allowWithoutPrompt: "允许且不再提示", askForDangerous: "危险操作时询问",
          thinking: "思考", fallbackModel: "备用模型",
          healthTitle: "健康检查", healthHint: "在一个地方看清 provider、模型、包管理器、MCP server 和权限规则是否真的可用。", healthRefresh: "刷新健康状态", healthProviders: "Provider key 状态", healthProvidersHint: "哪些 provider 已保存凭证。没有 key 的 provider 下的模型无法运行。", healthModels: "模型能力", healthModelsHint: "每个已配置模型的 tools / 视觉 / 图片生成能力。image prompt 需要带图片生成能力的模型；截图类 prompt 需要视觉能力。", healthPackageManager: "包管理器", healthPackageManagerHint: "根据当前项目的 lockfile 检测，checks 和 run_script 会用到。", healthMcp: "MCP 连接状态", healthMcpHint: "对已配置的 MCP server 发起实时连接，显示哪些已连接、哪些失败、哪些被跳过（blocked）。", healthRunMcp: "运行 MCP 检查", healthMcpRunning: "正在连接 MCP server...", capTools: "工具", capVision: "视觉", capImage: "图片", keyPresent: "已有 key", keyMissing: "无 key", pmDetected: "已检测", pmNotDetected: "未检测到 lockfile —— 默认用 npm", mcpConnected: "已连接", mcpFailed: "失败", mcpSkipped: "跳过 / blocked", mcpNone: "未配置 MCP server", mcpToolCount: "个工具",
          permPreviewTitle: "权限预览", permPreviewHint: "在 agent 真正执行之前，先看看权限策略会怎么判定一次文件编辑或命令。", permTool: "工具", permPath: "目标路径", permCommand: "命令", permEvaluate: "预览判定", permAction: "判定", permReviewRequired: "需要 review", permReviewNot: "无需 review", permNoMatch: "没有规则命中——回退到工具默认的审批策略。", permActionAllow: "允许", permActionAsk: "询问", permActionDeny: "拒绝", permActionNone: "未命中",

          petCardTitle: "BrainPet 模型 — pet 面板调用模型给当前 agent 运行生成进度文字时使用",
          roleLabel_routeBrain: "路由大脑", roleLabel_frontend: "前端", roleLabel_backend: "后端", roleLabel_designer: "设计师", roleLabel_imageMaker: "图片制造者", roleLabel_dba: "DBA", roleLabel_devops: "DevOps", roleLabel_security: "安全", roleLabel_qa: "QA", roleLabel_review: "审查", roleLabel_summarize: "总结", roleLabel_oracle: "Oracle", roleLabel_librarian: "Librarian", roleLabel_rush: "打杂", roleLabel_pet: "BrainPet",
          roleDesc_routeBrain: "主控路由：读取用户意图，生成 todo / 依赖计划，并决定交给哪个角色处理。",
          roleDesc_frontend: "前端：负责 UI、浏览器行为、CSS、组件、可访问性和用户侧打磨。已经没有通用的 coding 角色，代码工作按领域细分。",
          roleDesc_backend: "后端：负责 API、服务、校验、持久化边界和服务端行为。",
          roleDesc_designer: "设计师：负责 UX 流程、视觉方向、交互设计和可落地的产品布局建议。",
          roleDesc_imageMaker: "图片制造者：通过用户配置的 OpenAI-compatible Images API 生成图片资产，可接 OpenAI、Minimax 或兼容代理。",
          roleDesc_dba: "DBA：负责表结构、迁移、索引、查询计划、数据完整性和数据库性能。",
          roleDesc_devops: "DevOps：负责 CI/CD、部署、容器、基础设施、可观测性和运维。",
          roleDesc_security: "安全：负责认证、权限、密钥、漏洞、威胁建模和安全默认值。",
          roleDesc_qa: "QA：负责测试计划、边界场景、回归检查、可复现 bug 和质量策略。",
          roleDesc_review: "审查检查：负责 code review、风险审计、找回归。",
          roleDesc_summarize: "总结交接：负责压缩上下文、生成 handoff、整理结果。",
          roleDesc_oracle: "深度推理：负责复杂架构、疑难 bug、重大决策。",
          roleDesc_librarian: "代码库理解 + 信息检索：读仓库、定位符号、查资料、整理事实。已合并了原来的 research 角色。",
          roleDesc_rush: "打杂：各种杂事、一次性任务，以及简单的对话回复。已合并了原来的 fastReply 角色。",
          roleDesc_pet: "BrainPet 状态报告：观察当前 agent 的运行情况，给 TUI 右侧 pet 面板生成简短进度文字。只读，不参与路由。"
        }
      }

      const roles = ["routeBrain", "frontend", "backend", "designer", "imageMaker", "dba", "devops", "security", "qa", "review", "summarize", "oracle", "librarian", "rush", "pet"]
      const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh"]
      const apiTypes = ["openai", "anthropic", "openai-images"]
      function roleLabel(role) { return t("roleLabel_" + role) }
      function roleDescription(role) { return t("roleDesc_" + role) }
      const status = document.querySelector("#status")
      const authStatus = document.querySelector("#auth-status")
      const refresh = document.querySelector("#refresh")
      const language = document.querySelector("#language")
      const tabButtons = Array.from(document.querySelectorAll("[data-tab]"))
      const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"))
      const settingsForm = document.querySelector("#settings-form")
      const modelForm = document.querySelector("#model-form")
      const brainForm = document.querySelector("#brain-form")
      const hostInput = document.querySelector("#host")
      const portInput = document.querySelector("#port")
      const modeInput = document.querySelector("#mode")
      const modelSourceInput = document.querySelector("#model-source")
      const modelSourceHint = document.querySelector("#model-source-hint")
      const modelConnectionGrid = document.querySelector("#model-connection-grid")
      const savedProviderSelect = document.querySelector("#saved-provider-select")
      const modelKindInput = document.querySelector("#model-kind")
      const customProviderInput = document.querySelector("#custom-provider")
      const customBaseUrlInput = document.querySelector("#custom-base-url")
      const customApiKeyInput = document.querySelector("#custom-api-key")
      const providerKeyField = document.querySelector("#provider-key-field")
      const providerKeyHint = document.querySelector("#provider-key-hint")
      const loadProviderModelsButton = document.querySelector("#load-provider-models")
      const subscriptionModelsPanel = document.querySelector("#subscription-models-panel")
      const subscriptionProviderSelect = document.querySelector("#subscription-provider-select")
      const useSubscriptionProviderButton = document.querySelector("#use-subscription-provider")
      const providerSelect = document.querySelector("#provider-select")
      const catalogModelSelect = document.querySelector("#catalog-model-select")
      const catalogVisionInput = document.querySelector("#manual-vision")
      const catalogApiKeyInput = customApiKeyInput
      const manualProviderInput = customProviderInput
      const manualModelIdInput = document.querySelector("#manual-model-id")
      const manualNameInput = document.querySelector("#manual-name")
      const manualBaseUrlInput = customBaseUrlInput
      const manualApiKeyInput = customApiKeyInput
      const manualApiInput = document.querySelector("#manual-api")
      const manualContextWindowInput = document.querySelector("#manual-context-window")
      const manualThinkingInput = document.querySelector("#manual-thinking")
      const manualVisionInput = document.querySelector("#manual-vision")
      const testManualModelButton = document.querySelector("#test-manual-model")
      const manualTestResult = document.querySelector("#manual-test-result")
      const configuredModels = document.querySelector("#configured-models")
      const usageSummary = document.querySelector("#usage-summary")
      const usageModels = document.querySelector("#usage-models")
      const usageRoles = document.querySelector("#usage-roles")
      const usagePhases = document.querySelector("#usage-phases")
      const usageDetails = document.querySelector("#usage-details")
      const usageDetailTitle = document.querySelector("#usage-detail-title")
      const usageFilterNote = document.querySelector("#usage-filter-note")
      const usageShowAll = document.querySelector("#usage-show-all")
      const usageChartModels = document.querySelector("#usage-chart-models")
      const usageChartRoles = document.querySelector("#usage-chart-roles")
      const usageChartPhases = document.querySelector("#usage-chart-phases")
      const brainSelect = document.querySelector("#brain-select")
      const applyAllModel = document.querySelector("#apply-all-model")
      const applyAllRoles = document.querySelector("#apply-all-roles")
      const roleModels = document.querySelector("#role-models")
      const configuredTools = document.querySelector("#configured-tools")
      const oauthProviderSelect = document.querySelector("#oauth-provider-select")
      const oauthEnterpriseToggleField = document.querySelector("#oauth-enterprise-toggle-field")
      const oauthUseEnterpriseInput = document.querySelector("#oauth-use-enterprise")
      const oauthEnterpriseDomainField = document.querySelector("#oauth-enterprise-domain-field")
      const oauthEnterpriseDomainInput = document.querySelector("#oauth-enterprise-domain")
      const startOAuthLoginButton = document.querySelector("#start-oauth-login")
      const cancelOAuthLoginButton = document.querySelector("#cancel-oauth-login")
      const oauthLoginState = document.querySelector("#oauth-login-state")
      const oauthManualCodeInput = document.querySelector("#oauth-manual-code")
      const submitOAuthCodeButton = document.querySelector("#submit-oauth-code")
      const tavilyApiKeyInput = document.querySelector("#tavily-api-key")
      const configureTavilyButton = document.querySelector("#configure-tavily")
      const tavilyStatus = document.querySelector("#tavily-status")
      const healthRefreshButton = document.querySelector("#health-refresh")
      const healthProviders = document.querySelector("#health-providers")
      const healthModels = document.querySelector("#health-models")
      const healthPackageManager = document.querySelector("#health-package-manager")
      const healthRunMcpButton = document.querySelector("#health-run-mcp")
      const healthMcp = document.querySelector("#health-mcp")
      const permToolSelect = document.querySelector("#perm-tool")
      const permPathInput = document.querySelector("#perm-path")
      const permCommandInput = document.querySelector("#perm-command")
      const permEvaluateButton = document.querySelector("#perm-evaluate")
      const permResult = document.querySelector("#perm-result")

      let currentSettings = null
      let currentBrains = { brains: [] }
      let currentModels = { models: [] }
      let currentTools = { tools: [] }
      let currentAuthStatus = { configuredProviders: [], providerAuth: [] }
      let currentUserMcp = { path: "", config: { mcpServers: {} }, serverNames: [] }
      let currentUsageStats = { generatedAt: Date.now(), sessions: 0, totals: { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, byModel: [], byRole: [], byPhase: [], recent: [] }
      let currentUsageFilter = null
      const activeTabStorageKey = "braincode-config-tab-v2"
      let activeTab = localStorage.getItem(activeTabStorageKey) || "models"
      let chartRuntimePromise = null
      let chartRoots = new Map()
      let catalog = { providers: [] }
      let oauthProviders = []
      let oauthLoginSession = null
      let oauthPollTimer = null
      let oauthPopup = null
      let oauthPopupTarget = ""
      let editingModelId = null
      let currentLang = localStorage.getItem("braincode-config-lang") || "en"
      language.value = currentLang

      function t(key) { return translations[currentLang][key] || translations.en[key] || key }
      function option(value, label) { const item = document.createElement("option"); item.value = value; item.textContent = label; return item }
      function applyLanguage() { document.documentElement.lang = currentLang; for (const element of document.querySelectorAll("[data-i18n]")) { const key = element.getAttribute("data-i18n"); if (key) element.innerHTML = t(key) } }
      async function getJson(path) { const response = await fetch(path); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Request failed"); return body.data }
      async function postJson(path, value) { const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Request failed"); return body.data }
      async function putJson(path, value) { const response = await fetch(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "Request failed"); return body.data }

      function setActiveTab(tab, options = {}) {
        const nextTab = tabPanels.some((panel) => panel.dataset.tabPanel === tab) ? tab : "models"
        activeTab = nextTab
        localStorage.setItem(activeTabStorageKey, nextTab)
        for (const button of tabButtons) {
          const selected = button.dataset.tab === nextTab
          button.classList.toggle("active", selected)
          button.setAttribute("aria-selected", String(selected))
        }
        for (const panel of tabPanels) {
          panel.classList.toggle("active", panel.dataset.tabPanel === nextTab)
        }
        if (nextTab === "usage") renderUsageCharts()
        if (nextTab === "health") loadHealthCheck().catch(showError)
        if (options.scroll !== false) document.querySelector(".tab-section")?.scrollIntoView({ block: "start" })
      }

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
        function refresh() { input.value = selectLabel(select); input.disabled = select.disabled; combo.classList.toggle("disabled", select.disabled); render("") }
        input.addEventListener("focus", () => { if (select.disabled) return; input.select() })
        input.addEventListener("mousedown", () => { if (select.disabled) return; combo.classList.add("open"); render("") })
        input.addEventListener("input", () => { if (select.disabled) return; combo.classList.add("open"); render(input.value) })
        input.addEventListener("keydown", (event) => { if (select.disabled) return; if (event.key === "Escape") close(); if (event.key === "Enter") { const first = list.querySelector(".combo-option"); if (first) { event.preventDefault(); choose(first) } } })
        document.addEventListener("mousedown", (event) => { if (!combo.contains(event.target)) close() })
        select.addEventListener("change", refresh)
        new MutationObserver(refresh).observe(select, { childList: true, attributes: true, subtree: true })
        enhancedSelects.set(select, { refresh })
        refresh()
      }
      function enhanceSelects(root = document) { for (const select of root.querySelectorAll("select")) enhanceSelect(select) }

      function currentModelSource() {
        return modelSourceInput.value || "catalog"
      }

      function syncModelSourceControls() {
        const source = currentModelSource()
        for (const element of modelForm.querySelectorAll("[data-sources]")) {
          const sources = String(element.dataset.sources || "").split(/\\s+/).filter(Boolean)
          element.hidden = !sources.includes(source)
        }
        const sourceField = modelSourceInput.closest(".field")
        const providerCatalogField = providerSelect.closest(".field")
        const catalogModelField = catalogModelSelect.closest(".field")
        if (source === "catalog") {
          sourceField?.after(subscriptionModelsPanel, providerCatalogField, catalogModelField)
        } else {
          loadProviderModelsButton.after(providerCatalogField, catalogModelField)
        }
        if (source === "catalog") {
          catalogModelSelect.closest(".field")?.after(providerKeyField)
        } else {
          const baseUrlField = manualBaseUrlInput.closest(".field")
          if (baseUrlField) baseUrlField.after(providerKeyField)
          else modelConnectionGrid.append(providerKeyField)
        }
        modelSourceHint.textContent = t("modelSourceHint" + source.charAt(0).toUpperCase() + source.slice(1))
        manualModelIdInput.required = source === "manual"
        enhanceSelect(modelSourceInput)
        syncCatalogApiKeyPlaceholder()
        renderSubscriptionProviders()
      }

      function renderSettings() {
        hostInput.value = currentSettings.configServer.host
        portInput.value = String(currentSettings.configServer.port)
        modeInput.value = currentSettings.mode
        enhanceSelects(settingsForm)
      }

      function renderCatalogProviders() {
        providerSelect.disabled = catalog.providers.length === 0
        catalogModelSelect.disabled = catalog.providers.length === 0
        providerSelect.replaceChildren(...catalog.providers.map((entry) => option(entry.provider, entry.provider)))
        enhanceSelect(providerSelect)
        syncModelSourceControls()
        renderCatalogModels()
        renderSubscriptionProviders()
      }

      function renderCatalogModels() {
        const entry = catalog.providers.find((candidate) => candidate.provider === providerSelect.value)
        const wantsImages = normalizeApiType(manualApiInput.value) === "openai-images"
        catalogModelSelect.replaceChildren(...(entry?.models || []).filter((model) => wantsImages ? isImageGenerationModelConfig(model) : !isImageGenerationModelConfig(model)).map((model) => option(model.id, model.name + " / " + model.modelId)))
        enhanceSelect(catalogModelSelect)
        syncCatalogVision()
        syncCatalogApiKeyPlaceholder()
      }

      function authenticatedCatalogProviders() {
        const catalogByProvider = new Map(catalog.providers.map((entry) => [entry.provider, entry]))
        const oauthById = new Map(oauthProviders.map((provider) => [provider.id, provider]))
        const matched = new Map()
        for (const authEntry of currentAuthStatus.providerAuth || []) {
          if (authEntry.kind !== "oauth") continue
          const candidates = [authEntry.provider, authEntry.oauthProviderId].filter(Boolean)
          const catalogEntry = candidates.map((provider) => catalogByProvider.get(provider)).find(Boolean)
          if (!catalogEntry || matched.has(catalogEntry.provider)) continue
          const oauthProvider = candidates.map((provider) => oauthById.get(provider)).find(Boolean)
          matched.set(catalogEntry.provider, {
            provider: catalogEntry.provider,
            label: (oauthProvider?.name || catalogEntry.provider) + " / " + catalogEntry.provider,
          })
        }
        return Array.from(matched.values())
      }

      function renderSubscriptionProviders() {
        const providers = authenticatedCatalogProviders()
        subscriptionModelsPanel.hidden = currentModelSource() !== "catalog" || providers.length === 0
        subscriptionProviderSelect.disabled = providers.length === 0
        useSubscriptionProviderButton.disabled = providers.length === 0
        subscriptionProviderSelect.replaceChildren(...providers.map((entry) => option(entry.provider, entry.label)))
        enhanceSelect(subscriptionProviderSelect)
        syncCatalogApiKeyPlaceholder()
      }

      function applySubscriptionProvider() {
        const provider = subscriptionProviderSelect.value
        if (!provider) return
        providerSelect.value = provider
        catalogApiKeyInput.value = ""
        providerSelect.dispatchEvent(new Event("change", { bubbles: true }))
        status.textContent = t("subscriptionProviderApplied") + ": " + provider
      }

      function syncCatalogApiKeyPlaceholder() {
        const provider = activeCredentialProvider()
        const hasTypedKey = catalogApiKeyInput.value.trim().length > 0
        const hasOauth = hasProviderOAuth(provider)
        const hasKey = hasProviderApiKey(provider)
        catalogApiKeyInput.placeholder = hasKey ? t("apiKeySaved") : hasOauth ? t("apiKeyOptionalAuthenticated") : t("apiKeyOptional")
        providerKeyHint.classList.remove("credential-ok", "credential-missing")
        if (!provider) {
          providerKeyHint.textContent = ""
          return
        }
        const statusKey = hasTypedKey ? "providerKeyHintWillSave" : hasKey ? "providerKeyHintSaved" : hasOauth ? "providerKeyHintOAuth" : "providerKeyHintMissing"
        providerKeyHint.textContent = provider + ": " + t(statusKey) + " " + t("providerKeyStore")
        providerKeyHint.classList.add(hasTypedKey || hasOauth || hasKey ? "credential-ok" : "credential-missing")
      }

      function activeCredentialProvider() {
        if (currentModelSource() === "manual" || currentModelSource() === "provider") {
          return manualProviderInput.value.trim() || providerSelect.value || ""
        }
        const catalogModel = selectedCatalogModel()
        return catalogModel?.provider || manualProviderInput.value.trim() || providerSelect.value || ""
      }

      function hasProviderApiKey(provider) {
        return (currentAuthStatus.providerAuth || []).some((entry) => entry.provider === provider && entry.kind === "api-key")
      }

      function hasProviderOAuth(provider) {
        return (currentAuthStatus.providerAuth || []).some((entry) => entry.kind === "oauth" && (entry.provider === provider || entry.oauthProviderId === provider))
      }

      function userMcpServers() {
        return currentUserMcp.config?.mcpServers || currentUserMcp.config?.servers || {}
      }

      function renderTavilyConfig() {
        const servers = userMcpServers()
        const hasServer = Boolean(servers.tavily)
        const hasKey = hasProviderApiKey("tavily")
        tavilyStatus.hidden = false
        tavilyStatus.className = "test-result" + (hasServer && hasKey ? " ok" : hasServer && !hasKey ? " fail" : "")
        const lines = hasServer && hasKey
          ? [t("tavilyConfigured"), t("tavilyServerReady") + ": tavily", t("tavilyAuthReady") + ": tavily", t("tavilyRestartHint")]
          : hasServer
            ? [t("tavilyNeedsApiKey"), t("tavilyServerReady") + ": tavily"]
            : [t("tavilyNotConfigured")]
        tavilyStatus.textContent = lines.join("\\n")
      }

      function setAuthStatusData(authStatusData) {
        currentAuthStatus = authStatusData || { configuredProviders: [], providerAuth: [] }
        authStatus.textContent = JSON.stringify(currentAuthStatus, null, 2)
        renderSubscriptionProviders()
        renderTavilyConfig()
      }

      function renderSavedProviders() {
        const providers = currentModels.providers || []
        savedProviderSelect.replaceChildren(option("", t("none")), ...providers.map((entry) => option(entry.provider, entry.provider + " / " + (entry.api || "openai") + " / " + entry.baseUrl)))
        enhanceSelect(savedProviderSelect)
      }

      function applySavedProvider() {
        const provider = (currentModels.providers || []).find((entry) => entry.provider === savedProviderSelect.value)
        if (!provider) return
        customProviderInput.value = provider.provider
        customBaseUrlInput.value = provider.baseUrl || ""
        manualApiInput.value = apiChoice(provider.api || "openai")
        enhanceSelect(manualApiInput)
        syncManualApiControls({ fillDefaults: false })
        renderCatalogModels()
      }

      function selectedCatalogModel() {
        if (currentModelSource() === "manual") return undefined
        const provider = catalog.providers.find((entry) => entry.provider === providerSelect.value)
        return provider?.models.find((candidate) => candidate.id === catalogModelSelect.value)
      }

      function isImageGenerationModelConfig(model) {
        return model?.supportsImageGeneration === true || model?.api === "openai-images"
      }

      function textModels() {
        return (currentModels.models || []).filter((model) => !isImageGenerationModelConfig(model))
      }

      function imageModels() {
        return (currentModels.models || []).filter(isImageGenerationModelConfig)
      }

      function modelOptionLabel(model) {
        return model.name + " / " + model.id
      }

      function syncModelKindFromApi() {
        modelKindInput.value = normalizeApiType(manualApiInput.value) === "openai-images" ? "image" : "agent"
        enhanceSelect(modelKindInput)
      }

      function syncModelFormPlaceholders() {
        const isImageApi = normalizeApiType(manualApiInput.value) === "openai-images"
        manualProviderInput.placeholder = isImageApi ? "openai / minimax / image-proxy" : "openai"
        manualModelIdInput.placeholder = isImageApi ? "gpt-image-2 / image-model" : "anthropic/claude-sonnet-4.5"
        manualNameInput.placeholder = isImageApi ? "Image model" : "Claude Sonnet 4.5"
        manualBaseUrlInput.placeholder = isImageApi ? "https://api.example.com/v1" : "https://api.openai.com/v1"
      }

      function syncModelApiControls(apiControl, contextWindowControl, thinkingControl, visionControl) {
        const isImageApi = normalizeApiType(apiControl.value) === "openai-images"
        if (isImageApi) {
          if (!contextWindowControl.value || contextWindowControl.value === "128000" || contextWindowControl.value === "200000") {
            contextWindowControl.value = "32000"
          }
          thinkingControl.value = "off"
          visionControl.checked = false
        }
        thinkingControl.disabled = isImageApi
        visionControl.disabled = isImageApi
        enhanceSelect(thinkingControl)
      }

      function syncManualApiControls(options = {}) {
        const isImageApi = normalizeApiType(manualApiInput.value) === "openai-images"
        if (isImageApi && options.fillDefaults !== false) {
          manualContextWindowInput.value = "32000"
        }
        syncModelApiControls(manualApiInput, manualContextWindowInput, manualThinkingInput, manualVisionInput)
        enhanceSelect(manualApiInput)
        syncModelKindFromApi()
        syncModelFormPlaceholders()
      }

      function syncCatalogVision() {
        if (currentModelSource() === "manual") {
          syncManualApiControls({ fillDefaults: false })
          syncCatalogApiKeyPlaceholder()
          return
        }
        const model = selectedCatalogModel()
        if (!model) {
          catalogVisionInput.disabled = false
          syncManualApiControls({ fillDefaults: false })
          syncCatalogApiKeyPlaceholder()
          return
        }
        manualProviderInput.value = model.provider || ""
        manualModelIdInput.value = model.modelId || ""
        manualNameInput.value = model.name || model.modelId || ""
        manualBaseUrlInput.value = model.baseUrl || ""
        manualApiInput.value = apiChoice(model.api || "openai")
        manualContextWindowInput.value = String(model.contextWindow || (apiChoice(model.api) === "anthropic" ? 200000 : 128000))
        manualThinkingInput.value = thinkingLevels.includes(model.defaultThinkingLevel) ? model.defaultThinkingLevel : "medium"
        catalogVisionInput.disabled = false
        catalogVisionInput.checked = model.supportsVision === true
        enhanceSelect(manualApiInput)
        syncManualApiControls({ fillDefaults: false })
        syncCatalogApiKeyPlaceholder()
      }

      function modelFromUnifiedForm() {
        if (currentModelSource() === "manual") return manualModelFromForm()
        const model = selectedCatalogModel()
        const provider = manualProviderInput.value.trim() || model?.provider || providerSelect.value.trim()
        const modelId = manualModelIdInput.value.trim() || model?.modelId || ""
        if (!provider || !modelId) return undefined
        const api = normalizeApiType(manualApiInput.value)
        if (model && model.provider === provider && model.modelId === modelId && model.builtIn === true) {
          const contextWindow = Number(manualContextWindowInput.value) || model.contextWindow || (api === "openai-images" ? 32000 : 128000)
          return {
            ...model,
            name: manualNameInput.value.trim() || model.name || modelId,
            api,
            ...modelCapabilitiesForApi(api, contextWindow, catalogVisionInput.checked, manualThinkingInput.value),
          }
        }
        return manualModelFromForm()
      }

      function apiChoice(value) {
        const normalized = String(value || "").trim()
        if (normalized === "openai-images") return "openai-images"
        return normalized === "anthropic" || normalized === "anthropic-messages" ? "anthropic" : "openai"
      }

      function isOpenAICompatibleApi(apiType) {
        const api = normalizeApiType(apiType)
        return api === "openai-completions" || api === "openai-images"
      }

      function normalizeBaseUrl(value, apiType = "openai") {
        const trimmed = value.trim().replace(new RegExp("/+$"), "")
        if (!trimmed) return ""
        const api = normalizeApiType(apiType)
        if (api === "anthropic-messages") return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed
        return isOpenAICompatibleApi(api) ? (trimmed.endsWith("/v1") ? trimmed : trimmed + "/v1") : trimmed
      }

      function normalizeApiType(value) {
        const choice = apiChoice(value)
        if (choice === "openai-images") return "openai-images"
        if (choice === "anthropic") return "anthropic-messages"
        return "openai-completions"
      }

      function modelCapabilitiesForApi(api, contextWindow, vision, thinkingLevel) {
        if (api === "openai-images") {
          return {
            contextWindow: contextWindow || 32000,
            supportsTools: false,
            supportsVision: false,
            supportsImageGeneration: true,
            defaultThinkingLevel: "off",
          }
        }
        return {
          contextWindow: contextWindow || (api === "anthropic-messages" ? 200000 : 128000),
          supportsTools: true,
          supportsVision: vision === true,
          supportsImageGeneration: false,
          defaultThinkingLevel: thinkingLevel || "medium",
        }
      }

      function manualModelFromForm() {
        const provider = manualProviderInput.value.trim()
        const modelId = manualModelIdInput.value.trim()
        const name = manualNameInput.value.trim() || modelId
        const api = normalizeApiType(manualApiInput.value)
        const baseUrl = normalizeBaseUrl(manualBaseUrlInput.value, api)
        const contextWindow = Number(manualContextWindowInput.value) || (api === "openai-images" ? 32000 : 128000)
        const capabilities = modelCapabilitiesForApi(api, contextWindow, manualVisionInput.checked, manualThinkingInput.value)
        return {
          id: provider + "/" + modelId,
          provider,
          modelId,
          name,
          api,
          ...(baseUrl ? { baseUrl } : {}),
          ...capabilities,
        }
      }

      function mergeConfiguredModel(model) {
        const index = currentModels.models.findIndex((candidate) => candidate.id === model.id)
        if (index === -1) return [...currentModels.models, model]
        const nextModels = [...currentModels.models]
        nextModels[index] = { ...nextModels[index], ...model }
        return nextModels
      }

      function makeField(id, labelKey, control) {
        const field = document.createElement("div")
        field.className = "field"
        const label = document.createElement("label")
        label.htmlFor = id
        label.textContent = t(labelKey)
        control.id = id
        field.append(label, control)
        return field
      }

      function makeTextInput(value, required = false) {
        const input = document.createElement("input")
        input.autocomplete = "off"
        input.value = value || ""
        input.required = required
        return input
      }

      function makeNumberInput(value) {
        const input = document.createElement("input")
        input.type = "number"
        input.min = "1"
        input.value = String(value || 128000)
        return input
      }

      function makeSelectInput(values, value) {
        const select = document.createElement("select")
        select.replaceChildren(...values.map((entry) => option(entry, entry)))
        const normalized = values === apiTypes ? apiChoice(value) : value
        select.value = values.includes(normalized) ? normalized : values[0]
        return select
      }

      function makeCheckboxField(id, checked) {
        const field = document.createElement("div")
        field.className = "field checkbox-field"
        const label = document.createElement("label")
        label.htmlFor = id
        const input = document.createElement("input")
        input.id = id
        input.type = "checkbox"
        input.checked = checked
        const text = document.createElement("span")
        text.textContent = t("supportsVision")
        label.append(input, text)
        field.append(label)
        return { field, input }
      }

      function editedModelFromControls(previousModel, controls) {
        const provider = controls.provider.value.trim()
        const modelId = controls.modelId.value.trim()
        const name = controls.name.value.trim() || modelId
        const api = normalizeApiType(controls.api.value)
        const baseUrl = normalizeBaseUrl(controls.baseUrl.value, api)
        const contextWindow = Number(controls.contextWindow.value) || (api === "openai-images" ? 32000 : 128000)
        const capabilities = modelCapabilitiesForApi(api, contextWindow, controls.vision.checked, controls.thinking.value)
        const nextModel = {
          ...previousModel,
          id: provider + "/" + modelId,
          provider,
          modelId,
          name,
          api,
          ...capabilities,
        }
        if (baseUrl) nextModel.baseUrl = baseUrl
        else delete nextModel.baseUrl
        return nextModel
      }

      function replaceModelIdInBrains(previousId, nextId) {
        if (previousId === nextId) return currentBrains
        const nextBrains = structuredClone(currentBrains)
        for (const brain of nextBrains.brains || []) {
          replaceModelIdInPolicy(brain?.planner, previousId, nextId)
          for (const policy of Object.values(brain?.roles || {})) {
            replaceModelIdInPolicy(policy, previousId, nextId)
          }
        }
        return nextBrains
      }

      function replaceModelIdInPolicy(policy, previousId, nextId) {
        if (!policy || typeof policy !== "object") return
        if (policy.modelId === previousId) policy.modelId = nextId
        if (Array.isArray(policy.fallbackModelIds)) {
          policy.fallbackModelIds = policy.fallbackModelIds.map((modelId) => modelId === previousId ? nextId : modelId)
        }
      }

      function showResultError(resultElement, error) {
        const message = t("failed") + ": " + String(error?.message || error)
        resultElement.hidden = false
        resultElement.className = "test-result fail"
        resultElement.textContent = message
        status.textContent = message
      }

      function numberFormatter() {
        return new Intl.NumberFormat(currentLang === "zh" ? "zh-CN" : "en-US")
      }

      function formatCompactTokens(value) {
        const number = Number(value) || 0
        if (number >= 1000000) return trimZero((number / 1000000).toFixed(1)) + "m"
        if (number >= 1000) return trimZero((number / 1000).toFixed(1)) + "k"
        return numberFormatter().format(Math.round(number))
      }

      function trimZero(value) {
        return value.endsWith(".0") ? value.slice(0, -2) : value
      }

      function formatUsageBreakdown(usage) {
        const parts = [t("usageTokens") + " " + formatCompactTokens(usage?.total)]
        if ((usage?.input || 0) > 0) parts.push(t("usageInput") + " " + formatCompactTokens(usage.input))
        if ((usage?.output || 0) > 0) parts.push(t("usageOutput") + " " + formatCompactTokens(usage.output))
        const cache = (usage?.cacheRead || 0) + (usage?.cacheWrite || 0)
        if (cache > 0) parts.push(t("usageCache") + " " + formatCompactTokens(cache))
        return parts.join(" · ")
      }

      function usageBucketForModel(modelId) {
        return (currentUsageStats.byModel || []).find((bucket) => bucket.id === modelId)
      }

      function modelUsageLabel(modelId) {
        const bucket = usageBucketForModel(modelId)
        if (!bucket) return t("usageNoData")
        return formatUsageBreakdown(bucket) + " · " + t("usageCalls") + " " + numberFormatter().format(bucket.calls || 0)
      }

      function selectUsageFilter(type, id, label) {
        currentUsageFilter = type && id ? { type, id, label: label || id } : null
        renderUsageStats()
        setActiveTab("usage")
      }

      function createMetric(label, value) {
        const metric = document.createElement("div")
        metric.className = "metric"
        const labelElement = document.createElement("div")
        labelElement.className = "metric-label"
        labelElement.textContent = label
        const valueElement = document.createElement("div")
        valueElement.className = "metric-value"
        valueElement.textContent = value
        metric.append(labelElement, valueElement)
        return metric
      }

      function renderUsageStats() {
        const totals = currentUsageStats.totals || { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
        usageSummary.replaceChildren(
          createMetric(t("usageTokens"), formatCompactTokens(totals.total)),
          createMetric(t("usageCalls"), numberFormatter().format(totals.calls || 0)),
          createMetric(t("usageInput"), formatCompactTokens(totals.input)),
          createMetric(t("usageOutput"), formatCompactTokens(totals.output)),
          createMetric(t("usageSessions"), numberFormatter().format(currentUsageStats.sessions || 0)),
        )
        renderUsageBucketList(usageModels, currentUsageStats.byModel || [], "model")
        renderUsageBucketList(usageRoles, currentUsageStats.byRole || [], "role")
        renderUsageBucketList(usagePhases, currentUsageStats.byPhase || [], "phase")
        renderUsageDetails()
        renderUsageCharts()
      }

      function chartData(buckets, limit = 8) {
        return (buckets || []).slice(0, limit).map((bucket) => ({
          name: String(bucket.label || bucket.id || "unknown"),
          tokens: Number(bucket.total) || 0,
          input: Number(bucket.input) || 0,
          output: Number(bucket.output) || 0,
          calls: Number(bucket.calls) || 0,
        }))
      }

      function loadChartsRuntime() {
        if (!chartRuntimePromise) {
          chartRuntimePromise = Promise.all([
            import("https://esm.sh/react@18.3.1"),
            import("https://esm.sh/react-dom@18.3.1/client"),
            import("https://esm.sh/recharts@2.15.0?deps=react@18.3.1,react-dom@18.3.1"),
          ]).then(([React, ReactDOM, Recharts]) => ({ React, ReactDOM, Recharts }))
        }
        return chartRuntimePromise
      }

      async function renderUsageCharts() {
        const containers = [usageChartModels, usageChartRoles, usageChartPhases].filter(Boolean)
        if (activeTab !== "usage" || containers.length === 0) return
        const modelData = chartData(currentUsageStats.byModel, 8)
        const roleData = chartData(currentUsageStats.byRole, 8)
        const phaseData = chartData(currentUsageStats.byPhase, 8)
        if (!modelData.length && !roleData.length && !phaseData.length) {
          renderChartEmpty(usageChartModels)
          renderChartEmpty(usageChartRoles)
          renderChartEmpty(usageChartPhases)
          return
        }
        try {
          const runtime = await loadChartsRuntime()
          renderRechartsBar(runtime, usageChartModels, modelData)
          renderRechartsBar(runtime, usageChartRoles, roleData)
          renderRechartsPie(runtime, usageChartPhases, phaseData)
        } catch {
          renderFallbackBars(usageChartModels, modelData)
          renderFallbackBars(usageChartRoles, roleData)
          renderFallbackBars(usageChartPhases, phaseData)
        }
      }

      function renderChartEmpty(container) {
        if (!container) return
        disposeChartRoot(container)
        container.innerHTML = '<div class="chart-empty">' + t("usageNoData") + '</div>'
      }

      function disposeChartRoot(container) {
        const root = chartRoots.get(container)
        if (!root) return
        try { root.unmount() } catch {}
        chartRoots.delete(container)
      }

      function chartRoot(runtime, container) {
        let root = chartRoots.get(container)
        if (!root) {
          container.replaceChildren()
          root = runtime.ReactDOM.createRoot(container)
          chartRoots.set(container, root)
        }
        return root
      }

      function renderRechartsBar(runtime, container, data) {
        if (!container) return
        if (!data.length) { renderChartEmpty(container); return }
        const { React, Recharts } = runtime
        const e = React.createElement
        const axisStyle = { fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)" }
        chartRoot(runtime, container).render(
          e(Recharts.ResponsiveContainer, { width: "100%", height: "100%" },
            e(Recharts.BarChart, { data, margin: { top: 8, right: 8, bottom: 28, left: 0 } },
              e(Recharts.CartesianGrid, { stroke: "var(--border)", vertical: false }),
              e(Recharts.XAxis, { dataKey: "name", tick: axisStyle, tickLine: false, interval: 0, angle: -18, textAnchor: "end", height: 42 }),
              e(Recharts.YAxis, { tickFormatter: formatCompactTokens, tick: axisStyle, tickLine: false, width: 44 }),
              e(Recharts.Tooltip, { formatter: (value, name) => [formatCompactTokens(value), name], contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg)", borderRadius: "4px" } }),
              e(Recharts.Bar, { dataKey: "input", stackId: "tokens", fill: "var(--accent)", name: t("usageInput") }),
              e(Recharts.Bar, { dataKey: "output", stackId: "tokens", fill: "color-mix(in srgb, var(--accent) 52%, var(--fg))", name: t("usageOutput") }),
            ),
          ),
        )
      }

      function renderRechartsPie(runtime, container, data) {
        if (!container) return
        if (!data.length) { renderChartEmpty(container); return }
        const { React, Recharts } = runtime
        const e = React.createElement
        const colors = ["#458588", "#b16286", "#98971a", "#d79921", "#689d6a", "#cc241d", "#7c6f64", "#076678"]
        chartRoot(runtime, container).render(
          e(Recharts.ResponsiveContainer, { width: "100%", height: "100%" },
            e(Recharts.PieChart, null,
              e(Recharts.Pie, { data, dataKey: "tokens", nameKey: "name", innerRadius: 48, outerRadius: 78, paddingAngle: 2 },
                ...data.map((entry, index) => e(Recharts.Cell, { key: entry.name, fill: colors[index % colors.length] })),
              ),
              e(Recharts.Tooltip, { formatter: (value) => formatCompactTokens(value), contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg)", borderRadius: "4px" } }),
              e(Recharts.Legend, { verticalAlign: "bottom", height: 32, wrapperStyle: { color: "var(--muted)", fontSize: "11px", fontFamily: "var(--font-mono)" } }),
            ),
          ),
        )
      }

      function renderFallbackBars(container, data) {
        if (!container) return
        if (!data.length) { renderChartEmpty(container); return }
        disposeChartRoot(container)
        const max = Math.max(...data.map((entry) => entry.tokens), 1)
        const rows = data.slice(0, 6).map((entry) => {
          const label = entry.name.length > 18 ? entry.name.slice(0, 17) + "…" : entry.name
          const width = Math.max(2, Math.round((entry.tokens / max) * 100))
          return '<div class="fallback-bar-row"><span>' + escapeHtml(label) + '</span><span class="fallback-bar-track"><span class="fallback-bar-fill" style="width:' + width + '%"></span></span><span>' + formatCompactTokens(entry.tokens) + '</span></div>'
        }).join("")
        container.innerHTML = '<div class="fallback-bars">' + rows + '</div>'
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]))
      }

      function renderUsageBucketList(container, buckets, type) {
        if (!buckets.length) {
          container.innerHTML = '<div class="item">' + t("usageNoData") + '</div>'
          return
        }
        container.replaceChildren(...buckets.map((bucket) => {
          const row = document.createElement("button")
          row.type = "button"
          row.className = "stats-row"
          const main = document.createElement("div")
          main.className = "stats-row-main"
          main.textContent = bucket.label || bucket.id
          const meta = document.createElement("div")
          meta.className = "stats-row-meta"
          meta.textContent = formatCompactTokens(bucket.total) + " · " + numberFormatter().format(bucket.calls || 0)
          row.append(main, meta)
          row.addEventListener("click", () => selectUsageFilter(type, bucket.id, bucket.label || bucket.id))
          return row
        }))
      }

      function filteredUsageDetails() {
        const details = currentUsageStats.recent || []
        if (!currentUsageFilter) return details
        return details.filter((detail) => {
          if (currentUsageFilter.type === "model") return detail.modelId === currentUsageFilter.id
          if (currentUsageFilter.type === "role") return detail.role === currentUsageFilter.id
          if (currentUsageFilter.type === "phase") return detail.phase === currentUsageFilter.id
          return true
        })
      }

      function renderUsageDetails() {
        const details = filteredUsageDetails()
        const filterTitle = currentUsageFilter
          ? (currentUsageFilter.type === "model" ? t("usageForModel") : currentUsageFilter.type === "role" ? t("usageForRole") : t("usageForPhase")) + ": " + currentUsageFilter.label
          : t("usageRecent")
        usageDetailTitle.textContent = filterTitle
        usageFilterNote.textContent = currentUsageFilter ? filterTitle + "\\n" + t("usageClickHint") : t("usageClickHint")
        if (!details.length) {
          usageDetails.innerHTML = '<div class="detail-item">' + t("usageNoData") + '</div>'
          return
        }
        usageDetails.replaceChildren(...details.slice(0, 80).map((detail) => {
          const item = document.createElement("div")
          item.className = "detail-item"
          const time = detail.timestamp ? new Date(detail.timestamp).toLocaleString(currentLang === "zh" ? "zh-CN" : "en-US") : "-"
          const prompt = detail.prompt ? "\\n" + t("usageDetails") + ": " + detail.prompt.slice(0, 180) : ""
          item.textContent = [
            time + " · " + (detail.role || "unknown") + " · " + (detail.phase || "unknown"),
            (detail.modelId || "unknown") + " · " + formatUsageBreakdown(detail.usage),
            "session " + String(detail.sessionId || "").slice(0, 8) + (detail.agentSessionId ? " · agent " + detail.agentSessionId : ""),
          ].join("\\n") + prompt
          return item
        }))
      }

      function createModelEditForm(model, index) {
        const prefix = "edit-model-" + index + "-"
        const form = document.createElement("form")
        form.className = "model-edit-form"
        const controls = {
          provider: makeTextInput(model.provider, true),
          modelId: makeTextInput(model.modelId, true),
          name: makeTextInput(model.name || model.modelId),
          baseUrl: makeTextInput(model.baseUrl || ""),
          apiKey: makeTextInput(""),
          api: makeSelectInput(apiTypes, model.api || "openai"),
          contextWindow: makeNumberInput(model.contextWindow),
          thinking: makeSelectInput(thinkingLevels, model.defaultThinkingLevel || "medium"),
        }
        controls.apiKey.type = "password"
        controls.apiKey.placeholder = "Optional token saved for this provider"
        const vision = makeCheckboxField(prefix + "vision", model.supportsVision === true)
        controls.vision = vision.input
        const result = document.createElement("div")
        result.className = "test-result"
        result.hidden = true
        const testButton = document.createElement("button")
        testButton.type = "button"
        testButton.textContent = t("testConnection")
        const cancelButton = document.createElement("button")
        cancelButton.type = "button"
        cancelButton.textContent = t("cancel")
        const saveButton = document.createElement("button")
        saveButton.type = "submit"
        saveButton.className = "primary"
        saveButton.textContent = t("save")
        const actions = document.createElement("div")
        actions.className = "model-edit-actions"
        actions.append(testButton, cancelButton, saveButton)
        form.append(
          makeField(prefix + "provider", "provider", controls.provider),
          makeField(prefix + "model-id", "modelId", controls.modelId),
          makeField(prefix + "name", "modelName", controls.name),
          makeField(prefix + "base-url", "baseUrl", controls.baseUrl),
          makeField(prefix + "api-key", "apiKey", controls.apiKey),
          makeField(prefix + "api", "apiType", controls.api),
          makeField(prefix + "context-window", "contextWindow", controls.contextWindow),
          makeField(prefix + "thinking", "thinkingLevel", controls.thinking),
          vision.field,
          actions,
          result,
        )
        enhanceSelect(controls.api)
        enhanceSelect(controls.thinking)
        syncModelApiControls(controls.api, controls.contextWindow, controls.thinking, controls.vision)
        controls.api.addEventListener("change", () => syncModelApiControls(controls.api, controls.contextWindow, controls.thinking, controls.vision))
        cancelButton.addEventListener("click", () => { editingModelId = null; renderConfiguredModels() })
        testButton.addEventListener("click", () => testEditedModel(model, controls, testButton, result).catch((error) => showResultError(result, error)))
        form.addEventListener("submit", (event) => {
          event.preventDefault()
          saveEditedModel(model.id, editedModelFromControls(model, controls), controls.apiKey.value.trim(), result).catch((error) => showResultError(result, error))
        })
        return form
      }

      async function testEditedModel(previousModel, controls, button, resultElement) {
        const model = editedModelFromControls(previousModel, controls)
        if (!model.provider || !model.modelId) return
        const previous = button.textContent
        button.disabled = true
        button.textContent = t("testing") + "..."
        resultElement.hidden = false
        resultElement.className = "test-result"
        resultElement.textContent = t("testing") + " " + model.id + "..."
        status.textContent = t("testing") + " " + model.id
        try {
          const result = await postJson("/api/models/test-config", { model, apiKey: controls.apiKey.value.trim(), thinkingLevel: controls.thinking.value })
          renderConnectionTestResult(result, resultElement)
        } finally {
          button.disabled = false
          button.textContent = previous
        }
      }

      async function saveEditedModel(previousId, model, apiKey, resultElement) {
        if (!model.provider || !model.modelId) return
        const duplicatesAnotherModel = previousId !== model.id && currentModels.models.some((candidate) => candidate.id === model.id)
        if (duplicatesAnotherModel) throw new Error(t("duplicateModel"))
        status.textContent = t("saving") + " models..."
        const saveKey = apiKey ? postJson("/api/provider-api-key", { provider: model.provider, apiKey }) : Promise.resolve(null)
        const auth = await saveKey
        if (auth) setAuthStatusData(auth)
        const nextModels = currentModels.models.map((candidate) => candidate.id === previousId ? model : candidate)
        currentModels = await putJson("/api/models", { ...currentModels, models: nextModels })
        if (previousId !== model.id) {
          currentBrains = await putJson("/api/brains", replaceModelIdInBrains(previousId, model.id))
        }
        editingModelId = null
        renderSavedProviders()
        renderConfiguredModels()
        renderBrainRouting()
        resultElement.hidden = true
        status.textContent = t("saved") + " models"
      }

      function renderConfiguredModels() {
        const models = currentModels.models || []
        if (models.length === 0) { configuredModels.innerHTML = '<div class="item">' + t("none") + '</div>'; return }
        configuredModels.replaceChildren(...models.map((model, index) => {
          const item = document.createElement("div")
          item.className = "item"
          const header = document.createElement("div")
          header.className = "item-header model-item-header"
          const text = document.createElement("div")
          text.className = "model-summary"
          const visionTag = model.supportsVision === true ? " · " + t("visionBadge") : ""
          const imageTag = isImageGenerationModelConfig(model) ? " · " + t("imageBadge") : ""
          const summaryText = document.createElement("div")
          summaryText.textContent = model.name + visionTag + imageTag + "\\n" + model.id + "\\n" + model.provider
          const usageChip = document.createElement("span")
          usageChip.className = "usage-chip"
          usageChip.textContent = modelUsageLabel(model.id)
          text.append(summaryText, usageChip)
          const button = document.createElement("button")
          button.type = "button"
          button.className = "danger"
          button.textContent = t("remove")
          button.addEventListener("click", () => removeModel(model.id))
          const usageButton = document.createElement("button")
          usageButton.type = "button"
          usageButton.textContent = t("usageDetails")
          usageButton.addEventListener("click", () => selectUsageFilter("model", model.id, model.name || model.id))
          const editButton = document.createElement("button")
          editButton.type = "button"
          editButton.textContent = t("edit")
          editButton.addEventListener("click", () => { editingModelId = model.id; renderConfiguredModels() })
          const testButton = document.createElement("button")
          testButton.type = "button"
          testButton.textContent = t("testConnection")
          const result = document.createElement("div")
          result.className = "test-result"
          result.hidden = true
          testButton.addEventListener("click", () => testModel(model.id, testButton, result))
          const actions = document.createElement("div")
          actions.className = "item-actions model-actions"
          actions.append(usageButton, editButton, testButton, button)
          header.append(text, actions)
          item.append(header, result)
          if (editingModelId === model.id) item.append(createModelEditForm(model, index))
          return item
        }))
      }

      function legacyImageModelFromPolicy(policy) {
        if (!policy?.imageModel?.provider || !policy?.imageModel?.modelId) return null
        const provider = policy.imageModel.provider
        const modelId = policy.imageModel.modelId
        return {
          id: provider + "/" + modelId,
          provider,
          modelId,
          name: policy.imageModel.name || modelId,
          api: "openai-images",
          baseUrl: policy.imageModel.baseUrl || "https://api.openai.com/v1",
          contextWindow: 32000,
          supportsTools: false,
          supportsVision: false,
          supportsImageGeneration: true,
          defaultThinkingLevel: "off",
        }
      }

      function imageModelsForPolicy(policy) {
        const models = imageModels()
        const legacy = legacyImageModelFromPolicy(policy)
        if (legacy && !models.some((model) => model.id === legacy.id)) return [legacy, ...models]
        return models
      }

      function appendImageMakerRoutingCard(policy) {
        const models = imageModelsForPolicy(policy)
        const selectedModelId = models.some((model) => model.id === policy?.modelId) ? policy.modelId : (legacyImageModelFromPolicy(policy)?.id || models[0]?.id || "")
        const card = document.createElement("div")
        card.className = "role-card"
        const note = document.createElement("div")
        note.className = "role-note"
        note.textContent = roleDescription("imageMaker")
        const row = document.createElement("div")
        row.className = "role-row"
        const label = document.createElement("label")
        label.textContent = roleLabel("imageMaker")
        const select = document.createElement("select")
        select.dataset.role = "imageMaker"
        select.dataset.imageRole = "true"
        select.replaceChildren(...models.map((model) => option(model.id, modelOptionLabel(model))))
        select.value = selectedModelId
        const fallbackLabel = document.createElement("label")
        fallbackLabel.textContent = t("fallbackModel")
        const fallback = document.createElement("select")
        fallback.dataset.roleFallback = "imageMaker"
        fallback.dataset.imageRoleFallback = "true"
        fallback.replaceChildren(option("", t("none")), ...models.map((model) => option(model.id, modelOptionLabel(model))))
        fallback.value = policy?.fallbackModelIds?.[0] || ""
        const thinkingLabel = document.createElement("label")
        thinkingLabel.textContent = t("thinking")
        const thinking = document.createElement("select")
        thinking.dataset.roleThinking = "imageMaker"
        thinking.replaceChildren(option("off", "off"))
        thinking.value = "off"
        thinking.disabled = true
        row.append(label, select, fallbackLabel, fallback, thinkingLabel, thinking)
        const result = document.createElement("div")
        result.className = "test-result"
        result.hidden = true
        const testButton = document.createElement("button")
        testButton.type = "button"
        testButton.textContent = t("testConnection")
        testButton.disabled = models.length === 0
        testButton.addEventListener("click", async (event) => {
          event.preventDefault()
          const model = models.find((candidate) => candidate.id === select.value)
          if (!model) return testRoleModel("imageMaker", select, thinking, testButton, result)
          if (currentModels.models.some((candidate) => candidate.id === model.id)) {
            return testRoleModel("imageMaker", select, thinking, testButton, result)
          }
          const previous = testButton.textContent
          testButton.disabled = true
          testButton.textContent = t("testing") + "..."
          result.hidden = false
          result.className = "test-result"
          result.textContent = t("testing") + " " + model.id + "..."
          status.textContent = t("testing") + " imageMaker / " + model.id
          try {
            const testResult = await postJson("/api/models/test-config", { model, thinkingLevel: "off" })
            renderConnectionTestResult(testResult, result)
          } catch (error) {
            showResultError(result, error)
          } finally {
            testButton.disabled = false
            testButton.textContent = previous
          }
        })
        const actions = document.createElement("div")
        actions.className = "role-actions"
        actions.append(testButton)
        if (models.length === 0) {
          result.hidden = false
          result.className = "test-result fail"
          result.textContent = t("noImageModels")
        }
        card.append(row, note, actions, result)
        roleModels.append(card)
        enhanceSelect(select)
        enhanceSelect(fallback)
        enhanceSelect(thinking)
      }

      function renderBrainRouting() {
        brainSelect.replaceChildren(...currentBrains.brains.map((brain) => option(brain.id, brain.name ? brain.id + " — " + brain.name : brain.id)))
        const models = textModels()
        applyAllModel.replaceChildren(...models.map((model) => option(model.id, modelOptionLabel(model))))
        enhanceSelect(brainSelect)
        enhanceSelect(applyAllModel)
        if (!brainSelect.value && currentBrains.brains[0]) brainSelect.value = currentBrains.brains[0].id
        const brain = currentBrains.brains.find((candidate) => candidate.id === brainSelect.value)
        roleModels.replaceChildren()
        if (!brain) { roleModels.innerHTML = '<div class="item">' + t("none") + '</div>'; return }
        for (const role of roles) {
          const policy = role === "routeBrain" ? (brain.planner || brain.roles?.routeBrain) : brain.roles?.[role]
          if (role === "imageMaker") {
            appendImageMakerRoutingCard(policy)
            continue
          }
          const card = document.createElement("div")
          card.className = role === "pet" ? "role-card role-card--full" : "role-card"
          if (role === "pet") {
            const title = document.createElement("p")
            title.className = "role-card-title"
            title.textContent = t("petCardTitle")
            card.append(title)
          }
          const row = document.createElement("div")
          row.className = "role-row"
          const label = document.createElement("label")
          label.textContent = roleLabel(role) || role
          const select = document.createElement("select")
          select.dataset.role = role
          select.replaceChildren(...models.map((model) => option(model.id, modelOptionLabel(model))))
          select.value = policy?.modelId || brain.roles?.frontend?.modelId || models[0]?.id || ""
          const fallbackLabel = document.createElement("label")
          fallbackLabel.textContent = t("fallbackModel")
          const fallback = document.createElement("select")
          fallback.dataset.roleFallback = role
          fallback.replaceChildren(option("", t("none")), ...models.map((model) => option(model.id, modelOptionLabel(model))))
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
          const testButton = document.createElement("button")
          testButton.type = "button"
          testButton.textContent = t("testConnection")
          const testResult = document.createElement("div")
          testResult.className = "test-result"
          testResult.hidden = true
          const actions = document.createElement("div")
          actions.className = "role-actions"
          actions.append(testButton)
          testButton.addEventListener("click", (event) => { event.preventDefault(); testRoleModel(role, select, thinking, testButton, testResult) })
          card.append(row, note, actions, testResult)
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
          item.className = "item tool-item"
          const header = document.createElement("div")
          header.className = "item-header tool-item-header"
          const text = document.createElement("div")
          text.className = "tool-summary"
          text.textContent = tool.name + "\\n" + (tool.description || "") + "\\n" + (tool.permissions || []).join(", ") + " · " + (tool.risk || "low") + " · " + (tool.approvalPolicy === "confirm-dangerous" ? t("confirmDangerous") : t("allowedByDefault"))
          const toggle = document.createElement("button")
          toggle.type = "button"
          toggle.className = tool.enabled ? "primary" : ""
          toggle.textContent = tool.enabled ? t("enabled") : t("disabled")
          toggle.addEventListener("click", () => toggleTool(tool.name))
          const approval = document.createElement("button")
          approval.type = "button"
          approval.className = tool.approvalPolicy === "allow" ? "primary" : ""
          approval.textContent = tool.approvalPolicy === "allow" ? t("allowWithoutPrompt") : t("askForDangerous")
          approval.addEventListener("click", () => toggleToolApproval(tool.name))
          const actions = document.createElement("div")
          actions.className = "tool-actions"
          actions.append(approval, toggle)
          header.append(text, actions)
          item.append(header)
          configuredTools.append(item)
        }
      }

      async function toggleTool(toolName) {
        const nextTools = currentTools.tools.map((tool) => tool.name === toolName ? { ...tool, enabled: !tool.enabled } : tool)
        status.textContent = t("saving") + " tools..."
        currentTools = await putJson("/api/tools", { ...currentTools, tools: nextTools })
        renderTools()
        status.textContent = t("saved") + " tools"
      }

      async function toggleToolApproval(toolName) {
        const nextTools = currentTools.tools.map((tool) => tool.name === toolName ? { ...tool, approvalPolicy: tool.approvalPolicy === "allow" ? "confirm-dangerous" : "allow" } : tool)
        status.textContent = t("saving") + " tools..."
        currentTools = await putJson("/api/tools", { ...currentTools, tools: nextTools })
        renderTools()
        status.textContent = t("saved") + " tools"
      }

      function renderOAuthProviders() {
        const previous = oauthProviderSelect.value
        oauthProviderSelect.replaceChildren(...oauthProviders.map((provider) => option(provider.id, provider.name)))
        if (oauthProviders.some((provider) => provider.id === previous)) oauthProviderSelect.value = previous
        enhanceSelect(oauthProviderSelect)
        syncOAuthProviderControls()
      }

      function syncOAuthProviderControls() {
        const isGitHubCopilot = oauthProviderSelect.value === "github-copilot"
        oauthEnterpriseToggleField.hidden = !isGitHubCopilot
        if (!isGitHubCopilot) oauthUseEnterpriseInput.checked = false
        oauthEnterpriseDomainField.hidden = !isGitHubCopilot || !oauthUseEnterpriseInput.checked
        if (oauthEnterpriseDomainField.hidden) oauthEnterpriseDomainInput.value = ""
      }

      function renderOAuthLoginSession(session) {
        oauthLoginSession = session
        oauthLoginState.hidden = false
        oauthLoginState.className = "test-result" + (session.status === "completed" ? " ok" : session.status === "failed" ? " fail" : "")
        oauthLoginState.replaceChildren()
        const lines = [
          t("oauthState") + ": " + session.status,
          session.provider + " / " + session.oauthProviderId,
          ...(session.deviceCode ? ["Code: " + session.deviceCode.userCode, session.deviceCode.verificationUri] : []),
          ...(session.progress || []),
          ...(session.error ? [session.error] : []),
        ].filter(Boolean)
        const text = document.createElement("div")
        text.textContent = lines.join("\\n") || t("oauthPending")
        oauthLoginState.append(text)
        if (session.auth?.url) {
          const link = document.createElement("a")
          link.href = session.auth.url
          link.target = "_blank"
          link.rel = "noreferrer"
          link.textContent = t("openAuthPage")
          oauthLoginState.append(document.createElement("br"), link)
        }
        navigateOAuthPopup(session)
        if (session.status === "completed") { closeOAuthPopup(); status.textContent = t("oauthCompleted") }
        if (session.status === "failed" || session.status === "cancelled") { closeOAuthPopup(); status.textContent = t("oauthFailed") }
      }

      function prepareOAuthPopup() {
        try {
          oauthPopup = window.open("about:blank", "braincode-oauth")
          if (oauthPopup) {
            oauthPopup.opener = null
            oauthPopup.document.title = "Braincode OAuth"
            oauthPopup.document.body.textContent = t("oauthPending")
          }
        } catch {
          oauthPopup = null
        }
        oauthPopupTarget = ""
      }

      function navigateOAuthPopup(session) {
        const target = session.auth?.url || session.deviceCode?.verificationUri || ""
        if (!target || target === oauthPopupTarget) return
        oauthPopupTarget = target
        try {
          if (!oauthPopup || oauthPopup.closed) oauthPopup = window.open("about:blank", "braincode-oauth")
          if (oauthPopup) {
            oauthPopup.location.href = target
            oauthPopup.focus()
          }
        } catch {
          oauthPopup = null
        }
      }

      function closeOAuthPopup() {
        try {
          if (oauthPopup && !oauthPopup.closed) oauthPopup.close()
        } catch {}
        oauthPopup = null
        oauthPopupTarget = ""
      }

      function stopOAuthPolling() {
        if (oauthPollTimer) clearInterval(oauthPollTimer)
        oauthPollTimer = null
      }

      function pollOAuthLogin(sessionId) {
        stopOAuthPolling()
        oauthPollTimer = setInterval(async () => {
          try {
            const session = await getJson("/api/oauth/login/" + encodeURIComponent(sessionId))
            renderOAuthLoginSession(session)
            if (session.status === "completed" || session.status === "failed" || session.status === "cancelled") {
              stopOAuthPolling()
              setAuthStatusData(await getJson("/api/auth/status"))
            }
          } catch (error) {
            stopOAuthPolling()
            showError(error)
          }
        }, 1500)
      }

      async function startOAuthLogin() {
        status.textContent = t("loading")
        prepareOAuthPopup()
        try {
          const providerId = oauthProviderSelect.value
          const enterpriseDomain = oauthUseEnterpriseInput.checked ? oauthEnterpriseDomainInput.value.trim() : ""
          if (providerId === "github-copilot" && oauthUseEnterpriseInput.checked && !enterpriseDomain) {
            throw new Error(t("githubEnterpriseDomainRequired"))
          }
          const session = await postJson("/api/oauth/login", {
            oauthProviderId: providerId,
            provider: providerId,
            enterpriseDomain,
          })
          renderOAuthLoginSession(session)
          if (session.status === "pending" || session.status === "starting") {
            pollOAuthLogin(session.id)
            status.textContent = t("oauthPending")
          }
          if (session.status === "completed") {
            setAuthStatusData(await getJson("/api/auth/status"))
          }
        } catch (error) {
          closeOAuthPopup()
          throw error
        }
      }

      async function submitOAuthCode() {
        if (!oauthLoginSession?.id) return
        const code = oauthManualCodeInput.value.trim()
        if (!code) return
        const session = await postJson("/api/oauth/login/" + encodeURIComponent(oauthLoginSession.id) + "/manual-code", { code })
        oauthManualCodeInput.value = ""
        renderOAuthLoginSession(session)
        pollOAuthLogin(session.id)
      }

      async function cancelOAuthLogin() {
        if (!oauthLoginSession?.id) return
        const session = await postJson("/api/oauth/login/" + encodeURIComponent(oauthLoginSession.id) + "/cancel", {})
        renderOAuthLoginSession(session)
        stopOAuthPolling()
      }

      async function configureTavily() {
        const apiKey = tavilyApiKeyInput.value.trim()
        if (!apiKey && !hasProviderApiKey("tavily")) throw new Error(t("tavilyApiKeyRequired"))
        configureTavilyButton.disabled = true
        status.textContent = t("saving") + " Tavily..."
        try {
          const result = await postJson("/api/mcp/tavily", { apiKey })
          currentUserMcp = result.mcp || currentUserMcp
          tavilyApiKeyInput.value = ""
          setAuthStatusData(result.authStatus || await getJson("/api/auth/status"))
          renderTavilyConfig()
          status.textContent = t("saved") + " Tavily"
        } finally {
          configureTavilyButton.disabled = false
        }
      }

      async function loadAll() {
        status.textContent = t("loading")
        const [settingsData, brainsData, modelsData, toolsData, authStatusData, oauthProvidersData, usageStatsData, userMcpData] = await Promise.all([
          getJson("/api/settings"), getJson("/api/brains"), getJson("/api/models"), getJson("/api/tools"), getJson("/api/auth/status"), getJson("/api/oauth/providers"), getJson("/api/usage-stats"), getJson("/api/mcp/user")
        ])
        currentSettings = settingsData
        currentBrains = brainsData
        currentModels = modelsData
        currentTools = toolsData
        currentUsageStats = usageStatsData
        currentUserMcp = userMcpData.mcp || currentUserMcp
        oauthProviders = oauthProvidersData.providers || []
        setAuthStatusData(authStatusData)
        renderSettings(); renderSavedProviders(); renderCatalogProviders(); renderConfiguredModels(); renderUsageStats(); renderBrainRouting(); renderTools(); renderOAuthProviders()
        status.textContent = t("loaded")
        loadCatalog().catch(showCatalogError)
        loadSavedProviderModels().catch(showCatalogError)
        loadHealthCheck().catch(showError)
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
          const data = await postJson("/api/provider-models", { provider: entry.provider, baseUrl: entry.baseUrl, api: entry.api || "openai" })
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
        const api = apiChoice(manualApiInput.value)
        const data = await postJson("/api/provider-models", { provider, baseUrl, apiKey, api })
        currentModels = { ...currentModels, providers: data.providers }
        mergeCatalogProvider(provider, data.models)
        renderSavedProviders()
        renderCatalogProviders()
        providerSelect.value = provider
        providerSelect.dispatchEvent(new Event("change", { bubbles: true }))
        status.textContent = t("loaded")
      }

      async function removeModel(modelId) {
        currentModels = await putJson("/api/models", { ...currentModels, models: currentModels.models.filter((model) => model.id !== modelId) })
        renderConfiguredModels(); renderBrainRouting(); status.textContent = t("saved") + " models"
      }

      function healthRow(mainText, metaText, ok) {
        const row = document.createElement("div")
        row.className = "stats-row"
        const main = document.createElement("div")
        main.className = "stats-row-main"
        main.textContent = mainText
        const meta = document.createElement("div")
        meta.className = "stats-row-meta"
        meta.textContent = metaText
        if (ok === true) row.style.boxShadow = "inset 4px 0 0 var(--accent)"
        if (ok === false) row.style.boxShadow = "inset 4px 0 0 var(--danger-fg)"
        row.append(main, meta)
        return row
      }

      async function loadHealthCheck() {
        status.textContent = t("loading")
        const data = await getJson("/api/health-check")
        if (!data.providers.length) healthProviders.innerHTML = '<div class="item">' + t("none") + '</div>'
        else healthProviders.replaceChildren(...data.providers.map((entry) =>
          healthRow(entry.provider + " · " + entry.modelCount + " " + t("configuredModels"), entry.hasCredential ? t("keyPresent") + " (" + entry.kind + ")" : t("keyMissing"), entry.hasCredential)))
        if (!data.models.length) healthModels.innerHTML = '<div class="item">' + t("none") + '</div>'
        else healthModels.replaceChildren(...data.models.map((model) => {
          const caps = [model.supportsTools ? t("capTools") : null, model.supportsVision ? t("capVision") : null, model.supportsImageGeneration ? t("capImage") : null].filter(Boolean).join(" · ") || "-"
          return healthRow(model.name + " · " + model.id, caps + " · " + (model.hasCredential ? t("keyPresent") : t("keyMissing")), model.hasCredential)
        }))
        const pm = data.packageManager
        healthPackageManager.replaceChildren(healthRow(pm.name, pm.detected ? t("pmDetected") + ": " + pm.lockfile : t("pmNotDetected"), pm.detected))
        status.textContent = t("loaded")
      }

      async function runMcpHealth() {
        const previous = healthRunMcpButton.textContent
        healthRunMcpButton.disabled = true
        healthRunMcpButton.textContent = t("testing") + "..."
        healthMcp.innerHTML = '<div class="item">' + t("healthMcpRunning") + '</div>'
        try {
          const data = await postJson("/api/mcp/health", {})
          const rows = []
          for (const entry of data.connected) rows.push(healthRow(entry.scope + " / " + entry.name, t("mcpConnected") + " · " + entry.toolCount + " " + t("mcpToolCount"), true))
          for (const entry of data.failed) rows.push(healthRow(entry.scope + " / " + entry.name, t("mcpFailed") + ": " + entry.error, false))
          for (const entry of data.skipped) rows.push(healthRow(entry.scope + " / " + entry.name, t("mcpSkipped") + ": " + entry.reason, false))
          if (!rows.length) healthMcp.innerHTML = '<div class="item">' + t("mcpNone") + '</div>'
          else healthMcp.replaceChildren(...rows)
          status.textContent = t("loaded")
        } finally {
          healthRunMcpButton.disabled = false
          healthRunMcpButton.textContent = previous
        }
      }

      function permActionLabel(action) {
        return action === "allow" ? t("permActionAllow") : action === "ask" ? t("permActionAsk") : action === "deny" ? t("permActionDeny") : t("permActionNone")
      }

      async function evaluatePermissionPreview() {
        const toolName = permToolSelect.value
        const path = permPathInput.value.trim()
        const command = permCommandInput.value.trim()
        const previous = permEvaluateButton.textContent
        permEvaluateButton.disabled = true
        permEvaluateButton.textContent = t("testing") + "..."
        permResult.hidden = false
        permResult.className = "test-result"
        try {
          const result = await postJson("/api/permission-preview", { toolName, path, command })
          const ok = result.action === "allow" || result.action === "none"
          permResult.className = "test-result " + (result.action === "deny" ? "fail" : ok ? "ok" : "")
          const reviewLine = result.reviewRequired ? t("permReviewRequired") : t("permReviewNot")
          const reason = (result.matches && result.matches.length) ? result.reason : t("permNoMatch")
          permResult.textContent = [t("permAction") + ": " + permActionLabel(result.action) + " · " + reviewLine, reason].join("\\n")
          status.textContent = t("permAction") + ": " + permActionLabel(result.action)
        } finally {
          permEvaluateButton.disabled = false
          permEvaluateButton.textContent = previous
        }
      }

      function connectionFailureMessage(result) {
        const failureKeys = {
          "missing-api-key": "testFailure_missingApiKey",
          "unsupported-location": "testFailure_unsupportedLocation",
          "unsupported-client": "testFailure_unsupportedClient",
          "subscription-blocked": "testFailure_subscriptionBlocked",
          auth: "testFailure_auth",
          "rate-limit": "testFailure_rateLimit",
          "invalid-response": "testFailure_invalidResponse",
          network: "testFailure_network",
        }
        const failureKey = failureKeys[result?.failureKind]
        const translated = translations[currentLang][failureKey] || translations.en[failureKey]
        return translated || result?.message || t("failed")
      }

      function renderConnectionTestResult(result, resultElement) {
        const reachable = Boolean(result?.reachable)
        const detail = !reachable && result?.detail && result.detail !== result.message ? "\\n" + result.detail : ""
        const message = reachable ? t("testOk") + ": " + result.message : t("failed") + ": " + connectionFailureMessage(result) + detail
        resultElement.className = "test-result " + (reachable ? "ok" : "fail")
        resultElement.textContent = message
        status.textContent = message
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
          renderConnectionTestResult(result, resultElement)
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
          const result = await postJson("/api/models/test-config", { model, apiKey: manualApiKeyInput.value.trim(), thinkingLevel: manualThinkingInput.value })
          renderConnectionTestResult(result, manualTestResult)
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

      async function testRoleModel(role, modelSelect, thinkingSelect, button, resultElement) {
        const modelId = modelSelect.value
        const thinkingLevel = thinkingSelect.value
        if (!modelId) {
          resultElement.hidden = false
          resultElement.className = "test-result fail"
          resultElement.textContent = t("failed") + ": " + t("none")
          return
        }
        const previous = button.textContent
        button.disabled = true
        button.textContent = t("testing") + "..."
        resultElement.hidden = false
        resultElement.className = "test-result"
        resultElement.textContent = t("testing") + " " + modelId + " (" + thinkingLevel + ")..."
        status.textContent = t("testing") + " " + role + " / " + modelId + " (" + thinkingLevel + ")"
        try {
          const result = await postJson("/api/models/test", { modelId, thinkingLevel })
          renderConnectionTestResult(result, resultElement)
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

      refresh.addEventListener("click", () => loadAll().catch(showError))
      language.addEventListener("change", () => { currentLang = language.value; localStorage.setItem("braincode-config-lang", currentLang); applyLanguage(); syncModelSourceControls(); renderConfiguredModels(); renderUsageStats(); renderBrainRouting(); renderTools(); renderOAuthProviders(); renderSubscriptionProviders(); renderTavilyConfig(); if (oauthLoginSession) renderOAuthLoginSession(oauthLoginSession) })
      for (const button of tabButtons) {
        button.addEventListener("click", () => setActiveTab(button.dataset.tab))
      }
      usageShowAll.addEventListener("click", () => selectUsageFilter(null, null, null))
      savedProviderSelect.addEventListener("change", applySavedProvider)
      loadProviderModelsButton.addEventListener("click", () => loadProviderModels().catch(showError))
      useSubscriptionProviderButton.addEventListener("click", applySubscriptionProvider)
      testManualModelButton.addEventListener("click", () => testManualModel().catch(showError))
      oauthProviderSelect.addEventListener("change", syncOAuthProviderControls)
      oauthUseEnterpriseInput.addEventListener("change", syncOAuthProviderControls)
      startOAuthLoginButton.addEventListener("click", () => startOAuthLogin().catch(showError))
      submitOAuthCodeButton.addEventListener("click", () => submitOAuthCode().catch(showError))
      cancelOAuthLoginButton.addEventListener("click", () => cancelOAuthLogin().catch(showError))
      configureTavilyButton.addEventListener("click", () => configureTavily().catch(showError))
      healthRefreshButton.addEventListener("click", () => loadHealthCheck().catch(showError))
      healthRunMcpButton.addEventListener("click", () => runMcpHealth().catch(showError))
      permEvaluateButton.addEventListener("click", () => evaluatePermissionPreview().catch((error) => showResultError(permResult, error)))
      modelSourceInput.addEventListener("change", () => {
        syncModelSourceControls()
        renderCatalogModels()
      })
      modelKindInput.addEventListener("change", () => {
        if (modelKindInput.value === "image" && currentModelSource() === "catalog") modelSourceInput.value = "manual"
        if (modelKindInput.value === "image") manualApiInput.value = "openai-images"
        else if (normalizeApiType(manualApiInput.value) === "openai-images") manualApiInput.value = "openai"
        syncModelSourceControls()
        syncManualApiControls({ fillDefaults: true })
        renderCatalogModels()
      })
      manualApiInput.addEventListener("change", () => { syncManualApiControls({ fillDefaults: true }); renderCatalogModels() })
      manualModelIdInput.addEventListener("input", () => {
        if (/^(gpt-image|dall-e)/i.test(manualModelIdInput.value.trim()) && normalizeApiType(manualApiInput.value) !== "openai-images") {
          if (currentModelSource() === "catalog") modelSourceInput.value = "manual"
          manualApiInput.value = "openai-images"
          syncModelSourceControls()
          syncManualApiControls({ fillDefaults: true })
          renderCatalogModels()
        }
      })
      providerSelect.addEventListener("change", renderCatalogModels)
      catalogModelSelect.addEventListener("change", syncCatalogVision)
      manualProviderInput.addEventListener("input", syncCatalogApiKeyPlaceholder)
      catalogApiKeyInput.addEventListener("input", syncCatalogApiKeyPlaceholder)
      brainSelect.addEventListener("change", renderBrainRouting)
      applyAllRoles.addEventListener("click", () => {
        for (const select of roleModels.querySelectorAll("select[data-role]")) {
          if (select.dataset.role === "imageMaker") continue
          select.value = applyAllModel.value
          select.dispatchEvent(new Event("change", { bubbles: true }))
        }
      })

      settingsForm.addEventListener("submit", (event) => {
        event.preventDefault()
        const nextSettings = { ...currentSettings, configServer: { host: hostInput.value, port: Number(portInput.value) }, mode: modeInput.value }
        status.textContent = t("saving") + " settings..."
        putJson("/api/settings", nextSettings).then((savedSettings) => { currentSettings = savedSettings; renderSettings(); status.textContent = t("saved") + " settings" }).catch(showError)
      })

      modelForm.addEventListener("submit", (event) => {
        event.preventDefault()
        const model = modelFromUnifiedForm()
        if (!model) return
        status.textContent = t("saving") + " models..."
        const saveKey = catalogApiKeyInput.value.trim() ? postJson("/api/provider-api-key", { provider: model.provider, apiKey: catalogApiKeyInput.value.trim() }) : Promise.resolve(null)
        saveKey.then((auth) => {
          if (auth) setAuthStatusData(auth)
          return putJson("/api/models", { ...currentModels, models: mergeConfiguredModel(model) })
        }).then((savedModels) => { currentModels = savedModels; catalogApiKeyInput.value = ""; renderSavedProviders(); renderConfiguredModels(); renderBrainRouting(); status.textContent = t("saved") + " models" }).catch(showError)
      })

      brainForm.addEventListener("submit", (event) => {
        event.preventDefault()
        const brain = currentBrains.brains.find((candidate) => candidate.id === brainSelect.value)
        if (!brain) return
        const nextBrain = structuredClone(brain)
        nextBrain.roles = nextBrain.roles || {}
        for (const select of roleModels.querySelectorAll("select[data-role]")) {
          const role = select.dataset.role
          if (role === "imageMaker" && !select.value) continue
          const thinking = roleModels.querySelector('select[data-role-thinking="' + role + '"]')
          const fallback = roleModels.querySelector('select[data-role-fallback="' + role + '"]')
          const previous = nextBrain.roles[role] || { thinkingLevel: role === "routeBrain" || role === "oracle" ? "xhigh" : "medium" }
          const thinkingLevel = role === "imageMaker" ? "off" : thinking?.value || previous.thinkingLevel || "medium"
          const fallbackModelIds = fallback?.value ? [fallback.value] : []
          const { systemPrompt: _roleSystemPrompt, imageModel: _imageModel, ...previousWithoutPrompt } = previous
          nextBrain.roles[role] = { ...previousWithoutPrompt, modelId: select.value, fallbackModelIds, thinkingLevel }
          if (role === "routeBrain") {
            const { systemPrompt: _plannerSystemPrompt, ...plannerWithoutPrompt } = nextBrain.planner || previous
            nextBrain.planner = { ...plannerWithoutPrompt, modelId: select.value, fallbackModelIds, thinkingLevel }
          }
        }
        const nextBrains = currentBrains.brains.map((candidate) => candidate.id === nextBrain.id ? nextBrain : candidate)
        status.textContent = t("saving") + " brain..."
        const selectedImageModelId = nextBrain.roles?.imageMaker?.modelId
        const selectedImageModel = selectedImageModelId ? imageModelsForPolicy(brain.roles?.imageMaker).find((model) => model.id === selectedImageModelId) : undefined
        const saveLegacyImageModel = selectedImageModel && !currentModels.models.some((model) => model.id === selectedImageModel.id)
          ? putJson("/api/models", { ...currentModels, models: mergeConfiguredModel(selectedImageModel) })
          : Promise.resolve(currentModels)
        saveLegacyImageModel.then((savedModels) => {
          currentModels = savedModels
          return putJson("/api/brains", { brains: nextBrains })
        }).then((savedBrains) => { currentBrains = savedBrains; renderSavedProviders(); renderConfiguredModels(); renderBrainRouting(); status.textContent = t("saved") + " brain" }).catch(showError)
      })

      function showCatalogError(error) { status.textContent = t("catalogFailed"); authStatus.textContent = String(error) }
      function showError(error) { status.textContent = t("failed"); authStatus.textContent = String(error) }
      applyLanguage(); enhanceSelects(); setActiveTab(activeTab, { scroll: false }); loadAll().catch(showError)
    </script>
  </body>
</html>`
