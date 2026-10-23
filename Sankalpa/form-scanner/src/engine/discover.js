import { launch, load, settle, sleep, fieldLocator, short } from './browser.js';
import { tagForms, collectLinks, fieldFeedback } from './page.js';
import { isTextField, isEmailField, isRiskyForm, hasCaptcha, whyRisky, whyCaptcha, suggestLimit, sized } from '../rules.js';

// Links that usually lead to forms are visited first, so a small page limit still finds them.
const FORMISH = /sign\s*-?up|register|regist|log\s*-?in|sign\s*-?in|forgot|reset|password|contact|feedback|profile|account|address|settings|complain|support|apply|subscribe|join|edit/i;
const SKIP_LINK = /logout|log-out|sign-?out|\.(pdf|zip|png|jpe?g|gif|svg|mp4|csv|xlsx?|docx?)(\?|$)/i;

// Crawl same-origin pages (up to pageLimit), list every form, and probe each text field's client rules.
// One key per page. For apps routed by "#/…" the part before "#" doesn't matter: /login#/contact = /#/contact.
export function pageKey(u, hashRouted) {
  try {
    const x = new URL(u);
    if (hashRouted && x.hash.startsWith('#/')) return x.origin + x.hash.replace(/\/$/, '');
    return (x.origin + x.pathname).replace(/\/$/, '') + x.hash;
  } catch { return u; }
}

// Crawl same-origin pages (up to pageLimit), list every form, and probe each text field's client rules.
// Never loses what it found: a failing page is skipped, Stop is honoured between fields.
export async function discover({ startUrl, pageLimit = 30, session, log = () => {}, onForm = () => {}, shouldStop = () => false, onStatus = () => {} }) {
  const origin = new URL(startUrl).origin;
  const hashRouted = new URL(startUrl).hash.startsWith('#/');
  const key = (u) => pageKey(u, hashRouted);
  const { browser, context } = await launch(session);
  const page = await context.newPage();
  const queue = [{ url: startUrl, from: null }];
  const seen = new Set();
  const forms = [];
  const signatures = new Set();
  let pages = 0, stopped = false;
  try {
    while (queue.length && pages < pageLimit) {
      if (shouldStop()) { stopped = true; break; }
      const item = queue.shift();
      if (seen.has(key(item.url))) continue;
      seen.add(key(item.url));
      pages++;
      onStatus({ page: pages, of: pageLimit, url: short(item.url), forms: forms.length });
      log(`Page ${pages}/${pageLimit}: ${short(item.url)}`);
      try {
        await load(page, item.url);
        const here = page.url();
        if (!/^https?:/i.test(here) || new URL(here).origin !== origin) { log(`  skipped: the page left the site (${here})`); continue; }
        seen.add(key(here));

        const found = await page.evaluate(tagForms);
        for (const f of found) {
          if (shouldStop()) { stopped = true; break; }
          const sig = `${f.title}|${f.fields.map((x) => x.key).join(',')}`;
          const textFields = f.fields.filter(isTextField);
          if (!f.fields.length || signatures.has(sig) || (!textFields.length && !f.submitText)) continue;
          signatures.add(sig);
          const form = {
            key: `${short(here)}#${f.index}`,
            url: here, title: f.title, hasFormTag: f.hasFormTag, submitText: f.submitText, submitHtml: f.submitHtml,
            firstEditable: f.firstEditable, fields: f.fields,
            from: item.from,
            flags: {
              captcha: hasCaptcha(f.text), risky: isRiskyForm(`${f.text} ${f.submitText}`), noSubmit: !f.submitText,
              login: f.fields.some((x) => x.type === 'password') && !f.fields.some((x) => x.repeatOf) && /log\s*in|sign\s*in/i.test(`${f.submitText} ${f.title}`),
              reasons: {
                captcha: whyCaptcha(f.text) ? `page text mentions "${whyCaptcha(f.text)}"` : null,
                risky: whyRisky(`${f.text} ${f.submitText}`) ? `mentions "${whyRisky(`${f.text} ${f.submitText}`)}"` : null,
                login: 'password field with a "Log in / Sign in" button and no repeat-password field',
                noSubmit: 'no submit button found',
              },
            },
          };
          log(`  form "${form.title}" (${form.fields.length} fields)${form.flags.captcha ? ' · CAPTCHA' : ''}${form.flags.risky ? ' · risky' : ''}`);
          onStatus({ page: pages, of: pageLimit, url: short(here), forms: forms.length, checking: form.title });
          await probeForm(page, f.index, form, shouldStop).catch((e) => log(`  some field rules could not be read: ${e.message.split('\n')[0]}`));
          forms.push(form);
          onForm(form);
          onStatus({ page: pages, of: pageLimit, url: short(here), forms: forms.length });
        }
        if (stopped || shouldStop()) { stopped = true; break; }

        // Open menus so links hidden inside them are found too.
        const links = await page.evaluate(collectLinks);
        const menus = page.locator('button[aria-label*="menu" i], button[aria-label*="nav" i], button[aria-label*="account" i], button[aria-haspopup="true"]');
        for (let i = 0; i < Math.min(await menus.count(), 4); i++) {
          await menus.nth(i).click({ timeout: 1500 }).catch(() => {});
          await sleep(400);
          links.push(...(await page.evaluate(collectLinks).catch(() => [])));
          await page.keyboard.press('Escape').catch(() => {});
        }
        for (const l of links) {
          const k = key(l.href);
          if (seen.has(k) || SKIP_LINK.test(l.href) || queue.some((q) => key(q.url) === k)) continue;
          const next = { url: l.href, from: { url: here, text: l.text } };
          if (FORMISH.test(`${l.text} ${l.href}`)) {
            const at = queue.findIndex((q) => !q.formish);
            queue.splice(at === -1 ? queue.length : at, 0, { ...next, formish: true });
          } else queue.push(next);
        }
      } catch (e) {
        log(`  skipped this page: ${e.message.split('\n')[0]}`);
      }
    }
  } finally {
    await browser.close();
  }
  log(stopped ? `Stopped by you after ${pages} pages: ${forms.length} forms found.` : `Done: ${pages} pages, ${forms.length} forms.`);
  return { origin, startUrl, pages, forms, stopped };
}

