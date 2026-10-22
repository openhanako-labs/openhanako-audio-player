#!/usr/bin/env node
/**
 * tools/probe-width-chain.mjs — 沿 DOM 链量宽度，找「塌到 0」的那一级
 *
 * 用途：某个元素被挤成竖排时，问题往往不在它自己，而在某一级父元素
 *   宽度变成了 0。逐级量出来，才知道该修哪一层。
 *
 * 用法：node tools/probe-width-chain.mjs --sel "#trackMode" --w 420 --h 700
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CDP = 'http://127.0.0.1:9222';
const PORT = 8778;

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SEL = arg('sel', '#trackMode');
const W = Number(arg('w', 420));
const H = Number(arg('h', 700));

const MEASURE = `
(function () {
  var el = document.querySelector(${JSON.stringify(SEL)});
  if (!el) return { error: 'not found: ' + ${JSON.stringify(SEL)} };
  var chain = [];
  var cur = el;
  while (cur && cur !== document.documentElement.parentNode) {
    var r = cur.getBoundingClientRect();
    var cs = getComputedStyle(cur);
    chain.push({
      tag: cur.tagName.toLowerCase(),
      id: cur.id || '',
      cls: (typeof cur.className === 'string' ? cur.className : '').slice(0, 60),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      display: cs.display,
      flexDirection: cs.flexDirection,
      flex: cs.flex,
      minWidth: cs.minWidth,
      width: cs.width,
      alignSelf: cs.alignSelf,
      alignItems: cs.alignItems,
    });
    if (cur === document.body) break;
    cur = cur.parentElement;
  }
  return {
    chain: chain,
    bodyClass: document.body.className,
    layoutAttr: (document.querySelector('.player-container') || {}).getAttribute
      ? (document.querySelector('.player-container') || {}).getAttribute('data-layout') : null,
    // 找出哪一级宽度为 0 —— 那就是塌陷点
    firstZero: (function () {
      for (var i = 0; i < chain.length; i++) if (chain[i].w === 0) return i;
      return -1;
    })(),
  };
})();
`;

const main = async () => {
  const r = await fetch(CDP + '/json/version');
  const ws = new WebSocket((await r.json()).webSocketDebuggerUrl);
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
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
  await new Promise((x) => setTimeout(x, 2600));

  const out = (await S('Runtime.evaluate', { expression: MEASURE, returnByValue: true })).result?.value;
  await send('Target.closeTarget', { targetId });
  ws.close();

  console.log(JSON.stringify(out, null, 2));
};

main().catch((e) => { console.error(e); process.exit(1); });
