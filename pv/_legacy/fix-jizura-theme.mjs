// 修 JIZURA 主题跟随 + 分组 tab 刷新时机
// 用法：node tools/fix-jizura-theme.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. JIZURA 配色默认回退到 App 主题变量（CSS 追加） ============ */
const THEME_CSS = `
/* JIZURA 默认跟随 App 主题：内联没设 --jz-* 时走 App 变量 */
.pv-stage { --jz-bg: var(--card-bg); --jz-fg: var(--text); --jz-acc: var(--accent); }
`;

/* ============ 2. _jzApplyStyle 支持 auto（跟随主题=清掉内联覆盖） ============ */
const APPLY_OLD = `window._jzApplyStyle=function _jzApplyStyle(s){
 _jzStyle=s;`;
const APPLY_NEW = `window._jzApplyStyle=function _jzApplyStyle(s){
 _jzStyle=s;
 if(s&&s.id==='auto'){
  var st0=document.getElementById('pvStage');
  if(st0){st0.style.removeProperty('--jz-bg');st0.style.removeProperty('--jz-fg');st0.style.removeProperty('--jz-acc');st0.style.background='';st0.style.color='';}
  return;
 }`;

/* ============ 3. JZ_STYLES（骰子池）最前加 auto ============ */
const POOL_OLD = `var JZ_STYLES=[
 {id:'gold',nm:'金夜'`;
const POOL_NEW = `var JZ_STYLES=[
 {id:'auto',nm:'自动'},
 {id:'gold',nm:'金夜'`;

/* ============ 4. 风格条数组同样加 auto ============ */
const BAR_OLD = `var JZ_STYLES_REF=[
 {id:'gold',nm:'金夜'`;
const BAR_NEW = `var JZ_STYLES_REF=[
 {id:'auto',nm:'自动'},
 {id:'gold',nm:'金夜'`;

/* ============ 5. 风格条 dot 背景：auto 用 App 变量 ============ */
const DOT_OLD = `  dot.style.cssText='width:14px;height:14px;border-radius:50%;cursor:pointer;border:1.5px solid '+s.acc+';background:linear-gradient(135deg,'+s.bg+' 45%,'+s.acc+');transition:transform .15s';`;
const DOT_NEW = `  var _dbg=s.id==='auto'?'linear-gradient(135deg,var(--card-bg) 45%,var(--accent))':('linear-gradient(135deg,'+s.bg+' 45%,'+s.acc+')');
  var _dbd=s.id==='auto'?'var(--accent)':s.acc;
  dot.style.cssText='width:14px;height:14px;border-radius:50%;cursor:pointer;border:1.5px solid '+_dbd+';background:'+_dbg+';transition:transform .15s';`;

/* ============ 6. 分组 tab 刷新时机：包装 renderPL ============ */
const TABS_OLD = `renderTabs();
})();`;
const TABS_NEW = `if(typeof renderPL==='function'&&!window.renderPL._grpWrapped){
  var _r=window.renderPL;
  window.renderPL=function(){ _r.apply(this,arguments); renderTabs(); };
  window.renderPL._grpWrapped=1;
}
renderTabs();
})();`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + THEME_CSS + "\n" + html.slice(cssIdx);

  html = replaceOnce(html, APPLY_OLD, APPLY_NEW, `${rel} applyStyle`);
  html = replaceOnce(html, POOL_OLD, POOL_NEW, `${rel} 骰子池`);
  html = replaceOnce(html, BAR_OLD, BAR_NEW, `${rel} 风格条`);
  html = replaceOnce(html, DOT_OLD, DOT_NEW, `${rel} dot`);
  html = replaceOnce(html, TABS_OLD, TABS_NEW, `${rel} tab刷新`);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 主题跟随 + tab刷新 修复完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
