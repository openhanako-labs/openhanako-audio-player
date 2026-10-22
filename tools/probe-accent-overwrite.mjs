#!/usr/bin/env node
/**
 * tools/probe-accent-overwrite.mjs — 抓「谁在 1.5s 把 --accent 改回去了」
 *
 * 已确认事实（probe-theme-boot-snapshot）：
 *   43ms  --accent = #d49a6a（CSS 初始）
 *   56ms  读到 key = pitchblack
 *   63ms  --accent = #E8E8EC   ← 恢复成功
 *   1546ms --accent = #d49a6a  ← 被覆盖
 *
 * 本探针劫持 CSSStyleDeclaration.setProperty 与 style 属性写入，
 * 在覆盖发生的那一刻抓调用栈（Error().stack）。
 *
 * 用法：node tools/probe-accent-overwrite.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8786;

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
window.__acc = [];
(function () {
  var origSet = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (name, value, prio) {
    if (name === '--accent') {
      window.__acc.push({ kind:'set', t: Math.round(performance.now()),
        value: String(value), stack: (new Error()).stack || '' });
    }
    return origSet.apply(this, arguments);
  };
  var origRemove = CSSStyleDeclaration.prototype.removeProperty;
  CSSStyleDeclaration.prototype.removeProperty = function (name) {
    if (name === '--accent') {
      window.__acc.push({ kind:'remove', t: Math.round(performance.now()),
        value: null, stack: (new Error()).stack || '' });
    }
    return origRemove.apply(this, arguments);
  };
  // 整段覆盖 style 属性（cssText = ...）也会抹掉行内变量
  var desc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText')
          || Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
  // 直接在 Element.style 上无法拦 cssText；改用 MutationObserver 看行内 style 属性变化
})();
(function () {
  var obs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'attributes' && m.attributeName === 'style' && m.target === document.documentElement) {
        window.__acc.push({ kind:'attr-style-changed', t: Math.round(performance.now()),
          value: (m.target.getAttribute('style') || '').match(/--accent:\s*([^;]+)/)?.[1] || '(no --accent)',
          stack: '' });
      }
    }
  });
  try { obs.observe(document.documentElement, { attributes:true, attributeFilter:['style'] }); } catch (e) {}
})();
window.__t = function () { return Math.round(performance.now()); };
`;

await S('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

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

// 重开，抓所有 --accent 写入 + 栈
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 3200));

const diag = (await S('Runtime.evaluate', {
  expression: `({ writes: window.__acc || [],
              final: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
              key: localStorage.getItem('hana_audio_theme_preset') })`,
  returnByValue: true,
})).result?.value;

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `accent-overwrite-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

// 只保留对 documentElement 的写入（其它元素的 --accent 不重要），按时间排序
const writes = (diag?.writes || []).map((w) => ({
  kind: w.kind,
  t: w.t,
  value: w.value,
  stack: (w.stack || '').split('\n').slice(1, 6).map((s) => s.trim()),
}));

console.log(JSON.stringify({
  selected: applied,
  accentWrites: writes,
  finalAccent: diag?.final,
  finalKey: diag?.key,
  shot: file,
  hint: '看最后一条写入的 stack —— 那就是覆盖者',
}, null, 2));