// Works out each text field's client-side rules by typing and reading validity,
// so validator-only limits (no maxlength attribute) are found too.
async function probeForm(page, formIndex, form, shouldStop = () => false) {
  for (const field of form.fields) {
    if (shouldStop()) return;
    if (!isTextField(field) || field.readOnly || field.disabled || field.repeatOf) continue;
    const loc = fieldLocator(page, formIndex, field.key);
    const check = async (n) => {
      await loc.fill(sized(field, n, 'p'), { timeout: 2000 });
      await loc.evaluate((el) => el.blur());
      return page.evaluate(fieldFeedback, field.key);
    };
    const probe = { clientMax: field.maxLength, clientMin: field.minLength, source: field.maxLength ? 'maxlength attribute' : null };
    try {
      const starts = isEmailField(field) ? [24, 32, 40] : [8, 12, 16, 6, 5, 20, 4, 30, 3, 2, 1];
      let valid = null;
      for (const n of starts) { if (!(await check(n)).invalid) { valid = n; break; } }
      if (valid !== null) {
        if (probe.clientMax == null && (await check(300)).invalid) {
          let lo = valid, hi = 300; // lo valid, hi invalid
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((await check(mid)).invalid) hi = mid; else lo = mid; }
          probe.clientMax = lo; probe.source = 'form validation (no maxlength attribute)';
        }
        if (probe.clientMin == null && !isEmailField(field) && valid > 1 && (await check(1)).invalid) {
          let lo = 1, hi = valid; // lo invalid, hi valid
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((await check(mid)).invalid) lo = mid; else hi = mid; }
          probe.clientMin = hi;
        }
        const fb = await check(Math.min(valid, probe.clientMax ?? valid));
        if (fb.counter) probe.counter = fb.counter;
        if (probe.clientMax != null && !field.maxLength) { await check(probe.clientMax + 1); await sleep(250); probe.overMaxError = (await page.evaluate(fieldFeedback, field.key)).error; }
      } else {
        probe.note = 'Could not find a value the browser accepts (format rule?)';
      }
    } finally {
      await loc.fill('').catch(() => {});
      await loc.evaluate((el) => el.blur()).catch(() => {});
    }
    field.probe = probe;
    field.suggested = probe.clientMax == null ? suggestLimit(field) : null;
  }
  await settle(page, 200);
}
