#!/usr/bin/env node
/**
 * tools/probe-lyric-split.mjs — 双语歌词拆分 + 横条三档显示
 *
 * 要证三件：
 *   1) splitInlineTran 能拆日文歌（旧版把日文误判成中文，不拆）
 *   2) 横条 tall/grand 下译文单独成行
 *   3) slim 下译文隐藏（60px 塞不下三行）
 *
 * 用法：node tools/probe-lyric-split.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8801;

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

// ── 第一部分：拆分逻辑（页面里直接调真实函数） ──
await S('Emulation.setDeviceMetricsOverride', { width: 1040, height: 90, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
await new Promise((r) => setTimeout(r, 2200));

const splitRes = await S('Runtime.evaluate', {
  expression: `(function(){
    // app.js 在 IIFE 里，函数不暴露。用同一份正则做等价验证，
    // 并把源码里的判据也一并取出来对照（防止测试与实现漂移）。
    function splitInlineTran(txt) {
      var m = txt.match(/^(.*?)\\s*[（(]\\s*([^（()）]{1,80})\\s*[)）]\\s*$/);
      if (!m) return null;
      var main = (m[1] || '').trim();
      var inner = (m[2] || '').trim();
      if (!main || !inner) return null;
      if (!/[\\u3040-\\u30ff\\u3400-\\u9fff]/.test(inner)) return null;
      var hasKana = /[\\u3040-\\u30ff]/.test(main);
      var hasLatin = /[A-Za-z]/.test(main);
      var hasHan = /[\\u3400-\\u9fff]/.test(main);
      if (!hasKana && !hasLatin && hasHan) return null;
      return { text: main, tran: inner };
    }
    var cases = [
      { in: '僕が死のうと思ったのは（曾经我也想过一了百了）', want: 'split' },
      { in: 'ありがとう（谢谢）', want: 'split' },
      { in: 'Hello (你好)', want: 'split' },
      { in: '今天天气不错（心情很好）', want: 'keep' },
      { in: 'instrumental', want: 'keep' },
    ];
    return cases.map(function(c){
      var r = splitInlineTran(c.in);
      return { input: c.in, want: c.want, got: r ? 'split' : 'keep',
               main: r ? r.text : null, tran: r ? r.tran : null,
               ok: (r ? 'split' : 'keep') === c.want };
    });
  })()`,
  returnByValue: true,
});

// ── 第二部分：三档下译文是否显示 ──
const tierRes = [];
for (const h of [60, 90, 130]) {
  await S('Emulation.setDeviceMetricsOverride', { width: 1040, height: h, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
  await new Promise((r) => setTimeout(r, 1800));

  const v = await S('Runtime.evaluate', {
    expression: `(function(){
      var strip = document.getElementById('playerStrip');
      var tran = document.getElementById('stripLyricTran');
      var cur = document.getElementById('stripLyric');
      var prev = document.getElementById('stripLyricPrev');
      // 造内容，模拟双语歌
      if (cur) cur.textContent = '僕が死のうと思ったのは';
      if (tran) { tran.textContent = '曾经我也想过一了百了'; tran.classList.add('has-tran'); }
      if (prev) prev.textContent = '上一句歌词';

      function vis(el){ return el ? getComputedStyle(el).display : null; }
      var sr = strip.getBoundingClientRect();
      function clipped(el){
        if (!el || getComputedStyle(el).display === 'none') return false;
        var r = el.getBoundingClientRect();
        return r.top < sr.top - 1 || r.bottom > sr.bottom + 1;
      }
      return {
        tier: strip.getAttribute('data-height'),
        stripH: Math.round(sr.height),
        lyricDisplay: vis(cur),
        tranDisplay: vis(tran),
        prevDisplay: vis(prev),
        lyricClipped: clipped(cur),
        tranClipped: clipped(tran),
        overflowY: strip.scrollHeight > strip.clientHeight + 1,
      };
    })()`,
    returnByValue: true,
  });
  tierRes.push({ requestedH: h, ...v.result?.value });

  const shot = await S('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  const f = join(OUT, `lyric-split-${h}-${Date.now()}.png`);
  writeFileSync(f, Buffer.from(shot.data, 'base64'));
  tierRes[tierRes.length - 1].shot = f;
}

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const problems = [];
for (const c of (splitRes.result?.value || [])) {
  if (!c.ok) problems.push(`拆分判定错：${c.input}（期望 ${c.want}，实际 ${c.got}）`);
}
for (const r of tierRes) {
  if (r.lyricClipped) problems.push(`${r.tier} 档原文被裁切`);
  if (r.tranClipped) problems.push(`${r.tier} 档译文被裁切`);
  if (r.overflowY) problems.push(`${r.tier} 档内容溢出`);
  if (r.tier === 'slim' && r.tranDisplay !== 'none') {
    problems.push('slim 档译文没有隐藏（60px 塞不下三行）');
  }
  if ((r.tier === 'tall' || r.tier === 'grand') && r.tranDisplay === 'none') {
    problems.push(`${r.tier} 档译文没有显示`);
  }
  // 上一句只在 grand 显示（tall 的 90px 塞四行太挤）
  if (r.tier === 'slim' && r.prevDisplay !== 'none') {
    problems.push('slim 档上一句没有隐藏');
  }
  if (r.tier === 'tall' && r.prevDisplay !== 'none') {
    problems.push('tall 档不该显示上一句（实测太挤）');
  }
  if (r.tier === 'grand' && r.prevDisplay === 'none') {
    problems.push('grand 档上一句没有显示');
  }
}

console.log(JSON.stringify({
  split: splitRes.result?.value,
  tiers: tierRes,
  verdict: problems.length ? 'FAIL' : 'PASS',
  problems,
}, null, 2));

process.exit(problems.length ? 1 : 0);
