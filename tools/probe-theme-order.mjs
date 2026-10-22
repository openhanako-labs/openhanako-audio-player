#!/usr/bin/env node
/**
 * tools/probe-theme-order.mjs — 量 boot() 执行那一刻 window.applyTheme 在不在
 *
 * 假设（由 probe-theme-restore 推出）：
 *   boot() 里 wrapApplyTheme 第一行是
 *     if (typeof window.applyTheme !== "function" || ...) return;
 *   而实测 applyThemeWrapped 为 false → 说明那一刻 applyTheme 还不是函数。
 *   applyTheme 由 index.html 里更晚的脚本定义（PV 引擎等），
 *   于是 boot() 里的「包一层」直接 return 了 —— 背景永远不跟随明暗。
 *
 * 同时验证恢复主链路：currentId() → allThemes() → applyPreset(t)。
 *
 * 手法：在 boot 前后各取一次 window.applyTheme 的类型，用注入脚本记录时间线。
 *
 * 用法：node tools/probe-theme-order.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8784;

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

// 注入：用属性 setter 监视 window.applyTheme 的赋值时机
const HOOK = `
window.__order = [];
window.__mark = function (tag, detail) {
  window.__order.push({ t: Math.round(performance.now()), tag: tag, detail: detail === undefined ? null : detail });
};
(function watchApplyTheme() {
  var real = undefined;
  try {
    Object.defineProperty(window, 'applyTheme', {
      configurable: true,
      get: function () { return real; },
      set: function (v) {
        real = v;
        window.__mark('applyTheme-assigned', typeof v);
      },
    });
  } catch (e) { window.__mark('defineProperty-failed', String(e && e.message || e)); }
})();
`;

await S('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

// 先设一个非默认预设
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

// ── 重开：抓 applyTheme 赋值时间线 ─────────────────────────────
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 3200));

const diag = (await S('Runtime.evaluate', {
  expression: `(function(){
    var root = document.documentElement;
    function v(n){ return getComputedStyle(root).getPropertyValue(n).trim(); }
    return {
      order: window.__order || [],
      applyThemeTypeNow: typeof window.applyTheme,
      applyThemeWrapped: !!(window.applyTheme && window.applyTheme.__bgWrapped),
      presetKey: localStorage.getItem('hana_audio_theme_preset'),
      accent: v('--accent'),
      bg: v('--bg'),
      // 直接手动跑一次恢复链，看能不能成功 —— 能成功说明是时序，不是逻辑
      manualRestore: (function(){
        try {
          if (typeof window.applyThemePreset !== 'function') return { ok:false, err:'no applyThemePreset' };
          // 复现 boot 里的做法：从存储取 id → 找预设 → applyPreset
          var id = localStorage.getItem('hana_audio_theme_preset');
          return { ok:true, note:'需要 allThemes，外部拿不到；这条只判断函数存在', id:id };
        } catch (e) { return { ok:false, err:String(e && e.message || e) }; }
      })(),
    };
  })()`,
  returnByValue: true,
})).result?.value;

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `theme-order-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const assignedAt = (diag?.order || []).filter((x) => x.tag === 'applyTheme-assigned');

const problems = [];
if (!applied?.ok) problems.push(`选预设失败：${applied?.err}`);
if (assignedAt.length === 0) problems.push('整个过程没捕获到 applyTheme 赋值');
if (diag?.applyThemeWrapped === false) problems.push('wrapApplyTheme 没生效 —— boot 里那次 window.applyTheme 还不是函数（时序问题已确认）');

console.log(JSON.stringify({
  selected: applied,
  afterReload: diag,
  applyThemeAssignTimeline: assignedAt,
  shot: file,
  verdict: problems.length ? 'FAIL' : 'PASS',
  problems,
}, null, 2));

process.exit(problems.length ? 1 : 0);
