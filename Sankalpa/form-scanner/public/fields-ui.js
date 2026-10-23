// Field details: shared by the web app (public/app.js, src/report.js) and the extension (copied by its build).
// Pure functions: data in, HTML/Markdown strings out.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TEXT = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'textarea', '']);
const short = (u) => { try { const x = new URL(u); return x.pathname + x.hash; } catch { return u; } };

// One plain object per field, with everything Sankalpa learned about it.
export function fieldRows(form, settings = {}) {
  return form.fields.map((f) => {
    const agreed = settings.agreedLimits?.[form.key]?.[f.key] || null;
    const p = f.probe || null;
    const isText = TEXT.has(f.type ?? '');
    const state = [];
    if (f.key === form.firstEditable) state.push('first field');
    if (f.readOnly) state.push('read-only');
    if (f.disabled) state.push('disabled');
    if (f.repeatOf) state.push(`must match ${f.repeatOf}`);
    if (!f.hasLabel) state.push('no label');
    if (f.autofocusAttr) state.push('autofocus attribute');
    let limit = '—', source = '';
    if (isText && p) {
      const min = p.clientMin, max = p.clientMax;
      limit = max == null && min == null ? 'none' : `${min ?? 0}–${max ?? 'no max'}`;
      source = p.source || (p.note ? p.note : 'not limited in the browser');
    } else if (isText && f.repeatOf) {
      limit = `same as ${f.repeatOf}`;
    }
    const counter = p?.counter ? { of: p.counter.of, mismatch: p.clientMax != null && p.counter.of !== p.clientMax } : null;
    const attrs = [
      f.name && ['name', f.name], f.id && ['id', f.id], f.autocomplete && ['autocomplete', f.autocomplete],
      f.inputMode && ['inputmode', f.inputMode], f.pattern && ['pattern', f.pattern], f.placeholder && ['placeholder', f.placeholder],
      f.maxLength != null && ['maxlength', f.maxLength], f.minLength != null && ['minlength', f.minLength], f.helpText && ['help text', f.helpText],
    ].filter(Boolean);
    return {
      key: f.key, label: f.label || f.key, type: f.type || 'text', required: !!f.required, state, isText,
      limit, source, counter, errorAtLimit: p?.overMaxError || null,
      suggested: f.suggested ? { max: f.suggested.max, reason: f.suggested.reason } : null,
      agreed: agreed?.max ? agreed.max : null, attrs,
    };
  });
}

// Facts about the form itself (where it is, how it's reached, why it was flagged).
export function formFacts(form) {
  const facts = [
    ['Page', short(form.url)],
    ['Reached by', form.from ? `"${form.from.text || 'link'}" on ${short(form.from.url)}` : 'opened directly'],
    ['Submit button', form.submitText || 'none found'],
    ['<form> tag', form.hasFormTag ? 'yes' : 'no (fields grouped by their container)'],
    ['Fields', String(form.fields.length)],
  ];
  const r = form.flags?.reasons || {};
  if (form.flags?.captcha) facts.push(['CAPTCHA', `${r.captcha || 'detected'}: no server checks`]);
  if (form.flags?.risky) facts.push(['Risky', `${r.risky || 'payment/delete'}: never tested`]);
  if (form.flags?.login) facts.push(['Login form', `${r.login || 'detected'}: no server checks`]);
  if (form.flags?.noSubmit) facts.push(['No submit', r.noSubmit || 'no submit button']);
  return facts;
}

