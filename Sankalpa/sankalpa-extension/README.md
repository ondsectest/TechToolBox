# Sankalpa — Chrome extension

Sankalpa inside Chrome DevTools: open DevTools on any site, click the **Sankalpa** tab, and test its forms. Same features as the Sankalpa web app, with nothing to install or start.

- **Focus & cursor:** is the first field ready to type in when the form opens? Is the cursor at the end of prefilled text?
- **Length limits (browser):** does the browser stop input at the limit? Does the counter show the real limit? Do emoji count correctly?
- **Server checks:** submits the form once, then re-sends its request with boundary values to check that the **server** enforces the same rules (including "rejected but saved anyway" and linked requests).
- **Suites, test cases, runs:** built-in cases you can switch off, **+ Add test case**, run history compared with the previous run, Markdown report.

## Install (developer mode)

1. Open `chrome://extensions` and switch on **Developer mode** (top right).
2. Click **Load unpacked** and choose this folder (`Sankalpa/sankalpa-extension` in the TechToolBox repository).
3. Open any site, press **F12** (or ⌥⌘I on Mac), and choose the **Sankalpa** tab. It may be under the `»` menu.

### From the packaged file
`npm run package` creates `dist/sankalpa-extension-<version>.zip` (and a signed `.crx`). To install the zip: unzip it, then **Load unpacked** the unzipped folder. Upload the same zip to the Chrome Web Store to publish. Chrome only installs an off-store `.crx` through enterprise policy. The signing key is in `keys/`: keep it private and reuse it so updates keep the same extension ID.

## Using it

1. **+ New suite:** the site defaults to the page you're inspecting. Sankalpa visits pages **in this tab** to find forms, then puts the tab back where you were.
   Forms appear as cards while scanning; **Stop and use what's found** ends early.
2. **Choose forms** and checks. Click a form to see every field: type, required, browser limit and *where it comes from*, counter (with mismatch warning), error text, suggested limit, state (first field, read-only, must match…), and attributes (`name`, `id`, `autocomplete`, `inputmode`, `pattern`, `placeholder`, help text). **Show in page** outlines a field in the tab; **Inspect** selects it in the Elements panel. The suite page has the same table under **Forms & fields**, and run results are grouped by field.
    Payment/delete forms can't be selected; CAPTCHA and login forms get no server checks.
3. **Questions:** confirm suggested limits (each with its reason), pick the main form where a page has several, approve server checks once for the site.
4. **Run suite**, then read the results, compare with the last run, and download the report.

Forms behind a login: just log in (with a **test account**) in that tab first. Sankalpa uses your current session.

## AI bug reports (optional)
Tests never use AI. For any **Fail** or **Warning**, **Bug report** asks a model you choose to write a ticket-ready report (title, severity, environment, steps, expected/actual, impact, suggested fix, evidence) from what Sankalpa recorded. **Bug reports for all failures (AI)** writes them all in one go.
- **AI settings** (top right): **OpenRouter** (only free models listed; your key), **Ollama** (on this computer, no key), or any **OpenAI-compatible API** (base URL + key; quick picks for LM Studio, vLLM, llama.cpp…). Same choices as the Prana app.
- **Ollama + this extension:** Ollama blocks browser extensions by default. Allow Sankalpa once (Ollama's `OLLAMA_ORIGINS` setting), then quit and reopen Ollama. Sankalpa shows the exact command with your extension's ID when it's needed, e.g. `launchctl setenv OLLAMA_ORIGINS "chrome-extension://<id>"`. The web app doesn't need this.
- Format per copy: Markdown (Jira Cloud, GitHub, Linear…), Jira wiki markup (Jira Server/DC), or plain text.
- Privacy: settings and keys stay in this browser. Tokens, cookies and passwords are removed before sending; for cloud models you see exactly what will be sent and press **Send**. Use Ollama for private apps.

## Permissions and safety

| Permission | Why | When |
|---|---|---|
| `localhost` / `127.0.0.1` | Test local apps without extra prompts | At install |
| Other sites | Read and test that one site | Asked the first time you test it (small "Allow" window + Chrome's prompt) |
| `debugger` (optional) | **Type with a real keyboard**: exact typing for length/emoji/cursor checks | Only if you switch it on; attached only while typing, then detached. Chrome shows a "debugging" bar meanwhile |
| `storage`, `scripting` | Save suites locally; run checks in the page | Always |

Without the debugger, typing is **emulated**: Sankalpa applies the browser's own `maxlength` rules exactly and labels those results "emulated typing". Tests show it gives the same answers as real typing (for example, 80 of 160 emoji kept in Juice Shop's feedback box).

- Server checks create real records (test accounts, comments). Use your own local or staging site, never production.
- Never submits payment, checkout or delete forms; never solves or bypasses CAPTCHAs; one request at a time.
- Everything stays in this browser (`chrome.storage.local`). Nothing is sent to any Sankalpa server; there isn't one.

## For developers

The engine is shared with the web app in `../form-scanner` (single source of truth):

```
../form-scanner/src/rules.js, engine/cases.js, engine/replay-core.js, engine/page.js
        │  node scripts/build.mjs  (npm run build)
        ▼
lib/shared/*            generated copies (don't edit)
content/inpage.js       generated: page.js + src/inpage-extra.js  → window.__sk (isolated world)
content/main.js         generated: src/main-world.js + replayInPage → request capture + replay (main world)
```

```
background.js   bridge: runs named in-page helpers, navigation, permission window, optional debugger
panel.html/js   the DevTools tab (also works as a normal tab: panel.html?tabId=<id>)
lib/            api.js (same operations as the web app's routes), store.js, tab.js, discover.js, run.js
approve.html/js small window that asks Chrome for site access / the debugger
```

`npm test` builds and runs the extension end-to-end against OWASP Juice Shop on `localhost:3000`, clicking through the panel like a user. `node --test test/real-typing.test.mjs` checks the real-keyboard mode. Playwright comes from `../form-scanner/node_modules`.
