export const configWebHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Braincode Config</title>
    <style>
      :root {
        color-scheme: light;
        --paper: #e8ddc7;
        --paper-dark: #d6c7aa;
        --ink: #101010;
        --red: #9f241f;
        --red-dark: #6f1714;
        --muted: #564b3b;
        --line: 5px;
        font-family: "Arial Narrow", "Roboto Condensed", "Source Han Sans SC", "Noto Sans CJK SC", Arial, sans-serif;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        background:
          radial-gradient(circle at 84% 12%, rgba(159, 36, 31, 0.25) 0 12%, transparent 13% 100%),
          repeating-linear-gradient(112deg, transparent 0 16px, rgba(16, 16, 16, 0.055) 17px 19px),
          linear-gradient(180deg, var(--paper), var(--paper-dark));
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.28;
        mix-blend-mode: multiply;
        background:
          repeating-radial-gradient(circle at 18% 22%, transparent 0 6px, rgba(16, 16, 16, 0.08) 7px 8px),
          repeating-linear-gradient(0deg, rgba(16, 16, 16, 0.035) 0 1px, transparent 1px 5px);
      }
      .page {
        width: min(1180px, calc(100% - 28px));
        margin: 18px auto 42px;
        border: var(--line) solid var(--ink);
        background: rgba(232, 221, 199, 0.92);
        box-shadow: 12px 12px 0 var(--ink);
      }
      header {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.95fr);
        gap: 22px;
        padding: 28px;
        border-bottom: var(--line) solid var(--ink);
        overflow: hidden;
      }
      header::after {
        content: "";
        position: absolute;
        right: -70px;
        top: -100px;
        width: 430px;
        height: 430px;
        background:
          repeating-conic-gradient(from 8deg, var(--red) 0 8deg, transparent 8deg 16deg),
          radial-gradient(circle, transparent 0 34%, var(--ink) 35% 37%, transparent 38% 100%);
        opacity: 0.9;
        z-index: 0;
      }
      header > * { position: relative; z-index: 1; }
      .kicker {
        display: inline-block;
        padding: 6px 10px;
        background: var(--red);
        color: var(--paper);
        border: 3px solid var(--ink);
        font: 900 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        transform: rotate(-1deg);
      }
      h1 {
        margin: 18px 0 10px;
        font-size: clamp(52px, 9vw, 128px);
        line-height: 0.82;
        letter-spacing: -0.08em;
        text-transform: uppercase;
        font-weight: 1000;
      }
      h2, h3 { margin: 0 0 14px; text-transform: uppercase; letter-spacing: -0.035em; }
      h2 { display: inline-block; padding: 4px 10px; color: var(--paper); background: var(--ink); font-size: 24px; }
      h3 { font-size: 18px; }
      p { margin: 0 0 14px; }
      main { padding: 26px; }
      section {
        margin: 0 0 26px;
        padding: 18px;
        border: var(--line) solid var(--ink);
        background: rgba(232, 221, 199, 0.82);
        box-shadow: 7px 7px 0 rgba(16, 16, 16, 0.85);
      }
      label { display: block; margin: 13px 0 6px; font-weight: 1000; text-transform: uppercase; }
      input, select, textarea {
        width: 100%;
        max-width: 520px;
        padding: 11px 12px;
        border: 4px solid var(--ink);
        border-radius: 0;
        background: #f3ead8;
        color: var(--ink);
        box-shadow: 4px 4px 0 var(--ink);
        font: 800 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      pre { border: 4px solid var(--ink); padding: 14px; overflow: auto; background: #f3ead8; box-shadow: inset 5px 0 0 var(--red); }
      button {
        border: 4px solid var(--ink);
        border-radius: 0;
        padding: 10px 15px;
        cursor: pointer;
        color: var(--ink);
        background: var(--paper);
        box-shadow: 5px 5px 0 var(--ink);
        font-weight: 1000;
        text-transform: uppercase;
      }
      button.primary { color: var(--paper); background: var(--red); }
      button.danger { color: var(--paper); background: var(--ink); }
      button:active { transform: translate(3px, 3px); box-shadow: 2px 2px 0 var(--ink); }
      .poster-copy { max-width: 680px; font-size: 18px; font-weight: 800; }
      .language-bar { display: flex; gap: 10px; align-items: center; justify-content: flex-end; margin-bottom: 18px; font: 900 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .hero-card {
        min-height: 260px;
        border: var(--line) solid var(--ink);
        background:
          linear-gradient(135deg, transparent 0 42%, var(--red) 43% 55%, transparent 56%),
          repeating-linear-gradient(90deg, rgba(16, 16, 16, 0.12) 0 4px, transparent 4px 14px),
          var(--paper-dark);
        padding: 18px;
        display: grid;
        align-content: end;
        box-shadow: 8px 8px 0 var(--red-dark);
      }
      .head { width: 190px; height: 210px; border: 8px solid var(--ink); border-radius: 48% 42% 44% 50%; background: radial-gradient(circle at 58% 31%, var(--red) 0 12px, transparent 13px), linear-gradient(125deg, transparent 0 47%, var(--ink) 48% 51%, transparent 52%), var(--paper); margin-left: auto; position: relative; }
      .head::before, .head::after { content: ""; position: absolute; background: var(--ink); }
      .head::before { width: 132px; height: 7px; top: 78px; left: -44px; transform: rotate(-18deg); }
      .head::after { width: 9px; height: 142px; top: 22px; right: 46px; transform: rotate(28deg); }
      .row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
      .muted { color: var(--muted); font-weight: 800; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }
      .list { display: grid; gap: 10px; }
      .item { border: 4px solid var(--ink); background: #f3ead8; padding: 10px; box-shadow: 4px 4px 0 var(--ink); font: 800 13px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .item-header { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
      .item-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
      .test-result { margin-top: 10px; padding: 8px 10px; border: 3px solid var(--ink); background: rgba(232, 221, 199, 0.8); }
      .test-result.ok { color: #103b16; box-shadow: inset 5px 0 0 #287a32; }
      .test-result.fail { color: var(--red-dark); box-shadow: inset 5px 0 0 var(--red); }
      .role-row { display: grid; grid-template-columns: 145px minmax(0, 1fr) 110px minmax(160px, 0.4fr); gap: 12px; align-items: end; margin-bottom: 12px; }
      .role-card { display: grid; gap: 10px; margin-bottom: 14px; padding: 12px; border: 4px solid var(--ink); background: rgba(243, 234, 216, 0.65); box-shadow: 4px 4px 0 var(--ink); }
      .role-note { max-width: 900px; font: 900 13px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); }
      select.enhanced-select { display: none; }
      .combo { position: relative; width: 100%; max-width: 520px; }
      .combo-input { width: 100%; max-width: 520px; }
      .combo-list { display: none; position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 8px); max-height: 280px; overflow: auto; border: 4px solid var(--ink); background: #f3ead8; box-shadow: 6px 6px 0 var(--ink); }
      .combo.open .combo-list { display: block; }
      .combo-option { padding: 10px 12px; border-bottom: 3px solid var(--ink); cursor: pointer; font: 900 13px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .combo-option:last-child { border-bottom: 0; }
      .combo-option:hover, .combo-option.active { color: var(--paper); background: var(--red); }
      .combo-empty { padding: 10px 12px; font: 900 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted); }
      .signal-strip { margin-top: 22px; min-height: 52px; border: 4px solid var(--ink); background: linear-gradient(90deg, var(--ink) 0 12%, transparent 12% 16%, var(--red) 16% 26%, transparent 26% 31%, var(--ink) 31% 34%, transparent 34%), repeating-linear-gradient(90deg, transparent 0 22px, rgba(16, 16, 16, 0.35) 22px 26px); }
      @media (max-width: 760px) { header { grid-template-columns: 1fr; } header::after { opacity: 0.35; } .language-bar { justify-content: flex-start; } .role-row { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <div>
          <span class="kicker" data-i18n="kicker">LOCAL AI CONTROL PANEL</span>
          <h1 data-i18n="title">BRAIN<br />CODE</h1>
          <p class="poster-copy" data-i18n="subtitle">Brutalist configuration surface for brains, agents, models, tools, and local runtime policy.</p>
          <div class="signal-strip" aria-hidden="true"></div>
        </div>
        <div>
          <div class="language-bar">
            <span data-i18n="language">LANG</span>
            <select id="language"><option value="en">EN</option><option value="zh">中文</option></select>
          </div>
          <div class="hero-card" aria-hidden="true"><div class="head"></div></div>
        </div>
      </header>

      <main>
        <section>
          <div class="row"><button id="refresh" data-i18n="refresh">Refresh</button><span id="status" class="muted">Loading...</span></div>
        </section>

        <section>
          <h2 data-i18n="settingsTitle">Settings</h2>
          <form id="settings-form">
            <div class="grid">
              <div><label for="host" data-i18n="host">Config server host</label><input id="host" autocomplete="off" /></div>
              <div><label for="port" data-i18n="port">Config server port</label><input id="port" type="number" min="1" max="65535" /></div>
              <div><label for="defaultBrainId" data-i18n="defaultBrain">Default brain id</label><select id="defaultBrainId"></select></div>
              <div><label for="mode" data-i18n="mode">Mode</label><select id="mode"><option value="auto" data-i18n="modeAuto">auto — plan and route agents automatically</option><option value="radical" data-i18n="modeRadical">radical — more aggressive autonomous execution</option></select></div>
            </div>
            <p class="muted" data-i18n="restartHint">Changing host or port affects the next config server start.</p>
            <button class="primary" type="submit" data-i18n="saveSettings">Save settings</button>
          </form>
        </section>

        <section>
          <h2 data-i18n="modelsTitle">Model selection</h2>
          <p class="muted" data-i18n="modelsHint">Choose models from the provider catalog. The UI stores selected models in ~/.braincode/models.json.</p>
          <div class="grid">
            <form id="model-form">
              <h3 data-i18n="addModel">Add model</h3>
              <label for="saved-provider-select" data-i18n="savedProviders">Saved providers</label><select id="saved-provider-select"></select>
              <label for="custom-provider" data-i18n="provider">Provider</label><input id="custom-provider" autocomplete="off" placeholder="openai" />
              <label for="custom-base-url" data-i18n="baseUrl">Base URL</label><input id="custom-base-url" autocomplete="off" placeholder="https://api.openai.com/v1" />
              <label for="custom-api-key" data-i18n="apiKey">API key</label><input id="custom-api-key" type="password" autocomplete="off" placeholder="sk-..." />
              <button id="load-provider-models" type="button" data-i18n="loadProviderModels">Load /v1/models</button>
              <label for="provider-select" data-i18n="providerCatalog">Provider catalog</label><select id="provider-select"></select>
              <label for="catalog-model-select" data-i18n="catalogModel">Model</label><select id="catalog-model-select"></select>
              <button class="primary" type="submit" data-i18n="addSelectedModel">Add selected model</button>
            </form>
            <div><h3 data-i18n="configuredModels">Configured models</h3><div id="configured-models" class="list"></div></div>
          </div>
        </section>

        <section>
          <h2 data-i18n="brainRoutingTitle">Brain routing</h2>
          <p class="muted" data-i18n="brainRoutingHint">Select which configured model each agent role should use. No JSON editing required.</p>
          <form id="brain-form">
            <label for="brain-select" data-i18n="brain">Brain</label><select id="brain-select"></select>
            <label for="apply-all-model" data-i18n="applyAllModel">Apply model to all roles</label><select id="apply-all-model"></select>
            <button id="apply-all-roles" type="button" data-i18n="applyAllRoles">Apply to all roles</button>
            <div id="role-models"></div>
            <button class="primary" type="submit" data-i18n="saveBrainRouting">Save brain routing</button>
          </form>
        </section>

        <section>
          <h2 data-i18n="toolsAuthTitle">Tools and auth</h2>
          <div class="grid">
            <div><h3 data-i18n="tools">Tools</h3><p class="muted" data-i18n="toolsHint">Tool toggles will appear here when coding tools are implemented.</p><div id="configured-tools" class="list"></div></div>
            <div><h3 data-i18n="authStatus">Auth status</h3><p class="muted" data-i18n="authHint">Secrets are not shown here. They belong in ~/.braincode/auth.json or a future secure store.</p><pre id="auth-status">{}</pre></div>
          </div>
        </section>
      </main>
    </div>

    <script type="module">
      const translations = {
        en: {
          kicker: "LOCAL AI CONTROL PANEL", title: "BRAIN<br />CODE", subtitle: "Brutalist configuration surface for brains, agents, models, tools, and local runtime policy.", language: "LANG", refresh: "Refresh",
          settingsTitle: "Settings", host: "Config server host", port: "Config server port", defaultBrain: "Default brain id", mode: "Mode", modeAuto: "auto — plan and route agents automatically", modeRadical: "radical — more aggressive autonomous execution", restartHint: "Changing host or port affects the next config server start.", saveSettings: "Save settings",
          modelsTitle: "Model selection", modelsHint: "Enter a provider, OpenAI-compatible base URL, and API key, then load /v1/models. Providers are saved in ~/.braincode/models.json; API keys are saved in ~/.braincode/auth.json.", addModel: "Add model", savedProviders: "Saved providers", provider: "Provider", baseUrl: "Base URL", apiKey: "API key", loadProviderModels: "Load /v1/models", providerCatalog: "Provider catalog", catalogModel: "Model", addSelectedModel: "Add selected model", configuredModels: "Configured models",
          brainRoutingTitle: "Brain routing", brainRoutingHint: "Select which configured model each agent role should use. No JSON editing required.", brain: "Brain", applyAllModel: "Apply model to all roles", applyAllRoles: "Apply to all roles", saveBrainRouting: "Save brain routing",
          toolsAuthTitle: "Tools and auth", tools: "Tools", toolsHint: "Tool toggles will appear here when coding tools are implemented.", authStatus: "Auth status", authHint: "Secrets are not shown here. They belong in ~/.braincode/auth.json or a future secure store.",
          loading: "Loading...", loaded: "Loaded", loadingCatalog: "Loading model catalog...", catalogFailed: "Model catalog failed to load", saving: "Saving", saved: "Saved", failed: "Failed", none: "None configured", remove: "Remove", testConnection: "Test connection", testing: "Testing", testOk: "Connection ok"
        },
        zh: {
          kicker: "本地 AI 控制台", title: "脑码<br />控制", subtitle: "用于配置 brain、agent、模型、工具和本地运行策略的粗犷主义技术界面。", language: "语言", refresh: "刷新",
          settingsTitle: "基础设置", host: "配置服务主机", port: "配置服务端口", defaultBrain: "默认 Brain ID", mode: "模式", modeAuto: "auto — 根据意图自动规划并路由 agent", modeRadical: "radical — 更激进的自治执行", restartHint: "修改主机或端口会在下次启动配置服务时生效。", saveSettings: "保存设置",
          modelsTitle: "模型选择", modelsHint: "填写 provider、OpenAI-compatible Base URL 和 API key，然后通过 /v1/models 获取模型。Provider 会保存到 ~/.braincode/models.json；API key 会保存到 ~/.braincode/auth.json。", addModel: "添加模型", savedProviders: "已保存 Provider", provider: "Provider", baseUrl: "Base URL", apiKey: "API key", loadProviderModels: "加载 /v1/models", providerCatalog: "Provider 目录", catalogModel: "模型", addSelectedModel: "添加选中模型", configuredModels: "已配置模型",
          brainRoutingTitle: "Brain 路由", brainRoutingHint: "为每个 agent 角色选择已配置模型，不需要手写 JSON。", brain: "Brain", applyAllModel: "应用模型到全部角色", applyAllRoles: "应用到全部角色", saveBrainRouting: "保存 Brain 路由",
          toolsAuthTitle: "工具与认证", tools: "工具", toolsHint: "编码工具实现后，这里会显示工具开关。", authStatus: "认证状态", authHint: "这里不会展示密钥。密钥应放在 ~/.braincode/auth.json 或未来的安全存储中。",
          loading: "加载中...", loaded: "已加载", loadingCatalog: "正在加载模型目录...", catalogFailed: "模型目录加载失败", saving: "正在保存", saved: "已保存", failed: "失败", none: "暂无配置", remove: "移除", testConnection: "联通测试", testing: "测试中", testOk: "联通正常"
        }
      }

      const roles = ["routeBrain", "coding", "research", "review", "summarize", "fastReply", "oracle", "librarian"]
      const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh"]
      const roleLabels = { routeBrain: "路由大脑 / Router Brain", coding: "Coding", research: "Research", review: "Review", summarize: "Summarize", fastReply: "Fast reply", oracle: "Oracle", librarian: "Librarian" }
      const roleDescriptions = {
        routeBrain: "主控路由：先读用户意图，决定交给哪个角色处理。适合最强推理模型，默认 GPT-5.5 xhigh。",
        coding: "代码实现：负责改代码、修 bug、跑验证。适合强代码模型，优先稳定和工具调用能力。",
        research: "快速检索：负责查资料、查代码位置、整理事实。适合速度快、成本低、上下文大的模型。",
        review: "审查检查：负责 code review、风险审计、找回归。适合严谨推理和长上下文模型。",
        summarize: "总结交接：负责压缩上下文、生成 handoff、整理结果。适合便宜快速模型。",
        fastReply: "简单回复：负责问候、短问题、轻量响应。适合最快最低成本模型。",
        oracle: "深度推理：负责复杂架构、疑难 bug、重大决策。适合最强推理模型，通常 xhigh。",
        librarian: "大型代码库理解：负责外部仓库/大范围架构阅读。适合长上下文和代码理解强的模型。"
      }
      const status = document.querySelector("#status")
      const authStatus = document.querySelector("#auth-status")
      const refresh = document.querySelector("#refresh")
      const language = document.querySelector("#language")
      const settingsForm = document.querySelector("#settings-form")
      const modelForm = document.querySelector("#model-form")
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
          label.textContent = roleLabels[role] || role
          const select = document.createElement("select")
          select.dataset.role = role
          select.replaceChildren(...currentModels.models.map((model) => option(model.id, model.name + " / " + model.id)))
          select.value = policy?.modelId || currentModels.models[0]?.id || ""
          const thinkingLabel = document.createElement("label")
          thinkingLabel.textContent = "Thinking"
          const thinking = document.createElement("select")
          thinking.dataset.roleThinking = role
          thinking.replaceChildren(...thinkingLevels.map((level) => option(level, level)))
          thinking.value = policy?.thinkingLevel || (role === "routeBrain" || role === "oracle" ? "xhigh" : "medium")
          row.append(label, select, thinkingLabel, thinking)
          const note = document.createElement("div")
          note.className = "role-note"
          note.textContent = roleDescriptions[role] || ""
          card.append(row, note)
          roleModels.append(card)
          enhanceSelect(select)
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

      refresh.addEventListener("click", () => loadAll().catch(showError))
      language.addEventListener("change", () => { currentLang = language.value; localStorage.setItem("braincode-config-lang", currentLang); applyLanguage(); renderConfiguredModels(); renderBrainRouting(); renderTools() })
      savedProviderSelect.addEventListener("change", applySavedProvider)
      loadProviderModelsButton.addEventListener("click", () => loadProviderModels().catch(showError))
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
        const nextModels = currentModels.models.some((candidate) => candidate.id === model.id) ? currentModels.models : [...currentModels.models, model]
        status.textContent = t("saving") + " models..."
        putJson("/api/models", { ...currentModels, models: nextModels }).then((savedModels) => { currentModels = savedModels; renderSavedProviders(); renderConfiguredModels(); renderBrainRouting(); status.textContent = t("saved") + " models" }).catch(showError)
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
          const previous = nextBrain.roles[role] || { thinkingLevel: role === "routeBrain" || role === "oracle" ? "xhigh" : "medium" }
          const thinkingLevel = thinking?.value || previous.thinkingLevel || "medium"
          const { systemPrompt: _roleSystemPrompt, ...previousWithoutPrompt } = previous
          nextBrain.roles[role] = { ...previousWithoutPrompt, modelId: select.value, thinkingLevel }
          if (role === "routeBrain") {
            const { systemPrompt: _plannerSystemPrompt, ...plannerWithoutPrompt } = nextBrain.planner || previous
            nextBrain.planner = { ...plannerWithoutPrompt, modelId: select.value, thinkingLevel }
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
