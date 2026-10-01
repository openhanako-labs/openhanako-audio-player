// JIZURA 歌词模式注入脚本 —— 改 renderPv/pvSync 两处开头 + 注入 CSS/JS
// 用法：node tools/inject-jizura.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. renderPv 分支 ============ */
const RENDER_PV_OLD = `function renderPv(){
    if(!pvTrack) return;`;
const RENDER_PV_NEW = `function renderPv(){
    if(document.body.classList.contains('jizura-mode')){
      window._jizuraLrcData=lrcData;
      if(window.renderJizuraInit)window.renderJizuraInit();
      return;
    }
    if(!pvTrack) return;`;

/* ============ 2. pvSync 分支 ============ */
const PV_SYNC_OLD = `function pvSync(idx){
    if(!pvStage || !_pvLineEls.length || idx===_pvIdx) return;`;
const PV_SYNC_NEW = `function pvSync(idx){
    if(document.body.classList.contains('jizura-mode')){
      if(window.renderJizuraLine)window.renderJizuraLine(idx);
      return;
    }
    if(!pvStage || !_pvLineEls.length || idx===_pvIdx) return;`;

/* ============ 3. CSS（19 排版 + JIZURA 舞台 + 骰子） ============ */
const JIZURA_CSS = `
/* ===== JIZURA 歌词模式 ===== */
body.jizura-mode:not(.view-compact) .pv-stage{ display:flex; }
body.jizura-mode:not(.view-compact) .pv-track{ transform:none !important; }
.jizura-dice{ position:absolute; top:10px; right:12px; z-index:30; width:32px; height:32px; border-radius:50%; border:1px solid var(--jz-acc,#D4AF37); background:rgba(0,0,0,.35); color:var(--jz-acc,#D4AF37); font-size:15px; cursor:pointer; display:grid; place-items:center; transition:transform .4s cubic-bezier(.34,1.56,.64,1); backdrop-filter:blur(4px); }
.jizura-dice:hover{ transform:rotate(120deg) scale(1.1); }
.jizura-dice:active{ transform:rotate(360deg) scale(.92); }
.jizura-tag{ position:absolute; top:10px; left:12px; z-index:30; font-family:monospace; font-size:9px; letter-spacing:.12em; color:var(--jz-fg,#F3E7C4); opacity:.55; }
.jizura-ghost{ position:absolute; font-size:12px; opacity:.25; filter:blur(.6px); letter-spacing:.05em; color:var(--jz-fg,#F3E7C4); }
.jizura-ghost.up{ top:12%; left:50%; transform:translateX(-50%); }
.jizura-ghost.dn{ bottom:12%; left:50%; transform:translateX(-50%); }
.jz-line{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:36px; opacity:0; transition:opacity .45s ease; }
.jz-line.show{ opacity:1; }
.jz-w{ display:inline-block; white-space:pre; animation:jzWin .5s cubic-bezier(.22,1,.36,1) both; }
@keyframes jzWin{ 0%{opacity:0;transform:translateY(.5em)} 100%{opacity:1;transform:none} }
/* 12 基础 */
.jz-center{ flex-direction:column; text-align:center; } .jz-center .cur{ font-size:34px; font-weight:800; letter-spacing:.06em; }
.jz-mix{ text-align:center; line-height:1.15; } .jz-mix .big{ font-size:44px; font-weight:900; } .jz-mix .sm{ font-size:15px; opacity:.65; margin:0 10px; }
.jz-tategaki{ writing-mode:vertical-rl; flex-direction:row; } .jz-tategaki .cur{ font-size:28px; font-weight:700; letter-spacing:.35em; max-height:300px; }
.jz-band{ flex-direction:column; } .jz-band .bandrow{ background:var(--jz-acc); color:var(--jz-bg); font-size:24px; font-weight:800; padding:8px 28px; transform:rotate(-2deg); letter-spacing:.08em; box-shadow:0 4px 24px rgba(0,0,0,.25); }
.jz-tile{ display:grid; grid-template-columns:repeat(3,1fr); gap:4px 14px; align-content:center; justify-items:center; width:100%; } .jz-tile .jz-w{ font-size:26px; font-weight:800; }
.jz-scatter{ width:100%; height:100%; position:relative; } .jz-scatter .jz-w{ position:absolute; font-size:24px; font-weight:700; }
.jz-ring svg{ width:100%; height:100%; }
.jz-wave{ width:100%; display:flex; justify-content:center; align-items:flex-end; gap:2px; } .jz-wave .jz-w{ font-size:30px; font-weight:800; }
.jz-break{ flex-direction:column; text-align:center; } .jz-break .cur{ font-size:52px; font-weight:900; letter-spacing:.02em; transform:scaleX(1.12); } .jz-break .sub2{ font-size:11px; font-family:monospace; letter-spacing:.3em; margin-top:10px; opacity:.6; }
.jz-label{ flex-direction:column; } .jz-label .tagbox{ border:2px solid currentColor; padding:10px 22px; font-size:26px; font-weight:800; letter-spacing:.1em; position:relative; background:var(--jz-bg); }
.jz-label .tagbox::before{ content:'No.'attr(data-n); position:absolute; top:-9px; left:10px; background:var(--jz-acc); color:var(--jz-bg); font-size:9px; font-family:monospace; padding:1px 6px; letter-spacing:.15em; }
.jz-type{ font-family:'Consolas',monospace; font-size:22px; font-weight:700; letter-spacing:.04em; }
.jz-type .caret{ display:inline-block; width:.6em; height:1.1em; background:var(--jz-acc); vertical-align:-0.15em; margin-left:2px; animation:jzBlink 1s steps(1) infinite; }
@keyframes jzBlink{ 50%{opacity:0} }
.jz-caption{ flex-direction:column; justify-content:flex-end; align-items:flex-start; padding:44px; }
.jz-caption .capbar{ background:var(--jz-bg); border:1px solid currentColor; font-size:20px; font-weight:700; padding:8px 18px; box-shadow:4px 4px 0 var(--jz-acc); }
/* 7 补齐 */
.jz-diag{ overflow:hidden; }
.jz-diag .bd{ position:absolute; width:200%; left:-50%; top:50%; background:var(--jz-acc); height:74px; transform:translateY(-50%) rotate(-14deg); opacity:.9; }
.jz-diag .bd2{ height:14px; background:var(--jz-fg); opacity:.15; transform:translateY(-50%) rotate(-14deg) translateY(-92px); }
.jz-diag .dt{ position:relative; z-index:2; color:var(--jz-bg); font-weight:800; font-size:30px; letter-spacing:.1em; transform:rotate(-14deg); }
.jz-circle .disc{ position:absolute; width:230px; height:230px; border-radius:50%; background:radial-gradient(circle at 40% 35%,var(--jz-acc),transparent 140%); box-shadow:0 0 60px color-mix(in srgb,var(--jz-acc) 40%,transparent); }
.jz-circle .ct{ position:relative; z-index:2; color:var(--jz-bg); font-weight:800; font-size:19px; text-align:center; width:170px; line-height:1.4; }
.jz-stack .sk{ font-size:38px; font-weight:900; letter-spacing:.04em; white-space:nowrap; text-shadow:0 6px 0 color-mix(in srgb,var(--jz-fg) 70%,transparent),0 12px 0 color-mix(in srgb,var(--jz-fg) 45%,transparent),0 18px 0 color-mix(in srgb,var(--jz-fg) 25%,transparent),0 24px 0 color-mix(in srgb,var(--jz-fg) 12%,transparent); }
.jz-pill .pd{ position:absolute; width:88px; height:30px; border-radius:20px; border:1.5px solid var(--jz-acc); opacity:.5; }
.jz-pill .pt2{ top:16%; left:50%; margin-left:-44px; } .jz-pill .pb2{ bottom:16%; left:50%; margin-left:-44px; }
.jz-pill .pl{ background:linear-gradient(135deg,var(--jz-acc),color-mix(in srgb,var(--jz-acc) 55%,#000)); color:var(--jz-bg); font-weight:800; font-size:26px; letter-spacing:.08em; padding:14px 34px; border-radius:34px; position:relative; z-index:2; box-shadow:0 6px 30px color-mix(in srgb,var(--jz-acc) 35%,transparent); }
.jz-cond .cd{ font-size:44px; letter-spacing:.14em; transform:scaleX(.48) scaleY(1.22); font-weight:800; white-space:nowrap; text-shadow:0 0 24px color-mix(in srgb,var(--jz-acc) 35%,transparent); }
.jz-title{ flex-direction:column; }
.jz-title .tt{ font-size:64px; font-weight:900; letter-spacing:.22em; color:var(--jz-acc); text-shadow:0 0 40px color-mix(in srgb,var(--jz-acc) 45%,transparent); padding-left:.22em; }
.jz-title .sb{ font-size:12px; letter-spacing:.4em; color:var(--jz-fg); opacity:.6; margin-top:16px; font-family:monospace; }
.jz-inter-c{ flex-direction:column; }
.jz-inter-c .dg{ position:absolute; inset:0; opacity:.3; background-image:radial-gradient(color-mix(in srgb,var(--jz-acc) 45%,transparent) 1.5px,transparent 2px); background-size:26px 26px; }
.jz-inter-c .ct2{ position:relative; z-index:2; font-size:52px; letter-spacing:.1em; font-family:monospace; color:var(--jz-acc); font-weight:700; font-variant-numeric:tabular-nums; }
.jz-inter-r svg{ position:absolute; inset:0; width:100%; height:100%; }
.jz-inter-r circle{ fill:none; stroke:var(--jz-acc); stroke-width:.8; transform-origin:center; transform-box:fill-box; animation:jzBr 3.2s ease-in-out infinite; }
.jz-inter-r circle:nth-child(2){ animation-delay:.7s; } .jz-inter-r circle:nth-child(3){ animation-delay:1.4s; } .jz-inter-r circle:nth-child(4){ animation-delay:2.1s; }
@keyframes jzBr{ 0%,100%{transform:scale(.85);opacity:.12} 50%{transform:scale(1.1);opacity:.7} }
.jz-inter-r .nt{ position:relative; z-index:2; font-size:34px; color:var(--jz-acc); }
`;

