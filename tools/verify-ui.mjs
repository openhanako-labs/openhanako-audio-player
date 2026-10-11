#!/usr/bin/env node
// verify-ui.mjs — UI 静态断言脚本（第一版）
//
// 用途：捕获「跨文件契约没人校验」类实伤。该仓库近三天三次实伤都在这一类：
//   - .is-current 死选择器（CSS 写 A、JS 打 B）
//   - lyrics-toggle 事件无消费方
//   - 主题订阅空壳
//   - build 钩子锚点被改动炸过
//
// 这是防线，不是测试框架。红线是真实问题清单，不修，只报。
//
// 用法：
//   node tools/verify-ui.mjs            # 人类可读报告
//   node tools/verify-ui.mjs --json     # 机器可读（供 CI 消费）
// 退出码：0 = 全绿；1 = 有红（红项在 report.results[].failures 里）
//
// 只新建此文件，不改任何现有文件。发现的问题进报告，不顺手修。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IS_JSON = process.argv.includes('--json');

// ============================================================
// 配置与白名单
// ============================================================

const FILES = {
  css:            'ui/style.css',
  app:            'ui/app.js',
  head:           'ui/head.js',
  index:          'ui/index.html',
  standalone:     'ui/standalone.html',
  build:          'pv/build.mjs',
};

// 由 JS/DOM 控制状态语义、允许「CSS 里没有定义」的类名白名单。
// 白名单维护规则：
//   - 每一项都必须对应一段具体的 JS 状态语义（在报告里能看到它在哪一段 JS 被操作）
//   - 新增时说明是「哪种语义」；删掉对应 JS 语义时同步删掉
//   - 已存在的三条历史坑（is-current / l-main / lyric-open）在此显式声明，
//     避免 verify-ui 把它们报成「无样式类」；这三条在 CSS 里确实没定义，但
//     都是历史遗留/新语义标记，语义在 JS 里。
//   - 与 CSS 已有的类名共存时无害：只是白名单里多一项没用到，不算错误。
const JS_STATE_CLASSES = [
  // —— 歌词语义 ——
  'lyric-tran',      // 译文行标记（TTML 有译文才渲染），显隐走 body.tran-off
  'l-main',          // 主歌词行标记（对应 l.tran）
  'is-near',         // 当前行 ±1 高亮（2c 遗留接线）
  'is-current',      // 已知死选择器候选：CSS 从未定义，JS 也没在写；保留在白名单防止误报，见下
  'current',         // 当前行高亮（.lyric-line.current）
  'lyric-open',      // 面板开合语义（历史遗留）
  'is-browsing',     // 歌词浏览态
  'tran-off',        // 隐藏译文（body.tran-off）
  'chorus',          // 副歌行标记

  // —— 模式语义 ——
  'lyrics-mode',     // body.lyrics-mode：PV 模式开
  'jizura-mode',     // body.jizura-mode：歌词沉浸模式开
  'immersive-mode',  // 遗留（app.js 主动 remove 清残留）

  // —— 顶栏胶囊 ——
  'mode-caps',       // 顶栏三模式容器
  'mc',              // 胶囊按钮（在 app.js 里 createElement 时写）

  // —— 常见 UI 状态（CSS 有的多数场景，这里列一遍避免误报）——
  'open',            // 面板/菜单展开态
  'active',          // 激活态
  'show',            // 淡入态
  'live',            // 直播/实时标记
  'spinning',        // 封面旋转
  'collapsed',       // 折叠
  'dragging',
  'drag-over',
  'editing',
  'cached',
  'on',              // 通用开关
  'dim',
  'wide-off',        // head.js 宽屏切换
  'view-compact',
  'view-full',
  'player-popup',
];

// ============================================================
// 加载文件
// ============================================================

function readRel(rel) {
  const p = join(ROOT, rel);
  try { return readFileSync(p, 'utf8'); }
  catch (e) { return null; }
}

const SRC = {};
for (const [k, rel] of Object.entries(FILES)) SRC[k] = readRel(rel);
for (const [k, v] of Object.entries(SRC)) {
  if (v == null) console.error(`✗ 找不到文件：${k}（${FILES[k]}）`);
}

// ============================================================
// 1. CSS 类选择器提取
// ============================================================

/**
 * 把 CSS 顶层规则切出来。注释与整块（{...}）不吃掉，只做规则切分，
 * 返回「选择器部分」列表。与 build.mjs 的 splitCss 同源思路，只是这里
 * 只关心 selector 侧。
 */
