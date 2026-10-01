// JIZURA UI 集成：lyricModeBtn 三档循环（标准→PV→歌词）+ PV 舞台上加骰子和风格条
// 用法：node tools/inject-jizura-ui.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. lyricModeBtn 三档循环 ============ */
const BTN_OLD = `    btn.addEventListener('click',function(){
      var on=!document.body.classList.contains('lyrics-mode');
      if(on) openPanel();
      apply(on);
    });`;

const BTN_NEW = `    btn.addEventListener('click',function(){
      // 三档循环：标准 → PV(lyrics-mode) → 歌词(jizura-mode) → 标准
      var hasLyr=document.body.classList.contains('lyrics-mode');
      var hasJiz=document.body.classList.contains('jizura-mode');
      if(!hasLyr){
        // 标准 → PV
        openPanel();
        apply(true);
      }else if(hasLyr && !hasJiz){
        // PV → 歌词
        document.body.classList.add('jizura-mode');
        btn.style.color='var(--accent)';
        btn.title='退出歌词模式';
        if(window.renderJizuraInit)window.renderJizuraInit();
      }else{
        // 歌词 → 标准
        document.body.classList.remove('jizura-mode');
        apply(false);
      }
      updateBtnIcon();
    });
    function updateBtnIcon(){
      var hasLyr=document.body.classList.contains('lyrics-mode');
      var hasJiz=document.body.classList.contains('jizura-mode');
      if(hasJiz){
        btn.style.color='var(--accent)';
        btn.title='歌词模式（JIZURA）— 点击退出';
      }else if(hasLyr){
        btn.style.color='var(--accent)';
        btn.title='PV 模式 — 点击进歌词模式';
      }else{
        btn.style.color='';
        btn.title='歌词模式';
      }
    }`;

/* ============ 2. JIZURA 模式开启时注入骰子和风格条到 PV 舞台 ============ */
const JIZURA_UI_JS = `
<script>
/* ===== JIZURA UI：骰子 + 风格条 ===== */
(function(){
'use strict';
var JZ_STYLES_REF=[
 {id:'gold',nm:'金夜',bg:'#0A0907',fg:'#F3E7C4',sub:'#B39A62',acc:'#D4AF37'},
 {id:'ocean',nm:'深海',bg:'#031A2E',fg:'#E4FAFF',sub:'#7FB2C8',acc:'#1FD2E6'},
 {id:'sakura',nm:'夜樱',bg:'#26091B',fg:'#FCE8F0',sub:'#D69DB6',acc:'#FF86B0'},
 {id:'vapor',nm:'蒸汽',bg:'#3A2A6E',fg:'#FFFFFF',sub:'#D6C8FF',acc:'#FF8FD8'},
 {id:'synth80',nm:'合成80s',bg:'#0B0414',fg:'#FF4FD8',sub:'#A98BFF',acc:'#22E6FF'},
 {id:'newsprint',nm:'新闻',bg:'#E6E5E0',fg:'#111111',sub:'#4E4E4C',acc:'#D8141B',light:1},
 {id:'kraft',nm:'牛皮纸',bg:'#C49A6C',fg:'#1A1410',sub:'#46301E',acc:'#B8361B',light:1},
 {id:'sumi',nm:'墨与朱',bg:'#EFE5CF',fg:'#16130F',sub:'#5E574C',acc:'#B83A22',light:1}
];
var _jzStyleBarInjected=false;
function _jzInjectStyleBar(){
 if(_jzStyleBarInjected)return;
 var pvStage=document.getElementById('pvStage');
 if(!pvStage)return;
 /* 风格条：底部居中一排小圆点 */
 var bar=document.createElement('div');
 bar.className='jizura-style-bar';
 bar.style.cssText='position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:30;display:flex;gap:6px;padding:6px 10px;background:rgba(0,0,0,.35);border-radius:16px;backdrop-filter:blur(4px)';
 JZ_STYLES_REF.forEach(function(s){
  var dot=document.createElement('div');
  dot.style.cssText='width:14px;height:14px;border-radius:50%;cursor:pointer;border:1.5px solid '+s.acc+';background:linear-gradient(135deg,'+s.bg+' 45%,'+s.acc+');transition:transform .15s';
  dot.title=s.nm;
  dot.onclick=function(e){
   e.stopPropagation();
   if(window._jzApplyStyle)window._jzApplyStyle(s);
  };
  dot.onmouseenter=function(){dot.style.transform='scale(1.3)'};
  dot.onmouseleave=function(){dot.style.transform=''};
  bar.appendChild(dot);
 });
 pvStage.appendChild(bar);
 _jzStyleBarInjected=true;
}
/* 监听 jizura-mode 类变化，开启时注入 */
var _jzObserver=new MutationObserver(function(){
 if(document.body.classList.contains('jizura-mode')){
  _jzInjectStyleBar();
 }
});
_jzObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
})();
</`+`script>
`;

/* ============ 3. 把 _jzApplyStyle 暴露到 window（让风格条能调） ============ */
const EXPOSE_OLD = `function _jzApplyStyle(s){
 _jzStyle=s;`;
const EXPOSE_NEW = `window._jzApplyStyle=function _jzApplyStyle(s){
 _jzStyle=s;`;

/* ============ 注入逻辑 ============ */
function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, BTN_OLD, BTN_NEW, `${rel} lyricModeBtn 三档`);
  html = replaceOnce(html, EXPOSE_OLD, EXPOSE_NEW, `${rel} 暴露 _jzApplyStyle`);

  // JS：插到 </body> 前
  const jsIdx = html.lastIndexOf("</body>");
  if (jsIdx < 0) throw new Error(`${rel}: 找不到 </body>`);
  html = html.slice(0, jsIdx) + JIZURA_UI_JS + "\n" + html.slice(jsIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: JIZURA UI 注入完成（三档按钮 + 风格条 + 暴露接口）`);
}

console.log("两文件已同步。接下来跑 node tools/bump-build.mjs");
