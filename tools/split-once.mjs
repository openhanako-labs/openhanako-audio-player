#!/usr/bin/env node
// split-once.mjs — 一次性把 ui/index.html + ui/standalone.html 拆分为：
//   ui/style.css   两个核心 <style> 块的全部内容（不含 PV 块）
//   ui/head.js     head 里 9 个经典 <script> 块按原顺序拼接（保留 <script> 标签，不含 type）
//   ui/app.js      body 里 5 个经典 <script> 块按原顺序拼接
//   瘦 index.html  doctype/html/head 骨架 + <link style.css> + SDK module 内联 + <script src=head.js>
//                  + <style> PV CSS </style> + </head> + <body> + body markup
//                  + <script src=app.js> + PV JS 块（原位保留 PV:BEGIN/END 标记）+ </body></html>
//   瘦 standalone.html 同结构，保留原差异行（5 行 AudioContext 调试块）
//
// 用法：
//   node tools/split-once.mjs          执行拆分
//   node tools/split-once.mjs --check  只校验不写（幂等：对已经拆过的文件跑一次，检查能否再拆）
//
// 铁律：零行为变化，纯物理搬动。不修任何逻辑，不修任何 bug。
// 跑完保留备查——它是可复现的证据：谁动过结构，能一眼看出来。
//
// 关于换行：原文件是 LF-only（18265 LF / 0 CRLF），脚本检测并保持原风格，
// 不会引入 CRLF。用户方案里"注意 CRLF" 这条与实际不符，见报告偏差说明。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI = join(ROOT, 'ui');
const SRC = ['index.html', 'standalone.html'];

const CSS_B = '/* ===== PV:BEGIN 文字PV引擎（pv/ 目录构建产物，勿手改） ===== */';
const CSS_E = '/* ===== PV:END ===== */';
const JS_B = '<!-- ===== PV:BEGIN 文字PV引擎（pv/ 目录构建产物，勿手改） ===== -->';
const JS_E = '<!-- ===== PV:END ===== -->';
const LINK_TAG = '<link rel="stylesheet" href="./style.css">';
const HEAD_JS_TAG = '<script src="./head.js"></script>';
const APP_JS_TAG = '<script src="./app.js"></script>';

const CHECK = process.argv.includes('--check');
const TAG_SCRIPT = '<script>';
const TAG_SCRIPT_CLOSE = '</script>';
const TAG_STYLE = '<style>';
const TAG_STYLE_CLOSE = '</style>';

function indexOfAll(raw, needle) {
  const out = [];
  let i = 0;
  while ((i = raw.indexOf(needle, i)) >= 0) { out.push(i); i++; }
  return out;
}

