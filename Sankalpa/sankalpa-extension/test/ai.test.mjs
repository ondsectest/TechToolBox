// AI bug reports, end to end, against a fake OpenAI-compatible model server on localhost
// (records what Sankalpa sends, answers with a canned report). Needs Juice Shop on :3000.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../form-scanner/node_modules/playwright/index.mjs';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..');
const up = await fetch('http://localhost:3000/').then((r) => r.ok).catch(() => false);
const opts = { skip: up ? false : 'Juice Shop is not running on localhost:3000' };

const received = [];
const fake = createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.url.endsWith('/models')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'fake-qa-model' }] })); return; }
  if (req.url.endsWith('/chat/completions')) {
    const j = JSON.parse(body); received.push(j);
    const facts = j.messages.at(-1).content;
    const title = /"title": "([^"]+)"/.exec(facts)?.[1] || 'unknown';
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: j.messages.length === 1 ? 'OK' : `## FAKE BUG REPORT\nCase: ${title}` } }] }));
    return;
  }
  res.statusCode = 404; res.end();
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${fake.address().port}/v1`;

let ctx, panel, single = '', all = '', testMsg = '', copied = '';

before(async () => {
  if (!up) return;
  ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const target = await ctx.newPage();
  await target.goto('http://localhost:3000/#/register');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:3000/*' }))[0].id);
  panel = await ctx.newPage();

  // 1. AI settings: custom OpenAI-compatible provider → load models → save → test connection
  await panel.goto(`chrome-extension://${id}/panel.html?tabId=${tabId}#/settings`);
  await panel.getByLabel('Other OpenAI-compatible API').check();
  await panel.getByLabel('Base URL').fill(BASE);
  await panel.getByRole('button', { name: 'Load models' }).click();
  await panel.getByText('1 model found.').waitFor();
  await panel.getByRole('button', { name: 'Save' }).click();
  await panel.getByRole('button', { name: 'Test connection' }).click();
  await panel.getByText(/Model answered/).waitFor();
  testMsg = await panel.locator('#aiMsg').innerText();

  // 2. A quick suite with failures: registration form only, browser checks only
  await panel.goto(`chrome-extension://${id}/panel.html?tabId=${tabId}#/new`);
  await panel.getByLabel('Site to test').fill('http://localhost:3000/#/register');
  await panel.getByLabel('Max pages to visit').fill('1');
  await panel.getByRole('button', { name: 'Find forms' }).click();
  await panel.getByRole('heading', { name: 'Pick what to test' }).waitFor({ timeout: 120000 });
  await panel.locator('.part[value="1"]').uncheck();
  await panel.locator('.part[value="3"]').uncheck();
  await panel.getByRole('button', { name: 'Next' }).click();
  await panel.getByRole('button', { name: /^Start testing/ }).click();
  await panel.getByRole('button', { name: 'Download report (.md)' }).waitFor({ timeout: 300000 });

  // 3. One bug report (local model → no preview step), then copy
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `chrome-extension://${id}` }).catch(() => {});
  await panel.getByRole('button', { name: 'Bug report', exact: true }).first().click();
  await panel.getByRole('button', { name: 'Write bug report' }).click();
  await panel.locator('.bug-text').first().waitFor();
  single = await panel.locator('.bug-text').first().inputValue();
  await panel.getByRole('button', { name: 'Copy report' }).click();
  await panel.getByText(/Copied/).first().waitFor();
  copied = await panel.evaluate(() => navigator.clipboard.readText()).catch(() => '(clipboard not readable in test)');

  // 4. All failures at once
  await panel.getByRole('button', { name: 'Bug reports for all failures (AI)' }).click();
  await panel.getByText(/bug reports written/).waitFor({ timeout: 60000 });
  all = await panel.locator('#allBugsOut textarea').inputValue();
}, { timeout: 600000 });

after(async () => { await ctx?.close(); fake.close(); });

test('settings: load models, save, test connection', opts, () => assert.match(testMsg, /Model answered: OK/));
test('one bug report: the model\'s text appears and can be copied', opts, () => {
  assert.match(single, /FAKE BUG REPORT/);
  if (!copied.startsWith('(')) assert.equal(copied, single);
});
test('the model got the facts and the bug-report instructions', opts, () => {
  const r = received.find((x) => x.messages.length === 2);
  assert.equal(r.model, 'fake-qa-model');
  assert.match(r.messages[0].content, /senior QA engineer/);
  assert.match(r.messages[0].content, /Steps to reproduce/);
  assert.match(r.messages[1].content, /"testCase"/);
  assert.match(r.messages[1].content, /"html"/);
});
test('no secrets were sent', opts, () => {
  for (const r of received) assert.doesNotMatch(JSON.stringify(r), /Bearer\s|"password":\s*"[^[]/i);
});
test('all failures: one report per failure, joined for one copy', opts, () => {
  const n = (all.match(/FAKE BUG REPORT/g) || []).length;
  assert.ok(n >= 2, `reports: ${n}`);
});
