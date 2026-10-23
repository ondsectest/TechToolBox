// "Think while you wait": idea cards, predictions, lessons, stats & team. Needs Juice Shop on :3000.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../form-scanner/node_modules/playwright/index.mjs';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const up = await fetch('http://localhost:3000/').then((r) => r.ok).catch(() => false);
const opts = { skip: up ? false : 'Juice Shop is not running on localhost:3000' };
const out = {};
let ctx;

before(async () => {
  if (!up) return;
  ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const base = `chrome-extension://${sw.url().split('/')[2]}/panel.html`;
  const target = await ctx.newPage(); await target.goto('http://localhost:3000/#/register');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:3000/*' }))[0].id);
  const panel = await ctx.newPage();
  panel.on('pageerror', (e) => { out.errors = [...(out.errors || []), e.message]; });

  // 1. idea card while scanning, saved
  await panel.goto(`${base}?tabId=${tabId}#/new`);
  await panel.getByLabel('Site to test').fill('http://localhost:3000/#/register');
  await panel.getByLabel('Max pages to visit').fill('1');
  await panel.getByRole('button', { name: 'Find forms' }).click();
  await panel.getByText('While you wait: a test idea').waitFor({ timeout: 30000 });
  out.cardDuringScan = await panel.locator('.fun-idea').first().innerText();
  out.cardSource = await panel.locator('.fun-card .muted.small').nth(1).innerText();
  await panel.getByRole('button', { name: 'Save to my ideas' }).click();
  await panel.getByRole('heading', { name: 'Pick what to test' }).waitFor({ timeout: 120000 });
  await panel.locator('.part[value="1"]').uncheck(); await panel.locator('.part[value="3"]').uncheck();
  await panel.getByRole('button', { name: 'Next' }).click();


  // 2. predictions during the run
  await panel.getByRole('button', { name: /^Start testing/ }).click();
  out.predicted = 0;
  await panel.getByRole('button', { name: 'Yes, a bug' }).waitFor({ timeout: 30000 }).catch(() => {});
  for (let i = 0; i < 6; i++) {
    const yes = panel.getByRole('button', { name: 'Yes, a bug' });
    if (await yes.isVisible().catch(() => false)) { await yes.click(); out.predicted++; } else break;
  }
  await panel.getByRole('button', { name: 'Download report (.md)' }).waitFor({ timeout: 300000 });

  // 3. results: score banner, marks, a lesson
  out.banner = await panel.getByText(/Your predictions:/).innerText().catch(() => '');
  out.marks = await panel.locator('.chip', { hasText: /you said/ }).count();
  await panel.getByRole('button', { name: 'Why?' }).first().click();
  out.lesson = await panel.locator('[data-lesson-panel] .fun-card').first().innerText();
  const [dl] = await Promise.all([panel.waitForEvent('download'), panel.getByRole('button', { name: 'Download report (.md)' }).click()]);
  out.report = readFileSync(await dl.path(), 'utf8');

  // the idea saved while scanning is on the suite page
  await panel.getByRole('link', { name: /^←/ }).click();
  await panel.getByText(/Test ideas you saved \(1\)/).waitFor();
  out.ideaOnSuite = true;

  // 4. stats, export, team import
  await panel.goto(`${base}?tabId=${tabId}#/stats`);
  await panel.getByRole('heading', { name: 'My stats & team' }).waitFor();
  out.stats = await panel.locator('.summary').innerText();
  await panel.getByLabel(/Your name/).fill('Asha (test)');
  await panel.getByLabel(/Your name/).press('Tab');
  const [ex] = await Promise.all([panel.waitForEvent('download'), panel.getByRole('button', { name: 'Export my stats' }).click()]);
  const mine = readFileSync(await ex.path(), 'utf8');
  out.exported = JSON.parse(mine);
  const dir = mkdtempSync(join(tmpdir(), 'sk-team-'));
  writeFileSync(join(dir, 'me.json'), mine);
  writeFileSync(join(dir, 'ravi.json'), JSON.stringify({ sankalpaStats: 1, name: 'Ravi', predictions: 10, correct: 9, ideasSaved: 4, lessonsRead: 3 }));
  await panel.getByLabel(/Import teammates/).setInputFiles([join(dir, 'me.json'), join(dir, 'ravi.json')]);
  await panel.getByText('Ravi').waitFor();
  out.team = await panel.locator('table').innerText();
}, { timeout: 900000 });

after(async () => { await ctx?.close(); });

test('no page errors', opts, () => assert.deepEqual(out.errors || [], []));
test('idea card shows during the scan, with its source, and can be saved', opts, () => {
  assert.ok(out.cardDuringScan.length > 20);
  assert.match(out.cardSource, /"50 Bugs – Test Ideas" \(TestInsane\)|"37 Sources for Test Ideas"|"36 Days of Web Testing" by Rob Lambert/);
  assert.ok(out.ideaOnSuite);
});
test('predictions can be made during the run and are scored afterwards', opts, () => {
  assert.ok(out.predicted >= 1, `predicted ${out.predicted}`);
  assert.match(out.banner, /Your predictions: \d+ of \d+ right/);
  assert.ok(out.marks >= 1);
});
test('"Why?" shows a lesson', opts, () => { assert.match(out.lesson, /What's happening/); assert.match(out.lesson, /Where else to look/); });
test('report lists the saved idea', opts, () => assert.match(out.report, /## Test ideas saved during testing\n[\s\S]*- \[ \] /));
test('stats count predictions, ideas and lessons; export has the name', opts, () => {
  assert.match(out.stats, /1 idea saved/); assert.match(out.stats, /1 lesson read/);
  assert.equal(out.exported.name, 'Asha (test)'); assert.ok(out.exported.predictions >= 1);
});
test('team leaderboard shows imported testers', opts, () => { assert.match(out.team, /Ravi/); assert.match(out.team, /Asha \(test\)/); assert.match(out.team, /90%/); });
