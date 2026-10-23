// Runs a suite in the browser extension. Same cases and verdicts as form-scanner/src/engine/run.js.
import { Tab, reachForm, locateForm, sleep } from './tab.js';
import { sized, isTextField } from './shared/rules.js';
import { limitsFor, valueFor } from './shared/engine/cases.js';
import { validValue, analyzeCapture, judge, canReplay, captureRecord } from './shared/engine/replay-core.js';
import { suites, cases as caseStore, runs, results, consents } from './store.js';

const icon = { pass: '✅', fail: '❌', warn: '⚠️', not_verified: '⏸' };
const isServerCustom = (c) => !c.builtin && (c.expected === 'Accepted' || c.expected === 'Rejected');

export async function runSuite(tabId, suiteId, runId, { realTyping = false, log = () => {} } = {}) {
  const suite = await suites.get(suiteId);
  const all = (await caseStore.forSuite(suiteId)).filter((c) => c.enabled);
  const tab = new Tab(tabId, { realTyping });
  const counts = { pass: 0, fail: 0, warn: 0, not_verified: 0 };
  const captures = {};
  const delayMs = Math.min(60000, Math.max(0, Number(suite.settings?.throttleMs ?? 300)));
  const save = async (c, r) => {
    counts[r.status]++;
    await results.save(runId, c.id, r.status, r.detail, r.evidence);
    log(`${icon[r.status]} ${c.title} — ${r.detail}`);
  };
  const startUrl = await tab.url().catch(() => suite.start_url);
  log(realTyping ? 'Typing tests use the real keyboard (Chrome debugger, attached only while typing).' : 'Typing tests are emulated (browser rules applied exactly; no debugger).');
  try {
    for (const form of suite.forms) {
      const list = all.filter((c) => c.form_key === form.key);
      if (!list.length) continue;
      log(`▶ ${form.title} (${list.length} cases)`);
      const field = (k) => form.fields.find((f) => f.key === k);

      for (const c of list.filter((x) => x.part !== 3 && !isServerCustom(x))) {
        try { await save(c, await browserCase(tab, suite, form, c, field(c.field_key))); }
        catch (e) { await save(c, { status: 'not_verified', detail: `Could not run: ${e.message}` }); }
      }

      const server = list.filter((x) => x.part === 3 || isServerCustom(x));
      if (!server.length) continue;
      if (!(await consents.has(suite.origin))) {
        for (const c of server) await save(c, { status: 'not_verified', detail: `Server checks not approved for ${suite.origin}.` });
        continue;
      }
      if (form.flags.captcha || form.flags.risky) {
        const why = form.flags.captcha ? 'The form has a CAPTCHA; Sankalpa never solves or bypasses CAPTCHAs.' : 'Risky form (payment/delete); never replayed.';
        for (const c of server) await save(c, { status: 'not_verified', detail: why });
        continue;
      }
      log(`  capturing one real submit… (then ${delayMs} ms between requests)`);
      const cap = await capture(tab, form).catch((e) => { log(`  capture failed: ${e.message}`); return null; });
      if (cap) captures[form.key] = captureRecord(cap);
      if (cap) log(`  captured ${cap.requests.length} request(s): ${cap.requests.map((r) => `${r.method} ${new URL(r.url).pathname} → ${r.status ?? 'page load'}`).join(', ') || 'none'}`);
      for (const c of server) {
        const f = field(c.field_key);
        if (!cap || !f || !canReplay(cap, f)) {
          const why = cap?.requests.length ? `"${f?.label || c.field_key}" was not found in the submitted request.`
            : cap?.blocked?.disabled ? `The submit button stayed disabled after filling valid test values${cap.blocked.invalid.length ? ` (still invalid: ${cap.blocked.invalid.join(', ')})` : ''}. The form may need steps Sankalpa can't do (e.g. a lookup first).`
            : 'Submitting the form sent no request.';
          await save(c, { status: 'not_verified', detail: why });
          continue;
        }
        const lim = limitsFor(form, f, suite.settings);
        const value = valueFor(c.input_kind, f, lim, validValue(f), c.input_value, sized);
        try { await save(c, await judge((spec) => tab.replay(spec), cap, form, f, c.expected, value, { delayMs })); }
        catch (e) { await save(c, { status: 'not_verified', detail: `Replay failed: ${e.message}` }); }
        await sleep(delayMs);
      }
    }
    await runs.finish(runId, 'done', { ...counts, captures });
  } catch (e) {
    await runs.finish(runId, 'error', { ...counts, captures, error: e.message });
    throw e;
  } finally {
    if (startUrl) await tab.load(startUrl).catch(() => {}); // put the tab back where the user was
  }
  return counts;
}

