// AI settings screen + "Bug report" panels. Shared by the web app and the extension.
// Each app passes an adapter: { loadCfg, saveCfg, listModels(cfg), chat(cfg, messages), ensureAccess(url) }.
import { PROVIDERS, LOCAL_SERVERS, FORMATS, baseUrlOf, isLocalUrl, bugFacts, bugMessages } from './ai.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FORMAT_KEY = 'sankalpa.bugFormat';
const getFormat = () => { try { return localStorage.getItem(FORMAT_KEY) || 'markdown'; } catch { return 'markdown'; } };
const setFormat = (f) => { try { localStorage.setItem(FORMAT_KEY, f); } catch { /* private mode */ } };
export const browserName = () => { const m = navigator.userAgent.match(/(Chrome|Firefox|Version)\/([\d.]+)/); return m ? `${m[1] === 'Version' ? 'Safari' : m[1]} ${m[2]}` : navigator.userAgent; };

// Copies text; falls back to a hidden textarea where the Clipboard API isn't allowed (e.g. DevTools panels).
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta); ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

// ---------- AI settings page
export async function renderAiSettings(root, ad) {
  const cfg = { provider: 'ollama', baseUrl: '', apiKey: '', model: '', ...(await ad.loadCfg()) };
  let models = cfg.model ? [{ id: cfg.model, name: cfg.model }] : [];
  let loading = false, loadedFor = null, lastHelp = null, lastMsg = null, loadSeq = 0;
  // Loads the model list without needing a click: on open, on provider change, and when the empty list is clicked.
  const canAutoLoad = () => !(PROVIDERS[cfg.provider].needsKey && !cfg.apiKey) && /^https?:\/\//i.test(baseUrlOf(cfg));
  async function loadModels({ auto = false } = {}) {
    if (auto && (!canAutoLoad() || loadedFor === `${cfg.provider}|${baseUrlOf(cfg)}`)) return;
    const mine = ++loadSeq; // a newer load (e.g. after switching provider) makes this one stale
    const forCfg = { ...cfg };
    loading = true; lastMsg = ['Loading models…', false]; lastHelp = null; draw();
    try {
      if (!(await ad.ensureAccess(baseUrlOf(forCfg)))) throw Object.assign(new Error('Access to the provider was not allowed.'), {});
      const list = await ad.listModels(forCfg);
      if (mine !== loadSeq) return;
      models = list;
      loadedFor = `${forCfg.provider}|${baseUrlOf(forCfg)}`;
      if (!models.find((m) => m.id === cfg.model)) cfg.model = models[0]?.id || '';
      lastMsg = models.length ? [`${models.length} model${models.length === 1 ? '' : 's'} found.`, false] : [cfg.provider === 'ollama' ? 'Ollama is running but has no models. Run: ollama pull mistral' : 'No models found.', true];
    } catch (e) {
      if (mine !== loadSeq) return;
      lastMsg = [e.message, true]; lastHelp = e.help || null; loadedFor = `${forCfg.provider}|${baseUrlOf(forCfg)}`;
    } finally { if (mine === loadSeq) { loading = false; draw(); } }
  }
  const draw = () => {
    const p = PROVIDERS[cfg.provider];
    const base = baseUrlOf(cfg);
    root.innerHTML = `<h1>AI for bug reports</h1>
      <p class="sub">Optional. Sankalpa's tests never use AI; a model only <strong>writes bug reports</strong> for failures, when you ask. Your key is saved only in this browser.</p>
      <div class="panel stack">
        <div class="row" role="radiogroup" aria-label="Provider">${Object.entries(PROVIDERS).map(([k, v]) => `<label class="row"><input type="radio" name="prov" value="${k}" ${cfg.provider === k ? 'checked' : ''}> ${esc(v.label)}</label>`).join('')}</div>
        ${cfg.provider === 'custom' ? `<div><div class="muted small">Running a model on this computer? Pick it to fill in its usual address:</div><div class="row" style="margin-top:6px">${LOCAL_SERVERS.map((s) => `<button class="mini" data-pick="${esc(s.baseUrl)}">${esc(s.name)}</button>`).join('')}</div></div>` : ''}
        <div class="grid">
          <label class="field">Base URL<input type="url" id="aiBase" value="${esc(cfg.baseUrl || p.baseUrl)}" ${cfg.provider === 'custom' ? '' : 'readonly'}></label>
          ${cfg.provider === 'ollama' ? '' : `<label class="field">API key${p.needsKey ? '' : ' (if the provider needs one)'}<input type="password" id="aiKey" value="${esc(cfg.apiKey)}" autocomplete="off" placeholder="${cfg.provider === 'openrouter' ? 'sk-or-…  (openrouter.ai/keys)' : ''}"></label>`}
        </div>
        <div class="row"><button id="aiLoad" ${loading ? 'disabled' : ''}>${loading ? 'Loading…' : models.length > 1 ? 'Reload models' : 'Load models'}</button>
          <label class="field" style="min-width:260px">Model<select id="aiModel" ${loading || !models.length ? 'disabled' : ''}>${loading ? '<option value="">Loading models…</option>' : models.length ? models.map((m) => `<option value="${esc(m.id)}" ${m.id === cfg.model ? 'selected' : ''}>${esc(m.name)}</option>`).join('') : `<option value="">${PROVIDERS[cfg.provider].needsKey && !cfg.apiKey ? 'Paste your API key, then Load models' : 'No models loaded (click Load models)'}</option>`}</select></label></div>
        <p class="muted small" style="margin:0">${cfg.provider === 'openrouter' ? 'Only free models ($0) are listed.' : cfg.provider === 'ollama' ? 'Lists the models installed in Ollama (run <code>ollama serve</code>, then <code>ollama pull llama3.2</code> or similar).' : 'Any API that speaks the OpenAI chat format: Together, Groq, Fireworks, DeepInfra, LM Studio, vLLM…'}</p>
        ${isLocalUrl(base) ? '<p class="muted small" style="margin:0">Local model: nothing leaves this computer.</p>' : '<p class="note" style="margin:0">Cloud model: before each report you\'ll see exactly what is sent. Tokens, cookies and passwords are removed first. Free cloud models may log prompts, so use a local model for private apps.</p>'}
        <div class="row"><button class="primary" id="aiSave">Save</button><button id="aiTest">Test connection</button><span id="aiMsg" class="small" role="status"></span></div>
        <div id="aiHelp" class="note" hidden></div>
      </div>`;
    const $ = (id) => root.querySelector(`#${id}`);
    const msg = (t, bad, help) => {
      $('aiMsg').textContent = t; $('aiMsg').style.color = bad ? 'var(--fail)' : 'var(--pass)';
      $('aiHelp').innerHTML = help ? `<p class="small" style="margin:0 0 6px">${esc(help.text)}</p>${help.command ? `<div class="row"><code class="cmd">${esc(help.command)}</code><button class="mini" id="copyCmd">Copy</button><span class="small muted" id="cmdCopied"></span></div>` : ''}${help.alt ? `<p class="small muted" style="margin:6px 0 0">${esc(help.alt)}</p>` : ''}` : '';
      $('aiHelp').hidden = !help;
      if (help?.command) $('copyCmd').onclick = async () => { $('cmdCopied').textContent = (await copyText(help.command)) ? 'Copied' : ''; };
    };
    if (lastMsg) msg(lastMsg[0], lastMsg[1], lastHelp);
    const read = () => { cfg.baseUrl = cfg.provider === 'custom' ? $('aiBase').value.trim() : ''; cfg.apiKey = $('aiKey')?.value.trim() || ''; cfg.model = $('aiModel').value; };
    root.querySelectorAll('[name=prov]').forEach((r) => { r.onchange = () => { read(); cfg.provider = r.value; cfg.model = ''; models = []; lastMsg = null; lastHelp = null; loadSeq++; loading = false; loadedFor = null; draw(); loadModels({ auto: true }); }; });
    root.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { $('aiBase').value = b.dataset.pick; }; });
    $('aiLoad').onclick = () => { read(); loadModels(); };
    $('aiModel').onchange = () => { cfg.model = $('aiModel').value; };
    $('aiKey') && ($('aiKey').onchange = () => { read(); loadModels({ auto: true }); });
    $('aiSave').onclick = async () => { read(); await ad.saveCfg({ ...cfg }); lastMsg = [`Saved: ${cfg.model || 'no model chosen'}`, !cfg.model]; lastHelp = null; msg(lastMsg[0], lastMsg[1]); };
    $('aiTest').onclick = async () => {
      read(); msg('Asking the model…');
      try {
        if (!(await ad.ensureAccess(baseUrlOf(cfg)))) { msg('Access to the provider was not allowed.', true); return; }
        const t = await ad.chat(cfg, [{ role: 'user', content: 'Reply with exactly: OK' }]);
        lastMsg = [`Model answered: ${t.slice(0, 60)}`, false]; lastHelp = null; msg(lastMsg[0], false);
      } catch (e) { lastMsg = [e.message, true]; lastHelp = e.help || null; msg(e.message, true, e.help); }
    };
  };
  draw();
  loadModels({ auto: true }); // fill the list as soon as the page opens
}

