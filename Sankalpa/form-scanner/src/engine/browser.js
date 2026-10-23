import { chromium } from 'playwright';
import { tagForms, dismissOverlays } from './page.js';

export async function launch(session) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    storageState: session || undefined,
  });
  return { browser, context };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function settle(page, ms = 700) {
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await sleep(ms);
}

export async function clearOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const closed = await page.evaluate(dismissOverlays).catch(() => false);
    if (!closed) break;
    await sleep(400);
  }
}

// Fresh full load of a URL.
export async function load(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await settle(page);
  await clearOverlays(page);
}

// Reach a form the way a user would: open the page that links to it, then click the link.
// Falls back to an in-app hash change (still SPA navigation), then to a full load.
export async function reachForm(page, form) {
  if (form.from?.url && form.from.url !== form.url) {
    await load(page, form.from.url);
    const target = new URL(form.url);
    const link = page.locator(`a[href="${target.hash || target.pathname}"], a[href="${form.url}"]`).filter({ visible: true }).first();
    if (await link.count()) {
      await link.click({ timeout: 4000 }).catch(() => {});
      await settle(page, 1500);
      if (page.url() === form.url) return `clicked "${form.from.text || 'link'}" on ${short(form.from.url)}`;
    }
    if (target.hash && new URL(page.url()).pathname === target.pathname) {
      await page.evaluate((h) => { location.hash = h; }, target.hash);
      await settle(page, 1500);
      return `in-app navigation from ${short(form.from.url)} (link "${form.from.text || form.url}" was inside a closed menu)`;
    }
  }
  await load(page, form.url);
  await sleep(800);
  return 'opened the URL directly';
}

// Re-finds a discovered form on the current page by its field keys; returns its live index.
export async function locateForm(page, form) {
  const live = await page.evaluate(tagForms);
  const want = form.fields.map((f) => f.key).join('|');
  const exact = live.find((f) => f.fields.map((x) => x.key).join('|') === want);
  if (exact) return exact;
  const ranked = live
    .map((f) => ({ f, score: f.fields.filter((x) => form.fields.some((y) => y.key === x.key)).length }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].f : null;
}

export const fieldLocator = (page, formIndex, key) =>
  page.locator(`[data-sk-form="${formIndex}"] [data-sk-field="${key.replace(/"/g, '\\"')}"]`).first();

export const short = (u) => { try { const x = new URL(u); return x.pathname + x.hash; } catch { return u; } };
