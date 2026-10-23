// End-to-end: load the extension into Chromium, open its panel next to OWASP Juice Shop, click through
// the whole flow like a user, and check it finds the bugs confirmed by hand. Needs Juice Shop on :3000.
// Run: npm test   (Playwright comes from ../form-scanner/node_modules)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../form-scanner/node_modules/playwright/index.mjs';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const up = await fetch('http://localhost:3000/').then((r) => r.ok).catch(() => false);
const opts = { skip: up ? false : 'Juice Shop is not running on localhost:3000' };
let headline = '';
let urlBeforeRun = '', urlAfterRun = '', pressed = {}, chainGaps = [], throttleShown = '';
let ctx, panel, rows = {}, summary = '', targetPage, fieldTable = '', highlighted = false, liveCards = 0, fieldHeads = [], md = '';

before(async () => {
  if (!up) return;
  ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  targetPage = await ctx.newPage();
  await targetPage.goto('http://localhost:3000/#/login');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:3000/*' }))[0].id);

  panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/panel.html?tabId=${tabId}#/new`);
  await panel.getByLabel('Max pages to visit').fill('5');
  await panel.getByRole('button', { name: 'Find forms' }).click();
  await panel.getByText(/Forms found so far/).waitFor({ timeout: 120000 });
  liveCards = await panel.locator('#found .form-card').count();
  await panel.getByRole('heading', { name: 'Pick what to test' }).waitFor({ timeout: 240000 });
  const reg = panel.locator('.form-wrap', { hasText: 'User Registration' });
  await reg.locator('summary').click();
  fieldTable = await reg.locator('table.fields').innerText();
  await reg.locator('[data-show="passwordControl"]').click();
  for (let i = 0; i < 40 && !highlighted; i++) { highlighted = await targetPage.evaluate(() => !!document.getElementById('__sk_hl')); if (!highlighted) await targetPage.waitForTimeout(250); }
  for (const t of ['Customer Feedback']) { const cb = panel.getByLabel(`Test ${t}`); if (await cb.count()) await cb.uncheck(); }
  await panel.getByRole('button', { name: 'Next' }).click();
  // agree a limit for the security answer (suggested 100) and approve server checks for localhost:3000
  await panel.getByLabel(/I own this site/).check();
  await panel.getByText('Adjust before testing').click();
  await panel.getByLabel(/Wait between server requests/).fill('700');
  await panel.getByLabel('Suite name').fill('Juice Shop (extension)');
  const tabUrl = () => sw.evaluate(async (id) => (await chrome.tabs.get(id)).url, tabId);
  urlBeforeRun = await tabUrl();
  await panel.getByRole('button', { name: /^Start testing/ }).click();
  await panel.getByRole('button', { name: 'Download report (.md)' }).waitFor({ timeout: 600000 });
  await panel.waitForTimeout(1500);
  urlAfterRun = await tabUrl();
  summary = await panel.locator('.summary').first().innerText();
  fieldHeads = await panel.locator('.field-head').allInnerTexts();
  headline = await panel.locator('.headline').innerText();
  await panel.getByRole('button', { name: /Failures & warnings/ }).click();
  const bg = (n) => panel.getByRole('button', { name: n }).evaluate((b) => [b.getAttribute('aria-pressed'), getComputedStyle(b).backgroundColor]);
  pressed = { bad: await bg(/Failures & warnings/), all: await bg(/^All/) };
  await panel.getByRole('button', { name: /^All/ }).click();
  chainGaps = await sw.evaluate(async () => {
    const { results } = await chrome.storage.local.get('results');
    return Object.values(results).flatMap((run) => Object.values(run)).map((r) => r.evidence?.responses).filter((x) => x?.length > 1).map((x) => x[1].at - x[0].at);
  });
  const [dl] = await Promise.all([panel.waitForEvent('download'), panel.getByRole('button', { name: 'Download report (.md)' }).click()]);
  md = await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8');
  rows = await panel.evaluate(() => Object.fromEntries([...document.querySelectorAll('h2.form-title')].flatMap((h) => {
    const table = h.nextElementSibling;
    if (!table?.classList.contains('panel') || table.tagName !== 'DIV') return [];
    return [...table.querySelectorAll('tbody tr')].map((tr) => [`${h.textContent.trim()} › ${tr.children[1].firstChild.textContent.trim()}`, { status: tr.children[0].innerText.split('\n')[0], detail: tr.children[2].innerText }]);
  })));
  // the delay chosen in step 3 is saved on the suite
  await panel.getByRole('link', { name: /Juice Shop \(extension\)/ }).click();
  await panel.getByRole('button', { name: 'Run suite' }).waitFor();
  throttleShown = await panel.locator('#throttle').inputValue();
}, { timeout: 900000 });

after(async () => { await ctx?.close(); });

const r = (t) => rows[`User Registration › ${t}`];

test('run completes with results', opts, () => {
  console.log('summary:', summary.replace(/\n/g, ' · '), '| cases:', Object.keys(rows).length);
  assert.ok(Object.keys(rows).length > 15);
});
test('Part 1: registration email not focused on open', opts, () => assert.equal(r('"Email" is focused when the form opens')?.status, 'Fail'));
test('Part 2: password counter shows /20', opts, () => { assert.equal(r('"Password" counter shows the real limit (40)')?.status, 'Fail'); assert.match(r('"Password" counter shows the real limit (40)').detail, /\/20/); });
test('Part 2: typing is labelled emulated (no debugger by default)', opts, () => assert.match(r('Browser stops "Password" at 40 characters')?.detail || '', /emulated/));
test('Part 3: server accepts a 41-character password', opts, () => assert.equal(r('Server rejects "Password" with 41 characters')?.status, 'Fail'));
test('Part 3: reject-but-save on empty password', opts, () => assert.match(r('Server rejects an empty "Password"')?.detail || '', /saved the record anyway/));
test('Part 3: linked request — empty answer accepted', opts, () => assert.equal(r('Server rejects an empty "Answer"')?.status, 'Fail'));
test('Login: no server checks', opts, () => assert.ok(!Object.keys(rows).some((k) => k.startsWith('Login') && k.includes('› Server'))));
test('Tab is returned to where the user was', opts, () => { assert.ok(urlBeforeRun); assert.equal(urlAfterRun, urlBeforeRun); });

test('fields: forms appear live while scanning', opts, () => assert.ok(liveCards >= 1, `live cards: ${liveCards}`));
test('fields: table shows the hidden 5–40 rule, its source, and the /20 counter mismatch', opts, () => {
  assert.match(fieldTable, /5–40/); assert.match(fieldTable, /form validation/); assert.match(fieldTable, /shows \/20/); assert.match(fieldTable, /mismatch/);
});
test('fields: "Show in page" outlines the field in the tab', opts, () => assert.ok(highlighted));
test('report: results are grouped by field', opts, () => assert.ok(fieldHeads.some((h) => /Field: Password/.test(h)), fieldHeads.join(' | ')));
test('report: Markdown includes the field table', opts, () => { assert.match(md, /## Forms and fields/); assert.match(md, /passwordControl/); });

test('bug 1: the chosen filter button is visibly selected', opts, () => {
  assert.equal(pressed.bad[0], 'true'); assert.equal(pressed.all[0], 'false');
  assert.notEqual(pressed.bad[1], pressed.all[1], 'selected and unselected buttons look different');
});
test('bug 2: the delay set in step 3 is saved and honoured between requests', opts, () => {
  assert.equal(throttleShown, '700');
  assert.ok(chainGaps.length, 'linked requests were replayed');
  assert.ok(chainGaps.every((g) => g >= 700), `gaps: ${chainGaps.join(', ')} ms`);
  assert.match(md, /delay between requests \*\*700 ms\*\*/);
});
test('bug 3: report has the requests, responses, captured submit and client-side code', opts, () => {
  for (const re of [/## Details/, /The real submit Sankalpa captured/, /Where each field ends up in the request/, /```http\nPOST http:\/\/localhost:3000\/api\/Users\//, /Response:\n```http\nHTTP 201/, /Client-side code of the field:\n```html\n<input/, /Re-check: same unique values/, /Value sent:/, /Submit button \(client-side code\)/]) assert.match(md, re);
  console.log('report size:', md.length, 'characters');
});
test('linked request: answer checks re-send the chain through SecurityAnswers', opts, () => {
  assert.match(md, /POST http:\/\/localhost:3000\/api\/SecurityAnswers\//);
});

test('new flow: one Start testing button runs the tests and shows a headline', opts, () => {
  assert.match(headline, /\d+ problems? found: \d+ on the server, \d+ in the browser/);
});
