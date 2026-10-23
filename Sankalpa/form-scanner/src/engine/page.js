// Functions that run INSIDE the target page (passed to page.evaluate). No closures allowed.

// Groups visible fields into forms (with or without a <form> tag), tags them with
// data-sk-form / data-sk-field / data-sk-submit attributes, and describes them.
export function tagForms() {
  const vis = (el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const txt = (el) => {
    if (!el) return '';
    let t = el.innerText || el.value || '';
    el.querySelectorAll?.('mat-icon, .material-icons, .material-symbols-outlined, [class*="icon" i]').forEach((i) => { if (i.innerText) t = t.replace(i.innerText, ''); });
    return t.replace(/\s+/g, ' ').trim();
  };
  const SKIP_AREA = 'mat-paginator, header, nav, [role=banner], [role=navigation], [role=search], mat-toolbar, .mat-toolbar, footer, [role=contentinfo]';
  const CONTAINERS = ['form', '[role=form]', 'mat-card', '.card', 'fieldset', 'section', 'article', 'main']; // priority order
  const AUTO_ID = /^(mat-|cdk-|ng-|:r|react-|radix-|headlessui-|\d)/i;
  const labelOf = (el) => {
    const l = (el.labels && el.labels[0]?.innerText) || el.getAttribute('aria-label') ||
      (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((i) => document.getElementById(i)?.innerText || '').join(' ') ||
      el.closest('mat-form-field')?.querySelector('mat-label, label')?.innerText || '';
    return l.replace(/\s+/g, ' ').trim();
  };
  // Client-side HTML of an element, without Sankalpa's markers or Angular's generated attributes.
  const htmlOf = (el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll?.('*').forEach((x) => { if (x.children.length > 20) x.innerHTML = '…'; });
    return c.outerHTML.replace(/\s(data-sk-[\w-]+|_ng(content|host)-[\w-]+)(="[^"]*")?/g, '').replace(/\s+/g, ' ').slice(0, 700);
  };
  const typeOf = (el) => {
    const t = el.tagName.toLowerCase();
    if (t === 'textarea') return 'textarea';
    if (t === 'select' || t === 'mat-select' || el.getAttribute('role') === 'combobox' && t !== 'input') return 'select';
    return (el.getAttribute('type') || 'text').toLowerCase();
  };
  document.querySelectorAll('[data-sk-form],[data-sk-field],[data-sk-submit]').forEach((e) => {
    e.removeAttribute('data-sk-form'); e.removeAttribute('data-sk-field'); e.removeAttribute('data-sk-submit');
  });
  const all = [...document.querySelectorAll('input, textarea, select, mat-select, [contenteditable="true"]')]
    .filter((el) => vis(el) || (el.tagName === 'MAT-SELECT' && vis(el.closest('mat-form-field') || el)))
    .filter((el) => !['hidden', 'submit', 'button', 'reset', 'image', 'search'].includes((el.getAttribute('type') || '').toLowerCase()))
    .filter((el) => !el.closest(SKIP_AREA) && !el.closest('[role=dialog][aria-label*="cookie" i], .cc-window'));

  const groups = new Map();
  for (const el of all) {
    let c = document.body;
    for (const sel of CONTAINERS) { const hit = el.closest(sel); if (hit) { c = hit; break; } }
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(el);
  }
  const forms = [];
  let fi = 0;
  for (const [c, els] of groups) {
    c.setAttribute('data-sk-form', String(fi));
    const used = new Set();
    const fields = els.map((el, i) => {
      const label = labelOf(el);
      let key = el.getAttribute('formcontrolname') || el.getAttribute('name') ||
        (el.id && !AUTO_ID.test(el.id) ? el.id : '') || label || `${typeOf(el)}${i}`;
      key = key.replace(/\*/g, '').trim().slice(0, 40) || `field${i}`;
      while (used.has(key)) key += '_';
      used.add(key);
      el.setAttribute('data-sk-field', key);
      return {
        key, label: label.replace(/\s*\*$/, ''), type: typeOf(el), tag: el.tagName.toLowerCase(),
        required: el.required || el.getAttribute('aria-required') === 'true' || /\*\s*$/.test(label),
        readOnly: !!el.readOnly || el.getAttribute('aria-readonly') === 'true',
        disabled: el.matches?.(':disabled') || el.getAttribute('aria-disabled') === 'true',
        maxLength: el.maxLength >= 0 ? el.maxLength : null,
        minLength: el.minLength >= 0 ? el.minLength : null,
        valueLength: typeof el.value === 'string' ? el.value.length : 0,
        repeatOf: null,
        html: htmlOf(el),
        name: el.getAttribute('name') || null, id: el.id || null,
        autocomplete: el.getAttribute('autocomplete') || null, inputMode: el.getAttribute('inputmode') || null,
        pattern: el.getAttribute('pattern') || null, placeholder: el.getAttribute('placeholder') || null,
        helpText: (el.getAttribute('aria-describedby') || '').split(/\s+/).map((i) => document.getElementById(i)?.innerText || '').join(' ').replace(/\s+/g, ' ').trim().slice(0, 160) || null,
        hasLabel: !!label, autofocusAttr: el.hasAttribute('autofocus') || el.hasAttribute('cdkfocusinitial'),
      };
    });
    const pw = fields.filter((f) => f.type === 'password');
    for (const f of pw) if (/repeat|confirm|again|retype|verify/i.test(`${f.key} ${f.label}`)) f.repeatOf = pw.find((x) => x !== f && !/repeat|confirm|again|retype|verify/i.test(`${x.key} ${x.label}`))?.key ?? null;
    const btns = [...c.querySelectorAll('button, input[type=submit]')].filter(vis);
    const submit = btns.find((b) => b.type === 'submit' && !b.closest(SKIP_AREA)) ||
      btns.find((b) => /submit|register|sign\s*up|log\s*in|sign\s*in|save|send|continue|update|create|change|reset|confirm/i.test(txt(b)));
    if (submit) submit.setAttribute('data-sk-submit', String(fi));
    const HEAD = 'h1, h2, h3, mat-card-title, legend, [role=heading]';
    let titleEl = c.querySelector(HEAD);
    for (let p = c.parentElement, i = 0; !titleEl && p && i < 4; p = p.parentElement, i++) titleEl = p.querySelector(HEAD);
    forms.push({
      index: fi,
      title: (txt(titleEl) || c.getAttribute('aria-label') || document.title || 'Form').slice(0, 60),
      hasFormTag: c.tagName === 'FORM',
      submitText: submit ? txt(submit).slice(0, 40) || 'Submit' : null,
      submitHtml: submit ? htmlOf(submit) : null,
      text: (c.innerText || '').slice(0, 3000),
      fields,
      firstEditable: fields.find((f) => !f.readOnly && !f.disabled)?.key ?? null,
    });
    fi++;
  }
  return forms;
}

// Which element has focus, and where is the caret?
export function focusState() {
  const a = document.activeElement;
  if (!a || a === document.body || a === document.documentElement) return { key: null, desc: 'nothing (page body)' };
  let sel = null;
  try { sel = [a.selectionStart, a.selectionEnd]; } catch { /* email/number */ }
  return {
    key: a.getAttribute('data-sk-field'),
    desc: (a.getAttribute('aria-label') || a.innerText || a.tagName).replace(/\s+/g, ' ').trim().slice(0, 40),
    valueLength: typeof a.value === 'string' ? a.value.length : null,
    selection: sel && sel[0] !== null ? sel : null,
  };
}

// Reads validity, error text and any "n/N" counter shown for a field.
export function fieldFeedback(key) {
  const el = document.querySelector(`[data-sk-field="${CSS.escape(key)}"]`);
  if (!el) return null;
  const wrap = el.closest('mat-form-field, .form-group, .field, .form-field, [class*="field" i]') || el.parentElement;
  const described = (el.getAttribute('aria-describedby') || '').split(/\s+/).map((i) => document.getElementById(i)?.innerText || '').join(' ');
  const errors = [...(wrap?.querySelectorAll('mat-error, [role=alert], .error, .invalid-feedback, .help-block.error') || [])].map((e) => e.innerText.trim()).filter(Boolean);
  const text = `${wrap?.innerText || ''} ${described}`;
  const counter = text.match(/(\d+)\s*\/\s*(\d+)/);
  return {
    valueLength: typeof el.value === 'string' ? el.value.length : null,
    codePoints: typeof el.value === 'string' ? [...el.value].length : null,
    invalid: el.getAttribute('aria-invalid') === 'true' || (el.validity ? !el.validity.valid : false) || el.classList.contains('ng-invalid'),
    error: errors.join(' ') || null,
    counter: counter ? { shown: Number(counter[1]), of: Number(counter[2]) } : null,
  };
}

// Closes welcome dialogs/popups that block the form. Never accepts cookie consent.
export function dismissOverlays() {
  const btns = [...document.querySelectorAll('[role=dialog] button, mat-dialog-container button, .cdk-overlay-container button, .modal button')];
  const close = btns.find((b) => /^(dismiss|close|×|x|no thanks|got it|skip)$/i.test((b.innerText || b.getAttribute('aria-label') || '').trim()))
    || btns.find((b) => /close|dismiss/i.test(b.getAttribute('aria-label') || ''));
  if (close) { close.click(); return true; }
  return false;
}

// All same-origin link targets on the page (including hidden menus and hash routes).
export function collectLinks() {
  return [...document.querySelectorAll('a[href], [routerlink]')].map((a) => ({
    href: a.href || new URL(a.getAttribute('routerlink'), location.href).href,
    text: (() => { let t = a.innerText || ''; a.querySelectorAll('mat-icon, .material-icons, [class*="icon" i]').forEach((i) => { if (i.innerText) t = t.replace(i.innerText, ''); }); return (t.replace(/\s+/g, ' ').trim() || a.getAttribute('aria-label') || '').slice(0, 50); })(),
  })).filter((l) => l.href.startsWith(location.origin));
}
