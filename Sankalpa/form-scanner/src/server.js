#!/usr/bin/env node
// Sankalpa — local web app. Serves the dashboard and a small JSON API.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { suites, cases, runs, consents } from './db.js';
import { discover } from './engine/discover.js';
import { builtInCases, limitsFor, testable, replayable } from './engine/cases.js';
import { runSuite } from './engine/run.js';
import { runDetail, markdownReport } from './report.js';
import { isLocalHost, PRESETS, EXPECTED } from './rules.js';
import { listModels, chat } from '../public/ai.js';

const PORT = Number(process.env.PORT || 4000);
const HOST = '127.0.0.1'; // local only
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// ---- background jobs (discovery, runs) with live logs over server-sent events
const jobs = new Map();
let jobSeq = 0;
function startJob(fn) {
  const id = String(++jobSeq);
  const job = { id, status: 'running', logs: [], forms: [], result: null, error: null, listeners: new Set(), stop: false };
  const emit = (event, data) => { for (const res of job.listeners) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const log = (line) => { job.logs.push(line); emit('log', line); };
  log.form = (form) => { job.forms.push(form); emit('form', form); };
  log.stopped = () => job.stop;
  log.status = (st) => { job.lastStatus = st; emit('status', st); };
  jobs.set(id, job);
  fn(log).then((r) => { job.status = 'done'; job.result = r; emit('done', r ?? null); })
    .catch((e) => { job.status = 'error'; job.error = e.message; log(`Error: ${e.message.split('\n')[0]}`); emit('failed', e.message); })
    .finally(() => { for (const res of job.listeners) res.end(); job.listeners.clear(); });
  return job;
}

// ---- "log in yourself": a visible browser window; we only keep the resulting session
const logins = new Map();
const sessions = new Map();
let seq = 0;

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler });

route('GET', '/api/meta', () => ({ presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.label])), expected: EXPECTED }));

route('POST', '/api/discover', ({ body }) => {
  const url = new URL(body.url);
  const session = body.sessionId ? sessions.get(body.sessionId) : null;
  let job = null;
  job = startJob(async (log) => {
    await Promise.resolve(); // let `job` be assigned first
    try { return await discover({ startUrl: url.href, pageLimit: Math.min(Number(body.pageLimit) || 30, 200), session, log, onForm: log.form, shouldStop: log.stopped, onStatus: log.status }); }
    catch (e) { log(`The scan stopped because of an error: ${e.message.split('\n')[0]}`); return { origin: url.origin, startUrl: url.href, pages: job.lastStatus?.page || 0, forms: job.forms, stopped: true, error: e.message.split('\n')[0] }; }
  });
  return { jobId: job.id, local: isLocalHost(url.hostname) };
});

route('GET', '/api/jobs/:id', ({ params }) => {
  const j = jobs.get(params.id);
  return j ? { status: j.status, logs: j.logs, result: j.result, error: j.error } : { error: 'not found', _status: 404 };
});

// Optional AI for bug reports: relays to the provider the user configured in their browser (key sent per request, never stored).
route('POST', '/api/ai/models', async ({ body }) => { try { return { models: await listModels(body.cfg || {}) }; } catch (e) { return { error: e.message, help: e.help || null, _status: 502 }; } });
route('POST', '/api/ai/chat', async ({ body }) => { try { return { text: await chat(body.cfg || {}, body.messages || []) }; } catch (e) { return { error: e.message, help: e.help || null, _status: 502 }; } });

route('POST', '/api/jobs/:id/stop', ({ params }) => { const j = jobs.get(params.id); if (j) j.stop = true; return { ok: !!j }; });

route('POST', '/api/login/start', async ({ body }) => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  await page.goto(body.url).catch(() => {});
  const id = String(++seq);
  logins.set(id, { browser, context });
  return { loginId: id };
});

route('POST', '/api/login/:id/finish', async ({ params }) => {
  const l = logins.get(params.id);
  if (!l) return { error: 'login window not found', _status: 404 };
  const state = await l.context.storageState();
  await l.browser.close();
  logins.delete(params.id);
  const sessionId = String(++seq);
  sessions.set(sessionId, state);
  return { sessionId, cookies: state.cookies.length };
});

route('POST', '/api/consent', ({ body }) => { consents.grant(new URL(body.origin).origin); return { ok: true }; });

route('GET', '/api/suites', () => suites.list());

route('POST', '/api/suites', ({ body }) => {
  const { name, startUrl, forms, parts, settings, sessionId, consent } = body;
  const origin = new URL(startUrl).origin;
  if (consent && parts.includes(3)) consents.grant(origin);
  const session = sessionId ? sessions.get(sessionId) : null;
  const id = suites.create({ name: name || new URL(startUrl).host, origin, start_url: startUrl, settings, forms, session });
  for (const f of forms) for (const c of builtInCases(f, settings, parts)) cases.add({ ...c, suite_id: id });
  return { id };
});