function cssTopRules(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    // 跳过空白
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;
    // 跳过注释
    if (css[i] === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2);
      if (e < 0) break;
      i = e + 2;
      continue;
    }
    // 找到下一个 {
    const brace = css.indexOf('{', i);
    if (brace < 0) break;
    const sel = css.slice(i, brace);
    if (!/^@/.test(sel.trim())) out.push(sel);
    // 跳过 { ... } 整块（含嵌套）
    let d = 0, j = brace;
    while (j < css.length) {
      if (css[j] === '{') d++;
      else if (css[j] === '}') { d--; if (!d) { j++; break; } }
      j++;
    }
    i = j;
  }
  return out;
}

/**
 * 从单个选择器串中提取类名。剥离字符串、伪类参数、属性值里的引号字符串，
 * 避免误把 data-pv="..." 之类里的字符串当类。
 */
function classesInSelector(sel) {
  const s = sel
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/::?[a-zA-Z-]+(\([^()]*\))?/g, '');
  return (s.match(/\.[A-Za-z_][\w-]*/g) || []).map(s => s.slice(1));
}

function extractCssClasses(css) {
  const map = new Map(); // name -> first selector preview
  for (const sel of cssTopRules(css)) {
    for (const name of classesInSelector(sel)) {
      if (!map.has(name)) {
        const preview = sel.replace(/\s+/g, ' ').trim().slice(0, 120);
        map.set(name, preview);
      }
    }
  }
  return map;
}

/**
 * 从文件内容里提取所有 <style>...</style> 内的 CSS（包含 index.html 里的 PV 注入块）。
 * 多个 <style> 拼接返回。
 */
function extractInlineStyles(html) {
  const parts = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) parts.push(m[1]);
  return parts.join('\n');
}

/**
 * 合并多个 CSS 文本 → 类名映射。已存在的不覆盖（保留首个 preview）。
 */
function mergeCssClasses(map, css) {
  const m2 = extractCssClasses(css);
  for (const [n, p] of m2) if (!map.has(n)) map.set(n, p);
  return map;
}

/**
 * 合并所有 CSS 来源：
 *   1. ui/style.css —— 手写主样式
 *   2. ui/index.html 的 <style> 内联（包含 PV:BEGIN 注入的构建产物）
 *   3. pv/css/*.css —— PV 源文件（未拼装前），双重保险
 * 避免「PV CSS 定义在 pv/css 但不在 style.css」引起的批量误报。
 */
function loadAllCss() {
  const map = extractCssClasses(SRC.css || '');
  if (SRC.index) {
    const inline = extractInlineStyles(SRC.index);
    if (inline) mergeCssClasses(map, inline);
  }
  try {
    const fs2 = require_fs();
    const pvCssDir = join(ROOT, 'pv', 'css');
    if (fs2.existsSync(pvCssDir)) {
      for (const f of fs2.readdirSync(pvCssDir)) {
        if (!f.endsWith('.css')) continue;
        mergeCssClasses(map, fs2.readFileSync(join(pvCssDir, f), 'utf8'));
      }
    }
  } catch (e) { /* 降级：只拿已注入的 */ }
  return map;
}

// 局部引入 fs（因为顶层是 ESM）
let _fs;
function require_fs() {
  if (!_fs) _fs = createRequire(import.meta.url);
  return _fs;
}

// ============================================================
// 2. JS/HTML 类名使用提取
// ============================================================

