#!/usr/bin/env node
/**
 * tools/probe-theme-persist.mjs — 验证「选配色 → 重开 → 还是那个配色」
 *
 * 背景：
 *   用户反馈「每次重开变回 Default」。上一轮我猜是初始化时序，
 *   但没量过。这里把三个阶段都量出来：
 *     1) 写入：选一个预设后，key 真的落进 localStorage 了吗
 *     2) 读回：新文档（模拟重开）读得到吗
 *     3) 应用：读到的 preset 真的被应用到 CSS 变量了吗
 *
 *   只用同一浏览器上下文（localStorage 同源共享），所以能真实模拟重开。
 *
 * 用法：node tools/probe-theme-persist.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8782;

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

// ── 阶段 0：干净起点 ────────────────────────────────────────────
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 2600));
await S('Runtime.evaluate', { expression: `localStorage.clear();`, returnByValue: true });

// ── 阶段 1：重开一次，看默认状态 ────────────────────────────────
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 2600));

const readState = `
(function () {
  var root = document.documentElement;
  function v(n) { return getComputedStyle(root).getPropertyValue(n).trim(); }
  var api = window.__themePresetApi || null;
  return {
    presetKey: localStorage.getItem('hana_audio_theme_preset'),
    customKey: localStorage.getItem('hana_audio_theme_custom'),
    accent: v('--accent'),
    bg: v('--bg'),
    surface: v('--surface'),
    // 当前预设的 id（若有暴露）
    currentPresetId: (function () {
      try { return document.body.getAttribute('data-theme-preset') || ''; } catch (e) { return ''; }
    })(),
    hasApplyFn: typeof window.applyThemePreset === 'function',
    allThemeKeys: Object.keys(localStorage).filter(function (k) { return k.indexOf('theme') >= 0 || k.indexOf('hana_audio') >= 0; }),
  };
})();
`;

const fresh = (await S('Runtime.evaluate', { expression: readState, returnByValue: true })).result?.value;

// ── 阶段 2：选一个非默认预设 ────────────────────────────────────
// 先看有哪些预设可用
const presetList = (await S('Runtime.evaluate', {
  expression: `(function(){
    var el = document.querySelector('#themeSelect, select[id*="theme"], [data-theme-preset]');
    var opts = [];
    var sel = document.querySelector('select');
    if (sel) for (var i=0;i<sel.options.length;i++) opts.push(sel.options[i].value);
    return { selectFound: !!sel, options: opts.slice(0, 30) };
  })()`,
  returnByValue: true,
})).result?.value;

// 直接调 API 切到一个明确不是默认的预设。
//
// 注意：applyPreset(t) 要的是**预设对象**，不是 id 字符串。
// 传字符串会让 t.id 变成 undefined，存进 localStorage 的就是字面量 "undefined"
// —— 这是探针自己的错，不是 App 的 bug（第一次就踩了，记在这里）。
// 正确做法：通过面板里的 chip 点一下，走真实用户路径。
const APPLY = `(function(){
  // 真入口是 #paletteBtn（title="配色主题"），不是 #themeBtn（那是明暗切换）。
  // 第一次就搭错了，记在这里："theme" 和 "palette" 是两件不同的事。
  var opener = document.getElementById('paletteBtn');
  if (!opener) return { ok:false, err:'找不到 #paletteBtn' };
  opener.click();

  var grid = document.getElementById('themeGrid');
  if (!grid || !grid.children.length) return { ok:false, err:'点开后 theme chips 仍未渲染' };

  var chips = grid.querySelectorAll('.theme-chip');
  var target = null;
  for (var i = 0; i < chips.length; i++) {
    if (!chips[i].classList.contains('active')) { target = chips[i]; break; }
  }
  if (!target) return { ok:false, err:'没有非 active 的 chip' };
  var label = target.textContent.trim();
  target.click();
  return { ok:true, clicked: label, totalChips: chips.length };
})()`;

const applied = (await S('Runtime.evaluate', { expression: APPLY, returnByValue: true })).result?.value;
await new Promise((r) => setTimeout(r, 600));

const afterApply = (await S('Runtime.evaluate', { expression: readState, returnByValue: true })).result?.value;

// ── 阶段 3：重开（同一 origin，localStorage 保留）────────────────
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 2800));

const afterReload = (await S('Runtime.evaluate', { expression: readState, returnByValue: true })).result?.value;

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `theme-persist-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const problems = [];
if (!applied?.ok) problems.push(`切换预设失败：${applied?.err}`);
if (afterApply && !afterApply.presetKey) problems.push('切换后 localStorage 里没有 preset key —— 写入没发生');
if (afterApply && afterReload && afterApply.presetKey && afterReload.presetKey !== afterApply.presetKey)
  problems.push(`重开后 key 变了：${afterApply.presetKey} → ${afterReload.presetKey}`);
const colorChanged = afterApply && afterReload && afterApply.accent && afterReload.accent
  && afterApply.accent !== afterReload.accent;
if (colorChanged) problems.push(`重开后强调色变了：${afterApply.accent} → ${afterReload.accent}（配色没恢复）`);

console.log(JSON.stringify({
  presetsAvailable: presetList,
  freshStart: fresh,
  applyResult: applied,
  afterApply,
  afterReload,
  accentStable: !colorChanged,
  shot: file,
  verdict: problems.length ? 'FAIL' : 'PASS',
  problems,
}, null, 2));

process.exit(problems.length ? 1 : 0);
