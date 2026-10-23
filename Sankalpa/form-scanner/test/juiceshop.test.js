// Developer regression suite: Sankalpa must find the bugs we already confirmed by hand in
// OWASP Juice Shop (reports of 2026-10-06 and 2026-10-17). Needs Juice Shop on localhost:3000.
// Run: npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SANKALPA_DB = join(mkdtempSync(join(tmpdir(), 'sankalpa-test-')), 'test.sqlite');
const { suites, cases, runs, results, consents } = await import('../src/db.js');
const { discover } = await import('../src/engine/discover.js');
const { builtInCases } = await import('../src/engine/cases.js');
const { runSuite } = await import('../src/engine/run.js');

const TARGET = 'http://localhost:3000/#/login';
const up = await fetch('http://localhost:3000/').then((r) => r.ok).catch(() => false);
let byTitle = {};

before(async () => {
  if (!up) return;
  const d = await discover({ startUrl: TARGET, pageLimit: 5 });
  const forms = d.forms.filter((f) => ['User Registration', 'Login', 'Forgot Password'].includes(f.title));
  consents.grant(d.origin);
  const id = suites.create({ name: 'regression', origin: d.origin, start_url: TARGET, settings: { agreedLimits: { [forms.find((f) => f.title === 'User Registration').key]: { securityAnswerControl: { max: 100 } } } }, forms });
  for (const f of forms) for (const c of builtInCases(f, suites.get(id).settings, [1, 2, 3])) cases.add({ ...c, suite_id: id });
  const runId = runs.start(id);
  await runSuite(id, runId);
  const all = new Map(cases.forSuite(id).map((c) => [c.id, c]));
  const formTitle = Object.fromEntries(forms.map((f) => [f.key, f.title]));
  byTitle = Object.fromEntries(results.forRun(runId).map((r) => { const c = all.get(r.case_id); return [`${formTitle[c.form_key]} › ${c.title}`, r]; }));
}, { timeout: 600000 });

const opts = { skip: up ? false : 'Juice Shop is not running on localhost:3000' };
const status = (title) => byTitle[title]?.status;

test('discovery finds the password rule 5–40 from form validation (no maxlength)', opts, () => {
  assert.equal(status('User Registration › Browser stops "Password" at 40 characters'), 'fail');
  assert.ok(byTitle['User Registration › Server rejects "Password" with 4 characters'], 'min 5 detected');
});

test('Part 1: registration email is not focused on open', opts, () => {
  assert.equal(status('User Registration › "Email" is focused when the form opens'), 'fail');
});

test('Part 2: password counter shows /20 instead of 40', opts, () => {
  assert.equal(status('User Registration › "Password" counter shows the real limit (40)'), 'fail');
  assert.match(byTitle['User Registration › "Password" counter shows the real limit (40)'].detail, /\/20/);
});

test('Part 3: server accepts a 41-character password (no server rule)', opts, () => {
  assert.equal(status('User Registration › Server rejects "Password" with 41 characters'), 'fail');
  assert.match(byTitle['User Registration › Server rejects "Password" with 41 characters'].detail, /accepted/i);
});

test('Part 3: empty password is rejected but the account is saved anyway', opts, () => {
  assert.equal(status('User Registration › Server rejects an empty "Password"'), 'fail');
  assert.match(byTitle['User Registration › Server rejects an empty "Password"'].detail, /saved the record anyway/);
});

test('Part 3: password trimmed below the minimum is accepted', opts, () => {
  assert.equal(status('User Registration › Server rejects "Password" that is too short once spaces are removed'), 'fail');
});

test('Part 3: linked request — empty security answer accepted', opts, () => {
  assert.equal(status('User Registration › Server rejects an empty "Answer"'), 'fail');
});

test('Login form gets no server boundary cases', opts, () => {
  assert.ok(Object.keys(byTitle).some((t) => t.startsWith('Login › ')), 'login cases exist');
  assert.ok(!Object.keys(byTitle).some((t) => t.startsWith('Login › Server')), 'no server cases for login');
});
