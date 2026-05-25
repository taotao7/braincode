export const configWebHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Braincode Config</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { max-width: 880px; margin: 48px auto; padding: 0 20px; line-height: 1.55; }
      header { margin-bottom: 28px; }
      section { margin: 28px 0; }
      label { display: block; font-weight: 600; margin: 14px 0 6px; }
      input { box-sizing: border-box; width: min(100%, 420px); border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 10px; padding: 10px 12px; background: Canvas; color: CanvasText; }
      select { box-sizing: border-box; width: min(100%, 420px); border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 10px; padding: 10px 12px; background: Canvas; color: CanvasText; }
      textarea { box-sizing: border-box; width: 100%; min-height: 220px; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 12px; padding: 12px; background: Canvas; color: CanvasText; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      pre { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 12px; padding: 16px; overflow: auto; background: color-mix(in srgb, CanvasText 5%, transparent); }
      button { border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
      button.primary { background: #2563eb; color: white; }
      .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .muted { opacity: 0.7; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
    </style>
  </head>
  <body>
    <header>
      <h1>Braincode Config</h1>
      <p class="muted">Local configuration UI. Runtime settings are stored under <code>~/.braincode/</code>.</p>
    </header>

    <section>
      <div class="row">
        <button id="refresh">Refresh</button>
        <span id="status" class="muted">Loading...</span>
      </div>
    </section>

    <section>
      <h2>Settings</h2>
      <form id="settings-form">
        <div class="grid">
          <div>
            <label for="host">Config server host</label>
            <input id="host" name="host" autocomplete="off" />
          </div>
          <div>
            <label for="port">Config server port</label>
            <input id="port" name="port" type="number" min="1" max="65535" />
          </div>
          <div>
            <label for="defaultBrainId">Default brain id</label>
            <input id="defaultBrainId" name="defaultBrainId" autocomplete="off" />
          </div>
          <div>
            <label for="mode">Mode</label>
            <select id="mode" name="mode">
              <option value="auto">auto — plan and route agents automatically</option>
              <option value="radical">radical — more aggressive autonomous execution</option>
            </select>
          </div>
        </div>
        <p class="muted">Changing host or port affects the next config server start.</p>
        <button class="primary" type="submit">Save settings</button>
      </form>
      <pre id="settings">{}</pre>
    </section>

    <section>
      <h2>Brains, models, and tools</h2>
      <p class="muted">These are non-secret JSON configuration files stored under <code>~/.braincode/</code>.</p>
      <div class="grid">
        <form id="brains-form">
          <h3>Brains</h3>
          <textarea id="brains" spellcheck="false">{}</textarea>
          <button class="primary" type="submit">Save brains</button>
        </form>
        <form id="models-form">
          <h3>Models</h3>
          <textarea id="models" spellcheck="false">{}</textarea>
          <button class="primary" type="submit">Save models</button>
        </form>
        <form id="tools-form">
          <h3>Tools</h3>
          <textarea id="tools" spellcheck="false">{}</textarea>
          <button class="primary" type="submit">Save tools</button>
        </form>
        <div>
          <h3>Auth status</h3>
          <p class="muted">Secrets are not shown here. They belong in <code>~/.braincode/auth.json</code> or a future secure store.</p>
          <pre id="auth-status">{}</pre>
        </div>
      </div>
    </section>

    <script type="module">
      const status = document.querySelector("#status")
      const settings = document.querySelector("#settings")
      const brains = document.querySelector("#brains")
      const models = document.querySelector("#models")
      const tools = document.querySelector("#tools")
      const authStatus = document.querySelector("#auth-status")
      const refresh = document.querySelector("#refresh")
      const settingsForm = document.querySelector("#settings-form")
      const brainsForm = document.querySelector("#brains-form")
      const modelsForm = document.querySelector("#models-form")
      const toolsForm = document.querySelector("#tools-form")
      const hostInput = document.querySelector("#host")
      const portInput = document.querySelector("#port")
      const defaultBrainIdInput = document.querySelector("#defaultBrainId")
      const modeInput = document.querySelector("#mode")

      let currentSettings = null

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
        status.textContent = "Loading..."
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
        status.textContent = "Loaded"
      }

      refresh.addEventListener("click", () => loadAll().catch(showError))
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
        status.textContent = "Saving..."
        putJson("/api/settings", nextSettings)
          .then((savedSettings) => {
            renderSettings(savedSettings)
            status.textContent = "Saved"
          })
          .catch(showError)
      })

      function saveJsonDocument(event, path, element, label) {
        event.preventDefault()
        let value
        try {
          value = JSON.parse(element.value)
        } catch (error) {
          showError(new Error(label + " JSON is invalid: " + error.message))
          return
        }

        status.textContent = "Saving " + label + "..."
        putJson(path, value)
          .then((savedValue) => {
            element.value = JSON.stringify(savedValue, null, 2)
            status.textContent = "Saved " + label
          })
          .catch(showError)
      }

      brainsForm.addEventListener("submit", (event) => saveJsonDocument(event, "/api/brains", brains, "brains"))
      modelsForm.addEventListener("submit", (event) => saveJsonDocument(event, "/api/models", models, "models"))
      toolsForm.addEventListener("submit", (event) => saveJsonDocument(event, "/api/tools", tools, "tools"))

      function showError(error) {
        status.textContent = "Failed"
        settings.textContent = String(error)
      }

      loadAll().catch(showError)
    </script>
  </body>
</html>`
