import { launch, reachForm, locateForm, load, settle, sleep, fieldLocator } from './browser.js';
import { focusState, fieldFeedback } from './page.js';
import { sized } from '../rules.js';
import { limitsFor, valueFor } from './cases.js';
import { capture, judge, canReplay, validValue } from './replay.js';
import { captureRecord } from './replay-core.js';
import { suites, cases as caseStore, runs, results, consents } from '../db.js';

// Runs every enabled case of a suite. Emits progress lines through `log`.
export async function runSuite(suiteId, runId, log = () => {}) {
  const suite = suites.get(suiteId);
  const all = caseStore.forSuite(suiteId).filter((c) => c.enabled);
  const counts = { pass: 0, fail: 0, warn: 0, not_verified: 0 };
  const captures = {};
  const delayMs = throttleOf(suite);
  const save = (c, r) => {
    counts[r.status]++;
    results.save(runId, c.id, r.status, r.detail, r.evidence);
    log(`${icon[r.status]} ${c.title} — ${r.detail}`);
  };
  const { browser, context } = await launch(suite.session);
  const page = await context.newPage();
  try {
    for (const form of suite.forms) {
      const list = all.filter((c) => c.form_key === form.key);
      if (!list.length) continue;
      log(`▶ ${form.title} (${list.length} cases)`);
      const field = (k) => form.fields.find((f) => f.key === k);

      // Parts 1 & 2 and focus-type custom cases: browser-only checks.
      for (const c of list.filter((x) => x.part !== 3 && !isServerCustom(x))) {
        try { save(c, await browserCase(page, suite, form, c, field(c.field_key))); }
        catch (e) { save(c, { status: 'not_verified', detail: `Could not run: ${e.message.split('\n')[0]}` }); }
      }

      // Part 3 and Accepted/Rejected custom cases: one capture, then replays.
      const server = list.filter((x) => x.part === 3 || isServerCustom(x));
      if (!server.length) continue;
      if (!consents.has(suite.origin)) {
        for (const c of server) save(c, { status: 'not_verified', detail: `Replays not approved for ${suite.origin}.` });
        continue;
      }
      if (form.flags.captcha || form.flags.risky) {
        const why = form.flags.captcha ? 'The form has a CAPTCHA; Sankalpa never solves or bypasses CAPTCHAs.' : 'Risky form (payment/delete); never replayed.';
        for (const c of server) save(c, { status: 'not_verified', detail: why });
        continue;
      }
      log(`  capturing one real submit… (then ${delayMs} ms between requests)`);
      await reachForm(page, form);
      const live = await locateForm(page, form);
      const cap = live ? await capture(page, live.index, form) : null;
      if (cap) captures[form.key] = captureRecord(cap);
      if (cap) log(`  captured ${cap.requests.length} request(s): ${cap.requests.map((r) => `${r.method} ${new URL(r.url).pathname} → ${r.status}`).join(', ') || 'none'}`);
      for (const c of server) {
        const f = field(c.field_key);
        if (!cap || !f || !canReplay(cap, f)) {
          const why = cap?.requests.length ? `"${f?.label || c.field_key}" was not found in the submitted request.`
            : cap?.blocked?.disabled ? `The submit button stayed disabled after filling valid test values${cap.blocked.invalid.length ? ` (still invalid: ${cap.blocked.invalid.join(', ')})` : ''}. The form may need steps Sankalpa can't do (e.g. a lookup first).`
            : 'Submitting the form sent no request.';
          save(c, { status: 'not_verified', detail: why });
          continue;
        }
        const lim = limitsFor(form, f, suite.settings);
        const value = valueFor(c.input_kind, f, lim, validValue(f), c.input_value, sized);
        try { save(c, await judge(page, cap, form, f, c.expected, value, { delayMs })); }
        catch (e) { save(c, { status: 'not_verified', detail: `Replay failed: ${e.message.split('\n')[0]}` }); }
        await sleep(delayMs);
      }
    }
    runs.finish(runId, 'done', { ...counts, captures });
  } catch (e) {
    runs.finish(runId, 'error', { ...counts, captures, error: e.message });
    throw e;
  } finally {
    await browser.close();
  }
  return counts;
}

export const throttleOf = (suite) => Math.min(60000, Math.max(0, Number(suite.settings?.throttleMs ?? 300)));
const icon = { pass: '✅', fail: '❌', warn: '⚠️', not_verified: '⏸' };
const isServerCustom = (c) => !c.builtin && (c.expected === 'Accepted' || c.expected === 'Rejected');

async function openForm(page, form) {
  const how = await reachForm(page, form);
  const live = await locateForm(page, form);
  if (!live) throw new Error('form not found on the page');
  return { how, live };
}

