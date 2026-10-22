#!/usr/bin/env node
/**
 * tools/probe-cover-img.mjs — 封面图加载得出来吗，取色拿得到像素吗
 *
 * 背景（2026-10-22）：竖版那个黑胶圆盘只剩铜色 + 纹路，没有封面图。
 *   而宿主探针显示横条里 strip-cover 有 has-art，说明同一个 pic 地址
 *   在横条里是能出图的。所以问题不在 URL 本身，在竖版这条路上。
 *
 * 本探针要分清四种：
 *   A) <img> 根本没被写进去（DOM 里没 img）
 *   B) 写进去了但加载失败（naturalWidth === 0）
 *   C) 加载成功但被 CSS 盖住 / 尺寸为 0
 *   D) 加载成功、也可见，但取色仍然失败（CORS 污染）
 *
 * 用法：node tools/probe-cover-img.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8797;

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
// 用竖卡尺寸（宽 420），这是出问题的那一形态
await S('Emulation.setDeviceMetricsOverride', { width: 420, height: 780, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
await new Promise((r) => setTimeout(r, 3000));

const RESULT = await S('Runtime.evaluate', {
  expression: `(function(){
    var cover = document.getElementById('npCover');
    if (!cover) return { err: 'no #npCover' };

    var img = cover.querySelector('img');
    var coverCS = getComputedStyle(cover);
    var coverRect = cover.getBoundingClientRect();

    var out = {
      coverExists: true,
      hasImg: !!img,
      coverInnerHTMLHead: (cover.innerHTML || '').slice(0, 120),
      coverSize: { w: Math.round(coverRect.width), h: Math.round(coverRect.height) },
      coverDisplay: coverCS.display,
      coverOverflow: coverCS.overflow,
      coverZIndex: coverCS.zIndex,
      // ::before 是唱片纹，::after 是中心轴孔 —— 它们可能盖住图
      beforeContent: getComputedStyle(cover, '::before').content,
      beforeZ: getComputedStyle(cover, '::before').zIndex,
      afterContent: getComputedStyle(cover, '::after').content,
      afterZ: getComputedStyle(cover, '::after').zIndex,
    };

    if (img) {
      var ir = img.getBoundingClientRect();
      var ics = getComputedStyle(img);
      out.img = {
        src: (img.src || '').slice(0, 160),
        complete: img.complete,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        rect: { w: Math.round(ir.width), h: Math.round(ir.height) },
        display: ics.display,
        opacity: ics.opacity,
        objectFit: ics.objectFit,
        borderRadius: ics.borderRadius,
        // 是否被盖住：看中心点的命中元素
        hitAtCenter: (function(){
          var el = document.elementFromPoint(ir.left + ir.width/2, ir.top + ir.height/2);
          if (!el) return null;
          return { tag: el.tagName, cls: (typeof el.className === 'string' ? el.className : ''), id: el.id };
        })(),
      };
    }

    // 取色能力：能不能读像素
    out.canvasReadable = (function(){
      if (!img || !img.naturalWidth) return 'no-image';
      try {
        var c = document.createElement('canvas'); c.width = 8; c.height = 8;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0, 8, 8);
        g.getImageData(0, 0, 1, 1);
        return 'ok';
      } catch (e) { return 'tainted: ' + (e.name || e); }
    })();

    return out;
  })()`,
  returnByValue: true,
});

const r = RESULT.result?.value || {};
const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `cover-img-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

console.log(JSON.stringify({ ...r, shot: file }, null, 2));