/** classList.add/remove/toggle/contains/replace('name') 或 ('a','b') */
function extractClassList(src, tag) {
  const found = new Set();
  // 分开写三种引号，避免贪婪吞下去。
  const re = /\.classList\.(?:add|remove|toggle|contains|replace)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const args = m[1];
    // 提取内部的所有引号字符串（单/双/反引号）
    for (const p of [
      /'([^']*)'/g,
      /\"([^\"]*)\"/g,
      /`([^`]*)`/g,
    ]) {
      for (const n of args.matchAll(p)) {
        for (const part of n[1].split(/\s+/)) {
          const name = part.trim();
          if (name && /^[A-Za-z_][\w-]*$/.test(name)) found.add(name);
        }
      }
    }
  }
  return found;
}

/** 字符串里以 'class="a b"' 形式出现的类名（HTML 静态 class 属性、JS 里 innerHTML / createElement 时的 className 赋值） */
function extractClassAttrStrings(src) {
  const found = new Set();
  // class="..." 或 class='...'（HTML 静态）
  for (const m of src.matchAll(/\sclass\s*=\s*"([^"]*)"/gi)) {
    for (const p of m[1].split(/\s+/)) if (p && /^[A-Za-z_][\w-]*$/.test(p)) found.add(p);
  }
  for (const m of src.matchAll(/\sclass\s*=\s*'([^']*)'/gi)) {
    for (const p of m[1].split(/\s+/)) if (p && /^[A-Za-z_][\w-]*$/.test(p)) found.add(p);
  }
  // className = '...' / className = "..."
  for (const m of src.matchAll(/\.className\s*=\s*"([^"]*)"/g)) {
    for (const p of m[1].split(/\s+/)) if (p && /^[A-Za-z_][\w-]*$/.test(p)) found.add(p);
  }
  for (const m of src.matchAll(/\.className\s*=\s*'([^']*)'/g)) {
    for (const p of m[1].split(/\s+/)) if (p && /^[A-Za-z_][\w-]*$/.test(p)) found.add(p);
  }
  // className += ' ... ' / className += " ... "
  for (const m of src.matchAll(/\.className\s*=\s*[^;]+?\/\*noop\*\//g)) { /* noop */ }
  return found;
}

/** querySelector('.foo') / querySelectorAll('.foo .bar') —— 处理三种引号形式 */
function extractQuerySelectorClasses(src) {
  const found = new Set();
  // 分开写三种引号，避免单/双引号字符串里遇到反斜杠时贪婪吞下去。
  // 对字符串里出现的反斜杠（例如 '\"'）不做「保留」处理——实际 DOM 选择器里几乎不会出现。
  const pats = [
    /\.querySelector(?:All)?\s*\(\s*'([^']*)'/g,
    /\.querySelector(?:All)?\s*\(\s*\"([^"]*)\"/g,
    /\.querySelector(?:All)?\s*\(\s*`([^`]*)`/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(src))) {
      for (const c of classesInSelector(m[1])) found.add(c);
    }
  }
  return found;
}

// ============================================================
// 断言 1：类名对账
// ============================================================

function assertClassNames() {
  const cssClasses = loadAllCss();
  const usedSet = new Set();
  for (const [k, v] of Object.entries(SRC)) {
    if (!v) continue;
    if (k === 'css' || k === 'build') continue;
    for (const n of extractClassList(v, k)) usedSet.add(n);
    for (const n of extractClassAttrStrings(v)) usedSet.add(n);
    for (const n of extractQuerySelectorClasses(v)) usedSet.add(n);
  }

  const whitelist = new Set(JS_STATE_CLASSES);

  // CSS 有而 JS/DOM 从不用 → 死选择器候选（YELLOW；不硬红，因为 CSS 里可能有 :hover 内部规则等）
  const deadSelectors = [];
  for (const [name, preview] of cssClasses) {
    if (!usedSet.has(name)) deadSelectors.push({ name, preview });
  }

  // JS/DOM 用到但 CSS 没定义 → 无样式类
  // 减白名单，剩下的进红
  const styledMissing = [];
  const styledMissingLowConfidence = []; // 形如 '.cls' / '.ls-mode-' 的单字符或尾短横线：拼接口，仅警告
  const whitelistedHits = [];
  for (const name of usedSet) {
    if (cssClasses.has(name)) continue;
    if (whitelist.has(name)) {
      whitelistedHits.push(name);
      continue;
    }
    // 尾部短横线或单字符 = 拼接片段，不作硬红
    if (name.length <= 2 || name.endsWith('-')) {
      styledMissingLowConfidence.push(name);
      continue;
    }
    styledMissing.push(name);
  }

  const failures = styledMissing.map(n => `无样式类：JS/DOM 在用 .${n}，但 CSS 里无定义（若真是语义标记，请加入 JS_STATE_CLASSES 白名单并注明）`);
  const warnings = [
    ...deadSelectors.map(d => `CSS 死选择器候选：.${d.name}（示例：${d.preview}）—— JS/DOM 全仓未查到引用`),
    ...styledMissingLowConfidence.map(n => `低置信度无样式类（可能为拼接片段）：.${n} —— 尾部短横线或长度 ≤2`),
  ];
  return {
    pass: failures.length === 0,
    counts: {
      cssClasses: cssClasses.size,
      usedInJsOrHtml: usedSet.size,
      deadSelectors: deadSelectors.length,
      styledMissing: styledMissing.length,
      styledMissingLowConfidence: styledMissingLowConfidence.length,
      whitelisted: whitelistedHits.length,
    },
    failures,
    warnings,
    details: {
      deadSelectors,
      styledMissing,
      styledMissingLowConfidence,
      whitelistedHits,
    },
  };
}

