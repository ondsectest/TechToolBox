// "Think while you wait": test-idea cards, bug lessons, prediction scoring.
// Content is based on the Software Testing MindMaps collection (github.com/dimensi0nless/software-testing-mindmaps),
// an initiative by Santhosh Tuppad with many community contributors (see that repository's README).
// Each card names its mindmap, and an author only where the mindmap itself names one.
// Shared by the web app and the extension. Pure: no DOM.

export const COLLECTION = { name: 'Software Testing MindMaps', url: 'https://github.com/dimensi0nless/software-testing-mindmaps' };
const TI50 = (n) => `"50 Bugs – Test Ideas" (TestInsane) #${n}`;
const TI37 = (s) => `"37 Sources for Test Ideas": ${s}`;
const RL36 = (s) => `"36 Days of Web Testing" by Rob Lambert: ${s}`;

// tags: where the card fits. 'any' fits every form.
export const CARDS = [
  // registration / account creation
  { tags: ['registration'], text: 'Is there a "confirm password" field? If a user mistypes once, can they still log in?', source: TI50(2) },
  { tags: ['registration'], text: 'After signing up, is an activation email sent? Can the account be used before it is activated?', source: TI50(5) },
  { tags: ['registration', 'password'], text: 'Is there a password policy at all? Try "a", "123456" and the email address itself as the password.', source: TI50(11) },
  { tags: ['registration', 'password'], text: 'Is there a strength meter or any advice on choosing a good password, before the user gets it wrong?', source: `${TI50(37)} & #39` },
  { tags: ['registration'], text: 'Is there anything stopping a script from creating 1,000 accounts a minute (CAPTCHA, rate limit, IP rule)?', source: TI50(42) },
  { tags: ['registration'], text: 'Is the username limited in length? Try 300 characters, then log in with it.', source: TI50(45) },
  { tags: ['registration', 'password'], text: 'Is the maximum password length generous enough for passphrases and password managers (64+)?', source: TI50(46) },
  { tags: ['registration'], text: 'Can the username and the password be exactly the same text?', source: TI50(47) },
  { tags: ['registration', 'any'], text: 'Double-click the submit button fast. Do you get two accounts, two orders, two comments?', source: TI50(48) },
  { tags: ['registration', 'login'], text: 'Register as "Santhosh.Tuppad", then log in as "santhosh.tuppad". What should happen? What does happen?', source: TI50(44) },
  { tags: ['registration', 'any'], text: 'A "*" appears next to some labels. Is it explained anywhere what it means?', source: TI50(22) },
  // passwords: change / reset
  { tags: ['password'], text: 'Does "change password" ask for the old password first? What if someone else is using your open session?', source: TI50(1) },
  { tags: ['password'], text: 'Use a "forgot password" link twice. Does it still work the second time? After a day?', source: TI50(6) },
  { tags: ['password'], text: 'How long is the reset token in the link? Could it be guessed by trying many values?', source: TI50(7) },
  { tags: ['password', 'login'], text: 'After changing the password, does the OLD password still work anywhere (other device, API, mobile app)?', source: TI50(16) },
  { tags: ['password'], text: 'Registration requires 6+ characters. Does change-password and reset-password enforce the same minimum?', source: TI50(17) },
  { tags: ['password', 'login'], text: 'Can a password contain spaces and every keyboard symbol? Is the same password accepted at login?', source: TI50(36) },
  { tags: ['password', 'login'], text: 'Is "Secret1" the same password as "SECRET1"? Should it be?', source: `${TI50(40)} & #41` },
  { tags: ['password', 'login'], text: 'Log in with the right password plus one extra character at the end. Does it still let you in?', source: TI50(43) },
  { tags: ['password', 'login'], text: 'On a small phone screen, is there still a "show password" option?', source: TI50(38) },
  // login
  { tags: ['login'], text: 'Is "Remember me" ticked by default? Should the user have to opt in?', source: TI50(23) },
  { tags: ['login', 'any'], text: 'Type http:// instead of https://. Are you forced onto HTTPS before any password is sent?', source: `${TI50(14)} & #15` },
  { tags: ['login'], text: 'Does the error for "wrong password" differ from "no such account"? What could an attacker learn from that?', source: TI37('Failure Modes') },
  { tags: ['login'], text: 'How many wrong passwords in a row are allowed? Is anything slowed down or locked?', source: TI50(35) },
  // security questions
  { tags: ['security-question'], text: 'Does the browser offer to autocomplete the security answer, showing earlier answers?', source: TI50(25) },
  { tags: ['security-question'], text: 'Is the security answer typed in plain view? Should it be hidden like a password?', source: TI50(26) },
  { tags: ['security-question'], text: 'Could anyone guess the answer to the questions offered? ("favourite colour" has few answers)', source: TI50(30) },
  { tags: ['security-question'], text: 'Will the answer still be true in five years? ("What car do you own?")', source: TI50(31) },
  { tags: ['security-question'], text: 'Is the security answer case-sensitive? Should "Paris" and "paris" both work?', source: TI50(34) },
  { tags: ['security-question'], text: 'How many wrong security answers are allowed? Could it be brute-forced?', source: TI50(35) },
  { tags: ['security-question'], text: 'If I forget my security answer, is there any way back into my account?', source: TI50(33) },
  // dates
  { tags: ['date'], text: 'Enter 31 February. Is it rejected, or saved and shown as 3 March?', source: TI50(18) },
  { tags: ['date'], text: 'Can 31 April or 31 June be chosen? These months have 30 days.', source: TI50(19) },
  { tags: ['date'], text: 'Can a date of birth be in the future?', source: TI50(21) },
  { tags: ['date'], text: 'If the date is split into DD / MM / YYYY boxes, does the cursor move on by itself after 2 digits?', source: TI50(24) },
  // search
  { tags: ['search'], text: 'Can a search result page be shared by copying the URL? (Searches sent by POST cannot.)', source: TI50(49) },
  { tags: ['search', 'any'], text: 'Does pressing Enter submit the form, or only clicking the button?', source: TI50(50) },
  // checkout / money
  { tags: ['checkout'], text: 'If the price is sent with the order, what happens if it is changed in the request?', source: TI50(4) },
  // CAPTCHA
  { tags: ['captcha'], text: 'Is the CAPTCHA answer visible to the browser (in a script or a file) before the user solves it?', source: TI50(8) },
  { tags: ['captcha'], text: 'Refresh the CAPTCHA 20 times. Do the same images or questions repeat?', source: TI50(9) },
  // any form: thinking prompts
  { tags: ['any'], text: 'Is everything the browser checks also checked by the server? Sankalpa\'s server checks look at length; what about format and required fields?', source: TI50(3) },
  { tags: ['any'], text: 'Which fields have no maxlength? What happens with 10,000 characters?', source: TI50(10) },
  { tags: ['any'], text: 'Ask "What if…?" five times about this form. Write down the strangest one.', source: TI37('Capabilities') },
  { tags: ['any'], text: 'Follow one piece of data: where is it created, shown, changed and deleted? Test each place.', source: TI37('Data') },
  { tags: ['any'], text: 'Make every mistake a user could make on this form, one at a time. Which error message is least helpful?', source: TI37('Usage Scenarios') },
  { tags: ['any'], text: 'Two similar users might view this form differently. Who is it hardest for?', source: TI37('Users') },
  { tags: ['any'], text: 'What does the business fear most about this form going wrong? Test that first.', source: TI37('Product Fears') },
  { tags: ['any'], text: 'Has this form had bugs before? Check the bug tracker or ask support what users complain about.', source: TI37('Product History') },
  { tags: ['any'], text: 'Fill the form, then press Back and Forward. Is the data still there? Is anything submitted twice?', source: RL36('Back button') },
  { tags: ['any'], text: 'Open the form in two tabs and submit both. Which one wins? Does the session survive?', source: RL36('Multiple Tabs & Windows') },
  { tags: ['any'], text: 'Copy the URL of a page you can only see when logged in. Open it in a private window.', source: RL36('Change the URL') },
  { tags: ['any'], text: 'Use only the Tab key. Does the order make sense? Can you reach and use every control?', source: RL36('Tab order') },
  { tags: ['any'], text: 'Switch the browser language and region. Do dates, numbers and error messages still make sense?', source: RL36('Change the locale') },
  { tags: ['any'], text: 'Slow the network to "Slow 3G" in DevTools and submit. What does the user see while waiting?', source: RL36('Throttle It') },
  { tags: ['any'], text: 'Turn off JavaScript. Does the form still work, fail politely, or submit without any checks?', source: RL36('Disable javascript') },
];