/* ============ 4. JS（19 排版引擎 + 骰子 + 行切换） ============ */
const JIZURA_JS = `
<script>
/* ===== JIZURA 歌词模式 ===== */
(function(){
'use strict';
var JZ_STYLES=[
 {id:'gold',nm:'金夜',bg:'#0A0907',fg:'#F3E7C4',sub:'#B39A62',acc:'#D4AF37'},
 {id:'ocean',nm:'深海',bg:'#031A2E',fg:'#E4FAFF',sub:'#7FB2C8',acc:'#1FD2E6'},
 {id:'sakura',nm:'夜樱',bg:'#26091B',fg:'#FCE8F0',sub:'#D69DB6',acc:'#FF86B0'},
 {id:'vapor',nm:'蒸汽',bg:'#3A2A6E',fg:'#FFFFFF',sub:'#D6C8FF',acc:'#FF8FD8'},
 {id:'synth80',nm:'合成80s',bg:'#0B0414',fg:'#FF4FD8',sub:'#A98BFF',acc:'#22E6FF'},
 {id:'newsprint',nm:'新闻',bg:'#E6E5E0',fg:'#111111',sub:'#4E4E4C',acc:'#D8141B',light:1},
 {id:'kraft',nm:'牛皮纸',bg:'#C49A6C',fg:'#1A1410',sub:'#46301E',acc:'#B8361B',light:1},
 {id:'sumi',nm:'墨与朱',bg:'#EFE5CF',fg:'#16130F',sub:'#5E574C',acc:'#B83A22',light:1}
];
var JZ_PARTS=[
 {id:'center',nm:'中央'},{id:'mix',nm:'大小ミックス'},{id:'tategaki',nm:'縦書き'},{id:'band',nm:'流れる帯'},
 {id:'tile',nm:'敷き詰め'},{id:'scatter',nm:'散らし'},{id:'ring',nm:'円環'},{id:'wave',nm:'波の軌跡'},
 {id:'break',nm:'画面突き抜け'},{id:'label',nm:'ラベル貼り'},{id:'type',nm:'タイプ'},{id:'caption',nm:'注釈'},
 {id:'diag',nm:'斜め帯'},{id:'circle',nm:'円窓'},{id:'stack',nm:'残像スタック'},{id:'pill',nm:'カプセル'},
 {id:'cond',nm:'縦長圧縮'},{id:'title',nm:'タイトル',sp:1},{id:'interlude',nm:'間奏',sp:1}
];
var _jzSeed=Math.floor(Math.random()*1e9),_jzLastLayout='',_jzLastIdx=-1,_jzStyle=JZ_STYLES[0];
function _jzR(a){_jzSeed=(_jzSeed*1664525+1013904223)>>>0;return(_jzSeed/4294967296)*a}
function _jzPick(a){return a[Math.floor(_jzR(a.length))]}
function _jzFits(p,txt){var n=[...txt].length;
 if(p==='tategaki'||p==='ring')return n>=3&&n<=16;
 if(p==='tile')return n>=6;
 if(p==='band'||p==='break')return n<=20;
 if(p==='diag'||p==='pill')return n<=14;
 if(p==='circle'||p==='cond')return n<=10;
 if(p==='stack')return n<=12;
 return true}
function _jzSpans(txt){return[...txt].map(function(c,i){return'<span class="jz-w" style="animation-delay:'+(i*45)+'ms">'+c+'</span>'}).join('')}
function _jzApplyStyle(s){
 _jzStyle=s;
 var st=document.getElementById('pvStage');
 if(!st)return;
 st.style.setProperty('--jz-bg',s.bg);st.style.setProperty('--jz-fg',s.fg);st.style.setProperty('--jz-acc',s.acc);
 st.style.background=s.bg;st.style.color=s.fg;
}
function _jzRender(txt,idx){
 var pvTrack=document.getElementById('pvTrack');
 if(!pvTrack)return;
 var pool=JZ_PARTS.filter(function(x){return !x.sp&&_jzFits(x.id,txt)});
 var p=_jzPick(pool);if(pool.length>1){var g=0;while(p.id===_jzLastLayout&&g++<8)p=_jzPick(pool)}
 _jzLastLayout=p.id;
 var tag=document.querySelector('.jizura-tag');
 if(tag)tag.textContent='LAYOUT · '+p.nm;
 var html='';
 switch(p.id){
  case 'center':html='<div class="jz-line jz-center show"><div class="cur">'+_jzSpans(txt)+'</div></div>';break;
  case 'mix':var out='';[...txt].forEach(function(c,i){out+='<span class="jz-w '+(i%3===1?'sm':'big')+'" style="animation-delay:'+(i*50)+'ms">'+c+'</span>'});html='<div class="jz-line jz-mix show"><div>'+out+'</div></div>';break;
  case 'tategaki':html='<div class="jz-line jz-tategaki show"><div class="cur">'+_jzSpans(txt)+'</div></div>';break;
  case 'band':html='<div class="jz-line jz-band show"><div class="bandrow">'+_jzSpans(txt)+'</div></div>';break;
  case 'tile':var out='';[...txt].forEach(function(c,i){out+='<span class="jz-w" style="animation-delay:'+(i*35)+'ms;font-size:'+(20+((i*7)%3)*8)+'px">'+c+'</span>'});html='<div class="jz-line jz-tile show">'+out+'</div>';break;
  case 'scatter':var out='';[...txt].forEach(function(c,i){var x=8+_jzR(78),y=12+_jzR(70),r=(_jzR(30)-15).toFixed(0),s=(18+_jzR(22)).toFixed(0);out+='<span class="jz-w" style="left:'+x+'%;top:'+y+'%;font-size:'+s+'px;transform:rotate('+r+'deg);animation-delay:'+(i*55)+'ms">'+c+'</span>'});html='<div class="jz-line jz-scatter show">'+out+'</div>';break;
  case 'ring':var ch=[...txt],Rr=130,t='';ch.forEach(function(c,i){var a=(i/ch.length)*Math.PI*2-Math.PI/2;var x=(200+Math.cos(a)*Rr).toFixed(1),y=(150+Math.sin(a)*Rr).toFixed(1),rot=(a*180/Math.PI+90).toFixed(0);t+='<text x="'+x+'" y="'+y+'" fill="var(--jz-fg)" font-size="30" font-weight="800" text-anchor="middle" transform="rotate('+rot+' '+x+' '+y+')"><animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="'+(i*0.05)+'s" fill="freeze"/>'+c+'</text>'});html='<div class="jz-line jz-ring show"><svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">'+t+'<circle cx="200" cy="150" r="4" fill="var(--jz-acc)"/></svg></div>';break;
  case 'wave':var out='';[...txt].forEach(function(c,i){var dy=Math.sin(i/1.6)*26;out+='<span class="jz-w" style="transform:translateY('+dy.toFixed(0)+'px);animation-delay:'+(i*45)+'ms">'+c+'</span>'});html='<div class="jz-line jz-wave show">'+out+'</div>';break;
  case 'break':html='<div class="jz-line jz-break show"><div class="cur">'+_jzSpans(txt)+'</div><div class="sub2">TRACK '+String((idx||0)+1).padStart(2,'0')+' — PUNCH THROUGH</div></div>';break;
  case 'label':html='<div class="jz-line jz-label show"><div class="tagbox" data-n="'+String((idx||0)+1).padStart(2,'0')+'">'+_jzSpans(txt)+'</div></div>';break;
  case 'type':html='<div class="jz-line jz-type show"><div>&gt; '+_jzSpans(txt)+'<span class="caret"></span></div></div>';break;
  case 'caption':html='<div class="jz-line jz-caption show"><div class="capbar">'+_jzSpans(txt)+'</div></div>';break;
  case 'diag':html='<div class="jz-line jz-diag show"><div class="bd"></div><div class="bd bd2"></div><div class="dt">'+_jzSpans(txt)+'</div></div>';break;
  case 'circle':html='<div class="jz-line jz-circle show"><div class="disc"></div><div class="ct">'+_jzSpans(txt)+'</div></div>';break;
  case 'stack':html='<div class="jz-line jz-stack show"><div class="sk">'+_jzSpans(txt)+'</div></div>';break;
  case 'pill':html='<div class="jz-line jz-pill show"><div class="pd pt2"></div><div class="pd pb2"></div><div class="pl">'+_jzSpans(txt)+'</div></div>';break;
  case 'cond':html='<div class="jz-line jz-cond show"><div class="cd">'+_jzSpans(txt)+'</div></div>';break;
 }
 pvTrack.innerHTML=html;
 /* 前后行 ghost */
 var lrc=window._jizuraLrcData||[];
 var gUp=document.querySelector('.jizura-ghost.up'),gDn=document.querySelector('.jizura-ghost.dn');
 if(gUp)gUp.textContent=(idx>0&&lrc[idx-1])?lrc[idx-1].text:'';
 if(gDn)gDn.textContent=(idx<lrc.length-1&&lrc[idx+1])?lrc[idx+1].text:'';
}
/* 对外接口 */
window.renderJizuraInit=function(){
 var pvStage=document.getElementById('pvStage');
 if(!pvStage)return;
 _jzApplyStyle(_jzStyle);
 /* 注入骰子和标签（只注一次） */
 if(!pvStage.querySelector('.jizura-dice')){
  var dice=document.createElement('button');
  dice.className='jizura-dice';dice.textContent='🎲';dice.title='おまかせ（R）';
  dice.onclick=function(e){e.stopPropagation();_jzOmakase()};
  pvStage.appendChild(dice);
  var tag=document.createElement('div');
  tag.className='jizura-tag';tag.textContent='LAYOUT · —';
  pvStage.appendChild(tag);
  var gUp=document.createElement('div');gUp.className='jizura-ghost up';pvStage.appendChild(gUp);
  var gDn=document.createElement('div');gDn.className='jizura-ghost dn';pvStage.appendChild(gDn);
 }
 var lrc=window._jizuraLrcData||[];
 if(!lrc.length){
  var pvTrack=document.getElementById('pvTrack');
  if(pvTrack)pvTrack.innerHTML='<div class="jz-line jz-center show"><div class="cur" style="opacity:.4">暂无歌词</div></div>';
  return;
 }
 _jzLastIdx=-1;
};
window.renderJizuraLine=function(idx){
 if(idx===_jzLastIdx)return;
 _jzLastIdx=idx;
 var lrc=window._jizuraLrcData||[];
 if(!lrc.length||idx<0||idx>=lrc.length)return;
 _jzRender(lrc[idx].text,idx);
};
function _jzOmakase(){
 _jzSeed=Math.floor(Math.random()*1e9);
 var s=_jzPick(JZ_STYLES),g=0;while(s.id===_jzStyle.id&&g++<6)s=_jzPick(JZ_STYLES);
 _jzApplyStyle(s);
 /* 强制重渲染当前行 */
 var lrc=window._jizuraLrcData||[];
 if(lrc.length&&_jzLastIdx>=0&&_jzLastIdx<lrc.length){
  var idx=_jzLastIdx;
  _jzLastIdx=-1;
  _jzRender(lrc[idx].text,idx);
  _jzLastIdx=idx;
 }
}
/* R 键 */
document.addEventListener('keydown',function(e){
 if(!document.body.classList.contains('jizura-mode'))return;
 if(e.key==='r'||e.key==='R')_jzOmakase();
});
/* JIZURA 开关：双击 PV 舞台切换 */
document.addEventListener('dblclick',function(e){
 var pvStage=document.getElementById('pvStage');
 if(!pvStage||!pvStage.contains(e.target))return;
 if(!document.body.classList.contains('lyrics-mode'))return;
 document.body.classList.toggle('jizura-mode');
 if(document.body.classList.contains('jizura-mode')){
  window.renderJizuraInit();
 }else{
  /* 退出 JIZURA：触发一次 renderPv 恢复 folia */
  var evt=new Event('jizura-exit');
  document.dispatchEvent(evt);
 }
});
})();
</`+`script>
`;

/* ============ 注入逻辑 ============ */
function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, RENDER_PV_OLD, RENDER_PV_NEW, `${rel} renderPv`);
  html = replaceOnce(html, PV_SYNC_OLD, PV_SYNC_NEW, `${rel} pvSync`);

  // CSS：插到最后一个 </style> 前
  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + JIZURA_CSS + "\n" + html.slice(cssIdx);

  // JS：插到 </body> 前
  const jsIdx = html.lastIndexOf("</body>");
  if (jsIdx < 0) throw new Error(`${rel}: 找不到 </body>`);
  html = html.slice(0, jsIdx) + JIZURA_JS + "\n" + html.slice(jsIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 注入完成（renderPv + pvSync + CSS + JS）`);
}

console.log("两文件已同步。接下来跑 node tools/bump-build.mjs");
