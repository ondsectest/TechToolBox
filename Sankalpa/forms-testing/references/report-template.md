# Report template

Write the report to `forms-test-report-<page>-<YYYY-MM-DD>.md`. Keep findings factual and include evidence for each one.

```markdown
# Forms Test Report — <Page / form name>

**Date:** YYYY-MM-DD   **Tester:** forms-testing skill
**Target:** <URL or code path>   **Environment:** local | staging | production
**Platform(s):** desktop <browser> | mobile web <device> | hybrid <app/WebView>
**Entry action:** <what the user clicked to reach the form, e.g. "Header → My Profile">
**Parts run:** Focus & Cursor | Field Length Limits

## Decisions made with the user
- Mobile auto-focus: <yes / desktop only> — <reason given>
- Primary form on page: <form name> — <inferred from entry action / user chose>
- Agreed limits: First name 50, Email 254, ... (<suggested / business rule>)

## Summary
| ID | Part | Field | Finding | Severity |
|----|------|-------|---------|----------|
| F-1 | Focus | First name | Caret placed at start of prefilled value | Medium |
| L-1 | Length | Phone | Server accepts 40 chars; client allows 15 | Medium |

## Findings

### F-1 — <short title>
- **Expected:** <rule, e.g. F3: caret at end of "Santhosh">
- **Actual:** <what happened>
- **Evidence:** <selectionStart=0, value.length=8; screenshot name; request/response>
- **Why it matters:** <user impact in one or two sentences>
- **Suggested fix:** <short explanation + code snippet in their framework>

## Passed checks
- <Rule> — <field/form> ✓

## Not verified
- <Check> — <why, e.g. "server parity: no permission to submit on production">

## Questions for the team
- <Open judgment calls the user deferred>
```

Severity uses the guides in each part file. If something is uncertain, put it under "Not verified" or "Questions", not in Findings.