// What kind of form is this? (decides which cards fit)
export function formTags(form) {
  const t = new Set(['any']);
  const text = `${form.title} ${form.submitText || ''} ${form.url} ${form.fields.map((f) => `${f.key} ${f.label} ${f.type}`).join(' ')}`.toLowerCase();
  const pw = form.fields.filter((f) => f.type === 'password');
  if (form.flags?.login) t.add('login');
  if (pw.some((f) => f.repeatOf) || /regist|sign\s*up|create account|join/.test(text)) t.add('registration');
  if (pw.length) t.add('password');
  if (/reset|forgot|change password|new password/.test(text)) t.add('password');
  if (/security|answer/.test(text)) t.add('security-question');
  if (form.fields.some((f) => f.type === 'date') || /birth|dob|date/.test(text)) t.add('date');
  if (/search/.test(text)) t.add('search');
  if (/checkout|payment|price|basket|cart/.test(text)) t.add('checkout');
  if (form.flags?.captcha) t.add('captcha');
  return t;
}

// A shuffled deck for these forms: matching cards first, general ones after.
export function deckFor(forms = []) {
  const tags = new Set(forms.flatMap((f) => [...formTags(f)]));
  const specific = CARDS.filter((c) => c.tags.some((x) => x !== 'any' && tags.has(x)));
  const general = CARDS.filter((c) => !specific.includes(c) && c.tags.includes('any')); // never off-topic cards (e.g. dates when there are no date fields)
  const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  return [...shuffle(specific), ...shuffle(general)];
}