async function browserCase(page, suite, form, c, f) {
  const lim = f ? limitsFor(form, f, suite.settings) : {};
  switch (c.kind) {
    case 'focus_on_open':
    case 'caret_end':
    case 'custom': {
      if (!['Field focused on open', 'Cursor at end'].includes(c.expected)) break;
      const { how, live } = await openForm(page, form);
      const viaLink = await page.evaluate(focusState);
      await load(page, form.url);
      await locateForm(page, form);
      const afterReload = await page.evaluate(focusState);
      const evidence = { reachedBy: how, focusedAfterLink: viaLink.desc, focusedAfterReload: afterReload.desc, expectedField: f?.label || c.field_key };
      if (c.expected === 'Field focused on open' || c.kind === 'focus_on_open') {
        const ok1 = viaLink.key === c.field_key, ok2 = afterReload.key === c.field_key;
        if (ok1 && ok2) return { status: 'pass', detail: `Focused after ${how} and after a reload.`, evidence };
        return { status: 'fail', detail: `Expected "${f?.label || c.field_key}" to be focused. After ${how}: ${viaLink.desc}. After reload: ${afterReload.desc}. Users need an extra click.`, evidence };
      }
      // Cursor at end
      await openForm(page, form);
      const st = await page.evaluate(focusState);
      if (st.key !== c.field_key) return { status: 'fail', detail: `"${f?.label || c.field_key}" is not focused on open (${st.desc}), so the cursor isn't in it.`, evidence: { ...evidence, live: live.index } };
      if (!st.valueLength) return { status: 'pass', detail: 'Field is empty, so the cursor is at the end.', evidence: st };
      if (st.selection) {
        const [s, e] = st.selection, n = st.valueLength;
        if (s === n && e === n) return { status: 'pass', detail: 'Cursor is after the last character.', evidence: st };
        return { status: 'fail', detail: s === 0 && e === n ? 'The whole text is selected; one keystroke wipes it.' : `Cursor is at position ${s} of ${n}, not at the end.`, evidence: st };
      }
      await page.keyboard.type('Z');
      const v = await fieldLocator(page, live.index, c.field_key).inputValue();
      await page.keyboard.press('Backspace');
      return v.endsWith('Z') && v.length === st.valueLength + 1
        ? { status: 'pass', detail: 'Cursor is after the last character (checked by typing one character).', evidence: { value: v.length } }
        : { status: 'fail', detail: 'Cursor is not at the end (checked by typing one character).', evidence: { value: v.length } };
    }
    case 'labels': {
      const missing = form.fields.filter((x) => !x.hasLabel && !x.disabled && !x.readOnly).map((x) => x.key);
      return missing.length
        ? { status: 'fail', detail: `No label for: ${missing.join(', ')}. Screen-reader users won't know what to type.`, evidence: { missing } }
        : { status: 'pass', detail: 'All fields have labels.', evidence: {} };
    }
    case 'has_limit': {
      return { status: 'fail', detail: `No length limit in the browser${f.suggested ? `. Suggested ${f.suggested.max}: ${f.suggested.reason}` : ''}`, evidence: { suggested: f.suggested } };
    }
    case 'client_max': {
      const { live } = await openForm(page, form);
      const loc = fieldLocator(page, live.index, f.key);
      await loc.click({ timeout: 3000 }).catch(() => loc.focus());
      await page.keyboard.type(sized(f, lim.max + 5, 'c'));
      const during = await page.evaluate(fieldFeedback, f.key);
      await loc.evaluate((el) => el.blur()); await sleep(250);
      const after = await page.evaluate(fieldFeedback, f.key);
      const evidence = { limit: lim.max, typed: lim.max + 5, kept: during.valueLength, errorAfterLeaving: after.error };
      if (during.valueLength <= lim.max) return { status: 'pass', detail: `Typed ${lim.max + 5}, browser kept ${during.valueLength}.`, evidence };
      if (after.invalid && after.error) return { status: 'warn', detail: `Typed ${lim.max + 5} and all were kept; the error "${after.error}" only appears after leaving the field. Add maxlength="${lim.max}".`, evidence };
      return { status: 'fail', detail: `Typed ${lim.max + 5} and all were kept, with no error.${lim.fromClient ? '' : ` (Agreed limit ${lim.max}.)`}`, evidence };
    }
    case 'emoji': {
      const { live } = await openForm(page, form);
      const loc = fieldLocator(page, live.index, f.key);
      await loc.click({ timeout: 3000 }).catch(() => loc.focus());
      await page.keyboard.insertText('😀'.repeat(lim.max));
      await loc.evaluate((el) => el.blur()); await sleep(250);
      const fb = await page.evaluate(fieldFeedback, f.key);
      const evidence = { typed: lim.max, keptEmoji: fb.codePoints, utf16: fb.valueLength, invalid: fb.invalid, error: fb.error, counter: fb.counter };
      if (fb.codePoints === lim.max && !fb.invalid) return { status: 'pass', detail: `${lim.max} emoji accepted.`, evidence };
      if (fb.codePoints < lim.max) return { status: 'fail', detail: `Typed ${lim.max} emoji, only ${fb.codePoints} kept (no message). The browser counts each emoji as 2 characters.`, evidence };
      return { status: 'fail', detail: `${lim.max} emoji marked invalid${fb.error ? `: "${fb.error}"` : ''}. The rule counts each emoji as 2 characters.`, evidence };
    }
    case 'counter': {
      const shown = f.probe.counter.of;
      return shown === lim.max
        ? { status: 'pass', detail: `Counter shows /${shown}.`, evidence: f.probe.counter }
        : { status: 'fail', detail: `Counter shows "/${shown}" but the real limit is ${lim.max ?? 'not set'}. Users think they've hit the limit early (or late).`, evidence: f.probe.counter };
    }
  }
  return { status: 'not_verified', detail: 'Unknown case type.' };
}

export { settle };
