// Sankalpa dashboard — plain JS, hash routes: #/  #/new  #/suite/:id  #/run/:id
import { formFactsHtml, fieldTableHtml, evidenceHtml, PART_LABEL, plural } from './fields-ui.js';
import { mountIdeaCards, adoptUnsortedIdeas, mountSavedIdeas, mountPredictions, predictionSummary, predictionMark, lessonButtonHtml, lessonPanelHtml, wireLessons, renderStatsPage, ideasFor } from './fun-ui.js';
import { ideasMarkdown } from './report-md.js';
import { renderAiSettings, bugButtonHtml, bugPanelHtml, wireBugButtons, wireAllBugs } from './ai-ui.js';

async function aiCall(path, body) { // keeps the server's "what to do" hint (e.help)
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(d.error || `HTTP ${res.status}`); e.help = d.help; throw e; }
  return d;
}
// AI settings live only in this browser (like the Prana app); the server just relays each request.
const AI_KEY = 'sankalpa.ai';
const ai = {
  loadCfg: async () => { try { return JSON.parse(localStorage.getItem(AI_KEY) || 'null'); } catch { return null; } },
  saveCfg: async (cfg) => { localStorage.setItem(AI_KEY, JSON.stringify(cfg)); },
  listModels: async (cfg) => (await aiCall('/ai/models', { cfg })).models,
  chat: async (cfg, messages) => (await aiCall('/ai/chat', { cfg, messages })).text,
  ensureAccess: async () => true,
};
// "Think while you wait" data (ideas, predictions, stats) stays in this browser.
const funStore = { get: async (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: async (k, v) => { localStorage.setItem(k, JSON.stringify(v)); } };
const downloadText = (name, text, type = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (path, opts = {}) => {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};
const short = (u) => { try { const x = new URL(u); return x.pathname + x.hash; } catch { return u; } };
const STATUS = { pass: 'Pass', fail: 'Fail', warn: 'Warning', not_verified: 'Not verified' };
const chip = (s) => `<span class="chip s-${s}">${STATUS[s] || s}</span>`;
const summaryChips = (s = {}) => ['fail', 'warn', 'not_verified', 'pass'].filter((k) => s[k]).map((k) => `<span class="chip s-${k}">${s[k]} ${STATUS[k].toLowerCase()}</span>`).join(' ') || '<span class="muted small">Not run yet</span>';
const PARTS = { 1: 'Focus & cursor', 2: 'Length limits (browser)', 3: 'Server checks' };
const PART_HELP = { 1: 'Is the first field ready to type in when the form opens, with the cursor in the right place?', 2: 'Does the page stop input at the limit, show the right counter and count emoji correctly?', 3: 'Does the server enforce the same rules? Submits once, then re-sends with test values.' };
const flagsHtml = (f) => `${f.flags.captcha ? '<span class="flag">CAPTCHA · no server checks</span>' : ''}${f.flags.risky ? '<span class="flag">payment/delete · skipped</span>' : ''}${f.flags.login ? '<span class="flag">login · no server checks</span>' : ''}${!f.hasFormTag ? '<span class="flag">no &lt;form&gt; tag</span>' : ''}`;
const formCard = (f, { open = false, checkbox = '', casesByField = null, settings = {} } = {}) => {
  const forId = /id="([^"]+)"/.exec(checkbox)?.[1];
  const title = forId ? `<label for="${forId}"><strong>${esc(f.title)}</strong></label>` : `<strong>${esc(f.title)}</strong>`;
  return `<div class="panel form-wrap">
  <div class="row card-head">${checkbox}${title}${flagsHtml(f)}<span class="muted small">${esc(short(f.url))} · ${plural(f.fields.length, 'field')}</span></div>
  <details class="form-card"${open ? ' open' : ''}><summary>Fields and details</summary>
  <div style="margin-top:10px">${formFactsHtml(f)}${fieldTableHtml(f, settings, { casesByField })}</div></details>
</div>`;
};

function streamJob(jobId, logEl, onDone) {
  const es = new EventSource(`/api/jobs/${jobId}/events`);
  es.addEventListener('log', (e) => { logEl.textContent += `${JSON.parse(e.data)}\n`; logEl.scrollTop = logEl.scrollHeight; });
  es.addEventListener('form', (e) => streamJob.onForm?.(JSON.parse(e.data)));
  es.addEventListener('status', (e) => streamJob.onStatus?.(JSON.parse(e.data)));
  es.addEventListener('done', (e) => { es.close(); onDone(null, JSON.parse(e.data)); });
  es.addEventListener('failed', (e) => { es.close(); onDone(new Error(JSON.parse(e.data))); });
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) return; };
}