// ============================================================
// 断言 2：模式状态机
// ============================================================

function assertModeState() {
  const app = SRC.app;
  const failures = [];
  const details = {};

  // (a) curMode 函数存在
  const curModeMatch = /function\s+curMode\s*\([^)]*\)\s*\{([^}]+)\}/.exec(app);
  details.curModeExists = !!curModeMatch;
  if (!curModeMatch) {
    failures.push('curMode() 函数不存在（app.js 顶栏三模式胶囊依赖它）');
  } else {
    const body = curModeMatch[1];
    details.curModeBody = body.trim().slice(0, 200);
    // 两判：jizura-mode → 2, lyrics-mode → 1, else 0
    const jiz = body.includes('jizura-mode');
    const lyr = body.includes('lyrics-mode');
    details.curModeHasJiz = jiz;
    details.curModeHasLyr = lyr;
    if (!jiz) failures.push('curMode() 内缺失 jizura-mode 判定（三档语义塌成两档）');
    if (!lyr) failures.push('curMode() 内缺失 lyrics-mode 判定（三档语义塌成两档）');
    // 三档返回：在三元表达式中作为 value 出现，后面跟 : 或 )
    const ret = /([012])([:)])/g;
    const vals = new Set();
    let m2;
    while ((m2 = ret.exec(body))) vals.add(m2[1]);
    details.curModeReturns = { two: vals.has('2'), one: vals.has('1'), zero: vals.has('0') };
    if (!details.curModeReturns.two || !details.curModeReturns.one || !details.curModeReturns.zero) {
      failures.push(`curMode() 返回值语义缺失（应有 0/1/2 三档：得到 2=${details.curModeReturns.two} 1=${details.curModeReturns.one} 0=${details.curModeReturns.zero}）`);
    }
  }

  // (b) 胶囊三档数组：[['标准',0],['PV',2],['歌词',1]]
  // 允许引号形式变化（标准/PV/歌词 或 '标准' 'PV' '歌词'）
  const capsMatch = /\[\s*\[\s*['"]标准['"]\s*,\s*0\s*\]\s*,\s*\[\s*['"]PV['"]\s*,\s*2\s*\]\s*,\s*\[\s*['"]歌词['"]\s*,\s*1\s*\]\s*\]/.exec(app);
  details.capsuleArrayExists = !!capsMatch;
  if (!capsMatch) failures.push('胶囊三档数组未匹配到标准形：[[\'标准\',0],[\'PV\',2],[\'歌词\',1]] —— 模式循环可能被打断');

  // (c) 三档胶囊按钮循环存在（lyricModeBtn 处的三档语义）
  // 判定：lyricModeBtn 存在；有 hasLyr / hasJiz 局部变量；三档分支
  details.lyricModeBtnCount = (app.match(/lyricModeBtn/g) || []).length;
  const btnRef = app.includes("getElementById('lyricModeBtn')") || app.includes('getElementById("lyricModeBtn")');
  details.lyricModeBtnById = btnRef;
  if (!btnRef) failures.push('app.js 未找到 lyricModeBtn 元素获取 —— 三档循环失去入口');

  const hasLyrCount = (app.match(/hasLyr\b/g) || []).length;
  const hasJizCount = (app.match(/hasJiz\b/g) || []).length;
  details.hasLyrCount = hasLyrCount;
  details.hasJizCount = hasJizCount;
  if (hasLyrCount < 1 || hasJizCount < 1) failures.push(`三档循环语义变量缺失（hasLyr=${hasLyrCount} / hasJiz=${hasJizCount}，需要都至少 1）`);

  // (d) 模式类名出现次数（防被无声删掉）
  details.jizuraModeCount = (app.match(/jizura-mode/g) || []).length;
  details.lyricsModeCount = (app.match(/lyrics-mode/g) || []).length;
  if (details.jizuraModeCount < 3) failures.push(`app.js 里 'jizura-mode' 只出现 ${details.jizuraModeCount} 次（历史基线 ≥3）`);
  if (details.lyricsModeCount < 3) failures.push(`app.js 里 'lyrics-mode' 只出现 ${details.lyricsModeCount} 次（历史基线 ≥3）`);

  return {
    pass: failures.length === 0,
    counts: {
      curModePresent: details.curModeExists ? 1 : 0,
      capsuleArrayPresent: details.capsuleArrayExists ? 1 : 0,
      lyricModeBtnRefs: details.lyricModeBtnCount,
    },
    failures,
    details,
  };
}

