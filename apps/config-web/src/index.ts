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
        font-family: "Arial Narrow", "Roboto Condensed", "Source Han Sans SC", "Noto Sans CJK SC", "Arial", sans-serif;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        color: var(--ink);
        background:
          radial-gradient(circle at 82% 16%, rgba(159, 36, 31, 0.22) 0 12%, transparent 13% 100%),
          repeating-linear-gradient(112deg, transparent 0 16px, rgba(16, 16, 16, 0.055) 17px 19px),
          linear-gradient(180deg, var(--paper), var(--paper-dark));
        min-height: 100vh;
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
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-weight: 900;
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

      h2, h3 {
        margin: 0 0 14px;
        text-transform: uppercase;
        letter-spacing: -0.035em;
      }

      h2 {
        display: inline-block;
        padding: 4px 10px;
        color: var(--paper);
        background: var(--ink);
        font-size: 24px;
      }

      h3 { font-size: 18px; }

      p { margin: 0 0 14px; }

      .poster-copy {
        max-width: 680px;
        font-size: 18px;
        font-weight: 800;
      }

      .language-bar {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: flex-end;
        margin-bottom: 18px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-weight: 900;
      }

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

      .head {
        width: 190px;
        height: 210px;
        border: 8px solid var(--ink);
        border-radius: 48% 42% 44% 50%;
        background:
          radial-gradient(circle at 58% 31%, var(--red) 0 12px, transparent 13px),
          linear-gradient(125deg, transparent 0 47%, var(--ink) 48% 51%, transparent 52%),
          var(--paper);
        margin-left: auto;
        position: relative;
      }

      .head::before, .head::after {
        content: "";
        position: absolute;
        background: var(--ink);
      }

      .head::before {
        width: 132px;
        height: 7px;
        top: 78px;
        left: -44px;
        transform: rotate(-18deg);
      }

      .head::after {
        width: 9px;
        height: 142px;
        top: 22px;
        right: 46px;
        transform: rotate(28deg);
      }

      main { padding: 26px; }

      section {
        margin: 0 0 26px;
        padding: 18px;
        border: var(--line) solid var(--ink);
        background: rgba(232, 221, 199, 0.82);
        box-shadow: 7px 7px 0 rgba(16, 16, 16, 0.85);
      }

      label {
        display: block;
        margin: 13px 0 6px;
        font-weight: 1000;
        text-transform: uppercase;
      }

      input, select, textarea {
        width: 100%;
        border: 4px solid var(--ink);
        border-radius: 0;
        background: #f3ead8;
        color: var(--ink);
        box-shadow: 4px 4px 0 var(--ink);
      }

      input, select {
        max-width: 440px;
        padding: 11px 12px;
        font: 800 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }

      textarea {
        min-height: 240px;
        padding: 12px;
        font: 700 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }

      code, pre {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }

      pre {
        border: 4px solid var(--ink);
        padding: 14px;
        overflow: auto;
        background: #f3ead8;
        box-shadow: inset 5px 0 0 var(--red);
      }

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

      button.primary {
        color: var(--paper);
        background: var(--red);
      }

      button:active { transform: translate(3px, 3px); box-shadow: 2px 2px 0 var(--ink); }

      .row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
      .muted { color: var(--muted); font-weight: 800; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }

      .signal-strip {
        margin-top: 22px;
        min-height: 52px;
        border: 4px solid var(--ink);
        background:
          linear-gradient(90deg, var(--ink) 0 12%, transparent 12% 16%, var(--red) 16% 26%, transparent 26% 31%, var(--ink) 31% 34%, transparent 34%),
          repeating-linear-gradient(90deg, transparent 0 22px, rgba(16, 16, 16, 0.35) 22px 26px);
      }

      @media (max-width: 760px) {
        header { grid-template-columns: 1fr; }
        header::after { opacity: 0.35; }
        .language-bar { justify-content: flex-start; }
      }
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
            <select id="language">
              <option value="en">EN</option>
              <option value="zh">中文</option>
            </select>
          </div>
          <div class="hero-card" aria-hidden="true">
            <div class="head"></div>
          </div>
        </div>
      </header>

      <main>
        <section>
          <div class="row">
            <button id="refresh" data-i18n="refresh">Refresh</button>
            <span id="status" class="muted">Loading...</span>
          </div>
        </section>

        <section>
          <h2 data-i18n="settingsTitle">Settings</h2>
          <form id="settings-form">
            <div class="grid">
              <div>
                <label for="host" data-i18n="host">Config server host</label>
                <input id="host" name="host" autocomplete="off" />
              </div>
              <div>
                <label for="port" data-i18n="port">Config server port</label>
                <input id="port" name="port" type="number" min="1" max="65535" />
              </div>
              <div>
                <label for="defaultBrainId" data-i18n="defaultBrain">Default brain id</label>
                <input id="defaultBrainId" name="defaultBrainId" autocomplete="off" />
              </div>
              <div>
                <label for="mode" data-i18n="mode">Mode</label>
                <select id="mode" name="mode">
                  <option value="auto" data-i18n="modeAuto">auto — plan and route agents automatically</option>
                  <option value="radical" data-i18n="modeRadical">radical — more aggressive autonomous execution</option>
                </select>
              </div>
            </div>
            <p class="muted" data-i18n="restartHint">Changing host or port affects the next config server start.</p>
            <button class="primary" type="submit" data-i18n="saveSettings">Save settings</button>
          </form>
          <pre id="settings">{}</pre>
        </section>

        <section>
          <h2 data-i18n="documentsTitle">Brains, models, and tools</h2>
          <p class="muted" data-i18n="documentsHint">These are non-secret JSON configuration files stored under ~/.braincode/.</p>
          <div class="grid">
            <form id="brains-form">
              <h3 data-i18n="brains">Brains</h3>
              <textarea id="brains" spellcheck="false">{}</textarea>
              <button class="primary" type="submit" data-i18n="saveBrains">Save brains</button>
            </form>
            <form id="models-form">
              <h3 data-i18n="models">Models</h3>
              <textarea id="models" spellcheck="false">{}</textarea>
              <button class="primary" type="submit" data-i18n="saveModels">Save models</button>
            </form>
            <form id="tools-form">
              <h3 data-i18n="tools">Tools</h3>
              <textarea id="tools" spellcheck="false">{}</textarea>
              <button class="primary" type="submit" data-i18n="saveTools">Save tools</button>
            </form>
            <div>
              <h3 data-i18n="authStatus">Auth status</h3>
              <p class="muted" data-i18n="authHint">Secrets are not shown here. They belong in ~/.braincode/auth.json or a future secure store.</p>
              <pre id="auth-status">{}</pre>
            </div>
          </div>
        </section>
      </main>
    </div>

    <script type="module">
      const translations = {
        en: {
          kicker: "LOCAL AI CONTROL PANEL",
          title: "BRAIN<br />CODE",
          subtitle: "Brutalist configuration surface for brains, agents, models, tools, and local runtime policy.",
          language: "LANG",
          refresh: "Refresh",
          settingsTitle: "Settings",
          host: "Config server host",
          port: "Config server port",
          defaultBrain: "Default brain id",
          mode: "Mode",
          modeAuto: "auto — plan and route agents automatically",
          modeRadical: "radical — more aggressive autonomous execution",
          restartHint: "Changing host or port affects the next config server start.",
          saveSettings: "Save settings",
          documentsTitle: "Brains, models, and tools",
          documentsHint: "These are non-secret JSON configuration files stored under ~/.braincode/.",
          brains: "Brains",
          models: "Models",
          tools: "Tools",
          saveBrains: "Save brains",
          saveModels: "Save models",
          saveTools: "Save tools",
          authStatus: "Auth status",
          authHint: "Secrets are not shown here. They belong in ~/.braincode/auth.json or a future secure store.",
          loading: "Loading...",
          loaded: "Loaded",
          saving: "Saving",
          saved: "Saved",
          failed: "Failed",
          invalidJson: "JSON is invalid",
        },
        zh: {
          kicker: "本地 AI 控制台",
          title: "脑码<br />控制",
          subtitle: "用于配置 brain、agent、模型、工具和本地运行策略的粗犷主义技术界面。",
          language: "语言",
          refresh: "刷新",
          settingsTitle: "基础设置",
          host: "配置服务主机",
          port: "配置服务端口",
          defaultBrain: "默认 Brain ID",
          mode: "模式",
          modeAuto: "auto — 根据意图自动规划并路由 agent",
          modeRadical: "radical — 更激进的自治执行",
          restartHint: "修改主机或端口会在下次启动配置服务时生效。",
          saveSettings: "保存设置",
          documentsTitle: "Brains、模型与工具",
          documentsHint: "这些是非敏感 JSON 配置文件，存储在 ~/.braincode/。",
          brains: "Brains",
          models: "模型",
          tools: "工具",
          saveBrains: "保存 brains",
          saveModels: "保存模型",
          saveTools: "保存工具",
          authStatus: "认证状态",
          authHint: "这里不会展示密钥。密钥应放在 ~/.braincode/auth.json 或未来的安全存储中。",
          loading: "加载中...",
          loaded: "已加载",
          saving: "正在保存",
          saved: "已保存",
          failed: "失败",
          invalidJson: "JSON 格式无效",
        },
      }

      const status = document.querySelector("#status")
      const settings = document.querySelector("#settings")
      const brains = document.querySelector("#brains")
      const models = document.querySelector("#models")
      const tools = document.querySelector("#tools")
      const authStatus = document.querySelector("#auth-status")
      const refresh = document.querySelector("#refresh")
      const language = document.querySelector("#language")
      const settingsForm = document.querySelector("#settings-form")
      const brainsForm = document.querySelector("#brains-form")
      const modelsForm = document.querySelector("#models-form")
      const toolsForm = document.querySelector("#tools-form")
      const hostInput = document.querySelector("#host")
      const portInput = document.querySelector("#port")
      const defaultBrainIdInput = document.querySelector("#defaultBrainId")
      const modeInput = document.querySelector("#mode")

      let currentSettings = null
      let currentLang = localStorage.getItem("braincode-config-lang") || "en"
      language.value = currentLang

      function t(key) {
        return translations[currentLang][key] || translations.en[key] || key
      }

      function applyLanguage() {
        document.documentElement.lang = currentLang
        for (const element of document.querySelectorAll("[data-i18n]")) {
          const key = element.getAttribute("data-i18n")
          if (!key) continue
          element.innerHTML = t(key)
        }
      }

      async function getJson(path) {
        const response = await fetch(path)
        const body = await response.json()
        if (!response.ok || !body.ok) throw new Error(body.error || "Request failed")
        return body.data
      }

      async function putJson(path, value) {
        const response = await fetch(path, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value),
        })
        const body = await response.json()
        if (!response.ok || !body.ok) throw new Error(body.error || "Request failed")
        return body.data
      }

      function renderSettings(value) {
        currentSettings = value
        hostInput.value = value.configServer.host
        portInput.value = String(value.configServer.port)
        defaultBrainIdInput.value = value.defaultBrainId
        modeInput.value = value.mode
        settings.textContent = JSON.stringify(value, null, 2)
      }

      async function loadAll() {
        status.textContent = t("loading")
        const [settingsData, brainsData, modelsData, toolsData, authStatusData] = await Promise.all([
          getJson("/api/settings"),
          getJson("/api/brains"),
          getJson("/api/models"),
          getJson("/api/tools"),
          getJson("/api/auth/status"),
        ])
        renderSettings(settingsData)
        brains.value = JSON.stringify(brainsData, null, 2)
        models.value = JSON.stringify(modelsData, null, 2)
        tools.value = JSON.stringify(toolsData, null, 2)
        authStatus.textContent = JSON.stringify(authStatusData, null, 2)
        status.textContent = t("loaded")
      }

      refresh.addEventListener("click", () => loadAll().catch(showError))
      language.addEventListener("change", () => {
        currentLang = language.value
        localStorage.setItem("braincode-config-lang", currentLang)
        applyLanguage()
      })

      settingsForm.addEventListener("submit", (event) => {
        event.preventDefault()
        const nextSettings = {
          ...currentSettings,
          configServer: {
            host: hostInput.value,
            port: Number(portInput.value),
          },
          defaultBrainId: defaultBrainIdInput.value,
          mode: modeInput.value,
        }
        status.textContent = t("saving") + " settings..."
        putJson("/api/settings", nextSettings)
          .then((savedSettings) => {
            renderSettings(savedSettings)
            status.textContent = t("saved") + " settings"
          })
          .catch(showError)
      })

      function saveJsonDocument(event, path, element, label) {
        event.preventDefault()
        let value
        try {
          value = JSON.parse(element.value)
        } catch (error) {
          showError(new Error(label + " " + t("invalidJson") + ": " + error.message))
          return
        }

        status.textContent = t("saving") + " " + label + "..."
        putJson(path, value)
          .then((savedValue) => {
            element.value = JSON.stringify(savedValue, null, 2)
            status.textContent = t("saved") + " " + label
          })
          .catch(showError)
      }

      brainsForm.addEventListener("submit", (event) => saveJsonDocument(event, "/api/brains", brains, "brains"))
      modelsForm.addEventListener("submit", (event) => saveJsonDocument(event, "/api/models", models, "models"))
      toolsForm.addEventListener("submit", (event) => saveJsonDocument(event, "/api/tools", tools, "tools"))

      function showError(error) {
        status.textContent = t("failed")
        settings.textContent = String(error)
      }

      applyLanguage()
      loadAll().catch(showError)
    </script>
  </body>
</html>`
