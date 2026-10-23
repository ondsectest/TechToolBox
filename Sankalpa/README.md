# Sankalpa

**Form testing inside Chrome DevTools.** Point it at your site: it finds every form, works out each field's rules, and tests both the browser and the server. Every failure comes with an explanation and evidence.

Built by a tester, for testers. Runs on your machine; your data stays local.

## What it checks

| Check | Examples of what it finds |
|---|---|
| **Focus & cursor** | The first field isn't ready to type in when the form opens; the cursor lands at the start of prefilled text |
| **Browser limits** | No length limit; typing isn't stopped at the limit; a counter shows the wrong limit (e.g. "/20" when the rule is 40); emoji counted as two characters |
| **Server checks** | The server accepts values the browser blocks; it says "rejected" but saves the record anyway; spaces trimmed below the minimum; linked requests (e.g. user → security answer) |

It also shows **every field's details** (type, required, limit and where it comes from, counter, attributes, HTML), with **Show in page** and **Inspect**.

Results are grouped by field, compared with the previous run (fixed / new / still failing), and exported as a detailed **Markdown report** (requests, responses, field HTML).

**Optional extras:** AI-written bug reports (Ollama on your computer, free OpenRouter models, or any OpenAI-compatible API), and while-you-wait test-idea cards, predictions and short lessons.

## Quick start: the Chrome extension

1. Clone or download this repository.
2. In Chrome, open `chrome://extensions` and switch on **Developer mode**.
3. Click **Load unpacked** and choose the folder **`Sankalpa/sankalpa-extension`**.
4. Open the site you want to test, press **F12** (⌥⌘I on a Mac), and choose the **Sankalpa** tab (it may be under `»`).
5. **+ New suite → Find forms → Next → tick "Run server checks" → Start testing.**

No build step is needed: the generated files are included.

## Quick start: the web app (optional)

Same checks, in a local web page, driven by a hidden browser. Useful for automation.

```bash
cd Sankalpa/form-scanner
npm install
npx playwright install chromium
npm start
```

Then open http://localhost:4000.

## Try it safely on a practice site

[OWASP Juice Shop](https://owasp.org/www-project-juice-shop/) is a deliberately vulnerable app made for practice. Run it locally, then test `http://localhost:3000/#/register`:

```bash
docker run --rm -p 3000:3000 bkimminich/juice-shop
```

## Safety and privacy

- **Server checks create real records** (test accounts, comments) on the site. Only use them on your own or test sites, never production. Sankalpa asks for approval once per site.
- It never submits payment, checkout or delete forms, and never bypasses CAPTCHAs.
- Requests are sent one at a time, with a delay you can set.
- Everything is stored in your browser (extension) or on your computer (web app). There is no Sankalpa server.
- AI is optional and off by default. Tokens, cookies and passwords are removed before anything is sent, and cloud models show a preview first.
- Extension permissions: `localhost` built in; other sites are asked for when you first test them; Chrome's debugger only if you switch on "Type with a real keyboard".

## What's in this folder

```
sankalpa-extension/   the Chrome extension (DevTools panel)
form-scanner/         the web app and the shared engine the extension is built from
forms-testing/        a Claude Code skill: the same testing knowledge, for AI-assisted testing
```

### For developers

- The engine is shared: `sankalpa-extension/scripts/build.mjs` copies it from `form-scanner/` into the extension (`npm run build`).
- Tests run end to end against OWASP Juice Shop on `localhost:3000`:
  ```bash
  cd form-scanner && npm install && npx playwright install chromium && npm test
  cd ../sankalpa-extension && npm test      # uses Playwright from ../form-scanner
  ```
- `sankalpa-extension/demo/` records and edits a demo video (needs ffmpeg).

### The forms-testing skill (Claude Code)

```bash
ln -sfn "$(pwd)/forms-testing" ~/.claude/skills/forms-testing
```

Then ask Claude Code, for example: *"Test the sign-up form at http://localhost:3000/#/register"*.

## Credits

Test-idea cards and lessons draw on the [Software Testing MindMaps](https://github.com/dimensi0nless/software-testing-mindmaps) collection, an initiative by Santhosh Tuppad with many community contributors (listed in its README). "36 Days of Web Testing" is by Rob Lambert.

## License

[MIT](../LICENSE) © 2026 Santhosh Tuppad
