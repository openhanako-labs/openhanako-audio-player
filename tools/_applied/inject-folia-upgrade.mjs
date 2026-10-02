// folia 化升级：JIZURA 逐字扫光 + 拉丁按词 + 歌词模式加大加亮 + 暗夜主题 + 删明暗切换按钮
// 用法：node tools/inject-folia-upgrade.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ A1. 拉丁按词切 token（_jzSpans 升级） ============ */
const SPANS_OLD = `function _jzSpans(txt){return[...txt].map(function(c,i){return'<span class="jz-w" style="animation-delay:'+(i*45)+'ms">'+c+'</span>'}).join('')}`;
const SPANS_NEW = `function _jzTokens(txt){
 if(/[a-zA-Z]{2,}/.test(txt)){
  // 拉丁文按词切（保留空格不断词），中日韩逐字
  return txt.split(/(\\s+)/).filter(function(s){return s.length});
 }
 return [...txt];
}
function _jzSpans(txt){return _jzTokens(txt).map(function(c,i){return'<span class="jz-w" style="animation-delay:'+(i*45)+'ms">'+(c===' '?'\\u00A0':c)+'</span>'}).join('')}`;

/* ============ A2. 五处内联 [...txt] 换 _jzTokens ============ */
const TOKEN_SWAPS = [
  // mix
  [`case 'mix':var out='';[...txt].forEach(function(c,i){out+='<span class="jz-w '+(i%3===1?'sm':'big')+'" style="animation-delay:'+(i*50)+'ms">'+c+'</span>'});`,
   `case 'mix':var out='';_jzTokens(txt).forEach(function(c,i){out+='<span class="jz-w '+(i%3===1?'sm':'big')+'" style="animation-delay:'+(i*50)+'ms">'+(c===' '?'\\u00A0':c)+'</span>'});`],
  // tile
  [`case 'tile':var out='';[...txt].forEach(function(c,i){out+='<span class="jz-w" style="animation-delay:'+(i*35)+'ms;font-size:'+(20+((i*7)%3)*8)+'px">'+c+'</span>'});`,
   `case 'tile':var out='';_jzTokens(txt).forEach(function(c,i){out+='<span class="jz-w" style="animation-delay:'+(i*35)+'ms;font-size:'+(20+((i*7)%3)*8)+'px">'+(c===' '?'\\u00A0':c)+'</span>'});`],
  // scatter
  [`case 'scatter':var out='';[...txt].forEach(function(c,i){var x=8+_jzR(78),y=12+_jzR(70),r=(_jzR(30)-15).toFixed(0),s=(18+_jzR(22)).toFixed(0);out+='<span class="jz-w" style="left:'+x+'%;top:'+y+'%;font-size:'+s+'px;transform:rotate('+r+'deg);animation-delay:'+(i*55)+'ms">'+c+'</span>'});`,
   `case 'scatter':var out='';_jzTokens(txt).forEach(function(c,i){var x=8+_jzR(78),y=12+_jzR(70),r=(_jzR(30)-15).toFixed(0),s=(18+_jzR(22)).toFixed(0);out+='<span class="jz-w" style="left:'+x+'%;top:'+y+'%;font-size:'+s+'px;transform:rotate('+r+'deg);animation-delay:'+(i*55)+'ms">'+(c===' '?'\\u00A0':c)+'</span>'});`],
  // wave
  [`case 'wave':var out='';[...txt].forEach(function(c,i){var dy=Math.sin(i/1.6)*26;out+='<span class="jz-w" style="transform:translateY('+dy.toFixed(0)+'px);animation-delay:'+(i*45)+'ms">'+c+'</span>'});`,
   `case 'wave':var out='';_jzTokens(txt).forEach(function(c,i){var dy=Math.sin(i/1.6)*26;out+='<span class="jz-w" style="transform:translateY('+dy.toFixed(0)+'px);animation-delay:'+(i*45)+'ms">'+(c===' '?'\\u00A0':c)+'</span>'});`],
  // ring（円環逐字旋转保留逐字——英文沿圆周也成立，但空格要去掉）
  [`case 'ring':var ch=[...txt],Rr=130,t='';`,
   `case 'ring':var ch=_jzTokens(txt).filter(function(s){return s!==' '}),Rr=130,t='';`],
];

