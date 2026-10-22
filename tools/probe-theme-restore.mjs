#!/usr/bin/env node
/**
 * tools/probe-theme-restore.mjs — 定位配色恢复链路断在哪一环
 *
 * 已知事实（上一探针）：
 *   重开后 localStorage 里 key 仍是 pitchblack，但 --accent 变回 #d49a6a。
 *   即：存储没丢，**恢复时没生效**。
 *
 * 本探针把 boot() 里那条链逐段量出来：
 *   1) currentId() 读出来是什么
 *   2) allThemes() 里找得到这个 id 吗
 *   3) applyPreset 到底是执行了、还是提前 return 了
 *   4) 执行后 --accent 有没有变
 *
 * 关键手法：在页面脚本跑之前就注入钩子（Page.addScriptToEvaluateOnNewDocument），
 * 这样能抓到 boot 期的调用，也就能看到它和「别的主题逻辑」的先后顺序。
 *
 * 用法：node tools/probe-theme-restore.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8783;

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

// 页面脚本跑之前注入记录器
const HOOK = `
window.__trace = [];
window.__note = function (tag, detail) {
  try {
    window.__trace.push({ t: Math.round(performance.now()), tag: tag, detail: detail || null });
  } catch (e) {}
};
// 监视 --accent 的变化
(function () {
  var root = document.documentElement;
  var last = null;
  function poll() {
    var v = getComputedStyle(root).getPropertyValue('--accent').trim();
    if (v !== last) { last = v; window.__note('accent-changed', v); }
    requestAnimationFrame(poll);
  }
  try { requestAnimationFrame(poll); } catch (e) {}
})();
`;

await S('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

// ── 阶段 1：干净起点 + 选一个预设 ────────────────────────────────
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

const stored = (await S('Runtime.evaluate', {
  expression: `({ key: localStorage.getItem('hana_audio_theme_preset'),
                accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() })`,
  returnByValue: true,
})).result?.value;

// ── 阶段 2：重开，抓 boot 期轨迹 ────────────────────────────────
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 3000));

const diag = (await S('Runtime.evaluate', {
  expression: `(function(){
    var root = document.documentElement;
    function v(n){ return getComputedStyle(root).getPropertyValue(n).trim(); }
    return {
      trace: (window.__trace||[]).slice(0, 60),
      finalAccent: v('--accent'),
      finalBg: v('--bg'),
      presetKey: localStorage.getItem('hana_audio_theme_preset'),
      themeMode: localStorage.getItem('hanako_audio_theme_mode'),
      // 看看 applyTheme 有没有被包过（说明竞态）
      applyThemeWrapped: !!(window.applyTheme && window.applyTheme.__bgWrapped),
      hasApplyPreset: typeof window.applyThemePreset === 'function',
      bodyClass: document.body.className,
    };
  })()`,
  returnByValue: true,
})).result?.value;

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `theme-restore-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

// 分析轨迹：accent 变化的先后
const accents = (diag?.trace || []).filter((x) => x.tag === 'accent-changed');
const expected = stored?.accent;
const final = diag?.finalAccent;

const problems = [];
if (!applied?.ok) problems.push(`选预设失败：${applied?.err}`);
if (!stored?.key || stored.key === 'undefined') problems.push(`写入阶段 key 异常：${stored?.key}`);
if (diag?.presetKey !== stored?.key) problems.push(`重开后 key 变了：${stored?.key} → ${diag?.presetKey}`);
if (expected && final && expected !== final)
  problems.push(`重开后 accent 未恢复：选中时 ${expected} → 现在 ${final}`);

console.log(JSON.stringify({
  selected: applied,
  stored,
  afterReload: {
    presetKey: diag?.presetKey,
    finalAccent: diag?.finalAccent,
    finalBg: diag?.finalBg,
    themeMode: diag?.themeMode,
    applyThemeWrapped: diag?.applyThemeWrapped,
    hasApplyPreset: diag?.hasApplyPreset,
    bodyClass: diag?.bodyClass,
  },
  accentTimeline: accents,
  shot: file,
  verdict: problems.length ? 'FAIL' : 'PASS',
  problems,
}, null, 2));

process.exit(problems.length ? 1 : 0);
