// SQLite storage (Node's built-in node:sqlite). Four core tables match PLAN.md:
// suites, test_cases, runs, results. Plus consents (once-per-site replay approval).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.SANKALPA_DB || join(root, 'data', 'sankalpa.sqlite');
mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS suites (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, origin TEXT NOT NULL, start_url TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}', forms_json TEXT NOT NULL DEFAULT '[]',
  session_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS test_cases (
  id INTEGER PRIMARY KEY, suite_id INTEGER NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL, field_key TEXT, part INTEGER NOT NULL, kind TEXT NOT NULL,
  title TEXT NOT NULL, input_kind TEXT, input_value TEXT, expected TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, suite_id INTEGER NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running', summary_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS results (
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  case_id INTEGER NOT NULL, status TEXT NOT NULL, detail TEXT, evidence_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (run_id, case_id)
);
CREATE TABLE IF NOT EXISTS consents (
  origin TEXT PRIMARY KEY, approved_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const json = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

export const suites = {
  create({ name, origin, start_url, settings, forms, session }) {
    const r = db.prepare('INSERT INTO suites (name, origin, start_url, settings_json, forms_json, session_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, origin, start_url, JSON.stringify(settings || {}), JSON.stringify(forms || []), session ? JSON.stringify(session) : null);
    return Number(r.lastInsertRowid);
  },
  get(id) {
    const s = db.prepare('SELECT * FROM suites WHERE id = ?').get(id);
    if (!s) return null;
    return { ...s, settings: json(s.settings_json, {}), forms: json(s.forms_json, []), session: json(s.session_json, null) };
  },
  list() {
    return db.prepare(`SELECT s.id, s.name, s.origin, s.created_at,
      (SELECT COUNT(*) FROM test_cases c WHERE c.suite_id = s.id AND c.enabled = 1) AS cases,
      (SELECT summary_json FROM runs r WHERE r.suite_id = s.id ORDER BY r.id DESC LIMIT 1) AS last_summary
      FROM suites s ORDER BY s.id DESC`).all().map((s) => ({ ...s, last_summary: json(s.last_summary, null) }));
  },
  updateSettings(id, patch) {
    const s = this.get(id);
    if (!s) return null;
    const settings = { ...s.settings, ...patch };
    db.prepare('UPDATE suites SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), id);
    return settings;
  },
  remove(id) { db.prepare('DELETE FROM suites WHERE id = ?').run(id); },
};

export const cases = {
  add(c) {
    const r = db.prepare(`INSERT INTO test_cases (suite_id, form_key, field_key, part, kind, title, input_kind, input_value, expected, builtin, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .run(c.suite_id, c.form_key, c.field_key ?? null, c.part, c.kind, c.title, c.input_kind ?? null, c.input_value ?? null, c.expected, c.builtin ? 1 : 0);
    return Number(r.lastInsertRowid);
  },
  forSuite(suiteId) { return db.prepare('SELECT * FROM test_cases WHERE suite_id = ? ORDER BY form_key, part, id').all(suiteId); },
  setEnabled(id, enabled) { db.prepare('UPDATE test_cases SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id); },
  remove(id) { db.prepare('DELETE FROM test_cases WHERE id = ? AND builtin = 0').run(id); },
};

export const runs = {
  start(suiteId) { return Number(db.prepare('INSERT INTO runs (suite_id) VALUES (?)').run(suiteId).lastInsertRowid); },
  finish(id, status, summary) {
    db.prepare("UPDATE runs SET finished_at = datetime('now'), status = ?, summary_json = ? WHERE id = ?").run(status, JSON.stringify(summary), id);
  },
  forSuite(suiteId) {
    return db.prepare('SELECT * FROM runs WHERE suite_id = ? ORDER BY id DESC').all(suiteId).map((r) => ({ ...r, summary: json(r.summary_json, {}) }));
  },
  get(id) { const r = db.prepare('SELECT * FROM runs WHERE id = ?').get(id); return r && { ...r, summary: json(r.summary_json, {}) }; },
  previous(suiteId, runId) { return db.prepare('SELECT id FROM runs WHERE suite_id = ? AND id < ? ORDER BY id DESC LIMIT 1').get(suiteId, runId)?.id ?? null; },
};

export const results = {
  save(runId, caseId, status, detail, evidence) {
    db.prepare('INSERT OR REPLACE INTO results (run_id, case_id, status, detail, evidence_json) VALUES (?, ?, ?, ?, ?)')
      .run(runId, caseId, status, detail ?? null, JSON.stringify(evidence || {}));
  },
  forRun(runId) {
    return db.prepare('SELECT * FROM results WHERE run_id = ?').all(runId).map((r) => ({ ...r, evidence: json(r.evidence_json, {}) }));
  },
};

export const consents = {
  has(origin) { return !!db.prepare('SELECT 1 FROM consents WHERE origin = ?').get(origin); },
  grant(origin) { db.prepare('INSERT OR IGNORE INTO consents (origin) VALUES (?)').run(origin); },
  get(origin) { return db.prepare('SELECT * FROM consents WHERE origin = ?').get(origin) || null; },
};