async function openForm(tab, form) {
  const how = await reachForm(tab, form);
  const live = await locateForm(tab, form);
  if (!live) throw new Error('form not found on the page');
  return { how, live };
}

// Fill with unique valid values, submit once, record what the page sent.
async function capture(tab, form) {
  await reachForm(tab, form);
  const live = await locateForm(tab, form);
  if (!live) throw new Error('form not found on the page');
  await tab.main('cap.install');
  await tab.main('cap.clear');
  const markers = {};
  for (const f of form.fields) {
    if (f.readOnly || f.disabled) continue;
    if (isTextField(f) && !f.repeatOf) { markers[f.key] = validValue(f); await tab.call('setValue', f.key, markers[f.key], true); }
    else if (f.type === 'select') await tab.call('pickOption', f.key);
    else if ((f.type === 'checkbox' || f.type === 'radio') && f.required) await tab.call('check', f.key);
    else if (f.type === 'number') await tab.call('setValue', f.key, '7', true);
    else if (f.type === 'date') await tab.call('setValue', f.key, '2000-01-01', true);
  }
  for (const f of form.fields.filter((x) => x.repeatOf && markers[x.repeatOf])) {
    markers[f.key] = markers[f.repeatOf];
    await tab.call('setValue', f.key, markers[f.key], true);
  }
  await sleep(200);
  const blocked = await tab.call('submitState', live.index);
  await tab.call('clickSubmit', live.index);
  await sleep(1500);
  await tab.settle(500);
  const raw = await tab.main('cap.read');
  return { markers, blocked, ...analyzeCapture(markers, raw) };
}

async function typeInto(tab, key, text) {
  if (tab.realTyping) {
    await tab.call('focusField', key);
    await tab.withKeyboard((kb) => kb.insert(text));
    return 'real keyboard';
  }
  await tab.call('typeEmulated', key, text);
  return 'emulated';
}