route('GET', '/api/suites/:id', ({ params }) => {
  const s = suites.get(Number(params.id));
  if (!s) return { error: 'not found', _status: 404 };
  const forms = s.forms.map((f) => ({
    key: f.key, title: f.title, url: f.url, flags: f.flags, replayable: replayable(f),
    fields: f.fields.filter(testable).map((x) => ({ key: x.key, label: x.label || x.key, limit: limitsFor(f, x, s.settings) })),
    focusFields: f.fields.filter((x) => !x.disabled && !x.readOnly).map((x) => ({ key: x.key, label: x.label || x.key })),
  }));
  return {
    id: s.id, name: s.name, origin: s.origin, start_url: s.start_url, created_at: s.created_at, settings: s.settings, fullForms: s.forms,
    consent: consents.get(s.origin), hasSession: !!s.session, forms,
    cases: cases.forSuite(s.id), runs: runs.forSuite(s.id),
  };
});

route('PATCH', '/api/suites/:id', ({ params, body }) => {
  const patch = {};
  if (body.throttleMs != null) patch.throttleMs = Math.min(60000, Math.max(0, Math.round(Number(body.throttleMs) || 0)));
  const settings = suites.updateSettings(Number(params.id), patch);
  return settings ? { settings } : { error: 'not found', _status: 404 };
});

route('DELETE', '/api/suites/:id', ({ params }) => { suites.remove(Number(params.id)); return { ok: true }; });

route('POST', '/api/suites/:id/cases', ({ params, body }) => {
  const { form_key, field_key, input_kind, input_value, expected } = body;
  if (!EXPECTED.includes(expected)) return { error: 'unknown expected result', _status: 400 };
  const s = suites.get(Number(params.id));
  const form = s.forms.find((f) => f.key === form_key);
  const field = form?.fields.find((f) => f.key === field_key);
  if (!field) return { error: 'unknown form or field', _status: 400 };
  const server = expected === 'Accepted' || expected === 'Rejected';
  const input = server ? (input_kind === 'custom' ? `"${(input_value || '').slice(0, 30)}"` : PRESETS[input_kind]?.label) : null;
  const title = server ? `${field.label || field.key}: ${input} → ${expected}` : `${field.label || field.key}: ${expected}`;
  const id = cases.add({ suite_id: s.id, form_key, field_key, part: server ? 3 : 1, kind: 'custom', title, input_kind: server ? input_kind : null, input_value: input_kind === 'custom' ? input_value : null, expected, builtin: false });
  return { id };
});

route('PATCH', '/api/cases/:id', ({ params, body }) => { cases.setEnabled(Number(params.id), !!body.enabled); return { ok: true }; });
route('DELETE', '/api/cases/:id', ({ params }) => { cases.remove(Number(params.id)); return { ok: true }; });

route('POST', '/api/suites/:id/run', ({ params }) => {
  const suiteId = Number(params.id);
  const runId = runs.start(suiteId);
  const job = startJob((log) => runSuite(suiteId, runId, log));
  return { jobId: job.id, runId };
});

route('GET', '/api/runs/:id', ({ params }) => runDetail(Number(params.id)) || { error: 'not found', _status: 404 });

// ---- HTTP plumbing
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    // live job logs
    const ev = url.pathname.match(/^\/api\/jobs\/(\d+)\/events$/);
    if (ev) {
      const job = jobs.get(ev[1]);
      if (!job) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      for (const line of job.logs) res.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
      for (const f of job.forms) res.write(`event: form\ndata: ${JSON.stringify(f)}\n\n`);
      if (job.lastStatus) res.write(`event: status\ndata: ${JSON.stringify(job.lastStatus)}\n\n`);
      if (job.status !== 'running') { res.write(`event: ${job.status === 'done' ? 'done' : 'failed'}\ndata: ${JSON.stringify(job.result ?? job.error)}\n\n`); res.end(); return; }
      job.listeners.add(res);
      req.on('close', () => job.listeners.delete(res));
      return;
    }
    const md = url.pathname.match(/^\/api\/runs\/(\d+)\/report\.md$/);
    if (md) {
      const text = markdownReport(Number(md[1]));
      if (!text) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="sankalpa-run-${md[1]}.md"` });
      res.end(text);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) { send(res, 404, { error: 'not found' }); return; }
      let body = {};
      if (req.method !== 'GET') {
        let raw = ''; for await (const chunk of req) raw += chunk;
        body = raw ? JSON.parse(raw) : {};
      }
      const out = await r.handler({ params: url.pathname.match(r.re).groups || {}, body, query: url.searchParams });
      const status = out?._status || 200;
      if (out) delete out._status;
      send(res, status, out);
      return;
    }
    const file = join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(publicDir)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404).end('Not found'); return; }
    send(res, 500, { error: e.message.split('\n')[0] });
  }
});

const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };

server.listen(PORT, HOST, () => console.log(`Sankalpa is running at http://localhost:${PORT}`));
