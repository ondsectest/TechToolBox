// Local storage for suites, test cases, runs, results and site approvals (chrome.storage.local).
// Same tables and functions as the web app's src/db.js, but async. Data never leaves this browser.

const KEYS = ['seq', 'suites', 'cases', 'runs', 'results', 'consents'];
let cache = null;
let writing = Promise.resolve();

async function data() {
  if (!cache) {
    const got = await chrome.storage.local.get(KEYS);
    cache = { seq: got.seq || 0, suites: got.suites || {}, cases: got.cases || {}, runs: got.runs || {}, results: got.results || {}, consents: got.consents || {} };
  }
  return cache;
}
async function save(...keys) {
  const d = await data();
  writing = writing.then(() => chrome.storage.local.set(Object.fromEntries(['seq', ...keys].map((k) => [k, d[k]]))));
  return writing;
}
const nextId = (d) => ++d.seq;
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export const suites = {
  async create({ name, origin, start_url, settings, forms }) {
    const d = await data(); const id = nextId(d);
    d.suites[id] = { id, name, origin, start_url, settings: settings || {}, forms: forms || [], created_at: now() };
    await save('suites'); return id;
  },
  async get(id) { return (await data()).suites[id] || null; },
  async list() {
    const d = await data();
    return Object.values(d.suites).sort((a, b) => b.id - a.id).map((s) => {
      const last = Object.values(d.runs).filter((r) => r.suite_id === s.id).sort((a, b) => b.id - a.id)[0];
      return { id: s.id, name: s.name, origin: s.origin, created_at: s.created_at,
        cases: Object.values(d.cases).filter((c) => c.suite_id === s.id && c.enabled).length, last_summary: last?.summary || null };
    });
  },
  async updateSettings(id, patch) {
    const d = await data();
    if (!d.suites[id]) return null;
    d.suites[id].settings = { ...d.suites[id].settings, ...patch };
    await save('suites'); return d.suites[id].settings;
  },
  async remove(id) {
    const d = await data();
    delete d.suites[id];
    for (const c of Object.values(d.cases)) if (c.suite_id === id) delete d.cases[c.id];
    for (const r of Object.values(d.runs)) if (r.suite_id === id) { delete d.runs[r.id]; delete d.results[r.id]; }
    await save('suites', 'cases', 'runs', 'results');
  },
};

export const cases = {
  async add(c) {
    const d = await data(); const id = nextId(d);
    d.cases[id] = { id, field_key: null, input_kind: null, input_value: null, ...c, builtin: c.builtin ? 1 : 0, enabled: 1 };
    await save('cases'); return id;
  },
  async forSuite(suiteId) {
    return Object.values((await data()).cases).filter((c) => c.suite_id === suiteId)
      .sort((a, b) => (a.form_key < b.form_key ? -1 : a.form_key > b.form_key ? 1 : a.part - b.part || a.id - b.id));
  },
  async setEnabled(id, enabled) { const d = await data(); if (d.cases[id]) d.cases[id].enabled = enabled ? 1 : 0; await save('cases'); },
  async remove(id) { const d = await data(); if (d.cases[id] && !d.cases[id].builtin) delete d.cases[id]; await save('cases'); },
};

export const runs = {
  async start(suiteId) {
    const d = await data(); const id = nextId(d);
    d.runs[id] = { id, suite_id: suiteId, started_at: now(), finished_at: null, status: 'running', summary: {} };
    await save('runs'); return id;
  },
  async finish(id, status, summary) { const d = await data(); Object.assign(d.runs[id], { status, summary, finished_at: now() }); await save('runs'); },
  async forSuite(suiteId) { return Object.values((await data()).runs).filter((r) => r.suite_id === suiteId).sort((a, b) => b.id - a.id); },
  async get(id) { return (await data()).runs[id] || null; },
  async previous(suiteId, runId) {
    return Object.values((await data()).runs).filter((r) => r.suite_id === suiteId && r.id < runId).sort((a, b) => b.id - a.id)[0]?.id ?? null;
  },
};

export const results = {
  async save(runId, caseId, status, detail, evidence) {
    const d = await data();
    (d.results[runId] ||= {})[caseId] = { run_id: runId, case_id: caseId, status, detail: detail ?? null, evidence: evidence || {} };
    await save('results');
  },
  async forRun(runId) { return Object.values((await data()).results[runId] || {}); },
};

export const consents = {
  async has(origin) { return !!(await data()).consents[origin]; },
  async grant(origin) { const d = await data(); d.consents[origin] ||= { origin, approved_at: now() }; await save('consents'); },
  async get(origin) { return (await data()).consents[origin] || null; },
};
