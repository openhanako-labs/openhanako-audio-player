#!/usr/bin/env node
/**
 * tools/probe-strip-lyric-sync.mjs — 横条歌词到底会不会跟着播放走
 *
 * 背景（2026-10-22 反馈「歌词不同步」）：
 *   横条歌词区 #stripLyric 由 index.html 里的 syncLyric() 写，
 *   它读 `.lyric-line.current .l-main`。
 *   而那个 MutationObserver 只观察 childList —— 高亮是 classList.toggle，
 *   子节点没变，所以 observer 永远不触发，歌词停在切歌那一行。
 *
 * 本探针要证两件：
 *   1) 高亮真的会随播放时间往前推进（.current 会换行）
 *   2) 横条里显示的文字会跟着换（不是一直同一句）
 *
 * 做法：不依赖真实音频——直接给 lrcData 灌一份假歌词，
 *   再手动推进高亮，看横条元素有没有变。这测的是「接线」而不是「解码」。
 *
 * 用法：node tools/probe-strip-lyric-sync.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8791;

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
// 用横条尺寸
await S('Emulation.setDeviceMetricsOverride', { width: 1040, height: 90, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
await new Promise((r) => setTimeout(r, 3200));

// 确认已经是 strip 形态
const layout = (await S('Runtime.evaluate', {
  expression: `(document.querySelector('.player-container')||{}).getAttribute
    ? document.querySelector('.player-container').getAttribute('data-layout') : null`,
  returnByValue: true,
})).result?.value;

// 灌假歌词 + 手动推进高亮，观察横条文字
const RESULT = await S('Runtime.evaluate', {
  expression: `(function(){
    var lb = document.getElementById('lyricBody');
    var stripLyric = document.getElementById('stripLyric');
    if (!lb || !stripLyric) return { err: 'missing lyricBody or stripLyric' };

    // 造三句，时间 0 / 5 / 10 秒
    lb.innerHTML = [
      '<div class="lyric-line" data-lrc-idx="0"><span class="l-main">第一句</span></div>',
      '<div class="lyric-line" data-lrc-idx="1"><span class="l-main">第二句</span></div>',
      '<div class="lyric-line" data-lrc-idx="2"><span class="l-main">第三句</span></div>'
    ].join('');

    var lines = lb.querySelectorAll('.lyric-line');
    var seen = [];

    // 模拟高亮推进（与 highlightLrc 等效的最小动作）
    function setCurrent(i) {
      lines.forEach(function (el, k) { el.classList.toggle('current', k === i); });
    }

    return new Promise(function (resolve) {
      var step = 0;
      var marks = [0, 1, 2];
      function next() {
        if (step >= marks.length) {
          resolve({ seen: seen, finalStripText: stripLyric.textContent.trim() });
          return;
        }
        setCurrent(marks[step]);
        // 等两帧：一帧给 class 生效，一帧给 rAF 轮询把它读走
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            seen.push(stripLyric.textContent.trim());
            step++;
            next();
          });
        });
      }
      next();
    });
  })()`,
  awaitPromise: true,
  returnByValue: true,
});

const r = RESULT.result?.value || {};
const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `strip-lyric-sync-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const seen = r.seen || [];
const problems = [];
if (layout !== 'strip') problems.push(`形态不是 strip（实际 ${layout}），本探针不适用`);
if (r.err) problems.push(r.err);
if (seen.length < 3) problems.push(`只采到 ${seen.length} 个样本，推进流程没跑完`);
const distinct = new Set(seen.filter(Boolean));
if (seen.length >= 3 && distinct.size < 2) {
  problems.push(`横条歌词没跟着换（三次都是「${seen[0]}」）`);
}

console.log(JSON.stringify({
  layout,
  samples: seen,
  distinctTexts: [...distinct],
  finalStripText: r.finalStripText,
  shot: file,
  verdict: problems.length ? 'FAIL' : 'PASS',
  problems,
}, null, 2));

process.exit(problems.length ? 1 : 0);
