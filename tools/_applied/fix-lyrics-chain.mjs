// 修歌词渲染链：pvSync 实时刷新歌词快照 + 进出 JIZURA 时主动重渲染 + PV 模式隐藏 JIZURA 元素 + 读盘空 URL 修复
// 用法：node tools/fix-lyrics-chain.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. pvSync JIZURA 分支：每次同步都刷新快照（pvSync 在歌词 IIFE 内，能访问 lrcData） ============ */
const PVSYNC_OLD = `function pvSync(idx){
    if(document.body.classList.contains('jizura-mode')){
      if(window.renderJizuraLine)window.renderJizuraLine(idx);
      return;
    }`;
const PVSYNC_NEW = `function pvSync(idx){
    if(document.body.classList.contains('jizura-mode')){
      window._jizuraLrcData=lrcData;
      if(window.renderJizuraLine)window.renderJizuraLine(idx);
      return;
    }`;

/* ============ 2. PV→JIZURA：直接 renderPv() 触发分支赋值+初始化 ============ */
const ENTER_OLD = `        // PV → 歌词
        document.body.classList.add('jizura-mode');
        btn.style.color='var(--accent)';
        btn.title='退出歌词模式';
        if(window.renderJizuraInit)window.renderJizuraInit();`;
const ENTER_NEW = `        // PV → 歌词
        document.body.classList.add('jizura-mode');
        btn.style.color='var(--accent)';
        btn.title='退出歌词模式';
        renderPv();`;

/* ============ 3. JIZURA→标准：退出时 renderPv() 恢复 folia ============ */
const EXIT_OLD = `        // 歌词 → 标准
        document.body.classList.remove('jizura-mode');
        apply(false);`;
const EXIT_NEW = `        // 歌词 → 标准
        document.body.classList.remove('jizura-mode');
        renderPv();
        apply(false);`;

/* ============ 4. PV 模式不显示 JIZURA 元素（CSS） ============ */
const HIDE_CSS = `
/* JIZURA 元素只在歌词模式显示 */
body:not(.jizura-mode) .jizura-dice,
body:not(.jizura-mode) .jizura-style-bar,
body:not(.jizura-mode) .jizura-tag,
body:not(.jizura-mode) .jizura-ghost { display:none !important; }
`;

/* ============ 5. _loadLineLrc：lrcUrl 空但有 trackName 时也要读盘 ============ */
const LOAD_OLD = `function _loadLineLrc(lrcUrl, trackName){
    if(!lrcUrl) return;`;
const LOAD_NEW = `function _loadLineLrc(lrcUrl, trackName){
    if(!lrcUrl && !trackName) return;`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, PVSYNC_OLD, PVSYNC_NEW, `${rel} pvSync快照`);
  html = replaceOnce(html, ENTER_OLD, ENTER_NEW, `${rel} 进JIZURA`);
  html = replaceOnce(html, EXIT_OLD, EXIT_NEW, `${rel} 出JIZURA`);
  html = replaceOnce(html, LOAD_OLD, LOAD_NEW, `${rel} 读盘空URL`);

  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + HIDE_CSS + "\n" + html.slice(cssIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 歌词链修复完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
