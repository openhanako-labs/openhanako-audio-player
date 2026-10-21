#!/usr/bin/env node
// probe-clip.mjs —— 追问：被切的那些元素，用户到底够不够得着？
// 判据三条：容器能不能滚、滚了之后是否可见、有没有滚动条。
// 用法：node tools/probe-clip.mjs --w 560 --h 620 [--port 8778]

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDP = 'http://127.0.0.1:9222';
const q = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const W = Number(q('w', 560)), H = Number(q('h', 620)), PORT = Number(q('port', 8778));

class Conn {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } }); }
  send(method, params = {}, sid) { const id = ++this.id; const pl = { id, method, params };
    if (sid) pl.sessionId = sid; this.ws.send(JSON.stringify(pl));
    return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej })); }
}
const openWs = (u) => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.addEventListener('open', () => res(ws)); ws.addEventListener('error', () => rej(new Error('ws'))); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `(() => {
  const d = document.documentElement, b = document.body;
  const pc = document.querySelector('.player-container');
  const pr = document.querySelector('.player-right');
  const cs = (e) => e ? getComputedStyle(e) : null;

  const box = (e) => e ? {
    h: Math.round(e.getBoundingClientRect().height),
    clientH: e.clientHeight, scrollH: e.scrollHeight,
    canScroll: e.scrollHeight > e.clientHeight + 1,
    overflowY: cs(e).overflowY, overflowX: cs(e).overflowX,
    maxH: cs(e).maxHeight, heightProp: cs(e).height,
  } : null;

  // 找一个关键按钮，看它是否在视口内
  const inView = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return 'absent';
    const r = e.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom),
             visible: r.bottom <= innerHeight + 1 && r.top >= -1 };
  };

  return {
    viewport: { w: innerWidth, h: innerHeight },
    layout: pc ? pc.getAttribute('data-layout') : null,
    document: { scrollH: d.scrollHeight, clientH: d.clientHeight, canScroll: d.scrollHeight > d.clientHeight + 1,
                bodyScrollH: b.scrollHeight, bodyClientH: b.clientHeight,
                bodyOverflowY: cs(b).overflowY, htmlOverflowY: cs(d).overflowY },
    container: box(pc),
    playerRight: box(pr),
    playerLeft: box(document.querySelector('.player-left')),
    keyControls: {
      playBtn: inView('.play-btn') !== 'absent' ? inView('.play-btn') : inView('#playBtn'),
      progressBar: inView('.progress-bar') !== 'absent' ? inView('.progress-bar') : inView('#progressBar'),
      navTabs: inView('.nav-tabs'),
      playlistSection: inView('.playlist-section'),
    },
  };
})()`;

async function main() {
  const bws = await openWs((await (await fetch(CDP + '/json/version')).json()).webSocketDebuggerUrl);
  const conn = new Conn(bws);
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => conn.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html?c=${Date.now()}` });
  await sleep(2200);
  const r = await S('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  console.log(JSON.stringify(r.result.value, null, 2));

  // 试着滚到底，看关键按钮是否出现
  await S('Runtime.evaluate', { expression: `window.scrollTo(0, 99999); document.documentElement.scrollTop = 99999; true` });
  await sleep(300);
  const after = await S('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  console.log('\\n--- 尝试滚到底之后 ---');
  console.log(JSON.stringify({ document: after.result.value.document, keyControls: after.result.value.keyControls }, null, 2));

  await conn.send('Target.closeTarget', { targetId }); bws.close();
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
