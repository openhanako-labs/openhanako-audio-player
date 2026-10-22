#!/usr/bin/env node
/**
 * tools/probe-library-revision.mjs — 验证「revision 信号 → 前端立刻重拉」闭环
 *
 * 为什么要这样绕：
 *   sdk.js 的 isTrustedHostEvent 要求 event.source === parentWindow。
 *   页面挂在顶层时永远不满足 —— 只能**真的放进 iframe**，
 *   由父页面扮演宿主发消息。这也正好是宿主里卡片跑的方式。
 *
 * 验证内容：
 *   1) SDK 就绪，订阅注册成功
 *   2) 父页面发 hana.app.storage.changed（global 作用域）后，
 *      前端**真的**发出了 playlist 请求（不是靠 30s 轮询）
 *   3) 新曲出现在列表顶部
 *
 * 用法：node tools/probe-library-revision.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8781;

const PLAYLIST = join(process.env.USERPROFILE || '', '.hanako', 'app-data', 'hanako-audio-player', 'playlist.json');

/** 独立测试列表：读写都在内存，初值取真文件末尾 3 条并打标记。 */
let tracks = (() => {
  try {
    const raw = JSON.parse(readFileSync(PLAYLIST, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (raw && raw.SyncRoot) || [];
    return arr.slice(-3).map((t) => ({ ...t, name: '[fixture] ' + (t.name || '') }));
  } catch {
    return [{ name: '[fixture] 占位', url: 'https://example.com/a.mp3', mode: '在线', dur: 0, group: '测试' }];
  }
})();

const playlistHits = [];   // 只记 GET playlist 的时间戳

const HARNESS = (port) => `<!doctype html><meta charset="utf-8">
<title>harness</title>
<style>html,body{margin:0;background:#222}iframe{display:block;border:0;width:420px;height:700px}</style>
<iframe id="f" src="/ui/standalone.html?hana-host-origin=http://127.0.0.1:${port}"></iframe>
<script>
  window.__probe = {
    // 模拟宿主推 storage 变更事件
    fire(keys) {
      var f = document.getElementById('f');
      f.contentWindow.postMessage({
        protocol: 'hana.plugin.ui',
        version: 1,
        kind: 'event',
        type: 'hana.app.storage.changed',
        payload: { keys: keys, scope: { kind: 'global' } }
      }, 'http://127.0.0.1:${port}');
    },
    sdkReady() {
      try {
        var w = document.getElementById('f').contentWindow;
        return !!(w.__hana && w.__hana.storage && w.__hana.storage.global && w.__hana.storage.global.onChanged);
      } catch (e) { return false; }
    }
  };
</script>`;

const server = createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1');
  const path = decodeURIComponent(u.pathname);
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };

  if (path === '/widget/api/playlist' && req.method === 'GET') {
    playlistHits.push(Date.now());
    return json({ ok: true, tracks, count: tracks.length });
  }
  if (path === '/widget/api/playlist' && req.method === 'POST') {
    let body = '';
    for await (const ch of req) body += ch;
    try { const b = JSON.parse(body); if (Array.isArray(b.tracks)) tracks = b.tracks; } catch { /* 忽略 */ }
    return json({ ok: true, count: tracks.length });
  }
  if (path === '/__push') {
    const n = Number(u.searchParams.get('n') || 1);
    for (let i = 0; i < n; i++) {
      tracks.unshift({ name: `[push] 新曲 ${Date.now()}-${i}`, url: `https://example.com/new-${Date.now()}-${i}.mp3`, mode: '在线', dur: 0, group: '测试' });
    }
    return json({ ok: true, count: tracks.length });
  }
  if (path === '/__stats') return json({ hits: playlistHits.length, lastHits: playlistHits.slice(-4), top: tracks[0]?.name || null, total: tracks.length });
  if (path === '/__harness') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(HARNESS(PORT));
  }

  try {
    const p = normalize(join(ROOT, path === '/' ? '/ui/standalone.html' : path));
    if (!p.startsWith(normalize(ROOT))) { res.writeHead(403).end('403'); return; }
    const buf = readFileSync(p);
    const ext = p.split('.').pop().toLowerCase();
    const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json',
      png: 'image/png', jpg: 'image/jpeg', wav: 'audio/wav', mp3: 'audio/mpeg', svg: 'image/svg+xml' }[ext] || 'application/octet-stream';

    // app.js 里写着 const API = "/api/apps/hanako-audio-player/routes"，
    // 真实宿主下由宿主路由提供这些前缀；mock 服务里它们直接住在根路径。
    // 所以只在提供 app.js 时把这行换成 ""。
    if (ext === 'js' && path.endsWith('/app.js')) {
      const js = buf.toString('utf8').replace(
        /const API = "[^"]*";/,
        'const API = "";'
      );
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(js);
    }
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch { res.writeHead(404).end('404'); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// ── CDP ──────────────────────────────────────────────────────────
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
await S('Emulation.setDeviceMetricsOverride', { width: 460, height: 720, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/__harness` });
await new Promise((r) => setTimeout(r, 4000));

const sdkReady = (await S('Runtime.evaluate', {
  expression: 'window.__probe.sdkReady()', returnByValue: true,
})).result?.value;

const hitsBeforeSignal = (await (await fetch(`http://127.0.0.1:${PORT}/__stats`)).json()).hits;

// 后端入列（列表变化，但先不发信号）
await fetch(`http://127.0.0.1:${PORT}/__push?n=1`);
await new Promise((r) => setTimeout(r, 300));
const hitsAfterPush = (await (await fetch(`http://127.0.0.1:${PORT}/__stats`)).json()).hits;

// 现在发信号 —— 只有这一步能证明「事件驱动」真的工作
await S('Runtime.evaluate', { expression: `window.__probe.fire(['player-library-revision'])`, returnByValue: true });
await new Promise((r) => setTimeout(r, 1200));

const stats = await (await fetch(`http://127.0.0.1:${PORT}/__stats`)).json();

// ── 负面用例：无关键不应该触发重拉 ──────────────────────────────
// 没这条的话，上面那个“成功了”可能只是碰巧有别的路径在拉。
const irrelevantBefore = stats.hits;
await S('Runtime.evaluate', { expression: `window.__probe.fire(['some-other-key'])`, returnByValue: true });
await new Promise((r) => setTimeout(r, 1200));
const irrelevantAfter = (await (await fetch(`http://127.0.0.1:${PORT}/__stats`)).json()).hits;
const spurious = irrelevantAfter - irrelevantBefore;

const shot = await S('Page.captureScreenshot', { format: 'png' });
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `library-revision-${Date.now()}.png`);
writeFileSync(file, Buffer.from(shot.data, 'base64'));

await send('Target.closeTarget', { targetId });
ws.close();
server.close();

const problems = [];
if (!sdkReady) problems.push('iframe 里 window.__hana.storage.global.onChanged 不存在');
if (hitsAfterPush !== hitsBeforeSignal) problems.push(`只入列不写信号时前端就自己拉了（${hitsBeforeSignal}→${hitsAfterPush}），说明测的不是事件通路`);
if (stats.hits <= hitsAfterPush) problems.push(`发信号后没有新增 playlist 请求（${hitsAfterPush}→${stats.hits}）—— 订阅没生效`);
if (spurious > 0) problems.push(`无关键也触发了重拉（+${spurious}）—— 订阅没有按键名过滤`);

console.log(JSON.stringify({
  sdkReady,
  hitsBeforeSignal,
  hitsAfterPush,
  hitsAfterSignal: stats.hits,
  triggeredBySignal: stats.hits - hitsAfterPush,
  spuriousFromIrrelevantKey: spurious,
  topTrack: stats.top,
  shot: file,
  verdict: problems.length ? 'FAIL' : 'PASS',
  problems,
}, null, 2));

process.exit(problems.length ? 1 : 0);
