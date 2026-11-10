/*
 * Review Red Flags: styles for the modal and badge. They live in a JS string
 * so they can be applied to the shadow root as a constructed stylesheet,
 * which the Play Store's own CSS cannot reach or override.
 * Built by Santhosh Tuppad.
 */
(function (root) {
  'use strict';
  root.ReviewRedFlags = root.ReviewRedFlags || {};
  root.ReviewRedFlags.MODAL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }

.wrap {
  --bg: #ffffff;
  --surface: #f6f7f9;
  --border: #e3e5e8;
  --text: #1f2328;
  --muted: #5f6670;
  --accent: #c62828;
  --accent-soft: #fdecec;
  --mark-bg: #ffd54f;
  --mark-text: #1a1a1a;
  --mark-edge: #d9a400;
  --chip-on: #1f2328;
  --chip-on-text: #ffffff;
  --shadow: 0 24px 64px rgba(15, 20, 30, 0.28), 0 2px 8px rgba(15, 20, 30, 0.12);
  font: 14px/1.5 "Google Sans", Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  color: var(--text);
}
@media (prefers-color-scheme: dark) {
  .wrap {
    --bg: #1e2126;
    --surface: #262a30;
    --border: #363b43;
    --text: #e8eaed;
    --muted: #a3a9b3;
    --accent: #ef5350;
    --accent-soft: #3a2223;
    --chip-on: #e8eaed;
    --chip-on-text: #1e2126;
    --shadow: 0 24px 64px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);
  }
}

button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Bottom-right dock: load-all switch + flagged badge */
.dock {
  position: fixed; right: 24px; bottom: 24px;
  display: flex; align-items: center; gap: 8px;
}
.dock[hidden] { display: none; }

.loadall {
  position: relative; overflow: hidden;
  display: inline-flex; align-items: center; gap: 10px;
  padding: 9px 16px 9px 10px; border: 1px solid var(--border); border-radius: 999px;
  background: var(--bg); color: var(--text); font-size: 13px; font-weight: 600;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  max-width: min(360px, calc(100vw - 140px));
}
.loadall:hover:not([disabled]) { background: var(--surface); }
.loadall[disabled] { cursor: default; opacity: 0.8; }
.loadall .ltext { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.loadall.error .ltext { color: var(--accent); }
.sw {
  flex: none; position: relative; width: 30px; height: 18px; border-radius: 999px;
  background: #b9bec6; transition: background 0.15s;
}
.knob {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s;
}
.loadall[aria-checked="true"] .sw { background: #1a73e8; }
.loadall[aria-checked="true"] .knob { transform: translateX(12px); }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: transparent; }
.loadall.running .bar { background: rgba(26, 115, 232, 0.15); }
.fill { display: block; height: 100%; width: 0; background: #1a73e8; transition: width 0.3s; }
.loadall.indeterminate .fill { width: 30% !important; animation: slide 1.2s ease-in-out infinite; }
@keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }

.dock-export {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 14px; border: 1px solid var(--border); border-radius: 999px;
  background: var(--bg); color: var(--text); font-size: 13px; font-weight: 600;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}
.dock-export:hover { background: var(--surface); }
.dock-export[hidden] { display: none; }

/* Flagged badge */
.badge {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px 10px 14px; border: 0; border-radius: 999px;
  background: var(--accent); color: #fff;
  font-weight: 600; font-size: 14px;
  box-shadow: 0 6px 20px rgba(198, 40, 40, 0.35);
}
.badge[hidden] { display: none; }
.badge.clean { background: #5f6670; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2); }
.badge .flag { font-size: 16px; line-height: 1; }
.badge.pulse { animation: pulse 0.9s ease-out 2; }
@keyframes pulse {
  0% { transform: scale(1); }
  40% { transform: scale(1.12); }
  100% { transform: scale(1); }
}

/* Modal */
.overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; }
.overlay[hidden] { display: none; }
.backdrop { position: absolute; inset: 0; background: rgba(10, 14, 20, 0.5); }
.modal {
  position: relative; display: flex; flex-direction: column;
  width: min(780px, 100%); max-height: min(86vh, 920px);
  background: var(--bg); border-radius: 16px; box-shadow: var(--shadow);
  overflow: hidden;
}
.head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  padding: 20px 20px 12px 24px; border-bottom: 1px solid var(--border);
}
.head h2 { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 600; }
.summary { margin: 4px 0 0; color: var(--muted); }
.head-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.export {
  border: 1px solid var(--border); background: var(--surface); border-radius: 8px;
  padding: 6px 12px; font-size: 13px; font-weight: 600;
}
.export:hover { background: var(--bg); }

