#!/usr/bin/env node
/**
 * tools/probe-resume-bar.mjs — 验证「继续播放」引导条真的能渲染出来
 *
 * 为什么单独写：
 *   _showResumeBar() 定义在 app.js 的 IIFE 内部，从外部调不到。
 *   而这条引导是这轮唯一新增的**可见**元素，光读代码不算验过。
 *
 * 做法：用 CDP 直接在页面里注入与 _showResumeBar() 完全相同的 DOM 结构
 *   （同样的 class、同样的文本、同样的父容器 #toastContainer），
 *   然后量尺寸 + 截图。CSS 和布局是真跑出来的，不是脑补。
 *
 * 只能证明「样式与布局可用」；「什么时候会出现」由代码路径保证
 *   （_doPlay 的 NotAllowedError 分支 → _armAutoplayRetry → _showResumeBar）。
 *
 * 用法：node tools/probe-resume-bar.mjs
 * 前置：Chrome --remote-debugging-port=9222；静态服务 node pv/serve.mjs 8778
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8778;

async function wsUrl() {
  const r = await fetch(CDP + '/json/version');
  const j = await r.json();
  return j.webSocketDebuggerUrl;
}

/** 极简 CDP 客户端（Node 22 自带 WebSocket）。 */
function client(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { send };
}

/** 注入的结构必须与 app.js::_showResumeBar() 一模一样。 */
const INJECT = `
(function () {
    var host = document.getElementById('resumeHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'resumeHost';
    document.body.appendChild(host);
  }
  var bar = document.createElement('div');
  bar.className = 'resume-bar';
  bar.id = '__probeResumeBar';
  bar.setAttribute('role', 'status');
  var label = document.createElement('span');
  label.className = 'resume-bar-text';
  label.textContent = '浏览器拦住了自动播放';
  var btn = document.createElement('button');
  btn.className = 'resume-bar-btn';
  btn.type = 'button';
  btn.textContent = '继续播放';
  bar.appendChild(label);
  bar.appendChild(btn);
  host.appendChild(bar);
  return true;
})();
`;

const MEASURE = `
(function () {
  var bar = document.getElementById('__probeResumeBar');
  if (!bar) return { found: false };
  var r = bar.getBoundingClientRect();
  var btn = bar.querySelector('.resume-bar-btn');
  var br = btn ? btn.getBoundingClientRect() : null;
  var cs = getComputedStyle(bar);
  var bs = btn ? getComputedStyle(btn) : null;
  return {
    found: true,
    bar: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) },
    btn: br ? { w: Math.round(br.width), h: Math.round(br.height) } : null,
    borderColor: cs.borderColor,
    display: cs.display,
    btnBg: bs ? bs.backgroundColor : null,
    // 关键：按钮必须可点（不被 toast 容器的 pointer-events:none 拦住）
    btnPointerEvents: bs ? bs.pointerEvents : null,
    barPointerEvents: cs.pointerEvents,
    // 命中测试：这个点上最上层是不是按钮
    hitIsButton: (function () {
      if (!br) return false;
      var el = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      return !!(el && el.classList && el.classList.contains('resume-bar-btn'));
    })(),
    // 视口内可见（没有被挤出屏幕）
    inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
  };
})();
`;

const main = async () => {
  const url = await wsUrl();
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const c = client(ws);

  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });

  // 转发到 session
  let sid = 0;
  const sp = new Map();
  ws.addEventListener('message', (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id && sp.has(msg.id)) {
      const { resolve, reject } = sp.get(msg.id); sp.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    }
  });
  const ssend = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++sid; sp.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, sessionId, method, params }));
  });

  await ssend('Page.enable');
  await ssend('Runtime.enable');
  await ssend('Emulation.setDeviceMetricsOverride', {
    width: 420, height: 700, deviceScaleFactor: 1, mobile: false,
  });
  await ssend('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
  await new Promise((r) => setTimeout(r, 2500));

  await ssend('Runtime.evaluate', { expression: INJECT, returnByValue: true });
  await new Promise((r) => setTimeout(r, 350));   // 等入场动画跑完再量

  const measured = await ssend('Runtime.evaluate', {
    expression: MEASURE, returnByValue: true, awaitPromise: false,
  });
  const m = measured.result?.value || { found: false };

  const shot = await ssend('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `resume-bar-${Date.now()}.png`);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));

  await c.send('Target.closeTarget', { targetId });
  ws.close();

  const problems = [];
  if (!m.found) problems.push('引导条没有出现在 DOM 里');
  else {
    if (!m.inViewport) problems.push(`引导条超出视口（top=${m.bar.top}）`);
    if (m.bar.h < 28) problems.push(`高度过小（${m.bar.h}px），按钮难点`);
    if (m.btn && m.btn.h < 22) problems.push(`按钮高度过小（${m.btn.h}px）`);
    if (m.btnPointerEvents === 'none') problems.push('按钮被 pointer-events:none 拦住，点不动');
    if (!m.hitIsButton) problems.push('按钮中心点的命中最上层不是按钮（可能被遮挡）');
  }

  console.log(JSON.stringify({
    measured: m, shot: file,
    verdict: problems.length ? 'FAIL' : 'PASS',
    problems,
  }, null, 2));

  process.exit(problems.length ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