/* ============ A3. renderJizuraLine 存扫光数据 + rAF 扫光循环 ============ */
const LINE_OLD = `window.renderJizuraLine=function(idx){
 if(idx===_jzLastIdx)return;
 _jzLastIdx=idx;
 var lrc=window._jizuraLrcData||[];
 if(!lrc.length||idx<0||idx>=lrc.length)return;
 _jzRender(lrc[idx].text,idx);
};`;
const LINE_NEW = `window.renderJizuraLine=function(idx){
 if(idx===_jzLastIdx)return;
 _jzLastIdx=idx;
 var lrc=window._jizuraLrcData||[];
 if(!lrc.length||idx<0||idx>=lrc.length)return;
 var line=lrc[idx];
 _jzRender(line.text,idx);
 // folia 扫光数据：逐字时序（TTML）或行起止均分（LRC）
 var toks=_jzTokens(line.text), offs=[], acc=0;
 toks.forEach(function(tk){offs.push(acc);acc+=tk===' '?1:[...tk].length});
 var total=Math.max(1,acc);
 window._jzKaraoke={words:line.words||null,t0:line.time||0,t1:line.end||((lrc[idx+1]&&lrc[idx+1].time)||(line.time||0)+4000),offs:offs,lens:toks.map(function(tk){return tk===' '?1:[...tk].length}),total:total};
};
/* folia 式逐字扫光循环（MonetGlow 包络：smoothstep 升起→驻留→衰减） */
(function _jzKaraokeTick(){
 requestAnimationFrame(_jzKaraokeTick);
 if(!document.body.classList.contains('jizura-mode'))return;
 var k=window._jzKaraoke, pvTrack=document.getElementById('pvTrack'), audio=document.querySelector('audio');
 if(!k||!pvTrack||!audio)return;
 var els=pvTrack.querySelectorAll('.jz-w');
 if(!els.length)return;
 var now=audio.currentTime*1000;
 var t0=k.t0, t1=Math.max(k.t1,t0+800);
 if(k.words&&k.words.length){
  t0=k.words[0].time;
  t1=k.words[k.words.length-1].time+k.words[k.words.length-1].dur;
 }
 var span=Math.max(1,t1-t0);
 for(var i=0;i<els.length;i++){
  var w0=t0+span*(k.offs[i]/k.total), w1=t0+span*((k.offs[i]+k.lens[i])/k.total);
  var el=els[i];
  if(now<w0){ el.style.color='color-mix(in srgb,var(--jz-fg) 38%,transparent)'; el.style.textShadow='none'; }
  else if(now>w1){ el.style.color=''; el.style.textShadow='none'; }
  else{
   var p=(now-w0)/Math.max(1,w1-w0);
   var glow=p*p*(3-2*p);
   el.style.color='var(--jz-acc)';
   el.style.textShadow='0 0 '+(6+16*glow).toFixed(1)+'px var(--jz-acc), 0 0 '+(2+5*glow).toFixed(1)+'px var(--jz-fg)';
  }
 }
})();`;

/* ============ B. 歌词模式（folia 滚动）加大加亮 ============ */
const PVLINE_OLD = `.pv-line {
    padding: .5em 10%;
    font-size: 15px; line-height: 1.6;
    color: var(--text-dim);
    opacity: .16; filter: blur(2.6px);`;
const PVLINE_NEW = `.pv-line {
    padding: .45em 8%;
    font-size: 24px; line-height: 1.55;
    color: var(--text-dim);
    opacity: .3; filter: blur(1.1px);`;

/* ============ C. 暗夜主题（插在暖褐前） ============ */
const PRESET_OLD2 = `    { id: "amber", name: "暖褐",`;
const PRESET_NEW2 = `    { id: "pitchblack", name: "暗夜", mode: "dark",
      colors: { primary: "#E8E8EC", secondary: "#8E8E96", accent: "#FFFFFF" },
      background: { kind: "solid", color: "#050505",
        light: { kind: "solid", color: "#F4F4F6" } },
      animation: { speed: 1, glowIntensity: 0.15, pulse: 0 } },
    { id: "amber", name: "暖褐",`;

/* ============ D. 删掉明暗切换按钮（用户要求） ============ */
const CSS_EXTRA = `
/* 明暗切换按钮下线（主题由配色面板统一管理） */
#themeBtn { display:none !important; }
`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, SPANS_OLD, SPANS_NEW, `${rel} spans`);
  for (let i = 0; i < TOKEN_SWAPS.length; i++) {
    html = replaceOnce(html, TOKEN_SWAPS[i][0], TOKEN_SWAPS[i][1], `${rel} token${i}`);
  }
  html = replaceOnce(html, LINE_OLD, LINE_NEW, `${rel} 扫光`);
  html = replaceOnce(html, PVLINE_OLD, PVLINE_NEW, `${rel} pv-line`);
  html = replaceOnce(html, PRESET_OLD2, PRESET_NEW2, `${rel} 暗夜`);

  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + CSS_EXTRA + "\n" + html.slice(cssIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: folia 化升级完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
