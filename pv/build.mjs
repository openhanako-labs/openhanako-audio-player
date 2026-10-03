// PV 层构建：pv/{css,src} → 注入 ui/index.html + ui/standalone.html
// 用法：
//   node pv/build.mjs          构建并写入
//   node pv/build.mjs --check  只校验不写（CI / 改完自检）
//   node pv/build.mjs --report 附带打印迁移与剥离明细
//   PV_DEBUG=1 node pv/build.mjs   打中间态
//
// 为什么不再是一堆 inject-*.mjs：
// 旧链每个脚本只做一次 replaceOnce，锚点被自己替换后就不能重放，html 漂出脚本范围。
// 这里按固定顺序做幂等流水线：拆旧块 → 剥遗留 → 接核心钩子 → 插新块 → 校验 → 写盘。
// 任何一步不对（标记不是恰好一对、旧锚点没剥干净、核心锚点命中数不对）都直接拒写。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PV = dirname(fileURLToPath(import.meta.url));
const TARGETS = ['ui/index.html', 'ui/standalone.html'];

const CSS_ORDER = ['css/base.css', 'css/layouts.css', 'css/layouts2.css', 'css/chrome.css', 'css/parts.css', 'css/decor.css', 'css/decor2.css', 'css/fonts.css', 'css/bg.css', 'css/bg2.css', 'css/look.css'];
const JS_ORDER = [
  'src/00-engine.js', 'src/01-styles.js', 'src/02-layouts.js',
  'src/03-enter.js', 'src/04-hold.js', 'src/05-exit.js',
  'src/06-camera.js', 'src/07-transition.js', 'src/08-decor.js',
  'src/09-chrome.js', 'src/10-api.js', 'src/11-audio.js',
  'src/13-syntax.js', 'src/12-cuts.js',
  'src/14-decor.js', 'src/15-treat.js', 'src/16-trans.js', 'src/17-faces.js',
  'src/18-audit.js', 'src/19-bg.js', 'src/21-looks.js', 'src/22-layouts2.js',
  'src/23-enter2.js', 'src/24-exit2.js', 'src/25-decor2.js',
  'src/26-treat2.js', 'src/27-bg2.js', 'src/28-cam2.js', 'src/29-trans2.js'
];

const CSS_B = '/* ===== PV:BEGIN 文字PV引擎（pv/ 目录构建产物，勿手改） ===== */';
const CSS_E = '/* ===== PV:END ===== */';
const JS_B = '<!-- ===== PV:BEGIN 文字PV引擎（pv/ 目录构建产物，勿手改） ===== -->';
const JS_E = '<!-- ===== PV:END ===== -->';

/* 遗留识别：旧引擎的类名前缀是 jz-/jizura-，@keyframes 名没有短横（jzWin 等）
 * .jz-gpill 是播放列表的组标签胶囊，跟 PV 无关，必须留下 */
const LEGACY_CSS_PAT = /jz-|jizura|--jz|@keyframes\s+jz/;
const LEGACY_KEEP = ['.jz-gpill'];
const LEGACY_JS_ANCHORS = [
  '/* ===== JIZURA 歌词模式 ===== */',
  '/* ===== JIZURA UI：骰子 + 风格条 ===== */'
];

/* 核心接线锚点：把闭包里的 renderPv/pvSync/_pvIdx/lrcData 暴露给 PV 层 */
const CORE_ANCHOR = 'var _pvLineEls=[];';
const CORE_HOOK = CORE_ANCHOR + '\n  window.__pvCore={render:function(){renderPv()},sync:function(i){pvSync(i)},idx:function(){return _pvIdx},lrc:function(){return lrcData}};';

/* 声明式核心钩子：每条都要求锚点恰好命中一次，幂等可重放。
 * 为什么要入构建：lite 包不带 PV 块，核心必须在 window.PV 不存在时自己降级——
 * 这种判断写在 html 里手改一次就没人能复现，正是刚拆掉的那种补丁链。 */
