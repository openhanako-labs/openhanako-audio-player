// 修布局溢出（封面响应式 + 歌词区限高 + header 保险）+ 新增 cadenza「星散」排版
// 用法：node tools/fix-layout-cadenza.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. 封面响应式（高度不够自动缩小，不再挤出 header） ============ */
const COVER_OLD = `body:not(.view-compact) .np-cover { order:1; width:180px !important; height:180px !important; margin:14px 0 12px !important; font-size:56px !important; flex-shrink:0; }`;
const COVER_NEW = `body:not(.view-compact) .np-cover { order:1; width:clamp(110px, 30vh, 180px) !important; height:clamp(110px, 30vh, 180px) !important; margin:10px 0 10px !important; font-size:56px !important; flex-shrink:0; }`;

/* ============ 2. 纵排时歌词区限高 + header 保险 ============ */
const LAYOUT_CSS = `
/* ===== 布局溢出修复 ===== */
/* 标准模式纵排：歌词区不再吃掉整个剩余空间 */
body:not(.view-compact):not(.lyrics-mode) .now-playing-section .lyrics-section { flex:0 1 auto; max-height:22%; overflow-y:auto; }
/* header 保险：任何情况下完整视图的顶栏都在文档流且可点 */
body:not(.view-compact) .header { position:relative; z-index:6; flex-shrink:0; }
/* ===== cadenza「星散」排版 ===== */
.jz-cad{ width:100%; height:100%; position:relative; }
.jz-cad .jz-w{ position:absolute; font-weight:800; letter-spacing:.02em; }
.jz-cad .deco{ position:absolute; pointer-events:none; opacity:.35; animation:jzDrift 9s ease-in-out infinite alternate; }
@keyframes jzDrift{ 0%{ transform:translate(0,0) rotate(0deg);} 100%{ transform:translate(10px,-14px) rotate(18deg);} }
`;

/* ============ 3. PARTS 注册「星散」 ============ */
const PARTS_OLD = ` {id:'cond',nm:'縦長圧縮'},{id:'title',nm:'タイトル',sp:1},{id:'interlude',nm:'間奏',sp:1}`;
const PARTS_NEW = ` {id:'cond',nm:'縦長圧縮'},{id:'cad',nm:'星散'},{id:'title',nm:'タイトル',sp:1},{id:'interlude',nm:'間奏',sp:1}`;

/* ============ 4. 渲染器（插在 cond 分支后） ============ */
const RENDER_OLD = `  case 'cond':html='<div class="jz-line jz-cond show"><div class="cd">'+_jzSpans(txt)+'</div></div>';break;`;
const RENDER_NEW = `  case 'cond':html='<div class="jz-line jz-cond show"><div class="cd">'+_jzSpans(txt)+'</div></div>';break;
  case 'cad':{
   // cadenza 风：词/字种子散落 + 微旋转 + 漂浮几何；当前词发光交给扫光循环
   var toks=_jzTokens(txt), out='';
   var seedBase=txt.length*7+(idx||0)*13;
   function cr(o){var x=Math.sin(seedBase+o)*10000;return x-Math.floor(x)}
   var glyphs=['◇','✕','△','+','□'];
   for(var d=0;d<4;d++){
    out+='<span class="deco" style="left:'+(8+cr(d+40)*84).toFixed(1)+'%;top:'+(10+cr(d+50)*76).toFixed(1)+'%;font-size:'+(10+cr(d+60)*16).toFixed(0)+'px;animation-delay:'+(d*1.7).toFixed(1)+'s;color:var(--jz-acc)">'+glyphs[Math.floor(cr(d+70)*glyphs.length)]+'</span>';
   }
   toks.forEach(function(c,i){
    var x=6+cr(i*3)*82, y=14+cr(i*3+1)*64, r=(cr(i*3+2)-0.5)*24, s=(22+cr(i*3+4)*22).toFixed(0);
    out+='<span class="jz-w" style="left:'+x.toFixed(1)+'%;top:'+y.toFixed(1)+'%;font-size:'+s+'px;transform:rotate('+r.toFixed(1)+'deg);animation-delay:'+(i*60)+'ms">'+(c===' '?'':c)+'</span>';
   });
   html='<div class="jz-line jz-cad show">'+out+'</div>';break;
  }`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, COVER_OLD, COVER_NEW, `${rel} 封面响应式`);
  html = replaceOnce(html, PARTS_OLD, PARTS_NEW, `${rel} 部件注册`);
  html = replaceOnce(html, RENDER_OLD, RENDER_NEW, `${rel} 星散渲染`);

  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + LAYOUT_CSS + "\n" + html.slice(cssIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 布局修复 + 星散排版 完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
