// The panel's "API": the same operations as the web app's HTTP routes, run locally in the extension.
import { suites, cases, runs, results, consents } from './store.js';
import { Tab, rpc } from './tab.js';
import { discover as discoverForms } from './discover.js';
import { runSuite as runEngine } from './run.js';
import { builtInCases, limitsFor, testable, replayable } from './shared/engine/cases.js';
import { PRESETS, EXPECTED, isLocalHost } from './shared/rules.js';
import { buildMarkdown } from './shared/report-md.js';
import { reachForm, locateForm } from './tab.js';

// Background jobs (discovery, runs) with live log lines.
function startJob(fn) {
  const job = { status: 'running', logs: [], forms: [], result: null, error: null, subs: new Set(), stop: false };
  const emit = (ev, data) => job.subs.forEach((s) => s(ev, data));
  const log = (line) => { job.logs.push(line); emit('log', line); };
  log.form = (form) => { job.forms.push(form); emit('form', form); };
  log.status = (st) => { job.lastStatus = st; emit('status', st); };
  log.found = () => job.forms;
  log.stopped = () => job.stop;
  job.subscribe = (s) => { job.logs.forEach((l) => s('log', l)); job.forms.forEach((f) => s('form', f)); if (job.lastStatus) s('status', job.lastStatus); if (job.status !== 'running') s(job.status, job.result ?? job.error); else job.subs.add(s); };
  fn(log).then((r) => { job.status = 'done'; job.result = r; emit('done', r); })
    .catch((e) => { job.status = 'failed'; job.error = e.message; log(`Error: ${e.message}`); emit('failed', e.message); })
    .finally(() => job.subs.clear());
  return job;
}
export const jobs = new Map();
let jobSeq = 0;
const track = (job) => { const id = String(++jobSeq); jobs.set(id, job); return id; };

export const meta = () => ({ presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.label])), expected: EXPECTED });

// Site access: localhost is built in; other sites are asked for once, in a small window.
export async function ensureAccess(origin, { debuggerPerm = false } = {}) {
  const host = new URL(origin).hostname;
  const needSite = !(isLocalHost(host) && /^https?:$/.test(new URL(origin).protocol)) && !(await rpc('hasAccess', { origin }));
  const needDbg = debuggerPerm && !(await rpc('hasDebugger'));
  if (!needSite && !needDbg) return true;
  const want = { origins: needSite ? [`${origin}/*`] : [], permissions: needDbg ? ['debugger'] : [] };
  if (chrome.permissions?.request) { // panel opened as a normal tab: ask directly
    try { return await chrome.permissions.request(want); } catch { /* fall through to the window */ }
  }
  return rpc('requestAccess', { origin: needSite ? origin : null, debuggerPerm: needDbg });
}

export function discover(tabId, { url, pageLimit }) {
  const tab = new Tab(tabId);
  return track(startJob(async (log) => {
    const back = await tab.url().catch(() => null);
    try { return await discoverForms(tab, { startUrl: url, pageLimit: Math.min(Number(pageLimit) || 30, 200), log, onForm: log.form, shouldStop: log.stopped, onStatus: log.status }); }
    catch (e) { // never lose what was found
      log(`The scan stopped because of an error: ${e.message}`);
      return { origin: new URL(url).origin, startUrl: url, pages: tab.lastPages || 0, forms: log.found(), stopped: true, error: e.message };
    }
    finally { if (back) await tab.load(back).catch(() => {}); }
  }));
}

export const stopJob = (jobId) => { const j = jobs.get(jobId); if (j) j.stop = true; };

// Opens the form in the tab and outlines one field. Returns the live form index (for "Inspect").
export async function showField(tabId, form, key) {
  const tab = new Tab(tabId);
  const here = await tab.url().catch(() => '');
  let live = here === form.url ? await locateForm(tab, form) : null;
  if (!live) { await reachForm(tab, form); live = await locateForm(tab, form); }
  if (!live) throw new Error('The form is not on the page any more.');
  await tab.call('highlight', live.index, key);
  return live.index;
}

export const listSuites = () => suites.list();

export async function createSuite({ name, startUrl, forms, parts, settings, consent }) {
  const origin = new URL(startUrl).origin;
  if (consent && parts.includes(3)) await consents.grant(origin);
  const id = await suites.create({ name: name || new URL(startUrl).host, origin, start_url: startUrl, settings, forms });
  for (const f of forms) for (const c of builtInCases(f, settings, parts)) await cases.add({ ...c, suite_id: id });
  return id;
}