const AVAIL = 'window.PV&&PV.available';
const HOOKS = [
  {
    id: 'renderPv 分支',
    from: "  function renderPv(){\n    if(document.body.classList.contains('jizura-mode')){",
    to: "  function renderPv(){\n    if(" + AVAIL + "&&document.body.classList.contains('jizura-mode')){"
  },
  {
    id: 'pvSync 分支',
    from: "  function pvSync(idx){\n    if(document.body.classList.contains('jizura-mode')){",
    to: "  function pvSync(idx){\n    if(" + AVAIL + "&&document.body.classList.contains('jizura-mode')){"
  },
  {
    id: '三档循环可降级',
    from: "      }else if(hasLyr && !hasJiz){",
    to: "      }else if(hasLyr && !hasJiz && (" + AVAIL + ")){"
  },
  {
    id: '按钮提示可降级',
    from: "      var hasLyr=document.body.classList.contains('lyrics-mode');\n      var hasJiz=document.body.classList.contains('jizura-mode');\n      if(hasJiz){",
    to: "      var hasLyr=document.body.classList.contains('lyrics-mode');\n      var hasJiz=(" + AVAIL + "&&document.body.classList.contains('jizura-mode'));\n      if(hasJiz){"
  },
  {
    id: '胶囊按可用性出档',
    from: [
      "  [['标准',0],['PV',2],['歌词',1]].forEach(function(it){",
      "  [['标准',0],['PV',2],['歌词',1]].filter(function(it){ return it[1]!==2 || (window.PV&&PV.available); }).forEach(function(it){"
    ],
    /* 胶囊比 PV 块早执行，拿 window.PV 判永远是 false（实测三档被误降成两档）——
     * 所以用构建期就写好的标记：带 PV 块的包有 data-pv="1"，lite 包没这个属性。 */
    to: "  [['标准',0],['PV',2],['歌词',1]].filter(function(it){ return it[1]!==2 || document.documentElement.dataset.pv==='1'; }).forEach(function(it){"
  },
  {
    id: '构建期 PV 标记',
    from: ['<html lang="zh-CN">', '<html lang="zh">'],
    to: '<html lang="zh-CN" data-pv="1">'
  }
];

const ARGS = process.argv.slice(2);
const CHECK = ARGS.includes('--check');
const REPORT = ARGS.includes('--report');
const DBG = !!process.env.PV_DEBUG;

function read(p) { return readFileSync(p, 'utf8'); }
function die(msg) { console.error('✗ ' + msg); process.exit(1); }
function count(hay, needle) { return hay.split(needle).length - 1; }
function allIndex(hay, needle) { const o = []; let i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { o.push(i); i += needle.length; } return o; }

/* ---------- 1. 读 pv 源，拼成唯一一对标记块 ---------- */
const cssParts = CSS_ORDER.map(f => read(join(PV, f)));
const jsParts = JS_ORDER.map(f => read(join(PV, f)));
const CSS_BLOCK = CSS_B + '\n' + cssParts.join('\n') + '\n' + CSS_E;
const JS_BLOCK = JS_B + '\n<script>\n(function(){\n\'use strict\';\n' + jsParts.join('\n') + '\n' + '})();\n</' + 'script>\n' + JS_E;

/* ---------- 2. CSS 顶层规则切分（注释与嵌套块一起吃掉） ---------- */
function splitCss(css) {
  const chunks = [];
  let i = 0, buf = '';
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {                       // 注释
      const e = css.indexOf('*/', i + 2);
      if (e < 0) { buf += css.slice(i); break; }
      buf += css.slice(i, e + 2); i = e + 2; continue;
    }
    if (c === '{') {                                             // 整块（含内部注释）
      let d = 0, j = i;
      while (j < css.length) {
        if (css[j] === '/' && css[j + 1] === '*') { const e = css.indexOf('*/', j + 2); if (e < 0) break; j = e + 2; continue; }
        if (css[j] === '{') d++; else if (css[j] === '}') { d--; if (!d) { j++; break; } }
        j++;
      }
      buf += css.slice(i, j); i = j;
      chunks.push(buf); buf = ''; continue;
    }
    buf += c; i++;
    if (c === '}' && !buf.includes('{')) { chunks.push(buf); buf = ''; }   // 多余闭括号兜底
  }
  if (buf.trim()) chunks.push(buf);
  return chunks;
}

