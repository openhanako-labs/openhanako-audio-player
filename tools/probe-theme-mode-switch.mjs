#!/usr/bin/env node
/**
 * tools/probe-theme-mode-switch.mjs — 切明暗之后配色还在不在
 *
 * head.js 的 patchApplyTheme 会在 applyTheme 前 clearInlineTheme()，
 * 把 19 个主题变量从行内样式删掉。如果删完不铺回去，
 * 「选暗夜 → 点日月图标 → 配色退回默认」就是必然的。
 *
 * 本探针量三态：
 *   1) 选预设后的 accent
 *   2) 切一次明暗后的 accent
 *   3) 再切回来后的 accent
 * 只要 2 或 3 偏离 1，就是丢了。
 *
 * 用法：node tools/probe-theme-mode-switch.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8787;

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

const READ = `(function(){
  var cs = getComputedStyle(document.documentElement);
  var bgEl = document.getElementById('themeBg');
  return {
    accent: cs.getPropertyValue('--accent').trim(),
    bgVar: cs.getPropertyValue('--bg').trim(),
    theme: document.documentElement.getAttribute('data-theme') || '',
    presetKey: localStorage.getItem('hana_audio_theme_preset'),
    // 真正画背景的那层元素（--bg 变量和它不是一回事）
    bgLayer: bgEl ? {
      backgroundColor: bgEl.style.backgroundColor || '',
      backgroundImage: (bgEl.style.backgroundImage || '').slice(0, 90),
      opacity: bgEl.style.opacity || '',
    } : null,
    applyThemeWrapped: !!(window.applyTheme && window.applyTheme.__bgWrapped),
    applyThemeThemed: !!(window.applyTheme && window.applyTheme.__themed),
  };
})()`;

// 干净起点 + 选预设
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 2600));
await S('Runtime.evaluate', { expression: 'localStorage.clear();', returnByValue: true });
await S('Page.navigate', { url: URL_PAGE });
await new Promise((r) => setTimeout(r, 2800));

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

const afterSelect = (await S('Runtime.evaluate', { expression: READ, returnByValue: true })).result?.value;

// 切一次明暗（#themeBtn 是「切换主题」）
const switched = (await S('Runtime.evaluate', {
  expression: `(function(){
    var b = document.getElementById('themeBtn');
    if (!b) return { ok:false, err:'no themeBtn' };
    b.click();
    return { ok:true };
  })()`,
  returnByValue: true,
})).result?.value;
await new Promise((r) => setTimeout(r, 900));
const afterSwitch = (await S('Runtime.evaluate', { expression: READ, returnByValue: true })).result?.value;

// 再切回来
await S('Runtime.evaluate', {
  expression: `(function(){ var b=document.getElementById('themeBtn'); if(b) b.click(); })()`,
  returnByValue: true,
});
await new Promise((r) => setTimeout(r, 900));
const afterSwitchBack = (await S('Runtime.evaluate', { expression: READ, returnByValue: true })).result?.value;

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `theme-mode-switch-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const problems = [];
if (!applied?.ok) problems.push(`选预设失败：${applied?.err}`);
if (!switched?.ok) problems.push(`切明暗失败：${switched?.err}`);
if (afterSelect?.accent && afterSwitch?.accent && afterSelect.accent !== afterSwitch.accent) {
  if (afterSwitch.accent === '#d49a6a' || afterSwitch.accent === '#c48454') {
    problems.push(`切明暗后配色退回默认：${afterSelect.accent} → ${afterSwitch.accent}`);
  } else {
    problems.push(`切明暗后 accent 变了：${afterSelect.accent} → ${afterSwitch.accent}`);
  }
}
if (afterSelect?.accent && afterSwitchBack?.accent && afterSelect.accent !== afterSwitchBack.accent) {
  problems.push(`切回来也没恢复：期望 ${afterSelect.accent}，实际 ${afterSwitchBack.accent}`);
}

if (afterSelect?.accent && afterSelect?.bgLayer && afterSwitch?.bgLayer) {
  if (afterSelect.bgLayer.backgroundColor && afterSwitch.bgLayer.backgroundColor
      && afterSelect.bgLayer.backgroundColor === afterSwitch.bgLayer.backgroundColor) {
    problems.push(`切明暗后背景层没变（始终 ${afterSwitch.bgLayer.backgroundColor}）—— 深底配浅字`);
  }
}

console.log(JSON.stringify({
  selected: applied,
  afterSelect,
  afterSwitch,
  afterSwitchBack,
  accentHeld: !problems.length,
  shot: file,
  verdict: problems.length ? 'FAIL' : 'PASS',
  problems,
}, null, 2));

process.exit(problems.length ? 1 : 0);