// ---------- Bug report panels on the run page
// ctx: run detail { rows, forms, settings, run, suite } + env { generator, version }
export const bugButtonHtml = (row) => (row.status === 'fail' || row.status === 'warn' ? `<button class="mini" data-bug="${row.case_id}" aria-expanded="false">Bug report</button>` : '');
export const bugPanelHtml = (row) => (row.status === 'fail' || row.status === 'warn' ? `<div class="bug-panel" data-bug-panel="${row.case_id}"></div>` : '');

const formatSelect = (id) => `<label class="setting">Format <select id="${id}">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}" ${getFormat() === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;

async function generateInto(panel, ad, cfg, facts, format) {
  const out = panel.querySelector('.bug-out');
  out.innerHTML = `<p class="muted small">Writing the bug report with ${esc(cfg.model)}…</p>`;
  try {
    const text = await ad.chat(cfg, bugMessages(facts, format));
    out.innerHTML = `<textarea class="bug-text" rows="18" aria-label="Bug report">${esc(text)}</textarea>
      <div class="row"><button class="primary mini" data-copy>Copy report</button><button class="mini" data-regen>Regenerate</button><span class="small muted" role="status" data-copied></span></div>`;
    out.querySelector('[data-copy]').onclick = async () => { const ok = await copyText(out.querySelector('textarea').value); out.querySelector('[data-copied]').textContent = ok ? 'Copied. Paste it into Jira or anywhere.' : 'Select the text and copy it manually.'; };
    out.querySelector('[data-regen]').onclick = () => generateInto(panel, ad, cfg, facts, panel.querySelector('select').value);
  } catch (e) {
    out.innerHTML = `<div class="note"><p style="margin:0">${esc(e.message)}</p>${e.help ? `<p class="small" style="margin:6px 0 0">${esc(e.help.text)} <code class="cmd">${esc(e.help.command || '')}</code></p>` : ''}<p class="small" style="margin:6px 0 0"><a href="#/settings">AI settings</a></p></div>`;
  }
}

export function wireBugButtons(root, ctx, ad) {
  root.querySelectorAll('[data-bug]').forEach((b) => {
    b.onclick = async () => {
      const panel = root.querySelector(`[data-bug-panel="${b.dataset.bug}"]`);
      if (panel.innerHTML) { panel.innerHTML = ''; b.setAttribute('aria-expanded', 'false'); return; } // toggle
      b.setAttribute('aria-expanded', 'true');
      const cfg = await ad.loadCfg();
      if (!cfg?.model) { panel.innerHTML = `<p class="note">Choose a model first in <a href="#/settings">AI settings</a> (Ollama on this computer, OpenRouter free models, or any OpenAI-compatible API).</p>`; return; }
      const row = ctx.rows.find((r) => String(r.case_id) === b.dataset.bug);
      const facts = bugFacts({ row, forms: ctx.forms, settings: ctx.settings, run: ctx.run, suite: ctx.suite, env: { ...ctx.env, browser: browserName() } });
      const local = isLocalUrl(baseUrlOf(cfg));
      panel.innerHTML = `<div class="panel stack" style="margin-top:8px">
        <div class="row">${formatSelect(`fmt${b.dataset.bug}`)}<span class="muted small">Model: ${esc(cfg.model)} (${local ? 'on this computer' : esc(new URL(baseUrlOf(cfg)).host)})</span></div>
        <details ${local ? '' : 'open'}><summary class="muted small">${local ? 'What the model gets' : 'This will be sent to the model (secrets removed). Check it, then press Send.'}</summary><pre class="log">${esc(JSON.stringify(facts, null, 2))}</pre></details>
        <div class="row"><button class="primary mini" data-send>${local ? 'Write bug report' : 'Send and write bug report'}</button></div>
        <div class="bug-out"></div></div>`;
      const sel = panel.querySelector('select');
      sel.onchange = () => setFormat(sel.value);
      panel.querySelector('[data-send]').onclick = async () => {
        if (!(await ad.ensureAccess(baseUrlOf(cfg)))) { panel.querySelector('.bug-out').innerHTML = '<p class="note">Access to the provider was not allowed.</p>'; return; }
        generateInto(panel, ad, cfg, facts, sel.value);
      };
    };
  });
}

// "Bug reports for all failures": one after another, joined for a single copy.
export function wireAllBugs(button, target, ctx, ad) {
  button.onclick = async () => {
    const cfg = await ad.loadCfg();
    if (!cfg?.model) { target.innerHTML = '<p class="note">Choose a model first in <a href="#/settings">AI settings</a>.</p>'; return; }
    const bad = ctx.rows.filter((r) => r.status === 'fail' || r.status === 'warn');
    const local = isLocalUrl(baseUrlOf(cfg));
    if (!local && !confirm(`Send the recorded facts of ${bad.length} failures (secrets removed) to ${new URL(baseUrlOf(cfg)).host} to write ${bad.length} bug reports?`)) return;
    if (!(await ad.ensureAccess(baseUrlOf(cfg)))) return;
    const format = getFormat();
    target.innerHTML = `<div class="panel stack"><div class="row">${formatSelect('fmtAll')}<span class="small muted" id="allProgress"></span></div><textarea class="bug-text" rows="20" aria-label="All bug reports"></textarea><div class="row"><button class="primary mini" id="copyAll">Copy all</button><span class="small muted" id="allCopied" role="status"></span></div></div>`;
    target.querySelector('#fmtAll').onchange = (e) => setFormat(e.target.value);
    const ta = target.querySelector('textarea');
    const sep = format === 'jira' ? '\n\n----\n\n' : format === 'text' ? '\n\n==========\n\n' : '\n\n---\n\n';
    const parts = [];
    for (const [i, row] of bad.entries()) {
      target.querySelector('#allProgress').textContent = `Writing ${i + 1} of ${bad.length}…`;
      const facts = bugFacts({ row, forms: ctx.forms, settings: ctx.settings, run: ctx.run, suite: ctx.suite, env: { ...ctx.env, browser: browserName() } });
      try { parts.push(await ad.chat(cfg, bugMessages(facts, format))); } catch (e) { parts.push(`(Could not write the report for "${row.case.title}": ${e.message})`); }
      ta.value = parts.join(sep);
    }
    target.querySelector('#allProgress').textContent = `${bad.length} bug reports written.`;
    target.querySelector('#copyAll').onclick = async () => { target.querySelector('#allCopied').textContent = (await copyText(ta.value)) ? 'Copied.' : 'Select the text and copy it manually.'; };
  };
}