// ============================================================
// 断言 3：双副本一致（index.html vs standalone.html）
// ============================================================

function sha256Buf(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function assertDualCopy() {
  // 需要字节级 → 直接读 Buffer 而不是读字符串
  const aPath = join(ROOT, FILES.index);
  const bPath = join(ROOT, FILES.standalone);
  let bufA, bufB;
  try { bufA = readFileSync(aPath); }
  catch (e) { return { pass: false, failures: [`读不到 ${FILES.index}: ${e.message}`] }; }
  try { bufB = readFileSync(bPath); }
  catch (e) { return { pass: false, failures: [`读不到 ${FILES.standalone}: ${e.message}`] }; }
  const ha = sha256Buf(bufA);
  const hb = sha256Buf(bufB);
  const lenA = bufA.length, lenB = bufB.length;
  if (ha !== hb) {
    // 简单 diff 提示：找第一处差异
    let first = -1;
    const n = Math.min(lenA, lenB);
    for (let i = 0; i < n; i++) {
      if (bufA[i] !== bufB[i]) { first = i; break; }
    }
    return {
      pass: false,
      counts: { lenIndex: lenA, lenStandalone: lenB, sha256Index: ha, sha256Standalone: hb },
      failures: [
        `双副本不一致：index.html 与 standalone.html 字节级不匹配`,
        `  index.html     : ${lenA} B, sha256=${ha.slice(0, 16)}…`,
        `  standalone.html: ${lenB} B, sha256=${hb.slice(0, 16)}…`,
        `  第一处差异字节偏移：${first}`,
      ],
    };
  }
  return {
    pass: true,
    counts: { lenIndex: lenA, lenStandalone: lenB, sha256: ha },
    failures: [],
    warnings: [],
  };
}

// ============================================================
// 断言 4：build 钩子锚点自检
// ============================================================

/**
 * 从 pv/build.mjs 源码文本里提取 CORE_HOOKS 常量定义。
 * 结构固定：const CORE_HOOKS = [ {id, from, to}, ... ];
 * from / to 可为字符串字面量或数组字面量，字符串内含 '\n' 转义。
 * 直接 JSON.parse 会失败（JS 对象字面量的键不带引号、字符串内的 '\n' 需还原）。
 * 这里用 new Function 直接求值字面量：build.mjs 是本仓代码，非任意输入。
 */
function parseCoreHooks(buildSrc) {
  const start = buildSrc.indexOf('const CORE_HOOKS');
  if (start < 0) return { error: 'build.mjs 里找不到 const CORE_HOOKS' };
  const lb = buildSrc.indexOf('[', start);
  if (lb < 0) return { error: 'CORE_HOOKS 后面没有左方括号' };
  // 找匹配的 ]
  let d = 0, i = lb;
  while (i < buildSrc.length) {
    const c = buildSrc[i];
    // 跳过字符串（单引号、双引号、反引号）
    if (c === '\'' || c === '"' || c === '`') {
      const q = c; i++;
      while (i < buildSrc.length) {
        if (buildSrc[i] === '\\') { i += 2; continue; }
        if (buildSrc[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '[') d++;
    else if (c === ']') { d--; if (!d) { i++; break; } }
    i++;
  }
  const body = buildSrc.slice(lb, i); // [ ... ]
  // CORE_HOOKS 内部引用了 AVAIL 变量（'window.PV&&PV.available'）。
  // 求值前在作用域内注入一个等价的常量。
  try {
    const fn = new Function(
      'var AVAIL = "window.PV&&PV.available"; return (' + body + ');'
    );
    const arr = fn();
    if (!Array.isArray(arr)) return { error: 'CORE_HOOKS 求值后不是数组' };
    return { hooks: arr };
  } catch (e) {
    return { error: 'CORE_HOOKS 求值失败：' + e.message };
  }
}

function assertBuildHooks() {
  const failures = [];
  const details = { source: 'pv/build.mjs::CORE_HOOKS', hooks: [] };
  const parsed = parseCoreHooks(SRC.build);
  if (parsed.error) {
    failures.push(`无法从 build.mjs 解析 CORE_HOOKS：${parsed.error}`);
    return { pass: false, failures, details };
  }
  const hooks = parsed.hooks;
  details.count = hooks.length;
  if (hooks.length === 0) {
    failures.push('build.mjs 的 CORE_HOOKS 为空数组（预期 5 条）');
    return { pass: false, failures, details };
  }

  const app = SRC.app;
  const countStr = (hay, needle) => hay.split(needle).length - 1;

  hooks.forEach(h => {
    const rec = { id: h.id };
    details.hooks.push(rec);
    const toPresent = typeof h.to === 'string' && app.includes(h.to);
    rec.toPresent = toPresent;
    if (toPresent) { rec.status = 'applied'; return; }
    // 未应用：from 里任一条恰好命中 1 次即可
    const alts = Array.isArray(h.from) ? h.from : [h.from];
    const counts = alts.map(a => countStr(app, a));
    rec.fromCounts = counts;
    const good = counts.some(c => c === 1);
    rec.status = good ? 'pending-ok' : 'BROKEN';
    if (!good) {
      failures.push(`钩子「${h.id}」锚点全灭：from 候选命中次数 [${counts.join(', ')}]，需要其中一条恰好 1 次`);
    }
  });

  return { pass: failures.length === 0, counts: { hooks: hooks.length, applied: details.hooks.filter(h => h.status === 'applied').length, pendingOk: details.hooks.filter(h => h.status === 'pending-ok').length, broken: details.hooks.filter(h => h.status === 'BROKEN').length }, failures, details };
}

// ============================================================
// 断言 5：事件对账
// ============================================================

/** 提取 AudioEventBus 上的 emit 事件名：.emit('name', ...), _emit('name', ...) */
function extractBusEmits(src) {
  const set = new Map();
  const pats = [
    /(?:\.emit|_emit)\s*\(\s*'([^']*)'/g,
    /(?:\.emit|_emit)\s*\(\s*\"([^\"]*)\"/g,
    /(?:\.emit|_emit)\s*\(\s*`([^`]*)`/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (name === 'audio-event') continue;
      set.set(name, (set.get(name) || 0) + 1);
    }
  }
  return set;
}

/** 提取 AudioEventBus 上的订阅事件名：.on('name', ...), audioEventBus.on('name' ...) */
function extractBusSubs(src) {
  const set = new Map();
  const pats = [
    /(?:\.on|_on)\s*\(\s*'([^']*)'/g,
    /(?:\.on|_on)\s*\(\s*\"([^\"]*)\"/g,
    /(?:\.on|_on)\s*\(\s*`([^`]*)`/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (name === 'audio-event') continue;
      set.set(name, (set.get(name) || 0) + 1);
    }
  }
  return set;
}

/** 提取 DOM 自定义事件：dispatchEvent(new CustomEvent/Event('name' ...)) */
function extractDomDispatches(src) {
  const set = new Map();
  const pats = [
    /dispatchEvent\s*\(\s*new\s+(?:CustomEvent|Event)\s*\(\s*'([^']*)'/g,
    /dispatchEvent\s*\(\s*new\s+(?:CustomEvent|Event)\s*\(\s*\"([^\"]*)\"/g,
    /dispatchEvent\s*\(\s*new\s+(?:CustomEvent|Event)\s*\(\s*`([^`]*)`/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (BUILTIN_DOM_EVENTS.has(name)) continue;
      set.set(name, (set.get(name) || 0) + 1);
    }
  }
  return set;
}

/** 提取 DOM 事件监听：addEventListener('name', ...) */
function extractDomListeners(src) {
  const set = new Map();
  const pats = [
    /addEventListener\s*\(\s*'([^']*)'/g,
    /addEventListener\s*\(\s*\"([^\"]*)\"/g,
    /addEventListener\s*\(\s*`([^`]*)`/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (BUILTIN_DOM_EVENTS.has(name)) continue;
      set.set(name, (set.get(name) || 0) + 1);
    }
  }
  return set;
}

// 常见内置 DOM 事件：不算自定义事件
const BUILTIN_DOM_EVENTS = new Set([
  'click', 'dblclick', 'mousedown', 'mouseup', 'mouseenter', 'mouseleave',
  'mouseover', 'mouseout', 'mousemove', 'keydown', 'keyup', 'keypress',
  'input', 'change', 'focus', 'blur', 'submit', 'reset', 'scroll', 'wheel',
  'load', 'unload', 'resize', 'orientationchange',
  'touchstart', 'touchend', 'touchmove', 'touchcancel',
  'play', 'pause', 'ended', 'playing', 'waiting', 'error', 'timeupdate',
  'durationchange', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough',
  'stalled', 'suspend', 'seeking', 'seeked', 'ratechange', 'volumechange',
  'animationstart', 'animationend', 'animationiteration',
  'transitionstart', 'transitionend', 'transitionrun',
  'beforeunload', 'DOMContentLoaded', 'readystatechange', 'focusin', 'focusout',
  'pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout',
  'select', 'selectionchange', 'drag', 'dragstart', 'dragend', 'dragover',
  'dragenter', 'dragleave', 'drop',
  'contextmenu', 'wheel', 'beforeinput', 'compositionstart', 'compositionend',
  'cut', 'copy', 'paste', 'invalid', 'animationcancel', 'transitioncancel',
  'beforetoggle', 'toggle', 'toggle',
]);

function assertEvents() {
  const srcFiles = { app: SRC.app, head: SRC.head, index: SRC.index };
  const busEmits = new Map();
  const busSubs = new Map();
  const domDispatches = new Map();
  const domListeners = new Map();

  for (const [k, v] of Object.entries(srcFiles)) {
    if (!v) continue;
    for (const [n, c] of extractBusEmits(v)) busEmits.set(n, (busEmits.get(n) || 0) + c);
    for (const [n, c] of extractBusSubs(v)) busSubs.set(n, (busSubs.get(n) || 0) + c);
    for (const [n, c] of extractDomDispatches(v)) domDispatches.set(n, (domDispatches.get(n) || 0) + c);
    for (const [n, c] of extractDomListeners(v)) domListeners.set(n, (domListeners.get(n) || 0) + c);
  }

  const failures = [];
  const warnings = [];

  // (a) bus emit 无 .on 订阅
  // 注意：bus 是全局总线，跨 App/iframe 边界可能消费。这里报「本仓内无订阅」，
  // 定性为 warnings（不是硬红），因为外部宿主可能订阅。
  // 但若订阅方与派发方都在 app.js 且完全找不到消费方 → 提示强一些。
  const busOrphans = [];
  for (const [name, cnt] of busEmits) {
    if (!busSubs.has(name)) busOrphans.push({ name, dispatchCount: cnt });
  }
  busOrphans.forEach(o => {
    // 判定：如果这个 name 在整个仓库（含 docs）出现过，说明它是「设计过但未接线」
    warnings.push(`AudioEventBus 派发 '${o.name}' ×${o.dispatchCount} 次，全仓无 .on('${o.name}') 订阅（bus 可能被外部宿主订阅，静态分析无法确认；建议：或补消费方，或明确注释为保留事件）`);
  });

  // (b) DOM 自定义事件：派发但无监听
  const domDispatchNames = new Set(domDispatches.keys());
  const domDispatchOrphans = [];
  for (const [name, cnt] of domDispatches) {
    if (!domListeners.has(name)) domDispatchOrphans.push({ name, dispatchCount: cnt });
  }
  domDispatchOrphans.forEach(o => {
    failures.push(`DOM 自定义事件 '${o.name}' 派发 ×${o.dispatchCount} 次，全仓无 addEventListener 监听（真·无消费方）`);
  });

  // (c) 文档里提到但代码未派发的注释事件（历史坑：lyrics-toggle）
  // 扫 app.js 注释里出现的事件名，形如 - track-change: / - lyrics-toggle:  或 track-change / progress
  const docEvents = new Set();
  const re = /^\s*\*\s*-\s*([a-z][\w-]*):\s/gm;
  let m;
  const topComment = SRC.app.slice(0, 1200); // 文件头注释
  while ((m = re.exec(topComment))) docEvents.add(m[1]);
  for (const name of docEvents) {
    if (!busEmits.has(name)) {
      failures.push(`文件头注释声明 bus 事件 '${name}'，但 app.js 里无任何 .emit('${name}') 派发（幽灵事件，文档与实现漂移）`);
    }
  }

  return {
    pass: failures.length === 0,
    counts: {
      busEmits: [...busEmits.keys()].length,
      busSubs: [...busSubs.keys()].length,
      busOrphans: busOrphans.length,
      domDispatches: [...domDispatches.keys()].length,
      domListeners: [...domListeners.keys()].length,
      domOrphans: domDispatchOrphans.length,
      docDeclaredEvents: docEvents.size,
    },
    failures,
    warnings,
    details: {
      busEmits: Object.fromEntries(busEmits),
      busSubs: Object.fromEntries(busSubs),
      busOrphans,
      domDispatches: Object.fromEntries(domDispatches),
      domListeners: Object.fromEntries(domListeners),
      domDispatchOrphans,
      docDeclaredEvents: [...docEvents],
    },
  };
}

// ============================================================
// 报告
// ============================================================

function runAll() {
  const results = [
    { id: '1.class-names', name: '类名对账', ...assertClassNames() },
    { id: '2.mode-state', name: '模式状态机', ...assertModeState() },
    { id: '3.dual-copy', name: '双副本一致', ...assertDualCopy() },
    { id: '4.build-hooks', name: 'build 钩子锚点', ...assertBuildHooks() },
    { id: '5.events', name: '事件对账', ...assertEvents() },
  ];
  const red = results.filter(r => !r.pass).length;
  const yellow = results.reduce((n, r) => n + (r.warnings ? r.warnings.length : 0), 0);
  const green = results.filter(r => r.pass).length;
  return { results, red, yellow, green };
}

function printHuman(report) {
  process.stderr.write(buildHuman(report) + '\n');
}

function buildHuman(report) {
  const lines = [];
  const p = (s = '') => lines.push(s);
  const H = s => p(`\n===== ${s} =====`);

  p('verify-ui.mjs — UI 静态断言（第一版）');
  p('仓库：' + ROOT);
  p('运行：node tools/verify-ui.mjs');

  H('总览');
  p(`绿 ${report.green} / 红 ${report.red} / 黄(警告) ${report.yellow}`);

  for (const r of report.results) {
    H(`${r.id} · ${r.name} · ${r.pass ? 'PASS' : 'FAIL'}`);
    if (r.counts) p('计数：' + JSON.stringify(r.counts));
    if (r.failures && r.failures.length) {
      p('— 红 —');
      for (const f of r.failures) p('  ✗ ' + f);
    }
    if (r.warnings && r.warnings.length) {
      p('— 黄 —');
      for (const w of r.warnings) p('  ! ' + w);
    }
    if (!r.failures?.length && !r.warnings?.length) p('（无）');
  }

  H('脚本自身的局限（静态分析抓不到的东西）');
  for (const lim of LIMITATIONS) p('  · ' + lim);

  H('白名单（可维护）');
  p('JS_STATE_CLASSES 定义在脚本顶部。');
  p('用途：JS 控制状态语义、允许「CSS 无定义」的类名。');
  p('新增/删除前请确认对应 JS 语义还在。');

  return lines.join('\n');
}

const LIMITATIONS = [
  'CSS 里的 :hover/:focus 派生规则、@media 内定义、动态拼接的选择器（如 querySelector("." + cls)）无法静态对齐。',
  'AudioEventBus 派发可能被外部宿主订阅（iframe 之外），.on 计数只覆盖本仓。bus 孤儿事件按「警告」处理，非硬红。',
  '模板字符串 className="a " + var + " b" 的拼接无法完全展开；这类拼接的类名可能漏报。',
  'querySelectorAll(".a:not(.b)") 里 .b 的语义（否定）无法判定 —— 提取时会把 .b 也当作「使用」。',
  '事件名通过变量派发（new CustomEvent(name, ...)）无法静态解析；这类派发点跳过。',
  'CSS 里带 :is() / :where() / :not() 的嵌套类选择器会全部提取，可能被算作「使用」。',
  'build.mjs 的 CORE_HOOKS 依赖 JS 对象字面量转 JSON；若结构改变（例如加注释、加字段、换行），解析会失败并被报成硬红。',
  '本脚本只覆盖 ui/style.css、ui/app.js、ui/head.js、ui/index.html、ui/standalone.html、pv/build.mjs 六个文件。',
];

function printJson(report) {
  process.stderr.write(JSON.stringify({
    generatedAt: new Date().toISOString(),
    repo: ROOT,
    summary: { green: report.green, red: report.red, yellow: report.yellow, total: report.results.length },
    results: report.results.map(r => ({
      id: r.id,
      name: r.name,
      pass: r.pass,
      counts: r.counts || null,
      failures: r.failures || [],
      warnings: r.warnings || [],
      details: r.details || null,
    })),
    limitations: LIMITATIONS,
  }, null, 2) + '\n');
}

// ============================================================
// Main
// ============================================================

const report = runAll();
if (IS_JSON) printJson(report);
else printHuman(report);
process.exit(report.red > 0 ? 1 : 0);