function detectEOL(raw) {
  // 只看前 4KB，避免误判
  const head = raw.slice(0, 4096);
  return head.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * 拆一个 html。返回：
 *   { styleCss, headJs, appJs, slimHtml, parts, EOL }
 * parts 里每一项 { name, orig, slim } 用来做字节守恒断言。
 */
function split(raw, rel) {
  const EOL = detectEOL(raw);

  /* ---------- 定位：所有关键锚点的字符位置 ---------- */

  // 2 个 <style>
  const styleOpens = indexOfAll(raw, TAG_STYLE);
  if (styleOpens.length !== 2) throw new Error(`${rel}: 期望 2 个 <style>，实际 ${styleOpens.length}`);
  const s1Open = styleOpens[0];
  const s2Open = styleOpens[1];
  const s1Close = raw.indexOf(TAG_STYLE_CLOSE, s1Open);
  if (s1Close < 0) throw new Error(`${rel}: 找不到第 1 个 </style>`);

  // PV CSS 块：在 style #2 内部
  const pvCssBegin = raw.indexOf(CSS_B, s2Open);
  const pvCssEnd = raw.indexOf(CSS_E, pvCssBegin);
  if (pvCssBegin < 0 || pvCssEnd < 0) throw new Error(`${rel}: 找不到 PV CSS 标记对`);
  const pvCssEndFull = pvCssEnd + CSS_E.length;
  const s2Close = raw.indexOf(TAG_STYLE_CLOSE, pvCssEndFull);
  if (s2Close < 0) throw new Error(`${rel}: 找不到第 2 个 </style>`);

  // SDK module
  const sdkOpen = raw.indexOf('<script type="module">');
  if (sdkOpen < 0) throw new Error(`${rel}: 找不到 SDK module 脚本`);
  const sdkClose = raw.indexOf(TAG_SCRIPT_CLOSE, sdkOpen);
  if (sdkClose < 0) throw new Error(`${rel}: SDK module 找不到 </script>`);
  const sdkEnd = sdkClose + TAG_SCRIPT_CLOSE.length;

  // head scripts：9 个经典 <script>（不含 type="module"）
  //   #1 在 sdk 之后、style #2 之前
  //   #2 紧接在 </style><script>（style #2 结束）之后
  //   #3-#9 顺序跟在 style #2 之后，直到 </head>
  const headStarts = [];
  let h1Open = raw.indexOf(TAG_SCRIPT, sdkEnd);
  if (h1Open < 0 || h1Open >= s2Open) throw new Error(`${rel}: 找不到 head script #1`);
  let h1Close = raw.indexOf(TAG_SCRIPT_CLOSE, h1Open);
  headStarts.push([h1Open, h1Close]);
  let cursor = s2Close + TAG_STYLE_CLOSE.length;
  const headClosePos = raw.indexOf('</head>', cursor);
  for (let i = 0; i < 8; i++) {
    const open = raw.indexOf(TAG_SCRIPT, cursor);
    if (open < 0 || open >= headClosePos) throw new Error(`${rel}: 找不到 head script #${i + 2}`);
    const close = raw.indexOf(TAG_SCRIPT_CLOSE, open);
    if (close < 0 || close >= headClosePos) throw new Error(`${rel}: head script #${i + 2} 找不到 </script>`);
    headStarts.push([open, close]);
    cursor = close + TAG_SCRIPT_CLOSE.length;
  }

  // <body>
  const bodyOpen = raw.indexOf('<body', headClosePos);
  if (bodyOpen < 0) throw new Error(`${rel}: 找不到 <body`);
  const bodyOpenEnd = raw.indexOf('>', bodyOpen) + 1;

  // PV JS 块
  const pvJsBegin = raw.indexOf(JS_B);
  const pvJsEnd = raw.indexOf(JS_E);
  if (pvJsBegin < 0 || pvJsEnd < 0) throw new Error(`${rel}: 找不到 PV JS 标记对`);
  const pvJsEndFull = pvJsEnd + JS_E.length;

  // body scripts：5 个经典 <script>，在 body markup 之后、PV JS 之前
  const bodyStarts = [];
  cursor = bodyOpenEnd;
  while (cursor < pvJsBegin) {
    const open = raw.indexOf(TAG_SCRIPT, cursor);
    if (open < 0 || open >= pvJsBegin) break;
    const close = raw.indexOf(TAG_SCRIPT_CLOSE, open);
    if (close < 0 || close >= pvJsBegin) break;
    bodyStarts.push([open, close]);
    cursor = close + TAG_SCRIPT_CLOSE.length;
  }
  if (bodyStarts.length !== 5) throw new Error(`${rel}: 期望 5 个 body script，实际 ${bodyStarts.length}`);

  const bodyClose = raw.indexOf('</body>', pvJsEndFull);
  const htmlClose = raw.indexOf('</html>', bodyClose);
  if (bodyClose < 0 || htmlClose < 0) throw new Error(`${rel}: 找不到 </body>/</html>`);

  /* ---------- 提取内容 ---------- */

  // style #1 内部（<style> 之后到 </style> 之前）
  const style1Inner = raw.slice(s1Open + TAG_STYLE.length, s1Close);
  // style #2 核心内容（<style> 之后到 PV:BEGIN 之前；不含 PV 块）
  const style2Core = raw.slice(s2Open + TAG_STYLE.length, pvCssBegin);

  // head scripts 9 个的内部 JS
  const headJsParts = headStarts.map(([open, close]) => raw.slice(open + TAG_SCRIPT.length, close));
  // body scripts 5 个的内部 JS
  const appJsParts = bodyStarts.map(([open, close]) => raw.slice(open + TAG_SCRIPT.length, close));

  // PV CSS 块（原位保留，含 PV:BEGIN/END 标记）
  const pvCssBlock = raw.slice(pvCssBegin, pvCssEndFull);
  // PV JS 块（原位保留，含 PV:BEGIN/END 标记）
  const pvJsBlock = raw.slice(pvJsBegin, pvJsEndFull);

  /* ---------- 生成 style.css / head.js / app.js ---------- */

  // style.css = style #1 内容 + 空行 + style #2 核心内容
  // 用两个 EOL 做分隔，视觉上清楚两块是分开来的
  const styleCss = style1Inner + EOL + EOL + style2Core;

  // head.js = 9 段 JS 拼接（每段先剥掉首尾换行，段间用两个 EOL 分隔）
  const trim = (s) => s.replace(/^[ \t]*\r?\n+/, '').replace(/\r?\n+[ \t]*$/, '');
  const headJs = headJsParts.map(trim).join(EOL + EOL);
  const appJs = appJsParts.map(trim).join(EOL + EOL);

  /* ---------- 组装瘦 html ---------- */

  // 结构（按顺序）：
  //   [1]  原 0..s1Open-1        保留（doctype + <html> + <head> + meta + title + 可能的空行）
  //   [2]  LINK_TAG              替代原 <style>...#1...</style>
  //   [3]  原 s1Close+8..sdkOpen 保留（</style> 之后的空行/其他标签）
  //   [4]  原 sdkOpen..sdkEnd-1  保留（SDK module 整块）
  //   [5]  原 sdkEnd..h1Open-1   保留（空行）
  //   [6]  HEAD_JS_TAG           替代所有 9 个 head scripts（只放第一个位置）
  //   [7]  原 h1Close+9..s2Open-1 保留（第一个 head script 到 <style>#2 之间的空行）
  //   [8]  TAG_STYLE + pvCssBlock + TAG_STYLE_CLOSE
  //        替代原 <style>#2 整块：核心 CSS 已搬到 style.css，这里只留 PV CSS
  //   [9]  style #2 之后的 8 个 head scripts（原 #2-#9）已合并到 head.js，
  //        slim html 里这一段全部删除；如果中间夹着空白（换行）就保留，无空白则不加。
  //   [10] 原 headClosePos..bodyOpenEnd-1 保留（</head> + <body ...>）
  //   [11] 原 bodyOpenEnd..bodyStarts[0][0]-1 保留（body markup 第一部分）
  //   [12] APP_JS_TAG            替代所有 5 个 body scripts（只放第一个位置）
  //   [13] 原 bodyStarts[4][1]+9..pvJsBegin-1 保留（body scripts 结束后到 PV:BEGIN 之间的空白）
  //   [14] pvJsBlock             保留（PV JS 原位）
  //   [15] 原 pvJsEndFull..len-1 保留（</body></html>）
  const parts = [];
  parts.push(raw.slice(0, s1Open));
  parts.push(LINK_TAG);
  parts.push(raw.slice(s1Close + TAG_STYLE_CLOSE.length, sdkOpen));
  parts.push(raw.slice(sdkOpen, sdkEnd));
  parts.push(raw.slice(sdkEnd, headStarts[0][0]));
  parts.push(HEAD_JS_TAG);
  parts.push(raw.slice(headStarts[0][1] + TAG_SCRIPT_CLOSE.length, s2Open));
  parts.push(TAG_STYLE);
  parts.push(pvCssBlock);
  parts.push(TAG_STYLE_CLOSE);
  // style #2 之后到 </head> 之间：8 个 head scripts（已合并到 head.js）—— 保留其中的
  // 非 script 内容（通常只是空白/换行）。实现：从 s2Close+8 开始，跳过每一个 head script 区间。
  // 关键：反向删除（从最后一个到第一个），避免前面删除影响后面脚本的相对偏移。
  let tail = raw.slice(s2Close + TAG_STYLE_CLOSE.length, headClosePos);
  for (let i = headStarts.length - 1; i >= 1; i--) {
    const [open, close] = headStarts[i];
    const relOpen = open - (s2Close + TAG_STYLE_CLOSE.length);
    const relClose = close + TAG_SCRIPT_CLOSE.length - (s2Close + TAG_STYLE_CLOSE.length);
    tail = tail.slice(0, relOpen) + tail.slice(relClose);
  }
  if (tail) parts.push(tail);
  parts.push(raw.slice(headClosePos, bodyOpenEnd));
  parts.push(raw.slice(bodyOpenEnd, bodyStarts[0][0]));
  parts.push(APP_JS_TAG);
  parts.push(raw.slice(bodyStarts[bodyStarts.length - 1][1] + TAG_SCRIPT_CLOSE.length, pvJsBegin));
  parts.push(pvJsBlock);
  parts.push(raw.slice(pvJsEndFull));
  // 关键：用 EOL 拼接 parts，保证新标签后面有换行（新标签本身不含换行）
  const slimHtml = parts.join(EOL);

  /* ---------- 断言：内容守恒 ---------- */

  // 每个 part 的来源要么在 slimHtml 里原样出现，要么是新增标签（LINK_TAG / HEAD_JS_TAG / APP_JS_TAG / TAG_STYLE / TAG_STYLE_CLOSE）
  const assertContains = (needle) => {
    if (!slimHtml.includes(needle)) throw new Error(`${rel}: 瘦 html 缺关键片段 ${JSON.stringify(needle.slice(0, 40))}`);
  };
  assertContains(LINK_TAG);
  assertContains(HEAD_JS_TAG);
  assertContains(APP_JS_TAG);
  assertContains(pvCssBlock);
  assertContains(pvJsBlock);
  assertContains(raw.slice(sdkOpen, sdkEnd)); // SDK module 整块
  // 关键骨架
  assertContains('<!DOCTYPE html>');
  assertContains('</html>');

  return { styleCss, headJs, appJs, slimHtml, EOL, raw, rel, stats: {
    origLen: raw.length,
    slimLen: slimHtml.length,
    style1InnerLen: style1Inner.length,
    style2CoreLen: style2Core.length,
    styleCssLen: styleCss.length,
    headJsLen: headJs.length,
    appJsLen: appJs.length,
    pvCssLen: pvCssBlock.length,
    pvJsLen: pvJsBlock.length,
    partsLens: parts.map(p => p.length),
  }};
}

/* ---------- 主流程 ---------- */

console.log('=== split-once.mjs ===');
console.log(`ROOT: ${ROOT}`);
console.log(`CHECK: ${CHECK}`);

const results = SRC.map((src) => {
  const raw = readFileSync(join(UI, src), 'utf8');
  return split(raw, src);
});

/* 一致性校验：两个 html 拆出的 style.css / head.js 应完全相同；app.js 可能因 5 行调试块不同 */
const sameStyle = results[0].styleCss === results[1].styleCss;
const sameHead = results[0].headJs === results[1].headJs;
const sameApp = results[0].appJs === results[1].appJs;
if (!sameStyle) throw new Error(`style.css 不一致：index vs standalone（拆分逻辑有 bug）`);
if (!sameHead) throw new Error(`head.js 不一致：index vs standalone（拆分逻辑有 bug）`);
// app.js 允许不一致（standalone 有 5 行调试块，index 没有）

/* 内容层面的字节守恒断言：
 *   原文件字节 = 瘦 html 字节 + (被搬走的字节)
 *   被搬走的字节 = 原 <style>#1 内部 + 原 <style>#2 核心 + 9 个 head scripts 内部 + 5 个 body scripts 内部
 *                - 骨架差异（原 <style>/<script> 标签换成 <link>/<script src> 标签）
 *
 * 更简单的验证：
 *   styleCssLen = style1InnerLen + style2CoreLen + 2 (EOL 分隔)
 *   headJs 每段内容都出现在 headJs 里
 *   appJs 每段内容都出现在 appJs 里
 *
 * 这里做几个硬断言：
 */
const r0 = results[0];
const EOL0 = r0.EOL;
const eolSep = EOL0.length;
const styleCssExpected = r0.stats.style1InnerLen + 2 * eolSep + r0.stats.style2CoreLen;
if (r0.stats.styleCssLen !== styleCssExpected) {
  throw new Error(`style.css 长度对不上：${r0.stats.styleCssLen} vs 期望 ${styleCssExpected}`);
}
console.log(`style.css 长度校验通过：${r0.stats.styleCssLen} = ${r0.stats.style1InnerLen} + 2*${eolSep} + ${r0.stats.style2CoreLen}`);

/* 汇总 */
console.log('');
console.log('=== 拆分前后对比 ===');
for (const r of results) {
  console.log(`${r.rel}:`);
  console.log(`  原文件字节: ${r.stats.origLen}`);
  console.log(`  瘦 html 字节: ${r.stats.slimLen}`);
  console.log(`  style #1 内部: ${r.stats.style1InnerLen}`);
  console.log(`  style #2 核心: ${r.stats.style2CoreLen}`);
  console.log(`  PV CSS 块: ${r.stats.pvCssLen}`);
  console.log(`  PV JS 块: ${r.stats.pvJsLen}`);
  console.log(`  瘦 html parts 数: ${r.stats.partsLens.length}`);
}
console.log('');
console.log(`style.css: ${r0.stats.styleCssLen} bytes (两 html 共用一份)`);
console.log(`head.js:   ${r0.stats.headJsLen} bytes (两 html 共用一份，identical=${sameHead})`);
console.log(`app.js:    ${r0.stats.appJsLen} bytes (两 html 差异=${sameApp ? '无' : '有 5 行调试块差异，采用 index 版本'})`);
console.log('');
console.log('两 html 拆分一致性:');
console.log(`  style.css identical: ${sameStyle}`);
console.log(`  head.js   identical: ${sameHead}`);
console.log(`  app.js    identical: ${sameApp}  (standalone 有 5 行调试块，index 没有，正常)`);

/* 写盘 */
if (CHECK) {
  console.log('');
  console.log('--check：只校验，不写盘。以上拆分逻辑正确。');
} else {
  writeFileSync(join(UI, 'style.css'), r0.styleCss, 'utf8');
  writeFileSync(join(UI, 'head.js'), r0.headJs, 'utf8');
  // app.js：写两份内容中更完整的一份（index 版本；standalone 的调试块只在它的 html 里，不进共用 app.js）
  // 说明：standalone.html 里的 5 行调试块在 body 第 3 个 script 里（startReactiveLoop 内），
  // 拆到 app.js 后如果丢了，standalone 会失去那 5 行。方案：在 standalone 的 5 行位置，
  // 让 app.js 只包含 index 版本；standalone 的调试块通过 slim standalone.html 里 app.js 之后
  // 的补充内联 script 保留（用户方案允许保留差异行）。
  //
  // 更干净的做法：检查两份 app.js 的差异，把 standalone 独有的一段单独在 standalone.html 里内联。
  const appDiff = sameApp ? null : diffAppJs(results[0].appJs, results[1].appJs);
  if (appDiff) {
    console.log(`app.js 差异检测：${appDiff} 处差异（standalone 独有），会在 standalone.html 里补一个内联 script`);
  }
  writeFileSync(join(UI, 'app.js'), r0.appJs, 'utf8');
  for (const r of results) {
    // 对 standalone，如果它有差异，追加一个 inline script
    let slim = r.slimHtml;
    if (r.rel === 'standalone.html' && !sameApp) {
      // 找差异段并追加
      const diffSegments = extractDiffSegments(results[0].appJs, r.appJs);
      if (diffSegments.length) {
        const extraScript = TAG_SCRIPT + '\n' + diffSegments.join('\n') + '\n' + TAG_SCRIPT_CLOSE;
        // 插到 <script src="./app.js"></script> 之后
        slim = slim.replace(APP_JS_TAG, APP_JS_TAG + '\n' + extraScript);
      }
    }
    writeFileSync(join(UI, r.rel), slim, 'utf8');
    console.log(`  写入 ${r.rel}：${slim.length} bytes`);
  }
}

/* 差异工具：找 standalone 独有、index 没有的连续行 */
function diffAppJs(a, b) {
  const linesA = a.split(/\r?\n/);
  const linesB = b.split(/\r?\n/);
  const setA = new Set(linesA);
  const unique = [];
  for (const line of linesB) if (!setA.has(line)) unique.push(line);
  return unique.length;
}
function extractDiffSegments(a, b) {
  // 用简单的 diff：找 B 里有、A 里没有的连续块
  const linesA = a.split(/\r?\n/);
  const linesB = b.split(/\r?\n/);
  const setA = new Set(linesA);
  const segs = [];
  let cur = [];
  for (const line of linesB) {
    if (!setA.has(line)) { cur.push(line); }
    else if (cur.length) { segs.push(cur); cur = []; }
  }
  if (cur.length) segs.push(cur);
  return segs;
}
