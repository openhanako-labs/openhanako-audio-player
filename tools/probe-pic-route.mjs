#!/usr/bin/env node
/**
 * tools/probe-pic-route.mjs — /widget/api/music/pic 代理到底通不通
 *
 * 背景：取色器 404/403 是「背景不跟封面」的根因，但具体是哪种失败，
 *   一直没在宿主里直接量过。这次列四种候选 URL 一起打，看哪个返回图。
 *
 * 在页面上下文里发请求（带齐 cookie / surface 凭证），而不是从外部 curl ——
 * 外部请求缺凭证，得到的 403 不能代表卡片里的真实情况。
 *
 * 用法：node tools/probe-pic-route.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8798;

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
await S('Emulation.setDeviceMetricsOverride', { width: 420, height: 780, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
await new Promise((r) => setTimeout(r, 2800));

// 拿一首真实曲目的封面地址（播放列表里第一条有 pic 的）
const RESULT = await S('Runtime.evaluate', {
  expression: `(async function(){
    var out = { tried: [] };

    // 从页面的 localStorage / 全局里找一个真实 pic
    var pic = null;
    try {
      var raw = localStorage.getItem('hana_audio_playlist');
      var list = raw ? JSON.parse(raw) : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].pic) { pic = list[i].pic; break; }
      }
    } catch (e) {}
    if (!pic && window._currentTrack && window._currentTrack.cover) pic = window._currentTrack.cover;
    out.pic = pic ? String(pic).slice(0, 120) : null;
    if (!pic) return out;

    var API = '/api/apps/hanako-audio-player/routes';
    var cands = [
      { name: 'API 前缀 + pic', url: API + '/widget/api/music/pic?url=' + encodeURIComponent(pic) },
      { name: '裸根路径 + pic', url: '/widget/api/music/pic?url=' + encodeURIComponent(pic) },
      { name: '直连 CDN', url: pic },
    ];

    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var rec = { name: c.name, url: c.url.slice(0, 140) };
      try {
        var r = await fetch(c.url, { cache: 'no-store' });
        rec.status = r.status;
        rec.type = r.type;
        rec.redirected = r.redirected;
        rec.contentType = r.headers.get('content-type');
        rec.acao = r.headers.get('access-control-allow-origin');
        var b = await r.blob();
        rec.bytes = b.size;
        rec.looksLikeImage = /^image\\//.test(rec.contentType || '');
        if (!rec.looksLikeImage && rec.status === 200) {
          rec.head = (await b.text()).slice(0, 120);
        }
      } catch (e) {
        rec.err = String(e && e.message || e);
      }
      out.tried.push(rec);
    }
    return out;
  })()`,
  awaitPromise: true,
  returnByValue: true,
});

const r = RESULT.result?.value || {};
const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `pic-route-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

console.log(JSON.stringify({ ...r, shot: file }, null, 2));
