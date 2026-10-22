#!/usr/bin/env node
/**
 * tools/probe-bg-layer.mjs — 切明暗时，背景层到底被谁改/没改
 *
 * 已知：包装链完整（__bgWrapped / __themed 都为 true），
 *      但切到 light 后 #themeBg 仍是 rgb(5,5,5)。暗夜预设的 light 背景应为 #F4F4F6。
 *
 * 要分清两种：
 *   A) applyBackground 根本没被调用（包装链断了，或 applyTheme 没被调）
 *   B) 被调用了，但 resolveBg 拿到的还是 dark 分支（currentMode 读早了）
 *   C) 被调用了、铺对了，但随后被别的东西盖掉
 *
 * 手法：劫持 #themeBg 的 style.backgroundColor / backgroundImage setter，
 *       连同 applyBackground 每一步都记下来。
 *
 * 用法：node tools/probe-bg-layer.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8788;

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
window.__bglog = [];
window.__at = function (tag, detail) {
  window.__bglog.push({ t: Math.round(performance.now()), tag: tag, detail: detail === undefined ? null : detail });
};
// 监视 data-theme 变化（applyTheme 的真实效果）
(function () {
  var last = document.documentElement.getAttribute('data-theme');
  var obs = new MutationObserver(function () {
    var v = document.documentElement.getAttribute('data-theme');
    if (v !== last) { last = v; window.__at('data-theme', v); }
  });
  try { obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}
})();
`;

await S('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 2600));
await S('Runtime.evaluate', { expression: 'localStorage.clear();', returnByValue: true });
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 2800));

// 选暗夜
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
await new Promise((r) => setTimeout(r, 900));

const before = (await S('Runtime.evaluate', {
  expression: `(function(){
    var el = document.getElementById('themeBg');
    return { theme: document.documentElement.getAttribute('data-theme'),
             bgColor: el && el.style.backgroundColor, bgImage: el && (el.style.backgroundImage||'').slice(0,60),
             logLen: (window.__bglog||[]).length };
  })()`,
  returnByValue: true,
})).result?.value;

// 切明暗，并立刻在 applyTheme 内部打点
await S('Runtime.evaluate', {
  expression: `(function(){
    // 包一层观察：applyTheme 前后各记一次背景层
    if (window.applyTheme && !window.applyTheme.__probeWrapped) {
      var orig = window.applyTheme;
      window.applyTheme = function(){
        var el = document.getElementById('themeBg');
        window.__at('applyTheme-before', { theme: document.documentElement.getAttribute('data-theme'),
                                           bg: el && el.style.backgroundColor });
        var r = orig.apply(this, arguments);
        window.__at('applyTheme-after', { theme: document.documentElement.getAttribute('data-theme'),
                                          bg: el && el.style.backgroundColor });
        return r;
      };
      window.applyTheme.__probeWrapped = true;
      window.applyTheme.__bgWrapped = !!orig.__bgWrapped;
      window.applyTheme.__themed = !!orig.__themed;
    }
    var b = document.getElementById('themeBtn');
    if (b) b.click();
  })()`,
  returnByValue: true,
});
await new Promise((r) => setTimeout(r, 1000));

const after = (await S('Runtime.evaluate', {
  expression: `(function(){
    var el = document.getElementById('themeBg');
    return { theme: document.documentElement.getAttribute('data-theme'),
             bgColor: el && el.style.backgroundColor, bgImage: el && (el.style.backgroundImage||'').slice(0,60),
             log: window.__bglog || [] };
  })()`,
  returnByValue: true,
})).result?.value;

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `bg-layer-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

console.log(JSON.stringify({
  selected: applied,
  before,
  after,
  shot: file,
  hint: '看 applyTheme-before/after 里 bg 有没有变、data-theme 什么时候变',
}, null, 2));
