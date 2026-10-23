// Shared rules — the same knowledge as the forms-testing skill (Parts 1–3), in code.
// Keep this file the single source of truth for limits and safety decisions.

// Suggested limits when a field has none (skill Part 2 table). Shown to the user to confirm.
const SUGGESTIONS = [
  { test: /e-?mail/i, max: 254, reason: 'RFC 5321 limits an email address path to 256 characters including < >, so 254 is the usable maximum.' },
  { test: /pass(word)?|pwd/i, max: 64, min: 8, reason: 'NIST SP 800-63B: allow at least 64 characters; minimum 8. (If the app already has a rule, keep that.)' },
  { test: /phone|mobile|tel/i, max: 20, reason: 'ITU-T E.164 numbers have at most 15 digits; 20 leaves room for +, spaces and dashes.' },
  { test: /(first|given|last|family|sur)\s*-?name/i, max: 50, reason: 'Names worldwide can be long and multi-part; 50 per part avoids excluding real people.' },
  { test: /full\s*name|^name$/i, max: 100, reason: 'Room for multi-part names from any culture.' },
  { test: /user\s*name|login/i, max: 30, reason: 'Common practice for usernames (no standard; confirm with your team).' },
  { test: /zip|post(al)?\s*code|pin\s*code/i, max: 12, reason: 'The longest national postal codes are about 10 characters.' },
  { test: /address|street/i, max: 100, reason: 'No global standard; 100 per line fits most countries and couriers.' },
  { test: /url|website|link/i, max: 2048, reason: 'Practical limit across browsers and servers.' },
  { test: /answer/i, max: 100, reason: 'Long enough for a real answer, short enough to stop abuse (no standard).' },
  { test: /comment|message|feedback|bio|description|review/i, max: 1000, reason: 'Long free text: pick by purpose (500–2000) and show a counter.' },
];
const DEFAULT_SUGGESTION = { max: 100, reason: 'Short free text: 100 characters is a common, readable limit (confirm with your team).' };

export function suggestLimit(field) {
  const text = `${field.label || ''} ${field.key || ''} ${field.type || ''}`;
  const hit = SUGGESTIONS.find((s) => s.test.test(text));
  return hit ? { max: hit.max, min: hit.min ?? null, reason: hit.reason } : { ...DEFAULT_SUGGESTION, min: null };
}

// Fields whose length matters (free text). Selects, checkboxes, radios, dates are skipped.
export const TEXT_TYPES = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'textarea', '']);
export const isTextField = (f) => TEXT_TYPES.has(f.type ?? '') && !f.hidden;
export const isEmailField = (f) => f.type === 'email' || /e-?mail/i.test(`${f.label} ${f.key}`);

// Safety (skill Part 3 "Consent and scope").
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost|.+\.test)$/i;
export const isLocalHost = (hostname) => LOCAL.test(hostname);

const RISKY = /\b(card\s*number|credit\s*card|cvv|cvc|expiry|iban|swift|payment|pay now|checkout|place order|transfer|wallet|delete|remove account|close account)\b/i;
export const isRiskyForm = (text) => RISKY.test(text || '');
export const whyRisky = (text) => (text || '').match(RISKY)?.[0] ?? null;

const CAPTCHA = /captcha|recaptcha|hcaptcha|turnstile/i;
export const hasCaptcha = (text) => CAPTCHA.test(text || '');
export const whyCaptcha = (text) => (text || '').match(CAPTCHA)?.[0] ?? null;

// Input presets for "+ Add test case" (kept to six).
export const PRESETS = {
  at_max: { label: 'N chars (at the limit)', make: (lim) => 'a'.repeat(lim.max) },
  over_max: { label: 'N+1 chars (over the limit)', make: (lim) => 'a'.repeat(lim.max + 1) },
  empty: { label: 'Empty', make: () => '' },
  spaces_around: { label: 'Spaces around a valid value', make: (lim, valid) => `  ${valid}  ` },
  emoji: { label: 'Emoji × N', make: (lim) => '😀'.repeat(lim.max) },
  non_latin: { label: 'Non-Latin text', make: () => 'संतोष Тест テスト محمد' },
  custom: { label: 'My own text', make: (lim, valid, own) => own ?? '' },
};

// Expected results a user can pick (and the built-in kinds that map to them).
export const EXPECTED = ['Accepted', 'Rejected', 'Field focused on open', 'Cursor at end'];

// Build the value for a length-specific field, keeping emails syntactically valid.
// Emails keep the local part short and split the domain into labels of <= 60 chars,
// so length is the only thing that changes (RFC: local part <= 64, label <= 63).
export function sized(field, n, tag = 'x') {
  if (!isEmailField(field) || n < 16) return 'a'.repeat(n);
  const local = `t${tag}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
  let rest = n - local.length - 1 - 4; // '@' and '.com'
  const labels = [];
  while (rest > 0) { const len = Math.min(60, rest === 61 ? 59 : rest); labels.push('a'.repeat(len)); rest -= len + 1; }
  let s = `${local}@${labels.join('.')}.com`;
  while (s.length < n) s = s.replace('@', '@b');
  return s.slice(s.length - n);
}
