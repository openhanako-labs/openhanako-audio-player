// 主 UI 对齐设计稿：金夜主题预设 + 顶栏三模式胶囊 + 左栏纵排居中大封面 + 分组双排 label + 行内组胶囊
// 用法：node tools/inject-main-ui.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ A. PRESETS 加金夜（插在暖褐前，成为第一套） ============ */
const PRESET_OLD = `    { id: "amber", name: "暖褐",`;
const PRESET_NEW = `    { id: "goldnight", name: "金夜", mode: "dark",
      colors: { primary: "#D4AF37", secondary: "#B39A62", accent: "#F3E7C4" },
      background: { kind: "gradient", from: "#0A0907", to: "#17130C", angle: 160 },
      animation: { speed: 1, glowIntensity: 0.25, pulse: 0.1 } },
    { id: "amber", name: "暖褐",`;

/* ============ B. 标题改 HANA PLAYER ============ */
const TITLE_OLD = `<span class="header-title">播放器</span>`;
const TITLE_NEW = `<span class="header-title">HANA PLAYER</span>`;

/* ============ C. 布局 CSS（</style> 前） ============ */
const MAIN_CSS = `
/* ===== 主 UI 对齐设计稿 ===== */
/* 顶栏三模式胶囊 */
.mode-caps { display:flex; border:1px solid var(--accent); border-radius:20px; overflow:hidden; margin-left:auto; margin-right:8px; }
.mode-caps .mc { padding:4px 14px; font-size:11px; cursor:pointer; user-select:none; opacity:.55; transition:all .2s; color:var(--text); background:transparent; border:none; font-family:inherit; }
.mode-caps .mc + .mc { border-left:1px solid var(--accent); }
.mode-caps .mc.on { opacity:1; font-weight:700; background:var(--accent); color:var(--card-bg); }
/* 原歌词模式图标按钮由胶囊接管 */
body:not(.view-compact) #lyricModeBtn { display:none; }
/* 左栏纵排居中（设计稿唱盘机） */
body:not(.view-compact) .now-playing-section { display:flex; flex-direction:column; align-items:center; text-align:center; }
body:not(.view-compact) .np-cover { order:1; width:180px !important; height:180px !important; margin:14px 0 12px !important; font-size:56px !important; flex-shrink:0; }
body:not(.view-compact) .np-info { order:2; display:flex; flex-direction:column; align-items:center; }
body:not(.view-compact) .np-actions { justify-content:center; }
body:not(.view-compact) .lyrics-section { order:3; width:100%; }
body:not(.view-compact) .pv-stage { order:4; }
/* 分组双排：来源一排、自建一排 */
.group-selector { flex-wrap:wrap; row-gap:6px; align-items:center; }
.gs-label { font-size:9px; font-family:monospace; color:var(--text-faint); letter-spacing:.1em; margin-right:2px; }
.gs-break { flex-basis:100%; height:0; }
/* 行内组胶囊 */
.jz-gpill { font-size:8.5px; font-family:monospace; padding:1px 6px; border:1px solid var(--border); border-radius:3px; color:var(--text-faint); flex-shrink:0; }
`;

/* ============ D. JS（</body> 前）：胶囊 + 分组 label + 行胶囊 + 默认金夜 ============ */
const MAIN_JS = `
<script>
/* ===== 主 UI 对齐 ===== */
(function(){
'use strict';
/* D1. 首次注入后默认金夜主题（只设一次，之后用户自选） */
try{
  if(!localStorage.getItem('hana_audio_mainui_v1')){
    localStorage.setItem('hana_audio_mainui_v1','1');
    localStorage.setItem('hana_audio_theme_preset','goldnight');
    location.reload();
    return;
  }
}catch(e){}
/* D2. 顶栏三模式胶囊 */
function curMode(){ return document.body.classList.contains('jizura-mode')?2:(document.body.classList.contains('lyrics-mode')?1:0); }
function setMode(m){
  var btn=document.getElementById('lyricModeBtn');
  if(!btn)return;
  var guard=0;
  while(curMode()!==m&&guard++<5){ btn.click(); }
}
var header=document.querySelector('.header');
var actions=document.querySelector('.header-actions');
if(header&&actions&&!document.getElementById('modeCaps')){
  var caps=document.createElement('div');
  caps.className='mode-caps';caps.id='modeCaps';
  [['标准',0],['PV',1],['歌词',2]].forEach(function(it){
    var b=document.createElement('button');
    b.className='mc';b.textContent=it[0];b.dataset.m=it[1];
    b.onclick=function(){setMode(it[1]);syncCaps();};
    caps.appendChild(b);
  });
  header.insertBefore(caps,actions);
  window.syncCaps=function(){
    var m=curMode();
    caps.querySelectorAll('.mc').forEach(function(x){x.classList.toggle('on',+x.dataset.m===m)});
  };
  var mo=new MutationObserver(syncCaps);
  mo.observe(document.body,{attributes:true,attributeFilter:['class']});
  syncCaps();
}
/* D3. 分组双排 label */
var gs=document.querySelector('.group-selector');
var addBtn=document.getElementById('groupAddBtn');
if(gs&&addBtn&&!gs.querySelector('.gs-label')){
  var l1=document.createElement('span');l1.className='gs-label';l1.textContent='来源';
  gs.insertBefore(l1,gs.firstChild);
  var br=document.createElement('div');br.className='gs-break';
  var l2=document.createElement('span');l2.className='gs-label';l2.textContent='自建';
  gs.insertBefore(br,addBtn);
  gs.insertBefore(l2,addBtn);
}
/* D4. 行内组胶囊：包装 renderPL 后处理 */
function injectPills(){
  var plBody=document.getElementById('plBody');
  if(!plBody)return;
  plBody.querySelectorAll('.pl-group-body').forEach(function(body){
    var g=body.dataset.group||'';
    if(!g)return;
    body.querySelectorAll('.pl-item').forEach(function(item){
      if(item.querySelector('.jz-gpill'))return;
      var name=item.querySelector('.pl-name');
      if(!name)return;
      var pill=document.createElement('span');
      pill.className='jz-gpill';pill.textContent=g;
      name.after(pill);
    });
  });
}
if(typeof window.renderPL==='function'&&!window.renderPL._pillWrapped){
  var _r=window.renderPL;
  window.renderPL=function(){ _r.apply(this,arguments); injectPills(); };
  window.renderPL._pillWrapped=1;
}
injectPills();
})();
</`+`script>
`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, PRESET_OLD, PRESET_NEW, `${rel} 金夜预设`);
  html = replaceOnce(html, TITLE_OLD, TITLE_NEW, `${rel} 标题`);

  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + MAIN_CSS + "\n" + html.slice(cssIdx);

  const jsIdx = html.lastIndexOf("</body>");
  if (jsIdx < 0) throw new Error(`${rel}: 找不到 </body>`);
  html = html.slice(0, jsIdx) + MAIN_JS + "\n" + html.slice(jsIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 主 UI 对齐注入完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
