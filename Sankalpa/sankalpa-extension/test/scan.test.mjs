// The scan: visible status, quick Stop, survives a broken page, no duplicate pages. Needs Juice Shop on :3000.
// Reproduces the reported "Stopping after this page…" hang (start on /#/contact, 30 pages, Stop).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../form-scanner/node_modules/playwright/index.mjs';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const up = await fetch('http://localhost:3000/').then((r) => r.ok).catch(() => false);
const opts = { skip: up ? false : 'Juice Shop is not running on localhost:3000' };
const out = { errors: [] };
let ctx;

before(async () => {
  if (!up) return;
  ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const target = await ctx.newPage(); await target.goto('http://localhost:3000/#/contact');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:3000/*' }))[0].id);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => out.errors.push(e.message));
  await p.goto(`chrome-extension://${sw.url().split('/')[2]}/panel.html?tabId=${tabId}#/new`);
  await p.getByRole('button', { name: 'Find forms' }).click();

  // visible status while scanning
  await p.locator('#scanStatus').getByText(/Visiting page \d+ of 30/).waitFor({ timeout: 15000 });
  out.status = await p.locator('#scanStatus').innerText();

  // sabotage: send the tab somewhere extensions may not script; the scan must skip it and continue
  await p.waitForTimeout(6000);
  await sw.evaluate((id) => chrome.tabs.update(id, { url: 'chrome://version' }), tabId);
  await p.waitForTimeout(12000);
  out.stillScanning = await p.locator('#scanStatus').isVisible();

  // Stop must take effect within seconds and open step 2 with the forms found
  await p.getByRole('button', { name: /Stop and use/ }).click();
  const t0 = Date.now();
  await p.getByRole('heading', { name: 'Pick what to test' }).waitFor({ timeout: 60000 });
  out.stopSeconds = (Date.now() - t0) / 1000;
  out.note = await p.locator('.note').first().innerText().catch(() => '');
  out.forms = await p.locator('.form-wrap').count();
  out.log = await p.locator('#log').innerText().catch(() => null); // log is gone after step 2; read from storage of the job instead
  out.pages = await p.evaluate(() => [...document.querySelectorAll('.form-wrap .card-head .muted')].map((x) => x.textContent));
}, { timeout: 300000 });

after(async () => { await ctx?.close(); });

test('no page errors', opts, () => assert.deepEqual(out.errors, []));
test('a status line shows the page being visited', opts, () => assert.match(out.status, /Visiting page \d+ of 30[\s\S]*form/));
test('a page that cannot be scanned is skipped, the scan carries on', opts, () => assert.ok(out.stillScanning));
test('Stop opens step 2 within seconds, with the forms found', opts, () => {
  assert.ok(out.stopSeconds < 15, `took ${out.stopSeconds}s`);
  assert.ok(out.forms >= 1, `forms: ${out.forms}`);
  assert.match(out.note, /stopped the scan early/);
});
test('no duplicate pages like /login#/contact', opts, () => {
  const paths = out.pages.map((x) => x.split(' · ')[0]);
  assert.equal(new Set(paths).size, paths.length, paths.join(', '));
});