function stripLegacyCssRaw(css) {
  const chunks = splitCss(css);
  const removed = [], kept = [];
  for (const ch of chunks) {
    const brace = ch.indexOf('{');
    if (brace < 0) { kept.push(ch); continue; }                  // 纯注释/空白，保留
    const sel = ch.slice(0, brace);
    if (LEGACY_CSS_PAT.test(sel)) {
      if (LEGACY_KEEP.some(k => sel.includes(k))) { kept.push(ch); continue; }
      removed.push(sel.replace(/\s+/g, ' ').trim().slice(0, 72));
      continue;
    }
    kept.push(ch);
  }
  return { css: kept.join(''), removed };
}

/* ---------- 3. 拆掉已存在的 PV 块（整对拆，可反复） ---------- */
function cutBlock(html, begin, end, rel) {
  for (;;) {
    const b = html.indexOf(begin);
    if (b < 0) break;
    const e = html.indexOf(end, b);
    if (e < 0) die(`${rel}: ${begin.slice(0, 24)}… 之后找不到配对的结束标记（index ${b}），拒写`);
    let i = e + end.length;
    if (html[i] === '\n') i++;                                   // 插入时带的那个换行也吃掉，否则每跑一次多一行
    html = html.slice(0, b) + html.slice(i);
  }
  return html;
}

/* ---------- 4. 剥旧 JIZURA 脚本块（按锚点扩到整个 <script>） ---------- */
function stripLegacyJs(html, rel) {
  const gone = [];
  for (const anchor of LEGACY_JS_ANCHORS) {
    let at = html.indexOf(anchor);
    while (at >= 0) {
      const open = html.lastIndexOf('<script>', at);
      const close = html.indexOf('</script>', at);
      if (open < 0 || close < 0) die(`${rel}: 旧 JS 块边界不明：${anchor}`);
      gone.push(anchor);
      html = html.slice(0, open) + html.slice(close + '</script>'.length);
      at = html.indexOf(anchor);
    }
  }
  return { html, gone };
}

function insertAt(html, needle, block, rel, label) {
  const at = html.lastIndexOf(needle);
  if (at < 0) die(`${rel}: 找不到 ${label}（${needle}）`);
  return html.slice(0, at) + block + '\n' + html.slice(at);
}

