# Part 1 — Focus and Cursor

**Goal:** when someone opens a form, they can start typing immediately, with no extra click, and the caret is where they'd want it.

## Rules (expected behavior)

**F1. Auto-focus the first editable field.** When a page or dialog exists mainly to fill in a form (Sign Up, Login, My Profile, Edit Address, Add Card), the first editable field has focus on open without a click.

**F2. "Editable" means any field type the user can change:** text, email, tel, password, number, search, url, date, textarea, select, radio, checkbox, contenteditable. Skip a field if any of these is true:
- `disabled` (including inside a `<fieldset disabled>`), or `aria-disabled="true"`
- `readonly` / `aria-readonly="true"`
- hidden (`type="hidden"`, `display:none`, `visibility:hidden`, zero size, off-screen, `inert`)
- a button (submit, reset, button, image)

If the first field is read-only (e.g. a locked email on a profile), focus goes to the **next** editable field.

**F3. Prefilled text → caret at the END, nothing selected.** On a profile form where First name = `Santhosh`, the caret sits after the `h`, so the user can correct or extend it with no extra keys.
- Defect: caret at the start (`|Santhosh`). The user has to press End or click.
- Defect: whole text selected. One accidental keystroke wipes the value.
- Don't rely on the browser: Chromium's `autofocus` attribute places the caret at the **start** of a prefilled value (verified 2026-10). Code must move the caret explicitly.
- This applies even when *every* field is already filled. Opening "My Profile" signals intent to edit, so focus the first editable field rather than jumping to the first empty one.

**F4. Multiple forms on one page → focus the form matching the user's intent.** "My Profile" clicked → profile form, even if a Change Password form is also on the page. Never focus header search boxes, newsletter footers, chat widgets, or cookie banners. **ASK** the user if the primary form isn't obvious from the entry action.

**F5. Mobile and hybrid → ASK per form.** On touch devices, auto-focus opens the on-screen keyboard, which can hide the heading, instructions, or half the form. Tell the user this and ask whether this form should auto-focus on mobile too or on desktop only. Record the answer. Don't report missing mobile auto-focus as a defect until the user decides. Note: iOS Safari and many WebViews ignore programmatic focus that isn't triggered by a user tap, so test on a real device or simulator, not only a resized desktop browser.

**F6. Accessibility checks that go with auto-focus.** Auto-focus makes screen-reader users land on the field and skip whatever is above it. So also verify:
- The focused field has a programmatic label (`<label for>`, `aria-label`, or `aria-labelledby`). A placeholder alone isn't enough.
- Instructions or a heading above the form that matter (e.g. "All fields required", password rules) are connected with `aria-describedby`, or the form/dialog has an accessible name.
- A visible focus indicator is shown (no `outline: none` without a replacement).
- The page doesn't jump-scroll in a disorienting way. If the form is below the fold, focusing it can scroll past important content.

## Edge cases to test

| Case | What goes wrong |
|------|-----------------|
| SPA route change (React/Vue/Angular router) | The HTML `autofocus` attribute only works on initial page load, so it does nothing when navigating inside the app. Test by clicking the entry link, not only by reloading. |
| Modal / dialog form | Focus should move into the dialog's first editable field and return to the trigger button on close. |
| Data loads asynchronously (profile fetched after render) | Focus happens on an empty field, then the value arrives and the caret is left at the start, or a re-render drops focus completely. |
| User already clicked or typed elsewhere before a delayed focus fires | Delayed focus must not steal focus from the user. |
| Browser autofill fills the field | The caret should still end up at the end, and autofill shouldn't be overwritten. |
| `type="email"` / `type="number"` | These don't support `setSelectionRange`. Code that uses it throws an error or silently leaves the caret at the start. |
| RTL languages (Arabic, Hebrew) | "End" is the logical end of the text, which is visually on the left. Check that the caret follows the text direction. |
| Multiple `autofocus` attributes | Only the first one in the DOM wins. Check that it's the intended one. |

## How to test — live (browser)

1. Open the page the way a user would: start on the previous page and click the entry action. Repeat once with a full reload of the form URL.
2. **Don't click anything on the form.** Wait for network idle, about 1–2 seconds.
3. Run [scripts/inspect-form.js](../scripts/inspect-form.js) in the page. It reports every form, its fields, which ones are editable, the first editable field, `document.activeElement`, and the caret position (`selectionStart`, `selectionEnd`, `value.length`).
4. Compare the results with F1–F4:
   - `activeElement` is `body` or not the expected field → F1 defect.
   - `selectionStart === selectionEnd === value.length` → caret at end ✓.
   - `selectionStart === 0` with a non-empty value → F3 defect (caret at start).
   - `selectionStart === 0 && selectionEnd === value.length` → F3 defect (text selected).
5. **Email/number fields** return `null` for caret position, and pressing navigation keys would move the caret and spoil the result. Instead, type one marker character `Z` with the keyboard, read `value`, then press Backspace once to restore it.
   - `Santhosh` → `SanthoshZ`: caret was at the end ✓
   - `ZSanthosh`: caret was at the start ✗
   - `Z` alone: the text was selected and got replaced ✗
6. Take a screenshot as evidence. The caret and focus ring should be visible.
7. If mobile is in scope and the user said yes for F5, repeat on a simulator or device.

## How to test — source code

Search for where focus is set:
- HTML: `autofocus`
- React: `autoFocus`, `ref.current.focus()`, `useEffect(... focus`
- Vue: `v-focus`, `$refs.x.focus()`, `onMounted`
- Angular: `cdkFocusInitial`, `cdkTrapFocus`, `.nativeElement.focus()`
- UI libraries: MUI `autoFocus`, Headless UI / Radix `initialFocus`, Ionic `setFocus()`

For each form, check:
- Is focus set after async data has loaded, not before?
- Is the caret moved to the end after focusing a prefilled field?
- Are read-only and disabled fields skipped?
- In an SPA, does focus run on route entry, not only on first load?

## Reference fix (offer, adapt to the user's framework)

```js
function isEditable(el) {
  if (el.matches(':disabled') || el.readOnly) return false;
  if (el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true') return false;
  if (['hidden', 'submit', 'reset', 'button', 'image'].includes(el.type)) return false;
  if (el.closest('[inert]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function focusFirstEditable(form) {
  if (form.contains(document.activeElement)) return; // don't steal focus the user already moved
  const el = [...form.elements].find(isEditable);
  if (!el) return;
  el.focus();
  if (typeof el.value === 'string' && el.value.length) {
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);           // text, search, tel, url, password, textarea
    } catch {
      const v = el.value; el.value = ''; el.value = v; // email/number: re-setting value moves caret to end
    }
  }
}
// Call after the form's data has loaded and on every route entry (not only page load).
```

Verify the fix in each target browser. The `value` re-set trick for email/number fields works in Chromium and Firefox. Confirm it in Safari/WebKit as well.

## Severity guide

- **High:** focus lands on the wrong form, on a hidden field, or steals focus while the user is typing.
- **Medium:** no auto-focus on a single-purpose form (desktop); caret at start or text selected on a prefilled field; read-only field focused.
- **Low:** missing focus indicator styling polish, minor scroll jump.
- Missing label on the focused field is an accessibility defect, at least **Medium**.