// ---- 30-second lessons for failures
const LESSONS = {
  focus: { title: 'The missing first focus', what: 'The form opens but the cursor is nowhere, so the first thing every user does is click.', why: 'Single-page apps change screens without a page load, so the HTML autofocus attribute never fires. Focus has to be set in code after the view renders.', look: ['Dialogs and modals: does focus move into them, and back when they close?', 'After a validation error: does focus jump to the first wrong field?'], idea: TI50(24) },
  caret: { title: 'Where the cursor lands', what: 'The field is focused, but the cursor sits at the start of the existing text, or the whole text is selected.', why: 'Browsers place the caret differently when code calls focus(); developers rarely test with a prefilled value.', look: ['Edit-profile and edit-address forms with saved data', 'Fields filled by the browser\'s autofill'], idea: TI37('Usage Scenarios') },
  labels: { title: 'Fields without names', what: 'A screen reader announces "edit text" with no name, so the user cannot tell what to type.', why: 'A placeholder or nearby text looks like a label but is not connected to the field.', look: ['Icon-only buttons (search, close, menu)', 'Custom dropdowns, sliders and date pickers'], idea: '"Accessibility Testing Tools" (try VoiceOver on a Mac: Cmd+F5)' },
  'no-client-limit': { title: 'A field with no limit', what: 'The page accepts any amount of text in this field.', why: 'Limits are often decided late (by the database) and never surfaced in the page.', look: ['Is there a limit on the server? (Sankalpa\'s server checks)', 'What happens to 10,000 characters: error, cut-off, crash?'], idea: TI50(10) },
  'client-limit': { title: 'The limit that only complains later', what: 'You can type past the limit; the page complains afterwards, or never.', why: 'A validator checks the length, but nobody set maxlength, so typing is not stopped.', look: ['Pasting a long text instead of typing', 'Does the counter (if any) stay visible next to the error?'], idea: TI50(10) },
  emoji: { title: 'Why one emoji counts as two', what: 'Emoji and many non-Latin characters use two "code units" in JavaScript, so a 160-character box holds only 80 of them.', why: 'maxlength and .length count UTF-16 code units, not the characters people see. Servers often count differently again.', look: ['Names in Hindi, Chinese or Arabic', 'Family/flag emoji, which are even longer (up to 11 units)'], idea: TI37('Data') },
  counter: { title: 'A counter that disagrees with the rule', what: 'The counter shows one limit, the validation enforces another.', why: 'The number in the counter was typed by hand instead of coming from the same rule.', look: ['Other forms with the same field (reset password, change password)', 'Help text and error messages: do they state the same number?'], idea: TI50(17) },
  'reject-but-save': { title: '"Rejected", but saved anyway', what: 'The server replies with an error, yet the record exists.', why: 'The code sends the error response but keeps running, so the next step still saves the data.', look: ['Other endpoints written the same way', 'What the user sees next: "already exists" when they try again'], idea: TI50(3) },
  'no-server-rule': { title: 'A rule that lives only in the browser', what: 'The page enforces the rule; the server accepts anything sent directly.', why: 'Validation was written once, in the front end. Anyone can skip the page and send the request.', look: ['Format rules (email, phone) and required fields, not just length', 'Hidden fields and prices sent with the request'], idea: `${TI50(3)} & #4` },
  'server-error': { title: 'Bad input crashes the server', what: 'Instead of a clear error, unusual input makes the server fail (HTTP 5xx).', why: 'The value reaches the database or other code that was never meant to see it.', look: ['Very long values, empty values, unusual characters', 'Does the error page reveal internal details?'], idea: TI37('Failure Modes') },
  'vague-message': { title: 'An error that does not say what to fix', what: 'The server rejects the value but the message does not name the field or the rule.', why: 'Generic errors are quicker to write than field-specific ones.', look: ['Every error message on the form: which field? what rule? what to do?', 'Are errors read out by screen readers?'], idea: TI37('Usage Scenarios') },
  'server-stricter': { title: 'Server stricter than the page', what: 'The page allows a value, then the server refuses it after submit.', why: 'Front end and back end were changed at different times.', look: ['Edge values exactly at the limit', 'Older apps or mobile clients that call the same server'], idea: TI37('Models') },
  other: { title: 'A finding worth a closer look', what: 'Sankalpa found behaviour that does not match the expected result.', why: 'Read the details and evidence to see which rule was broken.', look: ['Where else does the same field or rule appear?'], idea: TI37('Capabilities') },
};

