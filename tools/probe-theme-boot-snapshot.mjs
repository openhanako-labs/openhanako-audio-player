#!/usr/bin/env node
/**
 * tools/probe-theme-boot-snapshot.mjs — 在 boot() 执行的那一刻拍下三个值
 *
 * 已知：
 *   - 重开后 presetKey=pitchblack（存储对）
 *   - accent 却回到 #d49a6a（没应用）
 *   - boot() 跑得比 applyTheme 定义更早（336ms 那次赋值之后才存在）
 *   - 但 boot 里 7273 行就是 `var saved = currentId(); ... applyPreset(t)`
 *
 * 要分清两种可能：
 *   A) boot 那刻 localStorage 还读不到（存储未就绪）
 *   B) 读到了、applyPreset 也跑了，但**之后被别的主题逻辑覆盖**
 *
 * 手法：劫持 localStorage.getItem 记录读取时刻与返回值，
 *       同时记录 --accent 的每一次变化。两条时间线一对就清楚。
 *
 * 用法：node tools/probe-theme-boot-snapshot.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8785;

const server = createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1');
  let path = decodeURIComponent(u.pathname);
  if (path === '/') path = '/ui/standalone.html';
  try {
    const p = normalize(join(ROOT, path));
    if (!p.startsWith(normalize(ROOT))) { res.writeHead(403).end('403'); return; }
    const buf = readFileSync(p);
    const ext = p.split('.').pop().toLowerCase();
    const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json',
      png: 'image/png', jpg: 'image/jpeg', wav: 'audio/wav', mp3: 'audio/mpeg', svg: 'image/svg+xml' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch { res.writeHead(404).end('404'); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const vr = await fetch(CDP + '/json/version');
const ws = new WebSocket((await vr.json()).webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

let id = 0; const pend = new Map();
ws.addEventListener('message', (ev) => {
  let m; try { m = JSON.parse(ev.data); } catch { return; }
  if (m.id && pend.has(m.id)) {
    const { resolve, reject } = pend.get(m.id); pend.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const n = ++id; pend.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

await S('Page.enable'); await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', { width: 420, height: 700, deviceScaleFactor: 1, mobile: false });

const URL_PAGE = `http://127.0.0.1:${PORT}/ui/standalone.html`;

const HOOK = `
window.__log = [];
window.__at = function (tag, detail) {
  window.__log.push({ t: Math.round(performance.now()), tag: tag, detail: detail === undefined ? null : detail });
};
// 1) 记录 preset key 的每一次读取
(function () {
  var orig = Storage.prototype.getItem;
  Storage.prototype.getItem = function (k) {
    var v = orig.apply(this, arguments);
    if (k === 'hana_audio_theme_preset') window.__at('preset-read', JSON.stringify(v));
    return v;
  };
  var origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'hana_audio_theme_preset') window.__at('preset-write', JSON.stringify(v));
    return origSet.apply(this, arguments);
  };
})();
// 2) 记录 --accent 变化
(function () {
  var last = null;
  function poll() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    if (v !== last) { last = v; window.__at('accent', v); }
    requestAnimationFrame(poll);
  }
  try { requestAnimationFrame(poll); } catch (e) {}
})();
`;

await S('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

// 设定预设
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 2600));
await S('Runtime.evaluate', { expression: 'localStorage.clear();', returnByValue: true });
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 2600));
const applied = (await S('Runtime.evaluate', {
  expression: `(function(){
    var opener = document.getElementById('paletteBtn');
    if (!opener) return { ok:false, err:'no paletteBtn' };
    opener.click();
    var grid = document.getElementById('themeGrid');
    if (!grid || !grid.children.length) return { ok:false, err:'no chips' };
    var chips = grid.querySelectorAll('.theme-chip');
    for (var i=0;i<chips.length;i++){
      if (!chips[i].classList.contains('active')) { var l=chips[i].textContent.trim(); chips[i].click(); return { ok:true, clicked:l }; }
    }
    return { ok:false, err:'all active' };
  })()`,
  returnByValue: true,
})).result?.value;
await new Promise((r) => setTimeout(r, 700));

// 重开并采集
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 3200));

const diag = (await S('Runtime.evaluate', {
  expression: `(function(){
    function v(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
    return { log: window.__log || [], accent: v('--accent'), presetKey: localStorage.getItem('hana_audio_theme_preset') };
  })()`,
  returnByValue: true,
})).result?.value;

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `theme-boot-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const log = diag?.log || [];
const reads = log.filter((x) => x.tag === 'preset-read');
const writes = log.filter((x) => x.tag === 'preset-write');
const accents = log.filter((x) => x.tag === 'accent');

console.log(JSON.stringify({
  selected: applied,
  presetReads: reads,
  presetWrites: writes,
  accentTimeline: accents,
  finalAccent: diag?.accent,
  finalKey: diag?.presetKey,
  shot: file,
  verdict: 'INFO',
  hint: '看 preset-read 返回什么、accent 在几毫秒变成什么、有没有被后一次覆盖',
}, null, 2));