// ---------- Suites list
async function home() {
  const list = await api('/suites');
  app.innerHTML = `
    <div class="row spread"><div><h1>Test suites</h1><p class="sub">A suite is a saved target, the forms you chose and your answers. Run it any time.</p></div>
    <a class="btn primary" href="#/new">+ New suite</a></div>
    ${list.length ? `<div class="stack">${list.map((s) => `
      <a class="card-link" href="#/suite/${s.id}"><div class="panel row spread">
        <div><strong>${esc(s.name)}</strong><div class="muted small">${esc(s.origin)} · ${s.cases} test cases</div></div>
        <div class="summary">${summaryChips(s.last_summary)}</div>
      </div></a>`).join('')}</div>`
    : `<div class="panel empty"><strong>No suites yet.</strong>
      <ol class="how">
        <li><span><strong>Find forms</strong>: Sankalpa visits your site and works out each field's rules. Nothing is submitted.</span></li>
        <li><span><strong>Choose and answer</strong>: tick the forms, confirm limits, approve server checks for your own site.</span></li>
        <li><span><strong>Run</strong>: see Pass / Fail per field, with evidence, lessons and bug reports.</span></li>
      </ol><br><a class="btn primary" href="#/new">Create your first suite</a></div>`}`;
}

// ---------- New suite wizard
let draft = null;
function steps(n) {
  return `<div class="steps">${['1 · Find forms', '2 · Pick what to test', '3 · Confirm and test'].map((t, i) => `<span class="${i + 1 === n ? 'on' : ''}">${t}</span>`).join('')}</div>`;
}

function newSuite() {
  draft = { url: 'http://localhost:3000/', pageLimit: 30, sessionId: null, selectedKeys: null, parts: null };
  stepTarget();
}

