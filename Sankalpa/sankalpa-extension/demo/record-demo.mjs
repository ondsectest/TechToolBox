// Records a social-media demo of Sankalpa against OWASP Juice Shop on localhost:3000.
// Output: raw videos + timing markers in <out>/raw, then build-video.mjs edits them into an MP4.
// Run: node demo/record-demo.mjs <outDir>
import { chromium } from '../../form-scanner/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const EXT = new URL('..', import.meta.url).pathname;
const OUT = process.argv[2];
const RAW = join(OUT, 'raw');
mkdirSync(RAW, { recursive: true });
const W = 640, H = 720; // two halves of a 1280×720 frame: site (left) + Sankalpa panel (right)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: W, height: H }, deviceScaleFactor: 1,
  recordVideo: { dir: RAW, size: { width: W, height: H } },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
// a returning visitor: Juice Shop's welcome dialog and cookie notice were dismissed before
await ctx.addCookies([...['cookieconsent_status', 'welcomebanner_status'].map((name) => ({ name, value: 'dismiss', domain: 'localhost', path: '/' })), { name: 'language', value: 'en', domain: 'localhost', path: '/' }]);
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const base = `chrome-extension://${sw.url().split('/')[2]}/panel.html`;

const site = await ctx.newPage();
const siteT0 = Date.now();
await site.goto('http://localhost:3000/#/register');
const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:3000/*' }))[0].id);

const panel = await ctx.newPage();
const T0 = Date.now();
const marks = {};
const mark = (name) => { marks[name] = (Date.now() - T0) / 1000; };

// ---- overlay: captions + a visible cursor (headless recordings have no mouse pointer)
async function overlay() {
  await panel.evaluate(() => {
    if (document.getElementById('demoCaption')) return;
    const st = document.createElement('style');
    st.textContent = `
      #demoCaption { position: fixed; left: 12px; right: 12px; bottom: 14px; z-index: 2147483646; background: rgba(16,24,20,.92); color: #fff;
        font: 600 19px/1.35 system-ui, -apple-system, sans-serif; padding: 12px 16px; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.35);
        border-left: 5px solid #5fb396; transition: opacity .3s; pointer-events: none; }
      body { padding-bottom: 150px; }
      #demoCaption small { display: block; font-weight: 500; font-size: 15px; opacity: .85; margin-top: 4px; }
      #demoCaption[hidden] { display: block; opacity: 0; }
      #demoCursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
        background: rgba(232,89,12,.85); border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.4); left: 320px; top: 360px;
        transition: left .6s ease, top .6s ease, transform .15s; pointer-events: none; }
      #demoCursor.down { transform: scale(.7); }`;
    document.head.append(st);
    const c = document.createElement('div'); c.id = 'demoCaption'; c.hidden = true; document.body.append(c);
    const k = document.createElement('div'); k.id = 'demoCursor'; document.body.append(k);
  });
}
async function caption(text, sub = '') {
  await overlay();
  await panel.evaluate(([t, s]) => { const c = document.getElementById('demoCaption'); c.innerHTML = t + (s ? `<small>${s}</small>` : ''); c.hidden = !t; }, [text, sub]);
}
async function pointAt(loc) {
  await overlay();
  await loc.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
  await sleep(250);
  const b = await loc.boundingBox();
  if (!b) return;
  await panel.evaluate(([x, y]) => { const k = document.getElementById('demoCursor'); k.style.left = `${x}px`; k.style.top = `${y}px`; }, [b.x + b.width / 2, b.y + b.height / 2]);
  await sleep(750);
}
async function click(loc) {
  await pointAt(loc);
  await panel.evaluate(() => document.getElementById('demoCursor').classList.add('down'));
  await loc.click();
  await sleep(150);
  await panel.evaluate(() => document.getElementById('demoCursor')?.classList.remove('down'));
}

// ---- 1. start
await panel.goto(`${base}?tabId=${tabId}#/`);
await panel.getByRole('heading', { name: 'Test suites' }).waitFor();
await caption('Sankalpa lives in Chrome DevTools', 'Your site on the left, Sankalpa on the right');
await sleep(3000);
await click(panel.getByRole('link', { name: /Create your first suite|New suite/ }).first());
await panel.getByLabel('Max pages to visit').fill('3');
await caption('1 · Find the forms', 'It visits your pages and works out every field\'s rules. Nothing is submitted.');
await sleep(2500);
await click(panel.getByRole('button', { name: 'Find forms' }));
mark('scanStart');
await panel.getByRole('heading', { name: 'Pick what to test' }).waitFor({ timeout: 180000 });
mark('scanEnd');

// ---- 2. field details
await caption('2 · Every field, every rule', 'Found on its own, even without a maxlength attribute');
const reg = panel.locator('.form-wrap', { hasText: 'User Registration' });
await click(reg.locator('summary'));
await sleep(800);
const pw = reg.locator('table.fields tr', { hasText: 'passwordControl' }).first();
await pointAt(pw.locator('td').nth(2));
await caption('Password: 5–40 characters… but the counter says /20', 'Mismatch spotted automatically');
await sleep(4000);
await caption('Show in page', 'Outlines the field on your site');
await click(pw.getByRole('button', { name: /Show in page/ }));
mark('show');
await sleep(4500);

// ---- 3. confirm and start
await click(panel.getByRole('button', { name: /Next: confirm and test/ }));
await caption('3 · Approve server checks, then start', 'Only for your own or test sites. It never touches payment or delete forms.');
await sleep(2000);
await click(panel.getByLabel(/I own this site/));
await sleep(1200);
await click(panel.getByRole('button', { name: /^Start testing/ }));
mark('runStart');
await caption('Testing the browser and the server', 'Focus, length limits, emoji, and what the server really accepts');
await panel.getByRole('button', { name: 'Download report (.md)' }).waitFor({ timeout: 600000 });
mark('runEnd');

// ---- 4. results
await caption('', '');
await sleep(800);
const headline = await panel.locator('.headline').innerText();
await pointAt(panel.locator('.headline'));
await caption(headline.replace(/\s+/g, ' '), 'Browser-side and server-side, per field');
await sleep(4500);
// a server check that failed: prefer "rejected but saved", else any failed server check
const failing = panel.locator('table.results tr', { has: panel.getByRole('button', { name: 'Why?' }) });
let row = failing.filter({ hasText: /saved the record anyway/ }).first();
if (!(await row.count())) row = failing.filter({ hasText: /Server (rejects|accepts)/ }).first();
if (!(await row.count())) row = failing.first();
const title = (await row.locator('td').nth(1).innerText()).split('\n')[0];
const detail = (await row.locator('td').nth(2).innerText()).split('\n')[0];
await pointAt(row);
await caption(/saved the record anyway/.test(detail) ? '"Rejected"… but the account was saved anyway' : title, detail.length > 110 ? `${detail.slice(0, 107)}…` : detail);
await sleep(4000);
await click(row.getByRole('button', { name: 'Why?' }));
await caption('Every failure explains itself', 'What is happening, why, and where else to look');
await sleep(4500);
await caption('With the real request and response', 'Ready for a developer');
await click(row.locator('details summary', { hasText: 'Evidence' }));
await sleep(4500);
await caption('Download a full report, or write bug reports with AI', 'Ollama on your computer, or free OpenRouter models');
await pointAt(panel.getByRole('button', { name: 'Download report (.md)' }));
await sleep(4000);
mark('end');

const panelVideo = panel.video(), siteVideo = site.video();
await ctx.close();
renameSync(await panelVideo.path(), join(RAW, 'panel.webm'));
renameSync(await siteVideo.path(), join(RAW, 'site.webm'));
for (const f of readdirSync(RAW)) if (!['panel.webm', 'site.webm'].includes(f) && f.endsWith('.webm')) renameSync(join(RAW, f), join(RAW, `other-${f}`));
writeFileSync(join(RAW, 'marks.json'), JSON.stringify({ ...marks, siteLeadSeconds: (T0 - siteT0) / 1000, headline: await Promise.resolve(headline) }, null, 2));
console.log(JSON.stringify(marks));
