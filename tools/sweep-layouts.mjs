#!/usr/bin/env node
// sweep-layouts.mjs —— 一次跑遍四种形态，给出各自的几何体检（v2：区分「真裁切」与「可滚动」）
//
// v1 的假阳性：元素在可滚动容器里时，rect 也会超出视口——那是正常的，不是被切。
// v2 沿祖先链找裁切者，只有「裁切它、又滚不动」才算真伤。
//
// 形态判定（index.html applyEnvelopeLayout）：
//   h <= 156 且 w >= h*1.6   → strip
//   否则 w >= 720             → wide
//   否则 h < 560              → compact
//   再否则                     → long
//
// 用法：node tools/sweep-layouts.mjs [--port 8778]

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const pi = process.argv.indexOf('--port');
const PORT = pi >= 0 ? Number(process.argv[pi + 1]) : 8778;

class Conn {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } }); }
  send(method, params = {}, sessionId) { const id = ++this.id; const pl = { id, method, params };
    if (sessionId) pl.sessionId = sessionId; this.ws.send(JSON.stringify(pl));
    return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej })); }
}
const openWs = (u) => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.addEventListener('open', () => res(ws)); ws.addEventListener('error', () => rej(new Error('ws'))); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  { w: 1180, h: 760, label: '拆窗默认（宽口）' },
  { w: 1040, h: 780, label: '拆窗默认（竖版）' },
  { w: 1280, h: 900, label: '大窗口' },
  { w: 900,  h: 620, label: '中等宽口' },
  { w: 720,  h: 640, label: 'wide 下界' },
  { w: 640,  h: 560, label: '窄口' },
  { w: 560,  h: 620, label: '很窄' },
  { w: 420,  h: 780, label: '手机竖屏' },
  { w: 380,  h: 500, label: '很小竖屏' },
  { w: 1040, h: 60,  label: '横条（贴顶）' },
  { w: 1040, h: 120, label: '横条（厚）' },
  { w: 620,  h: 90,  label: '横条（窄矮）' },
];

const PROBE = `(() => {
  const pc = document.querySelector('.player-container');
  const layout = pc ? pc.getAttribute('data-layout') : null;
  const vw = innerWidth, vh = innerHeight;

  const scrollable = (el) => {
    const cs = getComputedStyle(el);
    const oy = cs.overflowY;
    return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
  };
  // 找到最近一个「会裁切它」的祖先
  const clipperOf = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      const oy = cs.overflowY;
      const isScroll = oy === 'auto' || oy === 'scroll';
      if (cs.overflow !== 'visible') {
        // 父容器可纵向滚动 → 子内容可达，不算真裁切
        if (isScroll) return { el: p, scrolls: true };
        return { el: p, scrolls: false };
      }
      p = p.parentElement;
    }
    return null;
  };

  const DECOR = /front-glow|front-band|strip-flight|strip-spark|strip-field|backdrop|glow|sparkle|star|wisp|halo/i;
  const clipped = [], scrollableOff = [], decor = [];
  const seen = new Set();

  document.querySelectorAll('.player-container *').forEach((el) => {
    // 跳过 SVG 内部的非语义几何元素（path/circle/line/use glyph 等）：它们贴近容器是正常的
    if (el.namespaceURI && el.namespaceURI.indexOf('svg') >= 0 && !/svg$/.test(el.tagName)) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const bad = r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1;
    if (!bad) return;
    const isDecor = DECOR.test(el.id || '') || DECOR.test(String(el.className || ''));
    const rec = { id: el.id ? String(el.id) : String(el.className).slice(0, 26),
                  l: Math.round(r.left), r: Math.round(r.right),
                  t: Math.round(r.top), b: Math.round(r.bottom) };
    if (isDecor) { decor.push(rec); return; }
    const clip = clipperOf(el);
    if (clip && clip.scrolls) { scrollableOff.push(rec); return; }
    const key = rec.id + '|' + rec.t + '|' + rec.b;
    if (seen.has(key)) return;
    seen.add(key);
    clipped.push({ ...rec, clipper: clip ? (clip.el.id ? String(clip.el.id) : String(clip.el.className).slice(0, 20)) : 'document' });
  });

  const vis = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'absent';
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return 'hidden';
    const r = el.getBoundingClientRect();
    return (r.width > 0 && r.height > 0) ? 'visible' : 'zero';
  };
  return {
    layout, vw, vh,
    docScrolls: document.documentElement.scrollHeight > vh + 1,
    leak: layout !== 'strip' && vis('#playerStrip') === 'visible',
    regions: {
      nowPlaying: vis('.now-playing-section'),
      controls: vis('.controls-section'),
      lyrics: vis('.lyrics-section'),
      left: vis('.player-left'),
      right: vis('.player-right'),
      strip: vis('#playerStrip'),
    },
    clipped: clipped.slice(0, 10),
    clippedCount: clipped.length,
    scrollableOffCount: scrollableOff.length,
    decorCount: decor.length,
  };
})()`;

async function main() {
  const bws = await openWs((await (await fetch(CDP + '/json/version')).json()).webSocketDebuggerUrl);
  const conn = new Conn(bws);
  mkdirSync(OUT, { recursive: true });
  const rows = [];

  for (const c of CASES) {
    const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => conn.send(m, p, sessionId);
    const errs = [];
    const onMsg = (ev) => { const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.exceptionThrown' && m.sessionId === sessionId) {
        errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); } };
    conn.ws.addEventListener('message', onMsg);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: c.w, height: c.h, deviceScaleFactor: 1, mobile: false });
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html?s=${Date.now()}` });
    await sleep(2200);
    const r = await S('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const png = await S('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `layout-${c.w}x${c.h}.png`), Buffer.from(png.data, 'base64'));
    rows.push({ case: `${c.w}x${c.h}`, label: c.label, ...r.result.value, consoleErrors: errs.slice(0, 3) });
    conn.ws.removeEventListener('message', onMsg);
    await conn.send('Target.closeTarget', { targetId });
  }
  bws.close();

  for (const r of rows) {
    const flag = r.clippedCount > 0 || r.consoleErrors.length || r.leak ? '  ← 有问题' : '';
    console.log(`\n${r.case}  [${r.layout}]  ${r.label}${flag}`);
    console.log(`  真裁切 ${r.clippedCount} · 可滚动(reachable) ${r.scrollableOffCount} · 装饰 ${r.decorCount} · 文档滚动 ${r.docScrolls}` +
      (r.leak ? ` · ⚠ 横条泄漏(非strip形态却显示) ` : '') +
      (r.consoleErrors.length ? ` · 报错 ${r.consoleErrors.length}` : ''));
    r.clipped.slice(0, 5).forEach((o) => console.log(`    ✗ ${o.id}  L${o.l} R${o.r} T${o.t} B${o.b}  （被 ${o.clipper} 裁）`));
    r.consoleErrors.slice(0, 2).forEach((e) => console.log(`    ! ${String(e).slice(0, 110)}`));
  }
  const bad = rows.filter((r) => r.clippedCount > 0 || r.consoleErrors.length > 0 || r.leak);
  console.log(`\n=== 真裁切形态: ${bad.length} / ${rows.length} ===`);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
