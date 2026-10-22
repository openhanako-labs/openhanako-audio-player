#!/usr/bin/env node
/**
 * tools/probe-strip-tiers.mjs — 横条三档（slim/tall/grand）实测
 *
 * 要证四件：
 *   1) data-height 真的按高度切换（60→slim / 90→tall / 130→grand）
 *   2) tall/grand 下上一句歌词可见，slim 下隐藏
 *   3) 歌词字号随档位变大
 *   4) 所有档位都不裁切、不溢出
 *
 * 用法：node tools/probe-strip-tiers.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8800;

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
  if (!strip) return { err: 'no strip' };
  var sr = strip.getBoundingClientRect();

  function info(sel) {
    var el = strip.querySelector(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    return {
      text: (el.textContent || '').trim().slice(0, 20),
      display: cs.display,
      fontSize: cs.fontSize,
      h: Math.round(r.height),
      // 是否超出横条上下边界
      clipped: r.top < sr.top - 1 || r.bottom > sr.bottom + 1,
    };
  }

  // 造两句歌词内容，便于看效果
  var cur = document.getElementById('stripLyric');
  var prev = document.getElementById('stripLyricPrev');
  if (cur && !cur.textContent.trim()) cur.textContent = '当前这一句歌词';
  if (prev && !prev.textContent.trim()) prev.textContent = '上一句歌词淡出';

  return {
    layout: player ? player.getAttribute('data-layout') : null,
    tier: strip.getAttribute('data-height'),
    stripH: Math.round(sr.height),
    lyric: info('.strip-lyric'),
    prevLyric: info('.strip-lyric-prev'),
    title: info('.strip-identity strong'),
    cover: info('.strip-cover'),
    // 整条有没有溢出
    overflowY: strip.scrollHeight > strip.clientHeight + 1,
  };
})()`;

const results = [];
for (const h of [60, 90, 130]) {
  await S('Emulation.setDeviceMetricsOverride', { width: 1040, height: h, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
  await new Promise((r) => setTimeout(r, 1800));
  const v = (await S('Runtime.evaluate', { expression: MEASURE, returnByValue: true })).result?.value;
  results.push({ requestedH: h, ...v });

  const shot = await S('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  const f = join(OUT, `strip-tier-${h}-${Date.now()}.png`);
  writeFileSync(f, Buffer.from(shot.data, 'base64'));
  results[results.length - 1].shot = f;
}

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const problems = [];
const expect = { 60: 'slim', 90: 'tall', 130: 'grand' };
for (const r of results) {
  const want = expect[r.requestedH];
  if (r.tier !== want) problems.push(`高度 ${r.requestedH} 期望 ${want}，实际 ${r.tier}`);
  if (r.overflowY) problems.push(`高度 ${r.requestedH} 横条内容溢出`);
  if (r.lyric?.clipped) problems.push(`高度 ${r.requestedH} 当前句被裁切`);
  if (r.prevLyric?.clipped) problems.push(`高度 ${r.requestedH} 上一句被裁切`);
  // slim 下上一句必须隐藏
  if (r.requestedH === 60 && r.prevLyric?.display !== 'none') {
    problems.push('slim 档上一句没有隐藏');
  }
  // 上一句只在 grand 显示（2026-10-22：tall 的 90px 塞四行太挤，改成分层）
  if (r.requestedH === 90 && r.prevLyric?.display !== 'none') {
    problems.push('tall 档不该显示上一句（实测太挤）');
  }
  if (r.requestedH === 130 && r.prevLyric?.display === 'none') {
    problems.push('grand 档上一句没有显示');
  }
}

// 字号必须递增
const fs60 = parseFloat(results[0]?.lyric?.fontSize || '0');
const fs130 = parseFloat(results[2]?.lyric?.fontSize || '0');
if (!(fs130 > fs60)) problems.push(`grand 档字号没有变大（${fs60} → ${fs130}）`);

console.log(JSON.stringify({ results, verdict: problems.length ? 'FAIL' : 'PASS', problems }, null, 2));
process.exit(problems.length ? 1 : 0);
