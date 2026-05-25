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
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      pre { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 12px; padding: 16px; overflow: auto; background: color-mix(in srgb, CanvasText 5%, transparent); }
      button { border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
      .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .muted { opacity: 0.7; }
    </style>
  </head>
  <body>
    <header>
      <h1>Braincode Config</h1>
      <p class="muted">Local configuration UI. Runtime settings are stored under <code>~/.braincode/</code>.</p>
    </header>

    <section>
      <div class="row">
        <button id="refresh">Refresh settings</button>
        <span id="status" class="muted">Loading...</span>
      </div>
      <pre id="settings">{}</pre>
    </section>

    <script type="module">
      const status = document.querySelector("#status")
      const settings = document.querySelector("#settings")
      const refresh = document.querySelector("#refresh")

      async function loadSettings() {
        status.textContent = "Loading..."
        const response = await fetch("/api/settings")
        const body = await response.json()
        settings.textContent = JSON.stringify(body, null, 2)
        status.textContent = response.ok ? "Loaded" : "Failed"
      }

      refresh.addEventListener("click", loadSettings)
      loadSettings().catch((error) => {
        status.textContent = "Failed"
        settings.textContent = String(error)
      })
    </script>
  </body>
</html>`