async function browserCase(tab, suite, form, c, f) {
  const lim = f ? limitsFor(form, f, suite.settings) : {};
  switch (c.kind) {
    case 'focus_on_open':
    case 'caret_end':
    case 'custom': {
      if (!['Field focused on open', 'Cursor at end'].includes(c.expected)) break;
      const { how } = await openForm(tab, form);
      const viaLink = await tab.call('focusState');
      await tab.load(form.url);
      await locateForm(tab, form);
      const afterReload = await tab.call('focusState');
      const evidence = { reachedBy: how, focusedAfterLink: viaLink.desc, focusedAfterReload: afterReload.desc, expectedField: f?.label || c.field_key };
      if (c.expected === 'Field focused on open' || c.kind === 'focus_on_open') {
        if (viaLink.key === c.field_key && afterReload.key === c.field_key) return { status: 'pass', detail: `Focused after ${how} and after a reload.`, evidence };
        return { status: 'fail', detail: `Expected "${f?.label || c.field_key}" to be focused. After ${how}: ${viaLink.desc}. After reload: ${afterReload.desc}. Users need an extra click.`, evidence };
      }
      await openForm(tab, form);
      const st = await tab.call('focusState');
      if (st.key !== c.field_key) return { status: 'fail', detail: `"${f?.label || c.field_key}" is not focused on open (${st.desc}), so the cursor isn't in it.`, evidence };
      if (!st.valueLength) return { status: 'pass', detail: 'Field is empty, so the cursor is at the end.', evidence: st };
      if (st.selection) {
        const [s, e] = st.selection, n = st.valueLength;
        if (s === n && e === n) return { status: 'pass', detail: 'Cursor is after the last character.', evidence: st };
        return { status: 'fail', detail: s === 0 && e === n ? 'The whole text is selected; one keystroke wipes it.' : `Cursor is at position ${s} of ${n}, not at the end.`, evidence: st };
      }
      if (!tab.realTyping) return { status: 'not_verified', detail: 'Email/number fields hide the cursor position. Switch on "Type with a real keyboard" for this check.', evidence: st };
      const before = st.valueLength;
      const v = await tab.withKeyboard(async (kb) => { await kb.insert('Z'); const val = await tab.call('value', c.field_key); await kb.key('Backspace'); return val; });
      return v?.endsWith('Z') && v.length === before + 1
        ? { status: 'pass', detail: 'Cursor is after the last character (checked by typing one character).', evidence: { typing: 'real keyboard' } }
        : { status: 'fail', detail: 'Cursor is not at the end (checked by typing one character).', evidence: { typing: 'real keyboard' } };
    }
    case 'labels': {
      const missing = form.fields.filter((x) => !x.hasLabel && !x.disabled && !x.readOnly).map((x) => x.key);
      return missing.length
        ? { status: 'fail', detail: `No label for: ${missing.join(', ')}. Screen-reader users won't know what to type.`, evidence: { missing } }
        : { status: 'pass', detail: 'All fields have labels.', evidence: {} };
    }
    case 'has_limit':
      return { status: 'fail', detail: `No length limit in the browser${f.suggested ? `. Suggested ${f.suggested.max}: ${f.suggested.reason}` : ''}`, evidence: { suggested: f.suggested } };
    case 'client_max': {
      await openForm(tab, form);
      const typing = await typeInto(tab, f.key, sized(f, lim.max + 5, 'c'));
      const during = await tab.call('fieldFeedback', f.key);
      await tab.call('blurField', f.key); await sleep(250);
      const after = await tab.call('fieldFeedback', f.key);
      const evidence = { typing, limit: lim.max, typed: lim.max + 5, kept: during.valueLength, errorAfterLeaving: after.error };
      const how = typing === 'emulated' ? ' (emulated typing)' : '';
      if (during.valueLength <= lim.max) return { status: 'pass', detail: `Typed ${lim.max + 5}, browser kept ${during.valueLength}${how}.`, evidence };
      if (after.invalid && after.error) return { status: 'warn', detail: `Typed ${lim.max + 5} and all were kept; the error "${after.error}" only appears after leaving the field. Add maxlength="${lim.max}"${how}.`, evidence };
      return { status: 'fail', detail: `Typed ${lim.max + 5} and all were kept, with no error${lim.fromClient ? '' : ` (agreed limit ${lim.max})`}${how}.`, evidence };
    }
    case 'emoji': {
      await openForm(tab, form);
      const typing = await typeInto(tab, f.key, '😀'.repeat(lim.max));
      await tab.call('blurField', f.key); await sleep(250);
      const fb = await tab.call('fieldFeedback', f.key);
      const how = typing === 'emulated' ? ' (emulated typing)' : '';
      const evidence = { typing, typed: lim.max, keptEmoji: fb.codePoints, utf16: fb.valueLength, invalid: fb.invalid, error: fb.error, counter: fb.counter };
      if (fb.codePoints === lim.max && !fb.invalid) return { status: 'pass', detail: `${lim.max} emoji accepted${how}.`, evidence };
      if (fb.codePoints < lim.max) return { status: 'fail', detail: `Typed ${lim.max} emoji, only ${fb.codePoints} kept (no message). The browser counts each emoji as 2 characters${how}.`, evidence };
      return { status: 'fail', detail: `${lim.max} emoji marked invalid${fb.error ? `: "${fb.error}"` : ''}. The rule counts each emoji as 2 characters${how}.`, evidence };
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