/* "Export to HTML?" prompt */
.prompt {
  position: relative; width: min(480px, 100%);
  background: var(--bg); border-radius: 16px; box-shadow: var(--shadow);
  padding: 22px 24px 16px;
}
.prompt h2 { margin: 0 0 8px; font-size: 19px; font-weight: 600; }
.prompt-text { margin: 0; color: var(--text); }
.prompt-status { margin: 10px 0 0; min-height: 0; color: #1e7b34; font-weight: 600; }
.prompt-status:empty { display: none; }
.prompt-status.error { color: var(--accent); }
.prompt-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.prompt-actions button {
  border: 1px solid var(--border); background: var(--surface); border-radius: 8px;
  padding: 8px 14px; font-size: 14px; font-weight: 600;
}
.prompt-actions button[hidden] { display: none; }
.prompt-actions button[disabled] { opacity: 0.5; cursor: default; }
.prompt-actions .primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.prompt-credit { margin: 14px 0 0; font-size: 12px; color: var(--muted); font-weight: 600; }
@media (prefers-color-scheme: dark) { .prompt-status { color: #6fcf87; } }

.close {
  flex: none; width: 36px; height: 36px; border: 0; border-radius: 50%;
  background: transparent; font-size: 24px; line-height: 1; color: var(--muted);
}
.close:hover { background: var(--surface); color: var(--text); }

.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 24px; border-bottom: 1px solid var(--border); max-height: 132px; overflow-y: auto; }
.chips:empty { display: none; }
.chip {
  border: 1px solid var(--border); background: var(--surface);
  border-radius: 999px; padding: 3px 10px; font-size: 13px;
}
.chip .n { color: var(--muted); margin-left: 4px; font-variant-numeric: tabular-nums; }
.chip[aria-pressed="true"] { background: var(--chip-on); color: var(--chip-on-text); border-color: var(--chip-on); }
.chip[aria-pressed="true"] .n { color: inherit; opacity: 0.75; }

.list { list-style: none; margin: 0; padding: 8px 24px 16px; overflow-y: auto; flex: 1; }
.empty { padding: 32px 8px; text-align: center; color: var(--muted); }
.card { padding: 16px 0; border-bottom: 1px solid var(--border); }
.card:last-child { border-bottom: 0; }
.meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; color: var(--muted); font-size: 13px; }
.author { color: var(--text); font-weight: 600; font-size: 14px; }
.stars { color: #e8a200; letter-spacing: 1px; }
.source { border-radius: 4px; padding: 0 6px; background: var(--surface); font-size: 12px; }
.text { margin: 8px 0 10px; white-space: pre-wrap; word-wrap: break-word; }
mark {
  background: var(--mark-bg); color: var(--mark-text);
  border-radius: 3px; padding: 0 2px; box-shadow: inset 0 -2px 0 var(--mark-edge);
}
.foot-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.terms { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; color: var(--muted); }
.term { background: var(--accent-soft); color: var(--accent); border-radius: 4px; padding: 1px 6px; font-weight: 600; }
.show {
  border: 1px solid var(--border); background: transparent; border-radius: 8px;
  padding: 4px 12px; font-size: 13px;
}
.show:hover:not([disabled]) { background: var(--surface); }
.show[disabled] { cursor: default; opacity: 0.5; }
.more-row { padding: 16px 0 4px; text-align: center; }
.more {
  border: 1px solid var(--border); background: var(--surface); border-radius: 8px;
  padding: 7px 16px; font-size: 13px; font-weight: 600;
}
.more:hover { background: var(--bg); }

.foot {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px;
  padding: 10px 24px; border-top: 1px solid var(--border);
  color: var(--muted); font-size: 12px; background: var(--surface);
}
.credit { font-weight: 600; }
.credit a, .prompt-credit a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }

@media (max-width: 520px) {
  .head { padding: 16px 12px 10px 16px; }
  .chips, .list, .foot { padding-left: 16px; padding-right: 16px; }
  .dock { right: 16px; bottom: 16px; }
  .loadall { max-width: calc(100vw - 120px); }
}
`;
})(globalThis);
