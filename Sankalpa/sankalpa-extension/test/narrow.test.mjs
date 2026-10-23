// Narrow DevTools panels (480px): results must keep their details, Evidence, Why? and Bug report. Needs Juice Shop on :3000.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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
  ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 480, height: 800 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const t = await ctx.newPage(); await t.goto('http://localhost:3000/#/register');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:3000/*' }))[0].id);
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${sw.url().split('/')[2]}/panel.html?tabId=${tabId}#/new`);
  await p.getByLabel('Max pages to visit').fill('1');
  await p.getByRole('button', { name: 'Find forms' }).click();
  await p.getByRole('heading', { name: 'Pick what to test' }).waitFor({ timeout: 120000 });
  await p.locator('.part[value="1"]').uncheck(); await p.locator('.part[value="3"]').uncheck();
  await p.getByRole('button', { name: /Next/ }).click();
  await p.getByRole('button', { name: /^Start testing/ }).click();
  await p.getByRole('button', { name: 'Download report (.md)' }).waitFor({ timeout: 300000 });
  out.fails = await p.locator('table.results .s-fail').count();
  out.why = await p.getByRole('button', { name: 'Why?' }).count();
  out.bug = await p.getByRole('button', { name: 'Bug report', exact: true }).count();
  out.evidence = await p.locator('table.results details summary', { hasText: 'Evidence' }).first().isVisible();
  out.sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
}, { timeout: 600000 });

after(async () => { await ctx?.close(); });

test('every failure keeps its Why? and Bug report buttons at 480px', opts, () => {
  assert.ok(out.fails > 0);
  assert.equal(out.why, out.fails);
  assert.equal(out.bug, out.fails);
});
test('evidence is visible, and the page does not scroll sideways', opts, () => { assert.ok(out.evidence); assert.equal(out.sideways, false); });
