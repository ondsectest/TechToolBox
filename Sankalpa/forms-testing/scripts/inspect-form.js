// Read-only form inspector. Paste into the page (or run via the browser tool's JS
// execution) WITHOUT clicking the form first. Returns JSON; changes nothing.
(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const isEditable = (el) =>
    !el.matches(':disabled') &&
    !el.readOnly &&
    el.getAttribute('aria-disabled') !== 'true' &&
    el.getAttribute('aria-readonly') !== 'true' &&
    !['hidden', 'submit', 'reset', 'button', 'image'].includes(el.type) &&
    !el.closest('[inert]') &&
    isVisible(el);

  const labelOf = (el) =>
    (el.labels && el.labels[0]?.textContent.trim()) ||
    el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') &&
      el.getAttribute('aria-labelledby').split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent.trim()).join(' ')) ||
    null;

  const caret = (el) => {
    try {
      return { selectionStart: el.selectionStart, selectionEnd: el.selectionEnd };
    } catch {
      return { selectionStart: null, selectionEnd: null };
    }
  };

  const describe = (el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.type || null,
    name: el.name || el.id || null,
    label: labelOf(el),
    hasPlaceholderOnly: !labelOf(el) && !!el.placeholder,
    editable: isEditable(el),
    disabled: el.matches(':disabled'),
    readOnly: !!el.readOnly,
    visible: isVisible(el),
    required: !!el.required,
    autofocusAttr: el.hasAttribute('autofocus'),
    maxLength: el.maxLength >= 0 ? el.maxLength : null,
    minLength: el.minLength >= 0 ? el.minLength : null,
    pattern: el.pattern || null,
    inputMode: el.inputMode || null,
    valueLength: typeof el.value === 'string' ? el.value.length : null,
    describedBy: el.getAttribute('aria-describedby'),
  });

  const forms = [...document.forms].map((f, i) => {
    const fields = [...f.elements].filter((e) => e.tagName !== 'FIELDSET' && e.tagName !== 'OUTPUT');
    const first = fields.find(isEditable);
    return {
      index: i,
      id: f.id || null,
      name: f.getAttribute('name') || null,
      ariaLabel: f.getAttribute('aria-label') || null,
      inDialog: !!f.closest('dialog,[role="dialog"]'),
      visible: isVisible(f),
      firstEditable: first ? describe(first) : null,
      fields: fields.map(describe),
    };
  });

  // Fields outside any <form> (common in SPAs)
  const orphanFields = [...document.querySelectorAll('input,select,textarea,[contenteditable="true"]')]
    .filter((e) => !e.form && isVisible(e)).map(describe);

  const a = document.activeElement;
  const active = a && a !== document.body
    ? { ...describe(a), formIndex: a.form ? [...document.forms].indexOf(a.form) : null, ...caret(a) }
    : { tag: a ? a.tagName.toLowerCase() : null, note: 'Nothing focused (body)' };

  if (active.valueLength && active.selectionStart !== undefined) {
    const { selectionStart: s, selectionEnd: e, valueLength: n } = active;
    active.caretVerdict =
      s === null ? 'unknown (email/number: use marker-key check)'
      : s === n && e === n ? 'at end ✓'
      : s === 0 && e === n ? 'whole text selected ✗'
      : s === 0 && e === 0 ? 'at start ✗'
      : `at position ${s}–${e} of ${n}`;
  }

  return JSON.stringify({ url: location.href, active, forms, orphanFields }, null, 2);
})();