/* ---------- 5. 主流程 ---------- */
const log = [];
for (const rel of TARGETS) {
  const p = join(ROOT, rel);
  let html = read(p);
  const before = html.length;
  const migrated = { legacyCss: 0, legacyJs: 0, coreHook: false, hooks: 0, strippedBlocks: 0 };

  /* ① 先拆掉所有旧 PV 块，让「剥遗留」面对一个没有 PV 内容的现场 */
  const b0 = allIndex(html, CSS_B).length + allIndex(html, JS_B).length;
  html = cutBlock(html, CSS_B, CSS_E, rel);
  html = cutBlock(html, JS_B, JS_E, rel);
  migrated.strippedBlocks = b0;

  /* ② 剥遗留 CSS（只动最后一个 <style> 内部） */
  const sClose = html.lastIndexOf('</style>');
  const sOpen = sClose >= 0 ? html.lastIndexOf('<style', sClose) : -1;
  if (sOpen < 0 || sClose < sOpen) die(`${rel}: 找不到最后一个 <style> 区间`);
  const gt = html.indexOf('>', sOpen);
  const inner = html.slice(gt + 1, sClose);
  const s = stripLegacyCssRaw(inner);
  html = html.slice(0, gt + 1) + s.css + html.slice(sClose);
  migrated.legacyCss = s.removed.length;

  /* ③ 剥遗留 JS */
  const j = stripLegacyJs(html, rel);
  html = j.html;
  migrated.legacyJs = j.gone.length;

  /* ④ 核心钩子（幂等；用 split/join 而不是 replace，避开 $ 替换符） */
  if (html.includes('window.__pvCore=')) {
    migrated.coreHook = true;
  } else {
    const n = count(html, CORE_ANCHOR);
    if (n !== 1) die(`${rel}: 核心锚点 "var _pvLineEls=[];" 命中 ${n} 次（需要恰好 1 次），拒写`);
    html = html.split(CORE_ANCHOR).join(CORE_HOOK);
    migrated.coreHook = true;
  }

  /* ④b 降级钩子：没打上的打上，打过的跳过；from 可以是旧形列表（钩子自已进化时要能升级） */
  HOOKS.forEach((h) => {
    if (html.includes(h.to)) return;
    const alts = Array.isArray(h.from) ? h.from : [h.from];
    const hit = alts.find((a) => count(html, a) === 1);
    if (hit == null) {
      const counts = alts.map((a) => count(html, a)).join('/');
      die(`${rel}: 钩子「${h.id}」锚点命中 ${counts}（需要其中一条恰好 1 次），拒写`);
    }
    html = html.split(hit).join(h.to);
    migrated.hooks++;
  });

  /* ⑤ 插入新块 */
  html = insertAt(html, '</style>', CSS_BLOCK, rel, '样式结尾');
  html = insertAt(html, '</body>', JS_BLOCK, rel, 'body 结尾');

  /* ⑥ 写盘前自锁 */
  const nCB = count(html, CSS_B), nCE = count(html, CSS_E), nJB = count(html, JS_B), nJE = count(html, JS_E);
  if (!(nCB === 1 && nCE === 1 && nJB === 1 && nJE === 1))
    die(`${rel}: PV 标记对数不对（CSS ${nCB}/${nCE}，JS ${nJB}/${nJE}），拒写`);
  if (LEGACY_JS_ANCHORS.some(a => html.includes(a))) die(`${rel}: 旧 JIZURA 脚本仍在，拒写`);
  if (count(html, 'window.__pvCore=') !== 1) die(`${rel}: __pvCore 钩子不是恰好一处，拒写`);
  if (!html.includes('.jz-gpill')) die(`${rel}: 播放列表的 .jz-gpill 被误删，拒写`);

  const d = (html.length - before) / 1024;
  log.push(`${rel}: ${before / 1024 | 0} KB → ${(html.length / 1024).toFixed(1)} KB（${d >= 0 ? '+' : ''}${d.toFixed(1)} KB）｜拆旧块 ${migrated.strippedBlocks} 处｜剥遗留 CSS ${migrated.legacyCss} 条 / JS ${migrated.legacyJs} 块｜降级钩子 ${migrated.hooks} 条`);
  if (DBG) console.error(`[dbg] ${rel} CB=${nCB} CE=${nCE} JB=${nJB} JE=${nJE} len=${html.length}`);

  if (CHECK) log.push(`${rel}: （--check）${JSON.stringify(migrated)}`);
  else writeFileSync(p, html, 'utf8');
}

const srcAll = jsParts.join('\n');
const regCount = (srcAll.match(/PV\.reg\(/g) || []).length;
log.push(`PV.reg 调用点 ${regCount} 处（循环注册的件数多于这个数，真实件数看页面 PV.stats()）；PV 块 CSS ${(CSS_BLOCK.length / 1024).toFixed(1)} KB / JS ${(JS_BLOCK.length / 1024).toFixed(1)} KB`);
if (REPORT) log.push('（PV 块内容不参与遗留剥离，构建产物勿手改）');

console.log(log.join('\n'));
console.log(CHECK ? '（--check：未写入）' : '✓ 写入完成。下一步：node tools/bump-build.mjs，然后在 Hana 里重新加载 App');


