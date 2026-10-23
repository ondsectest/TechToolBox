---
name: forms-testing
description: Test web and hybrid-mobile app forms for usability and correctness — initial focus and cursor placement, max-length limits, and client/server validation parity. Use when the user asks to test, review, or audit a form (sign up, login, profile, checkout, contact, settings), a form's focus/cursor behavior, field length limits, or validation messages — on a live URL or in source code.
---

# Forms Testing

Tests forms the way a thoughtful human tester would: from the end user's intent, saving them clicks, keystrokes, and round-trips to the server. Works on web apps and hybrid mobile apps (WebView, Capacitor, Cordova, Ionic, React Native Web).

## Parts (load only what you need)

| Part | File | Covers |
|------|------|--------|
| 1 | [references/focus-and-cursor.md](references/focus-and-cursor.md) | Auto-focus on the first editable field, caret at end of prefilled text, skipping read-only fields, multiple forms, mobile, accessibility |
| 2 | [references/field-length-limits.md](references/field-length-limits.md) | Max-length on every field, suggested limits with reasons, client↔server parity, error message quality |
| 3 | [references/server-boundary-replay.md](references/server-boundary-replay.md) | Capture a real submit from the network log, replay it with boundary values, compare server rules with client rules (needs per-site approval) |
| — | [scripts/replay-boundaries.js](scripts/replay-boundaries.js) | Page-context helper that replays a captured request with boundary cases |
| — | [references/report-template.md](references/report-template.md) | Output format for every run |
| — | [scripts/inspect-form.js](scripts/inspect-form.js) | Browser snippet: lists forms, fields, editability, maxlength, focus, caret |

Read the part file before testing that part. Don't load parts the user didn't pick.

## Workflow

1. **Gather context — ask what you can't observe.** Ask in one message, only for what's missing:
   - Target: live URL (local/staging preferred) or source code path, or both.
   - Platform: desktop web, mobile web, hybrid app, or all.
   - Entry action: what did the user click to reach this form? ("Sign Up", "My Profile", "Edit Address"). Intent drives which form and field should get focus.
   - Which parts to run (default: all parts listed above).
2. **Choose the mode.**
   - Live URL → test in the browser (built-in browser pane by default). Reach the form by the real entry action, not only by typing the URL — SPA navigation and full page loads behave differently.
   - Source code → read the form markup/components and the backend validators.
   - Both available → do both; code explains *why* the live behavior happens.
3. **Run each selected part** following its file.
4. **Ask before asserting judgment calls.** Where a part says *ASK*, explain the trade-off in one or two sentences and let the user decide. Record the decision in the report.
5. **Write the report** to `forms-test-report-<page>-<YYYY-MM-DD>.md` in the user's working folder using the template, then summarise the top findings in chat.

## Ground rules

- Use made-up test data (e.g. `Testfirst`, `test+forms@example.com`). Never type real personal data, real passwords, or payment details.
- **Submitting a form is an outward action.** Before any submit on a live site, tell the user exactly what will be submitted and where, and wait for a yes. Prefer local or staging. Never submit on production without explicit permission.
- Report what you observed, with evidence (DOM values, screenshots, request/response). Mark anything you couldn't verify as *Not verified* rather than guessing.
- Explain every finding in terms of user impact ("costs an extra click", "user retypes 60 characters after a server error"), not only spec compliance.