export function lessonCategory(row) {
  const c = row.case, d = row.detail || '';
  if (c.kind === 'focus_on_open' || c.expected === 'Field focused on open') return 'focus';
  if (c.kind === 'caret_end' || c.expected === 'Cursor at end') return 'caret';
  if (['labels', 'counter', 'emoji'].includes(c.kind)) return c.kind;
  if (c.kind === 'has_limit') return 'no-client-limit';
  if (c.kind === 'client_max') return 'client-limit';
  if (/saved the record anyway/.test(d)) return 'reject-but-save';
  if (/Server accepted it/.test(d)) return 'no-server-rule';
  if (/Server error/.test(d)) return 'server-error';
  if (/doesn't name the field/.test(d)) return 'vague-message';
  if (/rejected a value the browser allows/.test(d)) return 'server-stricter';
  return 'other';
}
export const lessonFor = (row) => ({ id: lessonCategory(row), ...LESSONS[lessonCategory(row)] });

// ---- Predictions: "Will this check find a bug?"  yes = fail or warning.
export const isBug = (status) => status === 'fail' || status === 'warn';
export function scorePredictions(preds, rows) {
  const byCase = new Map(rows.map((r) => [String(r.case_id), r.status]));
  const judged = Object.entries(preds || {}).map(([caseId, guess]) => ({ caseId, guess, status: byCase.get(caseId) }))
    .filter((x) => x.status && x.status !== 'not_verified');
  return { total: judged.length, correct: judged.filter((x) => (x.guess === 'bug') === isBug(x.status)).length, judged };
}

// ---- Stats (kept on this machine; exportable for team comparison)
export const emptyStats = () => ({ name: '', predictions: 0, correct: 0, ideasSaved: 0, lessonsRead: 0, runsPredicted: 0 });
export function teamTable(files) {
  return files
    .map((f) => ({ name: f.name || 'Unnamed tester', predictions: f.predictions || 0, correct: f.correct || 0, ideasSaved: f.ideasSaved || 0, lessonsRead: f.lessonsRead || 0, exportedAt: f.exportedAt || '' }))
    .map((r) => ({ ...r, accuracy: r.predictions ? Math.round((100 * r.correct) / r.predictions) : null }))
    .sort((a, b) => (b.predictions >= 5) - (a.predictions >= 5) || (b.accuracy ?? -1) - (a.accuracy ?? -1) || b.predictions - a.predictions);
}
