#!/usr/bin/env node
/**
 * tools/probe-np-mode.mjs — 量「准备就绪」那行的实际排版
 *
 * 背景：420x700 的截图里，trackMode（"准备就绪"）竖着排成一列。
 * 先要分清是**我这次改动引发的**，还是**本来就存在**。
 * 做法：比 HEAD 与工作区两份 standalone.html 的同一处几何。
 *
 * 用法：node tools/probe-np-mode.mjs [--page ui/standalone.html]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '..', 'shots');
const CDP = 'http://127.0.0.1:9222';
const PORT = 8778;

const args = process.argv.slice(2);
const pageArg = (() => {
  const i = args.indexOf('--page');
  return i >= 0 && args[i + 1] ? args[i + 1] : 'ui/standalone.html';
})();
const widthArg = (() => { const i = args.indexOf('--w'); return i >= 0 ? Number(args[i + 1]) : 420; })();
const heightArg = (() => { const i = args.indexOf('--h'); return i >= 0 ? Number(args[i + 1]) : 700; })();

async function wsUrl() {
  const r = await fetch(CDP + '/json/version');
  return (await r.json()).webSocketDebuggerUrl;
}

const MEASURE = `
(function () {
  function box(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), left: Math.round(r.left),
      writingMode: cs.writingMode,
      whiteSpace: cs.whiteSpace,
      wordBreak: cs.wordBreak,
      overflowWrap: cs.overflowWrap,
      fontSize: cs.fontSize,
      text: (el.textContent || '').slice(0, 24),
      // 一行还是多行：用行盒数（getClientRects）而不是 高/行高 估——
      // 后者对 block 元素会把盒内边距也算进去，少字也算成多行。
      lineHeight: cs.lineHeight,
      lineBoxes: el.getClientRects().length,
      isVertical: (function () {
        // 竖排的真特征：宽远小于高、且文字长度可见
        var t = (el.textContent || '').trim();
        if (!t) return false;
        return r.width < r.height * 0.6 && r.width < 40 && t.length >= 3;
      })(),
    };
  }
  var mode = document.getElementById('trackMode');
  var name = document.getElementById('trackName');
  var info = document.querySelector('.np-info');
  return {
    trackMode: box(mode),
    trackName: box(name),
    npInfo: info ? (function () {
      var r = info.getBoundingClientRect(), cs = getComputedStyle(info);
      return { w: Math.round(r.width), h: Math.round(r.height), display: cs.display,
               flexDirection: cs.flexDirection, writingMode: cs.writingMode };
    })() : null,
    htmlWritingMode: getComputedStyle(document.documentElement).writingMode,
    bodyWritingMode: getComputedStyle(document.body).writingMode,
  };
})();
`;

const main = async () => {
  const ws = new WebSocket(await wsUrl());
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
  await S('Emulation.setDeviceMetricsOverride', {
    width: widthArg, height: heightArg, deviceScaleFactor: 1, mobile: false,
  });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/${pageArg}` });
  await new Promise((r) => setTimeout(r, 2600));

  const m = (await S('Runtime.evaluate', { expression: MEASURE, returnByValue: true })).result?.value;
  const shot = await S('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `npmode-${widthArg}x${heightArg}-${Date.now()}.png`);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));

  await send('Target.closeTarget', { targetId });
  ws.close();

  const mode = m?.trackMode;
  const problems = [];
  if (!mode) problems.push('trackMode 元素不存在');
  else {
    if (mode.writingMode && mode.writingMode !== 'horizontal-tb')
      problems.push(`writing-mode 不是横排：${mode.writingMode}`);
    if (mode.isVertical)
      problems.push(`「${mode.text}」被挤成竖排（${mode.w}×${mode.h}）`);
    if (mode.w < 12) problems.push(`可用宽度只有 ${mode.w}px，装不下字`);
  }

  console.log(JSON.stringify({ page: pageArg, size: `${widthArg}x${heightArg}`, measured: m, shot: file,
    verdict: problems.length ? 'FAIL' : 'PASS', problems }, null, 2));
  process.exit(problems.length ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
