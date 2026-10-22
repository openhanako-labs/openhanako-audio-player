#!/usr/bin/env node
/**
 * tools/probe-cover-palette.mjs — 「封面皮肤」到底会不会按封面换色
 *
 * 背景（2026-10-22 反馈「横版背景还是没有跟随封面」）：
 *   两个 bug 叠在一起：
 *     1) load() 里写的是 window.applyThemePreset('cover') ——
 *        applyPreset 收的是**预设对象**，传字符串进去 t.id 是 undefined，
 *        函数在 if (!t) return false 直接返回，什么都没发生。
 *     2) applyPreset 的取色分支条件是 `&& window.__currentCoverUrl`，
 *        打开时往往还没当前曲目 → 直接跳过，停在预设里写死的 #d49a6a。
 *
 * 本探针要证：设了封面、选了 cover 预设之后，
 *   --accent 会变成从封面取出来的颜色，而不是写死的那个。
 *
 * 做法：用一张纯色图当封面（本地 data URL 转成同源代理地址不现实，
 *   所以直接调取色器 API 验证它拿得到颜色，再验接线是否把它写进 CSS）。
 *
 * 用法：node tools/probe-cover-palette.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8793;

/** PNG chunk 用的 CRC32（无依赖）。 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1');
  let path = decodeURIComponent(u.pathname);

  // 造一张 16x16 的纯色 PNG（深青蓝 #1B4F6B），当封面用
  if (path === '/cover.png') {
    // 手工构建 PNG（无依赖）；颜色刻意选一个与任何预设都不同的深青蓝，
    // 这样取色成功时 --accent 的变化方向是明确的。
    const w = 16, h = 16;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      const off = y * (w * 3 + 1);
      raw[off] = 0; // filter none
      for (let x = 0; x < w; x++) {
        const p = off + 1 + x * 3;
        raw[p] = 0x1b; raw[p + 1] = 0x4f; raw[p + 2] = 0x6b;
      }
    }
    const zlib = await import('node:zlib');
    const idat = zlib.deflateSync(raw);
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const t = Buffer.from(type, 'ascii');
      const crcInput = Buffer.concat([t, data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcInput) >>> 0);
      return Buffer.concat([len, t, data, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
    ]);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    return res.end(png);
  }

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
await S('Emulation.setDeviceMetricsOverride', { width: 1040, height: 90, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
await new Promise((r) => setTimeout(r, 3200));

const RESULT = await S('Runtime.evaluate', {
  expression: `(async function(){
    var out = { steps: [] };

    // 1) 取色器能不能从这张图拿到颜色
    var ext = window.aiThemeGenerator && window.aiThemeGenerator.coverColorExtractor;
    out.hasExtractor = !!ext;
    if (!ext) return out;

    var before = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    out.accentBefore = before;

    // 2) 造一个「有封面」的状态：直接写 __currentCoverUrl，
    //    并调用本次修好后的取色入口
    window.__currentCoverUrl = '/cover.png';
    out.hasCoverPaletteFn = typeof window.__applyCoverPalette === 'function';
    if (!out.hasCoverPaletteFn) return out;

    var ok = await window.__applyCoverPalette();
    out.applyReturned = ok;

    await new Promise(function(r){ setTimeout(r, 300); });
    var after = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    out.accentAfter = after;
    out.changed = before !== after;
    return out;
  })()`,
  awaitPromise: true,
  returnByValue: true,
});

const r = RESULT.result?.value || {};
const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `cover-palette-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const problems = [];
if (!r.hasExtractor) problems.push('coverColorExtractor 不存在');
if (!r.hasCoverPaletteFn) problems.push('window.__applyCoverPalette 不存在（取色入口没接出来）');
if (r.hasCoverPaletteFn && !r.applyReturned) problems.push('applyCoverPalette 返回 false（没取到颜色）');
if (r.hasCoverPaletteFn && r.applyReturned && !r.changed) {
  problems.push(`取色成功了但 --accent 没变（${r.accentBefore}）—— 接线没生效`);
}

console.log(JSON.stringify({
  ...r,
  shot: file,
  verdict: problems.length ? 'FAIL' : 'PASS',
  problems,
}, null, 2));

process.exit(problems.length ? 1 : 0);
