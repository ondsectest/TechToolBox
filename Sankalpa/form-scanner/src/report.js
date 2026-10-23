import { suites, cases, runs, results, consents } from './db.js';
import { buildMarkdown } from '../public/report-md.js';

const BAD = new Set(['fail', 'warn']);

// Results of a run joined with their cases, plus change vs the previous run.
export function runDetail(runId) {
  const run = runs.get(runId);
  if (!run) return null;
  const suite = suites.get(run.suite_id);
  const byCase = new Map(cases.forSuite(run.suite_id).map((c) => [c.id, c]));
  const prevId = runs.previous(run.suite_id, runId);
  const prev = new Map(prevId ? results.forRun(prevId).map((r) => [r.case_id, r.status]) : []);
  const rows = results.forRun(runId).map((r) => {
    const c = byCase.get(r.case_id) || { title: '(deleted case)', form_key: '?' };
    const before = prev.get(r.case_id);
    let change = null;
    if (prevId && before) {
      if (BAD.has(before) && r.status === 'pass') change = 'fixed';
      else if (!BAD.has(before) && BAD.has(r.status)) change = 'new failure';
      else if (BAD.has(before) && BAD.has(r.status)) change = 'still failing';
    } else if (prevId && BAD.has(r.status)) change = 'new failure';
    return { ...r, case: c, change };
  });
  const formTitle = Object.fromEntries(suite.forms.map((f) => [f.key, f.title]));
  const fieldLabel = Object.fromEntries(suite.forms.map((f) => [f.key, Object.fromEntries(f.fields.map((x) => [x.key, x.label || x.key]))]));
  return { run, suite: { id: suite.id, name: suite.name, origin: suite.origin }, previousRunId: prevId, rows, formTitle, fieldLabel, forms: suite.forms, settings: suite.settings };
}

export function markdownReport(runId) {
  const d = runDetail(runId);
  if (!d) return null;
  return buildMarkdown({ ...d, consent: consents.get(d.suite.origin) }, { generator: 'the Sankalpa web app' });
}
