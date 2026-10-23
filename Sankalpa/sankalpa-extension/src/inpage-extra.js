// Extension-only helpers that run INSIDE the page (isolated world). Bundled by scripts/build.mjs
// together with the shared form-scanner/src/engine/page.js into content/inpage.js as window.__sk.
// Each function may call the others through window.__sk.

export function el(key) {
  return document.querySelector(`[data-sk-field="${CSS.escape(key)}"]`);
}

// Resolves once the page has finished loading and the DOM has been quiet for `idle` ms.
export function quiet(maxMs = 6000, idle = 500) {
  return new Promise((resolve) => {
    const start = Date.now();
    let last = Date.now();
    const mo = new MutationObserver(() => { last = Date.now(); });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => {
      const now = Date.now();
      if ((document.readyState === 'complete' && now - last >= idle) || now - start > maxMs) { mo.disconnect(); resolve(true); return; }
      setTimeout(tick, 100);
    };
    tick();
  });
}

// Sets a value the way frameworks notice (native setter + input/change events).
export function setValue(key, value, blur = true) {
  const e = window.__sk.el(key);
  if (!e) return false;
  e.focus();
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, value);
  e.dispatchEvent(new Event('input', { bubbles: true }));
  e.dispatchEvent(new Event('change', { bubbles: true }));
  if (blur) e.blur();
  return true;
}

export async function checkValue(key, value) {
  window.__sk.setValue(key, value, true);
  await new Promise((r) => setTimeout(r, 40));
  return window.__sk.fieldFeedback(key);
}

// Emulated typing: applies the browser's maxlength rule (UTF-16 units, never splitting an emoji).
export function typeEmulated(key, text) {
  const e = window.__sk.el(key);
  if (!e) return null;
  e.focus();
  let out = e.value || '';
  for (const ch of text) {
    if (e.maxLength >= 0 && out.length + ch.length > e.maxLength) break;
    out += ch;
  }
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, out);
  e.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  return { valueLength: out.length };
}

export function focusField(key) { const e = window.__sk.el(key); if (e) e.focus(); return !!e; }
export function blurField(key) { const e = window.__sk.el(key); if (e) e.blur(); return !!e; }
export function value(key) { return window.__sk.el(key)?.value ?? null; }

// Clicks a visible link to one of the given hrefs. Returns its text, or null.
export function clickLinkTo(hrefs) {
  const vis = (a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const a = [...document.querySelectorAll('a[href]')].find((x) => vis(x) && (hrefs.includes(x.getAttribute('href')) || hrefs.includes(x.href)));
  if (!a) return null;
  a.click();
  return (a.innerText || a.getAttribute('aria-label') || '').trim();
}

export function setHash(h) { location.hash = h; return true; }

// Picks the first real option of a native <select> or a custom dropdown (mat-select, role=combobox).
export async function pickOption(key) {
  const e = window.__sk.el(key);
  if (!e) return null;
  if (e.tagName === 'SELECT') {
    e.selectedIndex = Math.min(1, e.options.length - 1);
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return e.value;
  }
  e.click();
  await new Promise((r) => setTimeout(r, 400));
  let opt = document.querySelector('mat-option, [role=option]');
  if (!opt) {
    e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    opt = document.querySelector('mat-option, [role=option]');
  }
  opt?.click();
  await new Promise((r) => setTimeout(r, 300));
  return opt ? opt.innerText.trim() : null;
}

export function check(key) { const e = window.__sk.el(key); if (e && !e.checked) e.click(); return !!e; }

export function submitState(i) {
  const b = document.querySelector(`[data-sk-submit="${i}"]`);
  const bad = [...document.querySelectorAll(`[data-sk-form="${i}"] [data-sk-field]`)]
    .filter((e) => e.getAttribute('aria-invalid') === 'true' || e.classList.contains('ng-invalid')).map((e) => e.getAttribute('data-sk-field'));
  return { disabled: !!b?.disabled || b?.getAttribute('aria-disabled') === 'true', invalid: bad, exists: !!b };
}

export function clickSubmit(i) { const b = document.querySelector(`[data-sk-submit="${i}"]`); if (b) b.click(); return !!b; }

// Opens menus (hamburger, account) so links hidden inside them are found too.
export async function revealLinks() {
  const links = window.__sk.collectLinks();
  const menus = [...document.querySelectorAll('button[aria-label*="menu" i], button[aria-label*="nav" i], button[aria-label*="account" i], button[aria-haspopup="true"]')].slice(0, 4);
  for (const m of menus) {
    m.click();
    await new Promise((r) => setTimeout(r, 400));
    links.push(...window.__sk.collectLinks());
    document.querySelector('.cdk-overlay-backdrop')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
  }
  return links;
}

// Scrolls to a field and outlines it for a few seconds, with its Sankalpa name.
export function highlight(formIndex, key) {
  const e = document.querySelector(`[data-sk-form="${formIndex}"] [data-sk-field="${CSS.escape(key)}"]`) || window.__sk.el(key);
  if (!e) return false;
  const target = e.closest('mat-form-field, .form-group, .field') || e;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  document.getElementById('__sk_hl')?.remove();
  const box = document.createElement('div');
  box.id = '__sk_hl';
  const place = () => {
    const r = target.getBoundingClientRect();
    Object.assign(box.style, { position: 'fixed', left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
  };
  Object.assign(box.style, { border: '3px solid #e8590c', borderRadius: '6px', zIndex: 2147483647, pointerEvents: 'none', boxShadow: '0 0 0 4px rgba(232,89,12,.25)' });
  const tag = document.createElement('div');
  tag.textContent = `Sankalpa: ${key}`;
  Object.assign(tag.style, { position: 'absolute', top: '-24px', left: '-3px', background: '#e8590c', color: '#fff', font: '12px/1.6 system-ui, sans-serif', padding: '0 6px', borderRadius: '4px', whiteSpace: 'nowrap' });
  box.append(tag);
  document.body.append(box);
  place();
  const timer = setInterval(place, 50);
  setTimeout(() => { clearInterval(timer); box.remove(); }, 4000);
  return true;
}
