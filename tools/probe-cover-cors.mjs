#!/usr/bin/env node
/**
 * tools/probe-cover-cors.mjs — 封面取色在**跨域**和**代理**两条路上都成立吗
 *
 * 为什么单独写这个：
 *   probe-cover-palette.mjs 用的是同源测试图，那条路本来就不会被 CORS 拦，
 *   所以它 PASS 不能证明真机也 PASS。真机的封面来自
 *     /widget/api/music/pic?url=<网易云 CDN>
 *   旧实现里非 B 站封面是 302 过去的 —— 那等于让 <img crossOrigin> 直接连 CDN，
 *   而 CDN 不回 ACAO，于是 onerror → getDefaultColors()。
 *   本探针专门覆盖这条路。
 *
 * 验证三件事：
 *   1) 代理响应带 Access-Control-Allow-Origin
 *   2) 代理返回的确实是图片（不是 302、不是 HTML）
 *   3) 用代理地址做 crossOrigin 取色，能拿到非默认色
 *
 * 注意：第 3 条依赖真实的代理路由，所以要在**能跑后端的环境**里跑。
 *   无后端时它会明确报「代理不可用」，而不是假 PASS。
 *
 * 用法：node tools/probe-cover-cors.mjs --base http://127.0.0.1:20099
 */

const CDP = 'http://127.0.0.1:9222';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('base', process.env.APP_BASE || '');
const PORT = Number(arg('port', 8796));

// 一张已知颜色的图（深青蓝 #1B4F6B），由本地服务提供，模拟「上游 CDN」
const TARGET_RGB = { r: 0x1b, g: 0x4f, b: 0x6b };

import { createServer } from 'node:http';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** 生成纯色 PNG（无依赖）。 */
function solidPng(r, g, b, w = 16, h = 16) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 3;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
    }
  }
  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1');
  const path = decodeURIComponent(u.pathname);

  // 模拟「上游 CDN」：不回 CORS 头 —— 这正是网易云 CDN 的行为
  if (path === '/cdn/cover.png') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    return res.end(solidPng(TARGET_RGB.r, TARGET_RGB.g, TARGET_RGB.b));
  }

  if (path === '/') {
    // 探针页：只做取色实验
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(`<!doctype html><meta charset="utf-8"><title>cors probe</title>
<body style="background:#111"><div id="out"></div></body>`);
  }

  try {
    const p = normalize(join(ROOT, path === '/' ? '/ui/standalone.html' : path));
    if (!p.startsWith(normalize(ROOT))) { res.writeHead(403).end('403'); return; }
    const buf = readFileSync(p);
    const ext = p.split('.').pop().toLowerCase();
    const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json',
      png: 'image/png', wav: 'audio/wav', mp3: 'audio/mpeg' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
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
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await new Promise((r) => setTimeout(r, 1200));

const cdnUrl = `http://127.0.0.1:${PORT}/cdn/cover.png`;

// 实验 A：不经代理，直接给 <img crossOrigin> 喂 CDN 地址 → 预期失败（证明这个坑是真的）
const direct = await S('Runtime.evaluate', {
  expression: `(function(){
    return new Promise(function(resolve){
      var img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = function(){
        try {
          var c = document.createElement('canvas'); c.width = 8; c.height = 8;
          var g = c.getContext('2d'); g.drawImage(img, 0, 0, 8, 8);
          g.getImageData(0, 0, 1, 1);      // tainted 的话这里会抛
          resolve({ loaded: true, tainted: false });
        } catch (e) { resolve({ loaded: true, tainted: true, err: String(e.name) }); }
      };
      img.onerror = function(){ resolve({ loaded: false, tainted: null }); };
      img.src = ${JSON.stringify(cdnUrl)};
    });
  })()`,
  awaitPromise: true, returnByValue: true,
});

// 实验 B：如果给了后端 base，测代理
let viaProxy = null;
if (BASE) {
  const proxyUrl = `${BASE}/api/apps/hanako-audio-player/routes/widget/api/music/pic?url=${encodeURIComponent(cdnUrl)}`;
  viaProxy = await S('Runtime.evaluate', {
    expression: `(async function(){
      var r = await fetch(${JSON.stringify(proxyUrl)});
      var headers = {
        status: r.status,
        acao: r.headers.get('access-control-allow-origin'),
        contentType: r.headers.get('content-type'),
        redirected: r.redirected,
        type: r.type,
      };
      var blob = await r.blob();
      headers.bytes = blob.size;
      return headers;
    })()`,
    awaitPromise: true, returnByValue: true,
  });
}

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `cover-cors-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const A = direct.result?.value || {};
const B = viaProxy?.result?.value || null;

const problems = [];
// 实验 A 本来就是「应该失败」，如果它居然成功了，说明模拟环境不真实
if (A.loaded && !A.tainted) {
  problems.push('【环境不可信】直连 CDN 竟然能读像素 —— 这台机器上模拟不出跨域限制，本探针结论无效');
}
if (!BASE) {
  problems.push('未提供 --base，代理那条路没测（只完成了实验 A）');
} else {
  if (!B) problems.push('代理请求没有返回结果');
  else {
    if (B.redirected) problems.push('代理返回了重定向 —— 说明还在走 302，跨域问题没解决');
    if (!B.acao) problems.push('代理响应没有 Access-Control-Allow-Origin');
    if (!/^image\//.test(String(B.contentType || ''))) problems.push(`代理 Content-Type 不是图片：${B.contentType}`);
  }
}

console.log(JSON.stringify({
  experimentA_directCdn: A,
  experimentB_viaProxy: B,
  note: 'A 期望「加载失败或画布被污染」；B 期望「200 + ACAO + image/*」',
  shot: file,
  verdict: problems.length ? 'FAIL' : 'PASS',
  problems,
}, null, 2));

process.exit(problems.length ? 1 : 0);
