// probe-pr-scroll.mjs —— 640×560 下 player-right 到底能不能滚
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDP = 'http://127.0.0.1:9222';
const W = process.argv.includes('--w') ? Number(process.argv[process.argv.indexOf('--w')+1]) : 640;
const H = process.argv.includes('--h') ? Number(process.argv[process.argv.indexOf('--h')+1]) : 560;

class Conn {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m.result); this.pending.delete(m.id); } }); }
  send(method, params = {}, sid) { const id = ++this.id; const pl = { id, method, params };
    if (sid) pl.sessionId = sid; this.ws.send(JSON.stringify(pl));
    return new Promise(res => this.pending.set(id, res)); }
}
const openWs = u => new Promise((res, rej) => { const ws = new WebSocket(u);
  ws.addEventListener('open', () => res(ws)); ws.addEventListener('error', rej); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const bws = await openWs((await (await fetch(CDP + '/json/version')).json()).webSocketDebuggerUrl);
  const conn = new Conn(bws);
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => conn.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:8778/ui/standalone.html?pr=${Date.now()}` });
  await sleep(2200);

  const r = await S('Runtime.evaluate', { expression: `(() => {
    const q = s => document.querySelector(s);
    const pr = q('.player-right'), tc = q('.tab-content'), pc = q('.player-container');
    return {
      playerRight: { clientH: pr.clientHeight, scrollH: pr.scrollHeight, overflowY: getComputedStyle(pr).overflowY },
      tabContent: { clientH: tc.clientHeight, scrollH: tc.scrollHeight, overflowY: getComputedStyle(tc).overflowY },
      pcClientH: pc.clientHeight, pcScrollH: pc.scrollHeight,
    };
  })()`, returnByValue: true });

  // 尝试在 player-right 内滚动，看能否到达底部内容
  await S('Runtime.evaluate', { expression: `(() => {
    const pr = document.querySelector('.player-right');
    pr.scrollTop = 99999;
    document.querySelectorAll('.player-right *').forEach(e => e.scrollTop = 99999);
    return true;
  })()` });
  await sleep(200);
  const after = await S('Runtime.evaluate', { expression: `(() => {
    const pr = document.querySelector('.player-right');
    const lastItem = pr.querySelector('.pl-item:last-child') || pr.querySelector('.pl-group-header.collapsed:last-child');
    const r = lastItem ? lastItem.getBoundingClientRect() : null;
    return {
      scrollTop: pr.scrollTop, scrollH: pr.scrollHeight, clientH: pr.clientHeight,
      lastItemBottom: r ? Math.round(r.bottom) : null, viewportH: innerHeight,
      reached: r ? r.bottom <= innerHeight + 4 : false,
    };
  })()`, returnByValue: true });

  console.log('=== 滚动前 ==='); console.log(JSON.stringify(r.result.value, null, 2));
  console.log('=== 滚动后 ==='); console.log(JSON.stringify(after.result.value, null, 2));

  await conn.send('Target.closeTarget', { targetId }); bws.close();
}
main().catch(e => { console.error('FAIL:', e.message); process.exit(2); });