// Edits the raw demo footage into a social-ready MP4 (1280×720, H.264, silent, captions burned in).
// Site (left) + Sankalpa panel (right), title + end cards, waiting parts sped up and labelled.
// Run: node demo/build-video.mjs <outDir>   (after record-demo.mjs)
import { chromium } from '../../form-scanner/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const RAW = join(OUT, 'raw'), GFX = join(OUT, 'gfx');
mkdirSync(GFX, { recursive: true });
const m = JSON.parse(readFileSync(join(RAW, 'marks.json'), 'utf8'));
const version = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).version;

// ---- graphics (rendered with the browser so text looks crisp; ffmpeg here has no text filter)
const logo = `<svg width="64" height="64" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#5fb396"/><path d="M9 11h14M9 16h14M9 21h8" stroke="#0d1a15" stroke-width="2.6" stroke-linecap="round"/></svg>`;
const font = `font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;`;
const card = (inner) => `<html><body style="margin:0;width:1280px;height:720px;background:radial-gradient(circle at 30% 20%,#1f3a30,#0e1714 70%);color:#fff;${font};display:flex;align-items:center;justify-content:center"><div style="text-align:center;max-width:1040px">${inner}</div></body></html>`;
const graphics = {
  'title.png': [1280, 720, card(`${logo}
    <div style="font-size:84px;font-weight:800;letter-spacing:.5px;margin-top:18px">Sankalpa</div>
    <div style="font-size:38px;font-weight:600;color:#a8e6cc;margin-top:8px">Form testing inside Chrome DevTools</div>
    <div style="font-size:26px;color:#d6e4dd;margin-top:28px">Finds every form · reads every field's rules · tests what the server really accepts</div>`), false],
  'end.png': [1280, 720, card(`${logo}
    <div style="font-size:64px;font-weight:800;margin-top:14px">Sankalpa</div>
    <div style="font-size:30px;line-height:1.7;margin-top:22px;text-align:left;display:inline-block;color:#e8f3ee">
      ✓ Finds every form and its field rules<br>✓ Tests the browser <i>and</i> the server<br>✓ Explains every failure, with evidence<br>✓ Reports and AI bug reports, ready for Jira</div>
    <div style="font-size:26px;color:#a8e6cc;margin-top:30px;font-weight:600">Runs on your machine · your data stays local</div>`), false],
  'strip.png': [1280, 40, strip(''), false],
  'strip2.png': [1280, 40, strip('⏩ Scanning · 2× speed'), false],
  'strip6.png': [1280, 40, strip('⏩ Testing · 6× speed'), false],
};
function strip(badgeText) {
  return `<html><body style="margin:0;width:1280px;height:40px;background:#0e1714;${font};position:relative">
    <div style="position:absolute;left:18px;top:8px;background:rgba(255,255,255,.12);color:#fff;font-size:14px;font-weight:700;padding:3px 11px;border-radius:999px">Your site</div>
    <div style="position:absolute;right:18px;top:8px;background:#5fb396;color:#0d1a15;font-size:14px;font-weight:700;padding:3px 11px;border-radius:999px">Sankalpa · Chrome DevTools panel</div>
    ${badgeText ? `<div style="position:absolute;left:50%;top:6px;transform:translateX(-50%);background:#e8590c;color:#fff;font-size:15px;font-weight:800;padding:4px 14px;border-radius:999px">${badgeText}</div>` : ''}</body></html>`;
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const [name, [w, h, html, transparent]] of Object.entries(graphics)) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html);
  await page.screenshot({ path: join(GFX, name), omitBackground: transparent });
}
await browser.close();

// ---- edit
const seg = [
  { from: 0, to: m.scanStart, speed: 1 },
  { from: m.scanStart, to: m.scanEnd, speed: 2, badge: 3 },
  { from: m.scanEnd, to: m.runStart + 4, speed: 1 },
  { from: m.runStart + 4, to: m.runEnd - 1, speed: 6, badge: 4 },
  { from: m.runEnd - 1, to: m.end, speed: 1 },
];
const f = [];
f.push(`[0:v]trim=start=${m.siteLeadSeconds},setpts=PTS-STARTPTS,fps=30,scale=604:680,pad=640:680:18:0:color=0x0e1714,setsar=1[site]`);
f.push(`[1:v]fps=30,scale=604:680,pad=640:680:18:0:color=0x0e1714,setsar=1[pan]`);
f.push(`[site][pan]hstack=inputs=2[both]`);
f.push(`[both]pad=1280:720:0:40:color=0x0e1714[framed];[framed][2:v]overlay=0:0:shortest=1,split=${seg.length}${seg.map((_, i) => `[c${i}]`).join('')}`);
seg.forEach((s, i) => {
  f.push(`[c${i}]trim=start=${s.from.toFixed(2)}:end=${s.to.toFixed(2)},setpts=(PTS-STARTPTS)/${s.speed}${s.badge ? `[r${i}];[r${i}][${s.badge}:v]overlay=0:0:shortest=1` : ''},fps=30[s${i}]`);
});
f.push(`[5:v]fps=30,format=rgba,fade=t=out:st=3.1:d=0.4,setsar=1[title]`);
f.push(`[6:v]fps=30,format=rgba,fade=t=in:st=0:d=0.4,setsar=1[end]`);
f.push(`[title]${seg.map((_, i) => `[s${i}]`).join('')}[end]concat=n=${seg.length + 2}:v=1:a=0,format=yuv420p[out]`);

const mp4 = join(OUT, `sankalpa-demo-v${version}.mp4`);
execFileSync('ffmpeg', ['-y', '-v', 'error',
  '-i', join(RAW, 'site.webm'), '-i', join(RAW, 'panel.webm'),
  '-loop', '1', '-framerate', '30', '-t', String(Math.ceil(m.end + 2)), '-i', join(GFX, 'strip.png'), '-loop', '1', '-framerate', '30', '-t', String(Math.ceil(m.end + 2)), '-i', join(GFX, 'strip2.png'), '-loop', '1', '-framerate', '30', '-t', String(Math.ceil(m.end + 2)), '-i', join(GFX, 'strip6.png'),
  '-loop', '1', '-framerate', '30', '-t', '3.5', '-i', join(GFX, 'title.png'), '-loop', '1', '-framerate', '30', '-t', '5', '-i', join(GFX, 'end.png'),
  '-filter_complex', f.join(';'), '-map', '[out]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', '30', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
console.log(mp4);
