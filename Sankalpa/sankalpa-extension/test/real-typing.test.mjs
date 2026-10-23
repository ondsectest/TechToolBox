// "Type with a real keyboard" (optional debugger permission). Chrome's permission prompt can't be clicked
// in headless mode, so this test loads a temporary copy of the extension with "debugger" pre-granted.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../form-scanner/node_modules/playwright/index.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const up = await fetch('http://localhost:3000/').then((r) => r.ok).catch(() => false);
const opts = { skip: up ? false : 'Juice Shop is not running on localhost:3000' };
let ctx, rows = {};

before(async () => {
  if (!up) return;
  const EXT = join(mkdtempSync(join(tmpdir(), 'sankalpa-ext-')), 'ext');
  cpSync(SRC, EXT, { recursive: true, filter: (p) => !p.includes('/test') });
  const m = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  m.permissions.push('debugger');
  writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(m));

  ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const target = await ctx.newPage();
  await target.goto('http://localhost:3000/#/');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:3000/*' }))[0].id);
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${sw.url().split('/')[2]}/panel.html?tabId=${tabId}#/new`);
  await panel.getByLabel('Max pages to visit').fill('6');
  await panel.getByRole('button', { name: 'Find forms' }).click();
  await panel.getByRole('heading', { name: 'Pick what to test' }).waitFor({ timeout: 240000 });
  for (const t of ['Login', 'Forgot Password']) { const cb = panel.getByLabel(`Test ${t}`); if (await cb.count()) await cb.uncheck(); }
  await panel.locator('.part[value="1"]').uncheck();
  await panel.locator('.part[value="3"]').uncheck();
  await panel.getByLabel(/Type with a real keyboard/).check();
  await panel.getByRole('button', { name: 'Next' }).click();
  await panel.getByRole('button', { name: /^Start testing/ }).click();
  await panel.getByRole('button', { name: 'Download report (.md)' }).waitFor({ timeout: 600000 });
  rows = await panel.evaluate(() => Object.fromEntries([...document.querySelectorAll('h2.form-title')].flatMap((h) =>
    [...h.nextElementSibling.querySelectorAll('tbody tr')].map((tr) => [`${h.textContent.trim()} › ${tr.children[1].firstChild.textContent.trim()}`, { status: tr.children[0].innerText.split('\n')[0], detail: tr.children[2].innerText }]))));
}, { timeout: 900000 });

after(async () => { await ctx?.close(); });

test('real keyboard: Feedback keeps only 80 of 160 emoji (browser maxlength counts UTF-16)', opts, () => {
  const row = rows['Customer Feedback › 160 emoji fit in "Comment" (emoji count as 1)'];
  console.log(row);
  assert.equal(row?.status, 'Fail');
  assert.match(row.detail, /only 80 kept/);
  assert.doesNotMatch(row.detail, /emulated/);
});
test('real keyboard: Comment stops at 160', opts, () => {
  assert.equal(rows['Customer Feedback › Browser stops "Comment" at 160 characters']?.status, 'Pass');
});
test('real keyboard: Password keeps 45 characters (no maxlength), error only after leaving', opts, () => {
  const row = rows['User Registration › Browser stops "Password" at 40 characters'];
  console.log(row);
  assert.ok(['Warning', 'Fail'].includes(row?.status));
  assert.doesNotMatch(row.detail, /emulated/);
});