function stepTarget() {
  app.innerHTML = `${steps(1)}<h1>Find the forms to test</h1><p class="sub">Sankalpa visits the site, finds its forms and works out each field's rules. Nothing is submitted in this step.</p>
    <div class="panel stack">
      <div class="grid">
        <label class="field">Target URL<input type="url" id="url" value="${esc(draft.url)}" required></label>
        <label class="field">Max pages to visit<input type="number" id="limit" min="1" max="200" value="${draft.pageLimit}"></label>
      </div>
      <div class="row"><button id="login">Log in first (optional)</button><span id="loginState" class="muted small">${draft.sessionId ? 'Logged in ✓' : 'Only needed for forms behind a login. Use a test account.'}</span></div>
      <div class="row"><button class="primary" id="go">Find forms</button><button id="stop" hidden>Stop and use what's found</button></div>
      <div id="scanStatus" class="scan-status" role="status" hidden></div>
      <div id="scanError" role="alert"></div>
      <details id="logBox" hidden><summary class="muted small">Details (pages visited)</summary><pre class="log" id="log" role="log" aria-label="Progress"></pre></details>
    </div>
    <div id="ideas" style="margin-top:12px"></div>
    <div id="found"></div>`;
  const url = document.getElementById('url');
  url.focus(); url.setSelectionRange(url.value.length, url.value.length); // practise what we test
  document.getElementById('login').onclick = async () => {
    const st = document.getElementById('loginState');
    try {
      const { loginId } = await api('/login/start', { method: 'POST', body: { url: url.value } });
      st.innerHTML = 'A browser window opened. Log in there with a <strong>test account</strong>, then <button id="done">I\'m logged in</button>';
      document.getElementById('done').onclick = async () => {
        const r = await api(`/login/${loginId}/finish`, { method: 'POST' });
        draft.sessionId = r.sessionId; st.textContent = `Logged in ✓ (${r.cookies} cookies saved for this scan)`;
      };
    } catch (e) { st.textContent = `Could not open a browser window: ${e.message}`; }
  };
  document.getElementById('go').onclick = async (ev) => {
    if (!url.checkValidity()) { url.reportValidity(); return; }
    draft.url = url.value; draft.pageLimit = Number(document.getElementById('limit').value) || 30;
    ev.target.disabled = true; ev.target.textContent = 'Finding forms…';
    const log = document.getElementById('log'); document.getElementById('logBox').hidden = false; log.textContent = '';
    const status = document.getElementById('scanStatus'); const errBox = document.getElementById('scanError'); errBox.innerHTML = '';
    try {
      const { jobId, local } = await api('/discover', { method: 'POST', body: { url: draft.url, pageLimit: draft.pageLimit, sessionId: draft.sessionId } });
      draft.local = local;
      const found = document.getElementById('found');
      const stop = document.getElementById('stop'); stop.hidden = false; stop.disabled = false; stop.textContent = "Stop and use what's found";
      const started = Date.now();
      let last = { page: 0, of: draft.pageLimit, url: '', forms: 0 };
      const showStatus = () => {
        const t = Math.round((Date.now() - started) / 1000);
        status.hidden = false;
        status.innerHTML = `<span class="spinner" aria-hidden="true"></span> <strong>Visiting page ${last.page} of ${last.of}</strong> <span class="muted">${esc(last.url)}</span><br>${plural(last.forms, 'form')} found${last.checking ? ` · reading the fields of “${esc(last.checking)}”` : ''} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      };
      showStatus();
      const timer = setInterval(showStatus, 1000);
      stop.onclick = async () => { stop.disabled = true; stop.textContent = 'Stopping… (a few seconds)'; await api(`/jobs/${jobId}/stop`, { method: 'POST' }); };
      const live = [];
      mountIdeaCards(document.getElementById('ideas'), { getForms: () => live, store: funStore });
      streamJob.onStatus = (st) => { last = st; showStatus(); };
      streamJob.onForm = (f) => { live.push(f); found.innerHTML = `<h2>Forms found so far (${live.length})</h2>${live.map((x) => formCard(x)).join('')}`; };
      const reset = () => { clearInterval(timer); stop.hidden = true; status.hidden = true; ev.target.disabled = false; ev.target.textContent = 'Find forms'; streamJob.onForm = null; streamJob.onStatus = null; };
      streamJob(jobId, log, (err, result) => {
        reset();
        const forms = result?.forms || live;
        if (forms.length) { draft.discovery = { ...(result || {}), forms, pages: result?.pages ?? last.page, error: err?.message || result?.error }; stepForms(); return; }
        errBox.innerHTML = `<div class="note"><strong>No forms found${err || result?.error ? ': the scan stopped because of an error.' : '.'}</strong>
          ${err || result?.error ? `<div class="small">${esc(err?.message || result.error)}</div>` : `<div class="small">Visited ${plural(result?.pages ?? 0, 'page')}. Try starting from a page that has a form (e.g. the sign-up page), or allow more pages.</div>`}</div>`;
      });
    } catch (e) { errBox.innerHTML = `<p class="note">${esc(e.message)}</p>`; ev.target.disabled = false; ev.target.textContent = 'Find forms'; }
  };
}

function stepForms() {
  const { forms, pages } = draft.discovery;
  app.innerHTML = `${steps(2)}<h1>Pick what to test</h1><p class="sub">Found ${plural(forms.length, 'form')} on ${plural(pages, 'page')}. Tick the ones to test.</p>
    ${draft.discovery.error ? `<p class="note">The scan stopped early because of an error, so this may not be every form: ${esc(draft.discovery.error)}</p>` : draft.discovery.stopped ? '<p class="note">You stopped the scan early, so this may not be every form on the site.</p>' : ''}
    <p class="muted small">Open <strong>Fields and details</strong> on a form to see every field: type, required, browser limit and where it comes from, counter, suggested limit, attributes.</p>
    <div id="formCards">${forms.map((f, i) => formCard(f, { checkbox: `<input type="checkbox" id="f${i}" ${f.flags.risky ? 'disabled' : (draft.selectedKeys ? (draft.selectedKeys.includes(f.key) ? 'checked' : '') : 'checked')} aria-label="Test ${esc(f.title)}">` })).join('')}</div>
    <h2>What to test</h2>
    <div class="panel row">${Object.entries(PARTS).map(([n, t]) => `<div><label class="row"><input type="checkbox" class="part" value="${n}" ${!draft.parts || draft.parts.includes(Number(n)) ? 'checked' : ''}> ${t}</label><span class="part-help">${PART_HELP[n]}</span></div>`).join('')}</div>
    <p class="muted small">Server checks submit each form once, then re-send its request with test values. You'll be asked to approve that on the next screen.</p>
    <div class="row"><button id="back">Back</button><button class="primary" id="next">Next: confirm and test →</button></div>`;
  document.getElementById('back').onclick = stepTarget;
  document.getElementById('next').onclick = () => {
    draft.selected = forms.filter((f, i) => document.getElementById(`f${i}`).checked);
    draft.selectedKeys = draft.selected.map((f) => f.key);
    draft.parts = [...document.querySelectorAll('.part:checked')].map((c) => Number(c.value));
    if (!draft.selected.length || !draft.parts.length) { alert('Choose at least one form and one kind of test.'); return; }
    stepQuestions();
  };
}

function stepQuestions() {
  const origin = new URL(draft.url).origin;
  const textField = (x) => ['text', 'email', 'password', 'search', 'tel', 'url', 'textarea', ''].includes(x.type) && !x.readOnly && !x.disabled && !x.repeatOf && !/captcha/i.test(`${x.key} ${x.label}`);
  const noLimit = draft.selected.flatMap((f) => f.fields.filter((x) => textField(x) && x.probe && x.probe.clientMax == null).map((x) => ({ f, x })));
  const byPage = {};
  for (const f of draft.selected) (byPage[f.url] ||= []).push(f);
  const multi = Object.entries(byPage).filter(([, l]) => l.length > 1);
  const replays = draft.selected.filter((f) => !f.flags.captcha && !f.flags.risky && !f.flags.login).reduce((n, f) => n + f.fields.filter(textField).length * 3 + 1, 0);
  const server = draft.parts.includes(3);
  app.innerHTML = `${steps(3)}<h1>Confirm and start testing</h1>
    <p class="sub">Sankalpa will test <strong>${plural(draft.selected.length, 'form')}</strong> (${esc(draft.selected.map((f) => f.title).join(', '))}) for: ${draft.parts.map((n) => PARTS[n]).join(' · ')}.</p>
    ${server ? `<div class="panel stack">
      <label class="row"><input type="checkbox" id="consent"> <span><strong>Run server checks:</strong> I own this site (${esc(origin)}) or am allowed to test it.</span></label>
      <p class="small" style="margin:0">Server checks submit each form once, then re-send its request about <strong>${replays}</strong> times with test values, one at a time. This <strong>creates real records</strong> (for example test accounts) on this site. Payment and delete forms are never touched and CAPTCHAs are never bypassed.</p>
      ${draft.local ? '' : `<p class="note" style="margin:0">${esc(new URL(origin).hostname)} is not a local address. Only continue if this is your own test or staging site, never production.</p>`}
    </div>` : ''}
    <details class="panel adjust"><summary><strong>Adjust before testing</strong> <span class="muted small">optional: length limits${multi.length ? ', main form' : ''}${server ? ', delay between requests' : ''}, suite name</span></summary>
      <div class="stack" style="margin-top:10px">
      ${noLimit.length ? `<h2>Length limits</h2><p class="muted small" style="margin:0">These fields have no limit in the browser. Sankalpa suggests one, with the reason. Change it to your own rule, or clear it to skip.</p>
      <table><thead><tr><th>Form · Field</th><th>Limit</th><th>Why</th></tr></thead><tbody>
      ${noLimit.map(({ f, x }, i) => `<tr><td><strong>${esc(x.label || x.key)}</strong><div class="muted small">${esc(f.title)}</div></td>
        <td><input type="number" min="1" id="lim${i}" value="${x.suggested?.max ?? ''}" style="width:90px" aria-label="Limit for ${esc(x.label || x.key)}"></td>
        <td class="small muted">${esc(x.suggested?.reason || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${multi.length ? `<h2>Main form on the page</h2><p class="muted small" style="margin:0">Only the main form should get the cursor when the page opens.</p>
      ${multi.map(([url, l], i) => `<label class="field">${esc(short(url))}<select id="pri${i}">${l.map((f) => `<option value="${esc(f.key)}">${esc(f.title)}</option>`).join('')}</select></label>`).join('')}` : ''}
      ${server ? '<label class="setting">Wait between server requests <input type="number" id="throttle" min="0" max="60000" step="100" value="300"> ms <span class="muted">(raise it for slow or rate-limited servers)</span></label>' : ''}
      <label class="field">Suite name<input type="text" id="name" value="${esc(new URL(draft.url).host)}"></label>
      </div>
    </details>
    <p class="note" id="skipNote" hidden>Server checks will be skipped. Tick <strong>Run server checks</strong> above to include them.</p>
    <div class="row" style="margin-top:16px"><button id="back">Back</button><button class="primary" id="create">Start testing →</button></div>
    <p class="muted small">Results appear on the next screen as each check finishes. The suite is saved, so you can run it again any time.</p>`;
  const consentBox = document.getElementById('consent');
  const sync = () => {
    const off = server && !consentBox?.checked;
    document.getElementById('skipNote').hidden = !off;
    document.getElementById('create').textContent = off ? 'Start testing (browser checks only) →' : 'Start testing →';
  };
  consentBox?.addEventListener('change', sync);
  sync();
  document.getElementById('back').onclick = stepForms;
  document.getElementById('create').onclick = async (ev) => {
    const consent = server ? consentBox.checked : false;
    const settings = { agreedLimits: {}, primary: {} };
    noLimit.forEach(({ f, x }, i) => {
      const v = Number(document.getElementById(`lim${i}`).value);
      if (v > 0) (settings.agreedLimits[f.key] ||= {})[x.key] = { max: v, min: x.suggested?.min ?? null };
    });
    multi.forEach(([url], i) => { settings.primary[url] = document.getElementById(`pri${i}`).value; });
    const th = document.getElementById('throttle');
    if (th) settings.throttleMs = Math.min(60000, Math.max(0, Math.round(Number(th.value) || 0)));
    ev.target.disabled = true; ev.target.textContent = 'Starting…';
    const { id } = await api('/suites', { method: 'POST', body: { name: document.getElementById('name').value, startUrl: draft.url, forms: draft.selected, parts: draft.parts, settings, sessionId: draft.sessionId, consent } });
    await adoptUnsortedIdeas(funStore, id);
    const r = await api(`/suites/${id}/run`, { method: 'POST' });
    location.hash = `#/run/${r.runId}?job=${r.jobId}`;
  };
}

// ---------- Suite page
let suiteTab = 'cases';
async function suitePage(id) {
  const s = await api(`/suites/${id}`);
  const meta = await api('/meta');
  app.innerHTML = `
    <div class="row spread"><div><h1>${esc(s.name)}</h1><p class="sub" style="margin:0">${esc(s.origin)}${s.hasSession ? ' · logged-in session' : ''} · server checks ${s.consent ? 'approved' : 'not approved'}</p></div>
    <div class="row"><button class="primary" id="run">Run suite</button><button class="danger" id="del">Delete</button></div></div>
    <div class="setting" style="margin:10px 0 0">Wait between server requests <input type="number" id="throttle" min="0" max="60000" step="100" value="${s.settings?.throttleMs ?? 300}" aria-label="Wait between server requests in milliseconds"> ms <button class="mini" id="saveThrottle">Save</button><span id="throttleMsg" class="muted" role="status"></span></div>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="${suiteTab === 'cases'}" data-tab="cases">Test cases (${s.cases.filter((c) => c.enabled).length})</button>
      <button role="tab" aria-selected="${suiteTab === 'fields'}" data-tab="fields">Forms & fields (${s.fullForms.reduce((n, f) => n + f.fields.length, 0)})</button>
      <button role="tab" aria-selected="${suiteTab === 'runs'}" data-tab="runs">Runs (${s.runs.length})</button>
    </div><div id="tab"></div>`;
  document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { suiteTab = b.dataset.tab; suitePage(id); }; });
  document.getElementById('run').onclick = async () => { const r = await api(`/suites/${id}/run`, { method: 'POST' }); location.hash = `#/run/${r.runId}?job=${r.jobId}`; };
  document.getElementById('saveThrottle').onclick = async () => {
    const r = await api(`/suites/${id}`, { method: 'PATCH', body: { throttleMs: document.getElementById('throttle').value } });
    document.getElementById('throttle').value = r.settings.throttleMs;
    document.getElementById('throttleMsg').textContent = `Saved: ${r.settings.throttleMs} ms`;
  };
  document.getElementById('del').onclick = async () => { if (confirm(`Delete suite "${s.name}" and its runs?`)) { await api(`/suites/${id}`, { method: 'DELETE' }); location.hash = '#/'; } };
  const tab = document.getElementById('tab');
  if (suiteTab === 'fields') {
    tab.innerHTML = s.fullForms.map((f) => {
      const casesByField = {};
      for (const c of s.cases.filter((x) => x.form_key === f.key && x.enabled && x.field_key)) casesByField[c.field_key] = (casesByField[c.field_key] || 0) + 1;
      return formCard(f, { open: true, casesByField, settings: s.settings });
    }).join('');
    return;
  }
  if (suiteTab === 'runs') {
    tab.innerHTML = s.runs.length ? `<div class="panel"><table><thead><tr><th>Run</th><th>Started (UTC)</th><th>Result</th></tr></thead><tbody>
      ${s.runs.map((r) => `<tr><td><a href="#/run/${r.id}">#${r.id}</a></td><td class="small">${esc(r.started_at)}</td><td>${r.status === 'running' ? '<span class="chip s-not_verified">Running…</span>' : summaryChips(r.summary)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="panel empty">No runs yet. Click <strong>Run suite</strong>.</div>';
    return;
  }
  const byForm = s.forms.map((f) => ({ f, list: s.cases.filter((c) => c.form_key === f.key) }));
  tab.innerHTML = `
    <div class="row spread"><p class="muted small" style="margin:0">Built-in cases come from the three checks. Switch off any you don't need, or add your own.</p><button id="add">+ Add test case</button></div>
    <div id="addPanel"></div>
    <div id="savedIdeas"></div>
    ${byForm.map(({ f, list }) => `<h2 class="form-title">${esc(f.title)} <span class="muted small">${esc(short(f.url))}</span></h2>
      <div class="panel"><table><tbody>${list.map((c) => `<tr class="${c.enabled ? '' : 'case-off'}">
        <td style="width:48px"><button class="toggle" role="switch" aria-checked="${!!c.enabled}" aria-label="Enable ${esc(c.title)}" data-case="${c.id}"></button></td>
        <td>${esc(c.title)}${c.builtin ? '' : ' <span class="flag">custom</span>'}</td>
        <td class="small muted" style="white-space:nowrap">${PART_LABEL[c.part]}</td>
        <td style="width:40px">${c.builtin ? '' : `<button class="danger" data-remove="${c.id}" aria-label="Remove ${esc(c.title)}">×</button>`}</td></tr>`).join('') || '<tr><td class="muted">No test cases.</td></tr>'}
      </tbody></table></div>`).join('')}`;
  tab.querySelectorAll('[data-case]').forEach((b) => { b.onclick = async () => { await api(`/cases/${b.dataset.case}`, { method: 'PATCH', body: { enabled: b.getAttribute('aria-checked') !== 'true' } }); suitePage(id); }; });
  tab.querySelectorAll('[data-remove]').forEach((b) => { b.onclick = async () => { if (!confirm('Remove this custom test case?')) return; await api(`/cases/${b.dataset.remove}`, { method: 'DELETE' }); suitePage(id); }; });
  document.getElementById('add').onclick = () => addCasePanel(s, meta, id);
  mountSavedIdeas(document.getElementById('savedIdeas'), { store: funStore, suiteId: s.id });
}

function addCasePanel(s, meta, id) {
  const panel = document.getElementById('addPanel');
  panel.innerHTML = `<div class="panel stack" style="margin:12px 0">
    <div class="grid">
      <label class="field">Form<select id="cForm">${s.forms.map((f) => `<option value="${esc(f.key)}">${esc(f.title)}</option>`).join('')}</select></label>
      <label class="field">Expected<select id="cExp">${meta.expected.map((e) => `<option>${esc(e)}</option>`).join('')}</select></label>
      <label class="field">Field<select id="cField"></select></label>
      <label class="field" id="cInputWrap">Input<select id="cInput">${Object.entries(meta.presets).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
      <label class="field" id="cOwnWrap" hidden>Your text<input type="text" id="cOwn"></label>
    </div>
    <p class="muted small" id="cHint" style="margin:0"></p>
    <div class="row"><button class="primary" id="cSave">Add test case</button><button id="cCancel">Cancel</button></div></div>`;
  const $ = (x) => document.getElementById(x);
  const sync = () => {
    const form = s.forms.find((f) => f.key === $('cForm').value);
    const server = ['Accepted', 'Rejected'].includes($('cExp').value);
    const fields = server ? form.fields : form.focusFields;
    const keep = $('cField').value;
    $('cField').innerHTML = fields.map((x) => `<option value="${esc(x.key)}">${esc(x.label)}</option>`).join('');
    if (fields.some((x) => x.key === keep)) $('cField').value = keep;
    $('cInputWrap').hidden = !server;
    $('cOwnWrap').hidden = !server || $('cInput').value !== 'custom';
    const lim = server && form.fields.find((x) => x.key === $('cField').value)?.limit;
    $('cHint').textContent = !server ? 'Checked in the browser when the form opens.'
      : !form.replayable ? 'This form has a CAPTCHA or is risky, so server cases will show "Not verified".'
      : `N = ${lim?.max ?? 100} for this field. The form is submitted once, then the request is re-sent with this value.`;
  };
  ['cForm', 'cExp', 'cField', 'cInput'].forEach((x) => { $(x).onchange = sync; });
  sync(); $('cForm').focus();
  $('cCancel').onclick = () => { panel.innerHTML = ''; };
  $('cSave').onclick = async () => {
    await api(`/suites/${id}/cases`, { method: 'POST', body: { form_key: $('cForm').value, field_key: $('cField').value, expected: $('cExp').value, input_kind: $('cInput').value, input_value: $('cOwn').value } });
    suitePage(id);
  };
}

// ---------- Run report
async function runPage(id, jobId) {
  let d = await api(`/runs/${id}`);
  app.innerHTML = `<p class="small"><a href="#/suite/${d.suite.id}">← ${esc(d.suite.name)}</a></p>
    <div class="row spread"><div><h1>Run #${d.run.id}</h1><p class="sub" style="margin:0">${esc(d.suite.origin)} · ${esc(d.run.started_at)} UTC</p></div>
    <div class="row" id="actions"></div></div><div id="body"></div>`;
  const body = document.getElementById('body');
  if (d.run.status === 'running') {
    body.innerHTML = '<h2>Testing…</h2><progress id="progBar" value="0" max="1" aria-label="Checks done" style="width:100%"></progress><p id="progText" class="small muted" aria-live="polite"></p><div id="predict"></div><div id="ideas"></div><pre class="log" id="log" role="log" aria-live="polite" aria-label="Progress"></pre>';
    let running = true;
    const s = await api(`/suites/${d.suite.id}`);
    mountPredictions(document.getElementById('predict'), { cases: s.cases, runId: id, getRows: async () => (await api(`/runs/${id}`)).rows, store: funStore, isRunning: () => running });
    mountIdeaCards(document.getElementById('ideas'), { getForms: () => s.fullForms, suiteId: s.id, store: funStore });
    const total = s.cases.filter((c) => c.enabled).length;
    const bar = document.getElementById('progBar'); bar.max = Math.max(1, total);
    const tick = async () => {
      if (!running || !bar.isConnected) return;
      const rows = (await api(`/runs/${id}`)).rows;
      const bad = rows.filter((r) => r.status === 'fail' || r.status === 'warn').length;
      bar.value = rows.length;
      document.getElementById('progText').textContent = `${rows.length} of ${total} checks done · ${bad} problem${bad === 1 ? '' : 's'} so far`;
      setTimeout(tick, 1500);
    };
    tick();
    if (jobId) streamJob(jobId, document.getElementById('log'), () => { running = false; runPage(id); });
    else setTimeout(() => runPage(id), 3000);
    return;
  }
  document.getElementById('actions').innerHTML = `<button id="dlReport">Download report (.md)</button>${d.rows.some((r) => r.status === 'fail' || r.status === 'warn') ? '<button id="allBugs">Bug reports for all failures (AI)</button>' : ''}`;
  document.getElementById('dlReport').onclick = async () => {
    let md = await (await fetch(`/api/runs/${id}/report.md`)).text();
    const extra = ideasMarkdown(await ideasFor(funStore, d.suite.id));
    if (extra) { const at = md.lastIndexOf('\n---\n'); md = at > 0 ? `${md.slice(0, at)}\n${extra}${md.slice(at)}` : `${md}\n\n${extra}`; }
    downloadText(`sankalpa-run-${id}.md`, md, 'text/markdown');
  };
  body.insertAdjacentHTML('beforebegin', '<div id="allBugsOut" style="margin:12px 0"></div>');
  const bugCtx = { ...d, env: { generator: 'Sankalpa web app' } };
  if (document.getElementById('allBugs')) wireAllBugs(document.getElementById('allBugs'), document.getElementById('allBugsOut'), bugCtx, ai);
  const pred = await predictionSummary(funStore, id, d.rows);
  const badRows = d.rows.filter((r) => r.status === 'fail' || r.status === 'warn');
  const onServer = badRows.filter((r) => r.case.part === 3).length;
  const skipped = d.rows.filter((r) => r.status === 'not_verified').length;
  const headline = `<p class="headline">${badRows.length ? `<strong>${plural(badRows.length, 'problem')} found</strong>: ${onServer} on the server, ${badRows.length - onServer} in the browser.` : '<strong>No problems found.</strong> Every check that ran passed.'}${skipped ? ` <span class="muted">${plural(skipped, 'check')} could not run (marked “Not verified”, with the reason).</span>` : ''}</p>`;
  let only = 'all';
  const draw = () => {
    const order = { fail: 0, warn: 1, not_verified: 2, pass: 3 };
    const rows = d.rows.filter((r) => only === 'all' || r.status === 'fail' || r.status === 'warn').sort((a, b) => order[a.status] - order[b.status]);
    const forms = [...new Set(rows.map((r) => r.case.form_key))];
    const changeChip = (c) => c ? `<span class="chip ${c === 'fixed' ? 'c-fixed' : c === 'new failure' ? 'c-new' : 'c-still'}">${c}</span>` : '';
    body.innerHTML = `${headline}<div class="summary">${summaryChips(d.run.summary)}</div>${pred.html}
      ${d.previousRunId ? `<p class="muted small">Compared with <a href="#/run/${d.previousRunId}">run #${d.previousRunId}</a>.</p>` : ''}
      <div class="row" style="margin:12px 0"><div class="seg" role="group" aria-label="Show"><button data-only="all" aria-pressed="${only === 'all'}">All (${d.rows.length})</button><button data-only="bad" aria-pressed="${only !== 'all'}">Failures & warnings (${d.rows.filter((r) => r.status === 'fail' || r.status === 'warn').length})</button></div></div>
      ${forms.map((k) => {
        const inForm = rows.filter((r) => r.case.form_key === k);
        const groups = [...new Set(inForm.map((r) => r.case.field_key || ''))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
        return `<h2 class="form-title">${esc(d.formTitle[k] || k)}</h2><div class="panel">${groups.map((g) => `
          <div class="field-head">${g ? `Field: ${esc(d.fieldLabel[k]?.[g] || g)} <span class="muted small">${esc(g)}</span>` : 'Whole form'}</div>
          <table class="results"><colgroup><col class="c-status"><col class="c-case"><col></colgroup><tbody>${inForm.filter((r) => (r.case.field_key || '') === g).map((r) => `<tr><td>${chip(r.status)} ${changeChip(r.change)} ${predictionMark(pred.marks, r.case_id)}</td>
            <td>${esc(r.case.title)}${r.case.builtin ? '' : ' <span class="flag">custom</span>'}<div class="muted small">${PART_LABEL[r.case.part]}</div></td>
            <td class="small">${esc(r.detail)}${evidenceHtml(r.evidence)}${r.status === 'fail' || r.status === 'warn' ? `<div class="row row-actions">${lessonButtonHtml(r)}${bugButtonHtml(r)}</div>${lessonPanelHtml(r)}${bugPanelHtml(r)}` : ''}</td></tr>`).join('')}</tbody></table>`).join('')}</div>`;
      }).join('') || '<div class="panel empty">Nothing to show.</div>'}
      <h2>Forms and fields tested</h2>${d.forms.map((f) => formCard(f, { settings: d.settings })).join('')}`;
    body.querySelectorAll('[data-only]').forEach((b) => { b.onclick = () => { only = b.dataset.only; draw(); }; });
    wireBugButtons(body, bugCtx, ai);
    wireLessons(body, d.rows, { store: funStore, runId: id });
  };
  draw();
}

// ---------- Router
async function router() {
  const [path, query] = location.hash.slice(1).split('?');
  const parts = (path || '/').split('/').filter(Boolean);
  try {
    if (!parts.length) await home();
    else if (parts[0] === 'new') newSuite();
    else if (parts[0] === 'settings') await renderAiSettings(app, ai);
    else if (parts[0] === 'stats') await renderStatsPage(app, { store: funStore, download: downloadText });
    else if (parts[0] === 'suite') await suitePage(parts[1]);
    else if (parts[0] === 'run') await runPage(parts[1], new URLSearchParams(query).get('job'));
    else await home();
  } catch (e) {
    app.innerHTML = `<div class="panel empty">Something went wrong: ${esc(e.message)}<br><br><a href="#/">Back to suites</a></div>`;
  }
  if (!app.contains(document.activeElement)) app.focus({ preventScroll: true }); // keep a field's focus if a view set it
}
addEventListener('hashchange', () => { if (!location.hash.startsWith('#/suite') ) suiteTab = 'cases'; router(); });
router();
