#!/usr/bin/env node
// debug-layout.mjs —— 量出 long/compact 下到底是谁撑破 / 被裁
// 用法：node tools/debug-layout.mjs --w 560 --h 620 [--port 8778]
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
  const titles = ['player-container','player-left','header','now-playing-section','lyrics-section','pv-stage','controls-section','player-right','nav-tabs','tab-content'];
  const blocks = [];
  for (const t of titles) {
    const el = document.querySelector('.' + t);
    if (el) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      blocks.push({
        name: t,
        top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
        display: cs.display, flex: cs.flex, flexBasis: cs.flexBasis,
        minH: cs.minHeight, maxH: cs.maxHeight, hProp: cs.height,
        overflowY: cs.overflowY, scrollH: el.scrollHeight, clientH: el.clientHeight,
        inView: r.bottom <= innerHeight + 1 && r.top >= -1,
      });
    }
  }
  return { vw: innerWidth, vh: innerHeight,
    doc: { scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight,
           bodyOverflowY: getComputedStyle(document.body).overflowY },
    blocks };
})()`;

async function main() {
  const bws = await openWs((await (await fetch(CDP + '/json/version')).json()).webSocketDebuggerUrl);
  const conn = new Conn(bws);
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => conn.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html?d=${Date.now()}` });
  await sleep(2200);
  const r = await S('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  const d = r.result.value;
  console.log(`视口 ${d.vw}x${d.vh}`);
  console.log(`doc scrollH=${d.doc.scrollH} clientH=${d.doc.clientH} bodyOverflowY=${d.doc.bodyOverflowY}`);
  for (const b of d.blocks) {
    const inView = b.inView ? '' : '  ← 超界';
    const scrollNote = b.scrollH > b.clientH + 1 ? ` [可滚 ${b.clientH}→${b.scrollH}]` : '';
    console.log(`${b.name.padEnd(20)} top=${String(b.top).padStart(4)} bottom=${String(b.bottom).padStart(4)} h=${String(b.h).padStart(4)} ${b.display}${inView}${scrollNote}`);
    if (b.maxH !== 'none') console.log(`   maxH=${b.maxH} hProp=${b.hProp} flex=${b.flex}`);
  }
  await conn.send('Target.closeTarget', { targetId }); bws.close();
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });