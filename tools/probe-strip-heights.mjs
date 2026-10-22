#!/usr/bin/env node
/**
 * tools/probe-strip-heights.mjs — 横条在各高度下的可用空间
 *
 * 背景（2026-10-22）：形态阈值是 h<=156 进 strip、h>=184 退出，
 *   但 syncStripHeight 把内容高度硬夹在 40–64px。
 *   也就是说 64–156px 这一段横条只画 64px，上面空着。
 *
 * 要在那段空间里放「简化 PV」，得先知道每个档位究竟有多少可用高度。
 * 本探针逐个高度量：横条实际高、内部各元素占位、剩余空间。
 *
 * 用法：node tools/probe-strip-heights.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8799;

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

const MEASURE = `(function(){
  var strip = document.getElementById('playerStrip');
  var player = document.querySelector('.player-container');
  if (!strip || !player) return { err: 'missing' };
  var sr = strip.getBoundingClientRect();
  var pr = player.getBoundingClientRect();
  function box(sel) {
    var el = strip.querySelector(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    return { h: Math.round(r.height), w: Math.round(r.width),
             top: Math.round(r.top - sr.top), display: cs.display };
  }
  return {
    layout: player.getAttribute('data-layout'),
    viewportH: innerHeight,
    playerH: Math.round(pr.height),
    stripH: Math.round(sr.height),
    stripTop: Math.round(sr.top),
    // 横条下方还剩多少（这段就是被浪费的空间）
    spaceBelow: Math.round(pr.bottom - sr.bottom),
    parts: {
      cover: box('.strip-cover'),
      identity: box('.strip-identity'),
      lyric: box('.strip-lyric'),
      time: box('.strip-time'),
      controls: box('.strip-controls'),
    },
  };
})()`;

const results = [];
const heights = [60, 80, 100, 120, 140, 156, 175];

for (const h of heights) {
  await S('Emulation.setDeviceMetricsOverride', { width: 1040, height: h, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
  await new Promise((r) => setTimeout(r, 1600));
  const v = (await S('Runtime.evaluate', { expression: MEASURE, returnByValue: true })).result?.value;
  results.push({ requestedH: h, ...v });
}

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `strip-heights-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

console.log(JSON.stringify({ results, shot: file }, null, 2));