export function formFactsHtml(form) {
  return `<dl class="facts">${formFacts(form).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

// casesByField: { fieldKey: number }   actions: { show: bool, inspect: bool }
// Five columns; below 720px wide each field becomes its own card (labels come from data-label).
export function fieldTableHtml(form, settings, { casesByField = null, actions = {} } = {}) {
  const rows = fieldRows(form, settings);
  const act = actions.show || actions.inspect;
  const chips = (list) => list.map((s) => `<span class="flag tag">${esc(s)}</span>`).join('');
  return `<table class="fields"><thead><tr>
    <th scope="col">Field</th><th scope="col">Type</th><th scope="col">Browser limit</th><th scope="col">Suggested / agreed</th><th scope="col">State and attributes</th>
  </tr></thead><tbody>${rows.map((r) => `<tr>
    <td data-label="Field"><strong>${esc(r.label)}</strong><div class="muted small">${esc(r.key)}</div>
      ${casesByField ? `<div class="muted small">${casesByField[r.key] || 0} test case${casesByField[r.key] === 1 ? '' : 's'}</div>` : ''}
      ${act ? `<div class="row field-actions">${actions.show ? `<button class="mini" data-show="${esc(r.key)}" data-form="${esc(form.key)}" aria-label="Show in page: ${esc(r.label)}">Show in page</button>` : ''}${actions.inspect ? `<button class="mini" data-inspect="${esc(r.key)}" data-form="${esc(form.key)}" aria-label="Inspect: ${esc(r.label)}">Inspect</button>` : ''}</div>` : ''}</td>
    <td data-label="Type" class="small">${esc(r.type)}${r.required ? '<div><strong>required</strong></div>' : '<div class="muted">optional</div>'}</td>
    <td data-label="Browser limit" class="small">${esc(r.limit)}${r.source ? `<div class="muted">${esc(r.source)}</div>` : ''}${r.counter ? `<div>counter shows /${r.counter.of}${r.counter.mismatch ? ' <span class="chip s-fail">mismatch</span>' : ''}</div>` : ''}${r.errorAtLimit ? `<div class="muted">error: "${esc(r.errorAtLimit)}"</div>` : ''}</td>
    <td data-label="Suggested / agreed" class="small">${r.agreed ? `agreed ${r.agreed}` : r.suggested ? `suggest ${r.suggested.max}<div class="muted">${esc(r.suggested.reason)}</div>` : '—'}</td>
    <td data-label="State and attributes" class="small attrs">${chips(r.state)}${r.attrs.map(([k, v]) => `<div><span class="muted">${esc(k)}</span> ${esc(v)}</div>`).join('') || (r.state.length ? '' : '—')}</td>
  </tr>`).join('')}</tbody></table>`;
}

// Evidence as readable rows instead of raw JSON.
const EVIDENCE_LABELS = {
  typing: 'Typing', limit: 'Limit', typed: 'Characters typed', kept: 'Characters kept', errorAfterLeaving: 'Error after leaving the field',
  sentLength: 'Length sent (UTF-16 units)', codePoints: 'Characters sent', http: 'HTTP status', response: 'Server reply',
  responses: 'Replies (linked requests)', recheck: 'Re-check reply (same email, valid value)',
  reachedBy: 'Reached the form by', focusedAfterLink: 'Focused after the link', focusedAfterReload: 'Focused after reload', expectedField: 'Expected focus on',
  keptEmoji: 'Emoji kept', utf16: 'UTF-16 units in field', invalid: 'Marked invalid', error: 'Error shown', counter: 'Counter',
  valueSent: 'Value sent', delayMs: 'Delay between requests (ms)',
  missing: 'Fields without a label', suggested: 'Suggested limit', selection: 'Cursor (start, end)', valueLength: 'Value length', key: 'Focused field', desc: 'Focused element',
};
const show = (v) => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.map((x) => show(x)).join('\n\n');
  if (typeof v === 'object') return 'method' in v ? `${v.method} ${v.url}\n${typeof v.body === 'string' ? v.body.slice(0, 600) : JSON.stringify(v.body)}\n→ HTTP ${v.status}: ${String(v.text ?? '').slice(0, 600)}` : 'status' in v ? `HTTP ${v.status}: ${v.text}` : 'of' in v && 'shown' in v ? `${v.shown}/${v.of}` : 'max' in v ? `${v.max}: ${v.reason || ''}` : JSON.stringify(v);
  return String(v);
};
export function evidenceHtml(ev) {
  const entries = Object.entries(ev || {}).filter(([k]) => k !== 'responses' || (ev.responses?.length || 0) > 1);
  if (!entries.length) return '';
  return `<details><summary class="muted">Evidence</summary><dl class="facts evidence">${entries.map(([k, v]) => `<div><dt>${esc(EVIDENCE_LABELS[k] || k)}</dt><dd>${esc(show(v))}</dd></div>`).join('')}</dl></details>`;
}

// Markdown version of the field tables, for the downloaded report.
export function fieldsMarkdown(forms, settings = {}) {
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out = ['## Forms and fields', ''];
  for (const form of forms) {
    out.push(`### ${form.title}`, '', formFacts(form).map(([k, v]) => `**${k}:** ${cell(v)}`).join(' · '), '',
      '| Field | Type | Required | Browser limit | Counter | Suggested / agreed | State | Attributes |', '|---|---|---|---|---|---|---|---|');
    for (const r of fieldRows(form, settings)) {
      out.push(`| ${cell(r.label)} (\`${cell(r.key)}\`) | ${r.type} | ${r.required ? 'Yes' : '—'} | ${cell(r.limit)}${r.source ? ` (${cell(r.source)})` : ''}${r.errorAtLimit ? `; error: "${cell(r.errorAtLimit)}"` : ''} | ${r.counter ? `/${r.counter.of}${r.counter.mismatch ? ' ⚠ mismatch' : ''}` : '—'} | ${r.agreed ? `agreed ${r.agreed}` : r.suggested ? `suggest ${r.suggested.max}` : '—'} | ${cell(r.state.join(', ')) || '—'} | ${cell(r.attrs.map(([k, v]) => `${k}=${v}`).join('; ')) || '—'} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

// Plain names for the three kinds of check (shown instead of "Part 1/2/3").
export const PART_LABEL = { 1: 'Focus & cursor', 2: 'Browser limit', 3: 'Server check' };
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