export async function getSuite(id) {
  const s = await suites.get(Number(id));
  if (!s) throw new Error('Suite not found');
  return {
    id: s.id, name: s.name, origin: s.origin, start_url: s.start_url, created_at: s.created_at, settings: s.settings, fullForms: s.forms,
    consent: await consents.get(s.origin),
    forms: s.forms.map((f) => ({
      key: f.key, title: f.title, url: f.url, flags: f.flags, replayable: replayable(f),
      fields: f.fields.filter(testable).map((x) => ({ key: x.key, label: x.label || x.key, limit: limitsFor(f, x, s.settings) })),
      focusFields: f.fields.filter((x) => !x.disabled && !x.readOnly).map((x) => ({ key: x.key, label: x.label || x.key })),
    })),
    cases: await cases.forSuite(s.id), runs: await runs.forSuite(s.id),
  };
}

export const deleteSuite = (id) => suites.remove(Number(id));
export const updateSettings = (id, { throttleMs }) => suites.updateSettings(Number(id), { throttleMs: Math.min(60000, Math.max(0, Math.round(Number(throttleMs) || 0))) });
export const setCaseEnabled = (id, enabled) => cases.setEnabled(Number(id), enabled);
export const removeCase = (id) => cases.remove(Number(id));

export async function addCase(suiteId, { form_key, field_key, input_kind, input_value, expected }) {
  if (!EXPECTED.includes(expected)) throw new Error('Unknown expected result');
  const s = await suites.get(Number(suiteId));
  const field = s.forms.find((f) => f.key === form_key)?.fields.find((f) => f.key === field_key);
  if (!field) throw new Error('Unknown form or field');
  const server = expected === 'Accepted' || expected === 'Rejected';
  const input = server ? (input_kind === 'custom' ? `"${(input_value || '').slice(0, 30)}"` : PRESETS[input_kind]?.label) : null;
  const title = server ? `${field.label || field.key}: ${input} → ${expected}` : `${field.label || field.key}: ${expected}`;
  return cases.add({ suite_id: s.id, form_key, field_key, part: server ? 3 : 1, kind: 'custom', title, input_kind: server ? input_kind : null, input_value: input_kind === 'custom' ? input_value : null, expected, builtin: false });
}

export async function runSuite(tabId, suiteId) {
  const s = await suites.get(Number(suiteId));
  const realTyping = !!s.settings.realTyping && (await rpc('hasDebugger'));
  const runId = await runs.start(s.id);
  const jobId = track(startJob((log) => runEngine(tabId, s.id, runId, { realTyping, log })));
  return { runId, jobId };
}

const BAD = new Set(['fail', 'warn']);
export async function getRun(id) {
  const run = await runs.get(Number(id));
  if (!run) throw new Error('Run not found');
  const suite = await suites.get(run.suite_id);
  const byCase = new Map((await cases.forSuite(run.suite_id)).map((c) => [c.id, c]));
  const prevId = await runs.previous(run.suite_id, run.id);
  const prev = new Map(prevId ? (await results.forRun(prevId)).map((r) => [r.case_id, r.status]) : []);
  const rows = (await results.forRun(run.id)).map((r) => {
    const c = byCase.get(r.case_id) || { title: '(deleted case)', form_key: '?' };
    const before = prev.get(r.case_id);
    let change = null;
    if (prevId && before) {
      if (BAD.has(before) && r.status === 'pass') change = 'fixed';
      else if (!BAD.has(before) && BAD.has(r.status)) change = 'new failure';
      else if (BAD.has(before) && BAD.has(r.status)) change = 'still failing';
    } else if (prevId && BAD.has(r.status)) change = 'new failure';
    return { ...r, case: c, change };
  });
  const formTitle = Object.fromEntries(suite.forms.map((f) => [f.key, f.title]));
  const fieldLabel = Object.fromEntries(suite.forms.map((f) => [f.key, Object.fromEntries(f.fields.map((x) => [x.key, x.label || x.key]))]));
  return { run, suite: { id: suite.id, name: suite.name, origin: suite.origin }, previousRunId: prevId, rows, formTitle, fieldLabel, forms: suite.forms, settings: suite.settings, consent: await consents.get(suite.origin) };
}

export async function markdownReport(id, ideas = []) {
  return buildMarkdown(await getRun(id), { generator: 'the Sankalpa browser extension', ideas });
}
