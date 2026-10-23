// Part 3 for the web app: fill and submit with Playwright, then use the shared core to map and judge.
import { settle, sleep, fieldLocator } from './browser.js';
import { isTextField } from '../rules.js';
import { testable } from './cases.js';
import { validValue, analyzeCapture, replayInPage, judge as judgeCore, canReplay } from './replay-core.js';

export async function fillValid(page, idx, form) {
  const markers = {};
  for (const f of form.fields) {
    if (f.readOnly || f.disabled) continue;
    const loc = fieldLocator(page, idx, f.key);
    if (isTextField(f) && !f.repeatOf) {
      markers[f.key] = validValue(f);
      await loc.fill(markers[f.key], { timeout: 3000 }).catch(() => {});
    } else if (f.type === 'select') {
      if (f.tag === 'select') await loc.selectOption({ index: 1 }).catch(() => loc.selectOption({ index: 0 }).catch(() => {}));
      else { // custom dropdown (mat-select, role=combobox): open and pick the first option with the keyboard
        await loc.focus().catch(() => {});
        await page.keyboard.press('Enter'); await sleep(400);
        if (!(await page.locator('mat-option, [role=option]').count())) { await page.keyboard.press('ArrowDown'); await sleep(400); }
        await page.keyboard.press('Enter'); await sleep(300);
      }
    } else if ((f.type === 'checkbox' || f.type === 'radio') && f.required) {
      await loc.check({ force: true, timeout: 3000 }).catch(() => {});
    } else if (f.type === 'number') {
      await loc.fill('7').catch(() => {});
    } else if (f.type === 'date') {
      await loc.fill('2000-01-01').catch(() => {});
    }
  }
  for (const f of form.fields.filter((x) => x.repeatOf && markers[x.repeatOf])) {
    markers[f.key] = markers[f.repeatOf];
    await fieldLocator(page, idx, f.key).fill(markers[f.key]).catch(() => {});
  }
  return markers;
}

// Submit once and record every non-GET request the form sends.
export async function capture(page, idx, form) {
  const markers = await fillValid(page, idx, form);
  const seen = [];
  const onReq = (r) => { if (r.method() !== 'GET' && ['xhr', 'fetch', 'document'].includes(r.resourceType())) seen.push(r); };
  page.on('request', onReq);
  const btn = page.locator(`[data-sk-submit="${idx}"]`).first();
  const blocked = await page.evaluate((i) => {
    const b = document.querySelector(`[data-sk-submit="${i}"]`);
    const bad = [...document.querySelectorAll(`[data-sk-form="${i}"] [data-sk-field]`)].filter((e) => e.getAttribute('aria-invalid') === 'true' || e.classList.contains('ng-invalid')).map((e) => e.getAttribute('data-sk-field'));
    return { disabled: !!b?.disabled || b?.getAttribute('aria-disabled') === 'true', invalid: bad };
  }, idx);
  await btn.click({ timeout: 4000 }).catch(() => btn.evaluate((b) => b.click()).catch(() => {}));
  await settle(page, 1500);
  page.off('request', onReq);

  const raw = [];
  for (const r of seen) {
    const res = await r.response().catch(() => null);
    let responseText = '';
    try { responseText = res ? await res.text() : ''; } catch { /* body unavailable */ }
    raw.push({ method: r.method(), url: r.url(), headers: r.headers(), postData: r.postData(), status: res?.status() ?? null, responseText });
  }
  return { markers, blocked, ...analyzeCapture(markers, raw) };
}

export const judge = (page, cap, form, field, expected, value, opts) =>
  judgeCore((spec) => page.evaluate(replayInPage, spec), cap, form, field, expected, value, opts);

export { validValue, canReplay, testable };
