# Part 2 — Field Length Limits

**Goal:** users can't type more than the system will accept, the server enforces exactly the same limit, and when a limit is hit the message tells them clearly what to do. This saves the round-trip of "type 80 characters → submit → server error → retype".

## Rules (expected behavior)

**L1. Every free-text field has a client-side max length.** Use `maxlength` on `<input>`/`<textarea>` or an equivalent validator (zod `.max()`, yup `.max()`, Angular `Validators.maxLength`, etc.). If it's missing, **ASK**: propose a limit from the table below with its reason, and let the user confirm or give their own number. Don't report it as a defect until the expected number is agreed.

**L2. Client limit = server limit = storage limit.** If the client allows 10 characters, the server rejects 11 and accepts exactly 10. The database column must hold at least that many characters.
- Client looser than server → the user types, submits, gets an error, and has to retype. This is the main waste to prevent.
- Client stricter than server → harmless for users but a sign the limits drifted apart; report it as Low.
- Server missing → anyone who bypasses the browser (script, API call, devtools) can store unlimited data. Report as **High**: it's a data-integrity and abuse risk.
- Database smaller than server limit → a server error (500) or silent truncation. Report as **High**.

**L3. Error messages are useful.** A good length message:
- names the field and the limit, and ideally the current count: *"First name can be up to 50 characters. You've entered 63."*
- appears next to the field and is linked with `aria-describedby`, so screen readers announce it
- keeps the user's input. The form must not clear what they typed.
- uses the same wording whether it comes from the client or the server
- Bad: "Invalid input", "Error 422", "String too long", "value too long for type character varying(50)" (a leaked database error), or an error with no field named.

**L4. Truncation on paste is visible.** `maxlength` silently cuts pasted text, so the user may not notice the end was lost. For long fields (textarea, bio, address, comments), or anywhere truncation would change meaning, recommend a live counter (`63 / 100`) or a message when text is cut. **ASK** whether the user wants counters on short fields too.
- Counter accessibility: use `aria-live="polite"` and announce only near the limit (for example, the last 20 characters), not on every keystroke.

**L5. Characters are counted the same way on both sides.** This is a common global bug:
- HTML `maxlength` and JavaScript `.length` count UTF-16 code units: `😀` = 2, `👨‍👩‍👧` = 8.
- Python `len()` counts code points (`😀` = 1). Java `String.length()` counts UTF-16 units. MySQL/Postgres `VARCHAR(n)` count characters, but byte-limited columns count bytes (`é` = 2 bytes).
- Accented names can be stored precomposed (`é`, 1 code point) or decomposed (`e` + `◌́`, 2 code points).
- Test with the strings in the test data section below. Recommend that client and server count the same unit, ideally user-perceived characters (graphemes, via `Intl.Segmenter`), or at least code points. Normalize text to NFC on the server.

**L6. `type="number"` ignores `maxlength`.** Number inputs need `min`/`max` instead. For phone numbers, card numbers, OTPs, and postcodes, recommend `type="tel"` or `type="text"` with `inputmode="numeric"`, which supports `maxlength` and still shows a number keypad on mobile.

**L7. Trimming is consistent.** If the server trims spaces, the client should count trimmed length too. Otherwise `"  Santhosh  "` is rejected by one side and accepted by the other.

**L8. Minimum length (where it applies) follows the same parity rule** (`minlength` vs. server). Check password and username fields especially.

## Suggested limits (starting points — always confirm with the user)

| Field | Suggest | Why |
|-------|---------|-----|
| Email | 254 | RFC 5321 caps the address path at 256 including `< >`, so the usable maximum is 254 (RFC 3696 errata 1690). |
| Phone (digits) | 15 digits; allow ~20 characters if spaces/`+`/dashes are allowed | ITU-T E.164 caps international numbers at 15 digits. |
| Given name / family name | 50–100 each | Names worldwide can be long and multi-part. Too short excludes real people, which hurts for a global audience. (UK Government guidance uses 35 per name as a minimum to support.) |
| Full name (single field) | 100–150 | Same reason. Prefer one full-name field for global audiences. |
| Password | min 8, max at least 64 | NIST SP 800-63B. Never truncate silently. Note that bcrypt only uses the first 72 bytes, so if the backend uses bcrypt, a limit above 72 bytes needs pre-hashing or a different algorithm. |
| Username | 3–30 | Common practice. No standard exists, so confirm with the user. |
| Postal / ZIP code | 10–12 | Longest national formats are about 10 characters. |
| Address line | 100 | No single global standard. Confirm per region and courier/API limits. |
| URL | 2048 | A practical limit across browsers and servers. |
| Short free text (title, subject) | 100–150 | Readability and display width. |
| Long free text (bio, comment, message) | 500–2000 | Depends on purpose and storage. Pair with a counter (L4). |

When you suggest a limit, give the reason in one line and ask: *"Keep this, or do you have a business rule?"* Business rules (e.g. the payment provider accepts 40 characters, an SMS sender name is 11) override the table.

## Test data

For a limit `N`, test: `N-1`, `N`, `N+1`, a paste of `N+50`, and these strings:
- ASCII: `"A".repeat(N)`
- Emoji: `"😀".repeat(N)`. The client allows only N/2, and the server may allow N. That's a parity issue.
- Family emoji: `👨‍👩‍👧`
- Accented: `José` precomposed and `José` decomposed
- Non-Latin: `Тест`, `テスト`, `संतोष`, `محمد`
- Spaces: `"  " + "A".repeat(N) + "  "`

## How to test — live (browser)

1. Run [scripts/inspect-form.js](../scripts/inspect-form.js) to list each field's `maxlength`, `minlength`, `type`, and `pattern`.
2. **Client check:** type `N+5` characters with the keyboard and confirm `value.length === N`. Paste `N+50` and note whether the user is told the text was cut (L4).
3. **Server check (needs permission):** this means submitting the form. Tell the user what you'll submit and where, prefer local or staging, and wait for a yes. Then either:
   - remove the client limit in the page (`el.removeAttribute('maxlength')`), type `N+1`, and submit; or
   - copy the real submit request from the network log and replay it with `N+1` characters in one field.
   Expected: the server rejects `N+1` with a field-specific message (L3) and accepts exactly `N`. Record the status code and the message.
4. Repeat the server check with the emoji string to catch L5.
5. Check that after a server error the form still holds what the user typed.

## How to test — source code

Build a parity table for each field: **Client limit | Server limit | DB column | Match?**
- Client: `maxlength`, `minLength`/`maxLength` props, zod/yup/Joi/valibot schemas, Angular validators, react-hook-form `rules`.
- Server: DTO annotations (`@Size`, `@MaxLength`, `@Length`), pydantic `Field(max_length=)`, Django `max_length`, Rails `validates :x, length:`, Laravel `max:`, express-validator `isLength`, Go struct tags (`validate:"max=50"`).
- Storage: migrations and schema (`VARCHAR(n)`, `String(n)`, `@Column({ length })`).
- Look for a shared schema (one zod/JSON Schema used by both client and server). If there is one, recommend keeping it; if not, suggest one to stop limits drifting apart.

## Severity guide

- **High:** no server-side limit; DB column smaller than allowed input (500 error or truncation); server error leaks DB/stack details; form clears the user's input on error.
- **Medium:** client looser than server or missing; vague error message; emoji/unicode counting mismatch; `maxlength` on `type="number"` (has no effect).
- **Low:** client stricter than server; no counter on long text fields; message wording inconsistent between client and server.
