import { isTextField, isEmailField } from '../rules.js';

// The limit a field is tested against: the browser's own rule, else the limit the user agreed to.
export function limitsFor(form, field, settings = {}) {
  const agreed = settings.agreedLimits?.[form.key]?.[field.key] || {};
  return {
    max: field.probe?.clientMax ?? agreed.max ?? null,
    min: field.probe?.clientMin ?? agreed.min ?? null,
    fromClient: field.probe?.clientMax != null,
  };
}

const name = (f) => f.label || f.key;
export const testable = (f) => isTextField(f) && !f.readOnly && !f.disabled && !f.repeatOf && !/captcha/i.test(`${f.key} ${f.label}`);
export const replayable = (form) => !form.flags.captcha && !form.flags.risky && !form.flags.noSubmit && !form.flags.login;

// Built-in test cases for one form (skill Parts 1–3), as plain rows for the test_cases table.
export function builtInCases(form, settings, parts) {
  const out = [];
  const add = (c) => out.push({ form_key: form.key, builtin: true, ...c });
  const first = form.fields.find((f) => f.key === form.firstEditable);
  const isPrimary = (settings.primary?.[form.url] ?? form.key) === form.key;

  if (parts.includes(1)) {
    if (first && isPrimary) {
      add({ part: 1, kind: 'focus_on_open', field_key: first.key, title: `"${name(first)}" is focused when the form opens`, expected: 'Field focused on open' });
      if (first.valueLength > 0) add({ part: 1, kind: 'caret_end', field_key: first.key, title: `Cursor is at the end of the prefilled "${name(first)}"`, expected: 'Cursor at end' });
    }
    add({ part: 1, kind: 'labels', title: 'Every field has a label (not only a placeholder)', expected: 'All fields labelled' });
  }

  for (const f of form.fields.filter(testable)) {
    const lim = limitsFor(form, f, settings);
    if (parts.includes(2)) {
      if (lim.max == null) {
        add({ part: 2, kind: 'has_limit', field_key: f.key, title: `"${name(f)}" has a length limit`, expected: 'Has a limit' });
      } else {
        add({ part: 2, kind: 'client_max', field_key: f.key, title: `Browser stops "${name(f)}" at ${lim.max} characters`, expected: 'Stops at limit' });
        if (lim.fromClient && !isEmailField(f)) add({ part: 2, kind: 'emoji', field_key: f.key, title: `${lim.max} emoji fit in "${name(f)}" (emoji count as 1)`, expected: 'Counts emoji as 1' });
      }
      if (f.probe?.counter) add({ part: 2, kind: 'counter', field_key: f.key, title: `"${name(f)}" counter shows the real limit (${lim.max ?? '?'})`, expected: 'Counter matches' });
    }
    if (parts.includes(3) && replayable(form) && lim.max != null) {
      const srv = (input_kind, title, expected) => add({ part: 3, kind: 'server', field_key: f.key, input_kind, title, expected });
      srv('at_max', `Server accepts "${name(f)}" with ${lim.max} characters`, 'Accepted');
      srv('over_max', `Server rejects "${name(f)}" with ${lim.max + 1} characters`, 'Rejected');
      if (f.required) srv('empty', `Server rejects an empty "${name(f)}"`, 'Rejected');
      if (lim.min > 1) {
        srv('under_min', `Server rejects "${name(f)}" with ${lim.min - 1} characters`, 'Rejected');
        srv('spaces_short', `Server rejects "${name(f)}" that is too short once spaces are removed`, 'Rejected');
      }
    }
  }
  return out;
}

// Value for a server/custom case. `valid` is a value the browser accepts for this field.
export function valueFor(kind, field, lim, valid, own, sized) {
  const max = lim.max ?? 100;
  switch (kind) {
    case 'at_max': return sized(field, max, 'm');
    case 'over_max': return sized(field, max + 1, 'o');
    case 'empty': return '';
    case 'under_min': return 'a'.repeat(Math.max(0, (lim.min ?? 1) - 1));
    case 'spaces_short': { const n = Math.max(1, (lim.min ?? 2) - 1); return ' '.repeat(Math.ceil(((lim.min ?? 2) - n) / 2) + 1) + 'a'.repeat(n) + '  '; }
    case 'spaces_around': return `  ${valid}  `;
    case 'emoji': return '😀'.repeat(max);
    case 'non_latin': return 'संतोष Тест テスト محمد';
    case 'custom': return own ?? '';
    default: return valid;
  }
}
