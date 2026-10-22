#!/usr/bin/env node
/**
 * tools/probe-np-children.mjs — 量 .now-playing-section 的每个子元素
 *
 * 用途：np-info 宽度塌成 0 时，找出**谁把宽度吃掉了**。
 *   逐个子元素量 w / flex / order / width，比肉眼看 CSS 靠谱。
 *
 * 用法：node tools/probe-np-children.mjs --w 420 --h 700
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CDP = 'http://127.0.0.1:9222';
const PORT = Number(process.env.PROBE_PORT || 8778);

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const W = Number(arg('w', 420));
const H = Number(arg('h', 700));
const PAGE = arg('page', 'ui/standalone.html');

const MEASURE = `
(function () {
  var sec = document.querySelector('.now-playing-section');
  if (!sec) return { error: 'no .now-playing-section' };
  var cs = getComputedStyle(sec);
  var sr = sec.getBoundingClientRect();

  var kids = [];
  for (var i = 0; i < sec.children.length; i++) {
    var el = sec.children[i];
    var r = el.getBoundingClientRect();
    var s = getComputedStyle(el);
    kids.push({
      i: i,
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      flex: s.flex,
      width: s.width,
      minWidth: s.minWidth,
      maxWidth: s.maxWidth,
      order: s.order,
      alignSelf: s.alignSelf,
      display: s.display,
      position: s.position,
    });
  }

  return {
    parent: {
      w: Math.round(sr.width), h: Math.round(sr.height),
      display: cs.display, flexDirection: cs.flexDirection,
      flexWrap: cs.flexWrap, alignItems: cs.alignItems, gap: cs.gap,
    },
    children: kids,
    // 谁最宽 —— 通常就是吃掉空间的元凶
    widest: kids.slice().sort(function (a, b) { return b.w - a.w; })[0] || null,
    collapsed: kids.filter(function (k) { return k.w === 0; }).map(function (k) { return k.cls || k.tag; }),
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
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/${PAGE}` });
  await new Promise((x) => setTimeout(x, 2600));

  const out = (await S('Runtime.evaluate', { expression: MEASURE, returnByValue: true })).result?.value;
  await send('Target.closeTarget', { targetId });
  ws.close();

  console.log(JSON.stringify({ size: `${W}x${H}`, ...out }, null, 2));
};

main().catch((e) => { console.error(e); process.exit(1); });
