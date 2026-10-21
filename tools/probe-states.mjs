#!/usr/bin/env node
// probe-states.mjs — 状态探针：量「静态截图看不到」的交互态
// 用途：一个改动会不会在别的状态下出问题（悬停、聚焦、音量展开、超窄、超高）
// 用法：node tools/probe-states.mjs [--w 1040] [--h 60]

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDP = 'http://127.0.0.1:9222';
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
const W = Number(arg('w', 1040));
const H = Number(arg('h', 60));
const PORT = Number(arg('port', 8778));

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

// 每个状态跑一段脚本，返回该状态下的关键量
const STATES = [
  {
    name: '静置（无交互）',
    script: `(() => {
      const b = document.getElementById('stripBar');
      const v = document.getElementById('stripVolSlider');
      return { barH: Math.round(b.getBoundingClientRect().height),
               volW: Math.round(v.getBoundingClientRect().width),
               volVisible: getComputedStyle(v).visibility };
    })()`,
  },
  {
    name: '悬停条（.active）',
    script: `(() => {
      const s = document.getElementById('playerStrip');
      s.classList.add('active');
      const c = document.getElementById('stripControls');
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      return { controlsOpacity: cs.opacity, controlsVisible: cs.visibility,
               controlsRight: Math.round(r.right), vw: innerWidth,
               overflowRight: Math.round(r.right) - innerWidth };
    })()`,
  },
  {
    name: '音量展开（模拟点喇叭）',
    script: `(() => {
      const v = document.getElementById('stripVolume');
      const s = document.getElementById('stripVolSlider');
      v.classList.add('open');
      const r = s.getBoundingClientRect();
      const strip = document.getElementById('playerStrip');
      const sr = strip.getBoundingClientRect();
      const vw = innerWidth;
      return { sliderW: Math.round(r.width), sliderVisible: getComputedStyle(s).visibility,
               sliderRight: Math.round(r.right), vw,
               sliderPastViewport: Math.round(r.right) - vw,
               stripOverflowStyle: getComputedStyle(strip).overflow };
    })()`,
  },
  {
    name: '聚焦播放键（键盘可达）',
    script: `(() => {
      const p = document.getElementById('stripPlay');
      p.focus();
      const cs = getComputedStyle(p);
      const r = p.getBoundingClientRect();
      return { focusVisible: p.matches(':focus-visible'), outline: cs.outlineStyle,
               w: Math.round(r.width), h: Math.round(r.height),
               activeDescriptor: document.getElementById('playerStrip').className };
    })()`,
  },
];

async function main() {
  const bws = await openWs((await (await fetch(CDP + '/json/version')).json()).webSocketDebuggerUrl);
  const conn = new Conn(bws);
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => conn.send(m, p, sessionId);

  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html?p=${Date.now()}` });
  await sleep(2500);

  // 先在 Canvas 里强制 strip 布局，模拟宿主挂载位
  await S('Runtime.evaluate', { expression: `(() => {
    const pc = document.querySelector('.player-container');
    if (pc) pc.setAttribute('data-layout', 'strip');
    return true;
  })()` });
  await sleep(400);

  const out = { size: `${W}x${H}`, states: [] };
  for (const st of STATES) {
    const r = await S('Runtime.evaluate', { expression: st.script, returnByValue: true });
    out.states.push({ name: st.name, result: r.result.value });
    // 状态之间复位
    await S('Runtime.evaluate', { expression: `(() => {
      const v = document.getElementById('stripVolume'); if (v) v.classList.remove('open');
      const s = document.getElementById('playerStrip'); if (s) s.classList.remove('active');
      document.activeElement && document.activeElement.blur();
      return true; })()` });
    await sleep(120);
  }
  await conn.send('Target.closeTarget', { targetId }); bws.close();
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
