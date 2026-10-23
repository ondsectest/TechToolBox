# Sankalpa

Form testing that runs on your machine. Give it a website, it finds the forms, and tests them the way a careful tester would:

1. **Focus & cursor:** is the first field ready to type in when the form opens? Is the cursor at the end of prefilled text?
2. **Length limits (browser):** does the browser stop input at the limit? Do counters show the real limit? Do emoji count correctly?
3. **Server checks:** submits the form once, then re-sends its request with boundary values to check that the **server** enforces the same rules as the browser (including "rejected but saved anyway").

No AI and no accounts. Everything stays on your computer.

## Start

Requires Node.js 22.5 or newer.

```bash
cd Sankalpa/form-scanner
npm install
npx playwright install chromium
npm start
```

Open **http://localhost:4000**.

## How to use it

1. **New suite:** enter the site's URL. Optionally *Log in first* (a browser window opens; log in with a **test account**).
2. **Choose forms:** tick the forms to test and which checks to run. Payment/delete forms can't be selected; CAPTCHA and login forms get no server checks.
3. **Questions:** confirm suggested length limits (each with its reason), pick the main form on pages with several, and approve server checks for the site (asked once per site).
4. **Suite page:**
   - **Test cases:** built-in cases (switch any off) and **+ Add test case** (form · field · input · expected result).
   - **Runs:** every run with its results, compared with the previous run (*fixed · new failure · still failing*). Download a Markdown report.

## AI bug reports (optional)
Tests never use AI. For any **Fail** or **Warning**, **Bug report** asks a model you choose to write a ticket-ready report (title, severity, environment, steps, expected/actual, impact, suggested fix, evidence) from what Sankalpa recorded. **Bug reports for all failures (AI)** writes them all in one go.
- **AI settings** (top right): **OpenRouter** (only free models listed; your key), **Ollama** (on this computer, no key), or any **OpenAI-compatible API** (base URL + key; quick picks for LM Studio, vLLM, llama.cpp…). Same choices as the Prana app.
- Format per copy: Markdown (Jira Cloud, GitHub, Linear…), Jira wiki markup (Jira Server/DC), or plain text.
- Privacy: settings and keys stay in this browser. Tokens, cookies and passwords are removed before sending; for cloud models you see exactly what will be sent and press **Send**. Use Ollama for private apps.

## Safety
- Server checks create real records (test accounts, comments) on the target. Use your own local or staging site, never production.
- Never submits payment, checkout or delete forms, and never solves or bypasses CAPTCHAs.
- One request at a time, 300 ms apart; stops on HTTP 429 or repeated server errors.

## For developers

```
src/server.js          HTTP API + live progress (server-sent events), local only (127.0.0.1)
src/db.js              SQLite (node:sqlite): suites, test_cases, runs, results, consents
src/rules.js           Suggested limits, safety rules, input presets: shared with the forms-testing skill
src/engine/discover.js Crawl (form-like links first), find forms, probe each field's browser rules
src/engine/cases.js    Built-in test cases from the three checks
src/engine/replay.js   Capture one submit, map fields into the request, replay boundary values, judge
src/engine/run.js      Runs a suite's cases
src/report.js          Run detail, comparison with previous run, Markdown export
public/                Dashboard (plain HTML/CSS/JS)
test/                  Regression suite against OWASP Juice Shop
```

`npm test` runs the engine against OWASP Juice Shop on `localhost:3000` and checks that it finds the bugs confirmed by hand (focus, the /20 counter, no server password rule, reject-but-save, trim bypass, linked security-answer request). It's skipped if Juice Shop isn't running.
