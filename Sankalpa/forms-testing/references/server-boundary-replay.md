# Part 3 — Server Boundary Testing via Network Replay

**Goal:** prove that the server enforces the same rules the browser does. Submit the form once, capture its request, then replay it with boundary values one field at a time and compare what the server accepts with what the browser allowed.

Run Part 2 first (or at least its inventory step). Part 3 uses the client limits Part 2 found.

## Consent and scope (do this before anything else)

- **Approval is once per site** (origin, e.g. `http://localhost:3000`). Before the first replay on a site, tell the user: the site, the forms, roughly how many requests, and what data they create (accounts, comments, emails). Wait for a yes, then record it in the report. Ask again for any new origin.
- **Allowed by default:** `localhost`, `127.0.0.1`, `*.localhost`, `*.test`, and hosts the user names as their own staging. **Production:** only with explicit permission for that host, and warn that replays create real records.
- **Never replay:** payments, checkout, money transfers, delete/cancel actions, password change for a real account, anything that sends messages to real people.
- **CAPTCHA or bot check on the form → stop.** Don't solve or bypass it. Mark the form *Not verified — CAPTCHA* and suggest the team test it in an environment where the CAPTCHA is turned off.
- Rate: one request at a time, ≥300 ms apart. Stop on HTTP 429 or on repeated 5xx errors.

## Steps

**1. Learn the client rules.** For each field: `maxlength`, `minlength`, `required`, `pattern`, `type`, and framework validators (from Part 2's inventory or the source). Where a field has no limit, use the agreed limit from Part 2, or **ASK**.

**2. Capture one valid submit.** Fill every field with a unique, valid marker value (e.g. `Tfname7Q`, `test+bv00@example.com`), submit once, and capture the request from the network log: method, URL, headers (especially `Authorization`, `Content-Type`, CSRF headers), body, and the response status and body. In the built-in browser use `read_network_requests`. In the future Chrome extension, a DevTools panel will do this (`chrome.devtools.network.onRequestFinished`).

If the network tool shows responses but not request bodies, run [scripts/capture-requests.js](../scripts/capture-requests.js) in the page **before** submitting. It records each fetch/XHR body. Otherwise, read the body shape from the frontend source.

**3. Map fields to the request.** Find each marker value in the request body. This gives the path (`email`, `user.first_name`, `answer`) even when request names differ from field names. Fields whose markers don't appear are sent somewhere else (a second request, a header) or dropped. Look for a follow-up request (Juice Shop sends the security answer in a second request).

**4. Generate boundary cases** for each field with limit `N` (and minimum `M` where set):

| Case | Value | Expected |
|------|-------|----------|
| at-max | `N` chars | accept |
| over-max | `N+1` chars | reject, field-specific message |
| far-over | `N+500` chars | reject (not 500, not truncated) |
| under-min | `M−1` chars | reject |
| at-min | `M` chars | accept |
| empty | `""` (required fields) | reject |
| emoji-at-max | `N/2` × `😀` (= N UTF-16 units, what the browser allows) | accept: the browser allowed it |
| emoji-over | `N` × `😀` | should match how the browser counts. Accepted ⇒ server counts code points/graphemes, browser counts UTF-16 units: report the mismatch |
| padded | `"  " + M chars + "  "` | consistent with client: if the server trims, check that the remaining length is still validated |

Make every replay unique where uniqueness matters (`test+bv01@example.com`, `test+bv02@…`) so "already exists" doesn't hide the real result.

**5. Replay from the page.** Run [scripts/replay-boundaries.js](../scripts/replay-boundaries.js) in the page context, so cookies and session match the real request. Copy auth and CSRF headers from the capture. If a one-time CSRF token is rejected, fetch a fresh one or mark *Not verified — one-time token*.

**6. Judge each response:**

| Server result for a case expected to be rejected | Verdict | Severity |
|---------------------------------------------------|---------|----------|
| 2xx, record created | No server rule | **High** |
| 2xx but value stored shorter (truncated) | Silent data loss | **High** |
| 5xx / database or stack error in body | Server breaks on bad input | **High** |
| 4xx with no field named ("Bad request", "Validation error") | Unhelpful message | Medium |
| 4xx naming the field and the limit | ✅ Pass | — |

For cases expected to be **accepted** (at-max, at-min, emoji-at-max): a rejection means the server is *stricter* than the browser, so users hit an error the browser said was fine → **Medium**.

Some APIs answer 200 with an error inside the body. Read the body; don't trust the status code alone.

**A rejection doesn't prove nothing was saved.** After any 4xx, check whether the record exists anyway (GET it, log in with it, or query the local DB read-only). Juice Shop returned 400 "cannot be empty" *and* created the account. This is a "reject-but-save" defect: **High**. Server logs showing `ERR_HTTP_HEADERS_SENT` (Node) or "response already committed" (Java) are a strong hint.

**Multi-request forms:** when one form sends several requests linked by an ID (user → security answer), replay the chain. Create a fresh parent for each case, then replay the child with the boundary value.

**7. Follow-up checks** where a field is transformed (trimmed, lower-cased, normalised): use the value through another path. For example, log in with a password that was registered with spaces around it. The same value must work everywhere.

**8. Record everything created** (IDs, emails) in the report under "Test data created", so the team can clean it up.

## Report additions
Add a **Server boundary results** table: `Form | Field | Client rule | Case | Sent length | HTTP | Server message | Verdict`. Then add the consent record (origin, approved by, date) and "Test data created".
