#!/usr/bin/env node
// shot.mjs — 真渲染截图 + 断言（CDP 直连，无第三方依赖）
//
// 为什么存在：2026-10-21 那一整天，横条改动反复「改了没变」，
// 每一次都是靠人截图回传才发现。根因不是代码难，是没有测量仪器。
// 这个脚本补的就是那台仪器：自己开页面、自己量、自己截图。
//
// 用法：
//   node tools/shot.mjs                          # 默认 1040x780，截图到 临时/shots/
//   node tools/shot.mjs --w 1040 --h 60          # 横条形态
//   node tools/shot.mjs --w 420 --h 780          # 竖卡形态
//   node tools/shot.mjs --w 1040 --h 60 --probe "stripTitle"  # 顺便取 DOM 值
//
// 前置：Chrome 带 --remote-debugging-port=9222 在跑（headless 即可）。
//       静态服务器：node pv/serve.mjs 8778

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', '..', 'shots');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const W = Number(arg('w', 1040));
const H = Number(arg('h', 780));
const PORT = Number(arg('port', 8778));
const PAGE = arg('page', 'ui/standalone.html');
const PROBES = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--probe') PROBES.push(process.argv[i + 1]);
}

const CDP = 'http://127.0.0.1:9222';

async function wsUrl() {
  const r = await fetch(CDP + '/json/version');
  const j = await r.json();
  return j.webSocketDebuggerUrl;
}

class Conn {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(new Error('ws error')));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browserWs = await openWs(await wsUrl());
  const conn = new Conn(browserWs);

  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => conn.send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 2, mobile: false,
  });

  const url = `http://127.0.0.1:${PORT}/${PAGE}?shot=${Date.now()}`;
  await S('Page.navigate', { url });
  await sleep(2500); // 让 app.js 的异步 boot / 取色器跑完

  // 收集控制台错误——这一条就能抓住「整个 IIFE 崩掉」那类伤
  const errs = [];
  conn.ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errs.push(d.exception?.description || d.text);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  await sleep(300);

  const shots = [];
  mkdirSync(OUT, { recursive: true });
  const png = await S('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `shot-${W}x${H}-${Date.now()}.png`);
  writeFileSync(file, Buffer.from(png.data, 'base64'));
  shots.push(file);

  // 探针：取 DOM 真实值（不是猜）
  const probes = {};
  for (const id of PROBES) {
    const r = await S('Runtime.evaluate', {
      expression: `(() => {
        const el = document.getElementById(${JSON.stringify(id)});
        if (!el) return { missing: true };
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').trim().slice(0, 40),
          display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
          color: cs.color, background: cs.backgroundColor,
          w: Math.round(rect.width), h: Math.round(rect.height),
          x: Math.round(rect.x), y: Math.round(rect.y),
        };
      })()`,
      returnByValue: true,
    });
    probes[id] = r.result.value;
  }

  // 几何体检：溢出、越界、互相遮挡
  // 分两类：
  //   裁切伤（content）——内容元素超出视口，是真的看不全，exit 1
  //   设计性外溢（decor）——光效/星光图层故意从条外伸进来，不算伤
  const geom = await S('Runtime.evaluate', {
    expression: `(() => {
      const vw = innerWidth, vh = innerHeight;
      const DECOR = /strip-front-glow|strip-front-band|strip-flight|strip-spark|strip-field/;
      const content = [], decor = [];
      document.querySelectorAll('#playerStrip *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const isDecor = DECOR.test(el.id || '') || DECOR.test(String(el.className || ''));
        const bad = r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1;
        if (!bad) return;
        const rec = {
          id: el.id || String(el.className).slice(0, 30),
          left: Math.round(r.left), right: Math.round(r.right),
          top: Math.round(r.top), bottom: Math.round(r.bottom),
        };
        (isDecor ? decor : content).push(rec);
      });
      return {
        vw, vh,
        contentOverflow: content.slice(0, 12),
        contentOverflowCount: content.length,
        decorOverflowCount: decor.length,
      };
    })()`,
    returnByValue: true,
  });

  await conn.send('Target.closeTarget', { targetId });
  browserWs.close();

  const g = geom.result.value;
  const report = {
    page: PAGE, size: `${W}x${H}`, shot: file,
    consoleErrors: errs.slice(0, 8),
    probes, geometry: g,
    verdict: errs.length > 0
      ? 'FAIL: 控制台有错误'
      : g.contentOverflowCount > 0
        ? 'FAIL: 内容被裁切'
        : 'PASS',
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(errs.length > 0 || g.contentOverflowCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(2);
});
