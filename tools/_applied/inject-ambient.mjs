// PV 氛围升级：封面取色背景 + 全局粒子层 + 前后行参与排版（pill 胶囊放前后行 + 新布局「連行」）
// 用法：node tools/inject-ambient.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. 主 IIFE：铺 pvBg 时顺手存封面 URL 到 window（供取色） ============ */
const COVER_OLD = `    try{
      var bg=document.getElementById('pvBg');
      if(bg) bg.style.backgroundImage=t.pic?('url("'+String(t.pic).replace(/"/g,'')+'")'):'';
    }catch(e){}`;
const COVER_NEW = `    try{
      var bg=document.getElementById('pvBg');
      if(bg) bg.style.backgroundImage=t.pic?('url("'+String(t.pic).replace(/"/g,'')+'")'):'';
      window._jzCover=t.pic||'';
    }catch(e){}`;

/* ============ 2. CSS：粒子层 + ghost 清晰化 ============ */
const AMBIENT_CSS = `
/* ===== JIZURA 氛围层 ===== */
.jz-particles{ position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:1; }
.jz-particles i{ position:absolute; border-radius:50%; background:var(--jz-acc); opacity:0; animation:jzFloat linear infinite; }
.jz-particles i.sq{ border-radius:1px; background:none; border:1px solid var(--jz-acc); }
@keyframes jzFloat{ 0%{ transform:translateY(30px) rotate(0deg); opacity:0 } 15%{ opacity:.28 } 80%{ opacity:.22 } 100%{ transform:translateY(-70px) rotate(160deg); opacity:0 } }
/* 前后行 ghost 清晰化（参与排版，不再只是模糊影子） */
.jizura-ghost{ opacity:.5; filter:none; font-size:13px; }
/* 連行布局 */
.jz-ren{ flex-direction:column; gap:14px; text-align:center; }
.jz-ren .prev,.jz-ren .next{ font-size:15px; opacity:.5; letter-spacing:.06em; }
.jz-ren .cur{ font-size:34px; font-weight:800; letter-spacing:.05em; }
.jz-ren .rule{ width:56px; height:2px; background:var(--jz-acc); margin:2px auto; opacity:.7; }
/* pill 装饰胶囊里的小字 */
.jz-pill .pd{ display:flex; align-items:center; justify-content:center; font-size:9px; color:var(--jz-fg); opacity:.65; width:auto; min-width:88px; padding:0 12px; white-space:nowrap; }
`;

/* ============ 3. PARTS 注册「連行」 ============ */
const PARTS_OLD = `{id:'cad',nm:'星散'},{id:'title',nm:'タイトル',sp:1}`;
const PARTS_NEW = `{id:'cad',nm:'星散'},{id:'ren',nm:'連行'},{id:'title',nm:'タイトル',sp:1}`;

/* ============ 4. pill 装饰胶囊放前后行 + 新布局連行（渲染器） ============ */
const PILL_OLD = `  case 'pill':html='<div class="jz-line jz-pill show"><div class="pd pt2"></div><div class="pd pb2"></div><div class="pl">'+_jzSpans(txt)+'</div></div>';break;`;
const PILL_NEW = `  case 'pill':{
   var _lrc=window._jizuraLrcData||[], _pv=(idx>0&&_lrc[idx-1])?_lrc[idx-1].text:'', _nx=(idx<_lrc.length-1&&_lrc[idx+1])?_lrc[idx+1].text:'';
   html='<div class="jz-line jz-pill show"><div class="pd pt2">'+_pv+'</div><div class="pd pb2">'+_nx+'</div><div class="pl">'+_jzSpans(txt)+'</div></div>';break;
  }
  case 'ren':{
   var _lrc2=window._jizuraLrcData||[], _p2=(idx>0&&_lrc2[idx-1])?_lrc2[idx-1].text:'', _n2=(idx<_lrc2.length-1&&_lrc2[idx+1])?_lrc2[idx+1].text:'';
   html='<div class="jz-line jz-ren show"><div class="prev">'+_p2+'</div><div class="rule"></div><div class="cur">'+_jzSpans(txt)+'</div><div class="rule"></div><div class="next">'+_n2+'</div></div>';break;
  }`;

/* ============ 5. renderJizuraInit：注入粒子层 + 封面取色 ============ */
const INIT_OLD = `  var gUp=document.createElement('div');gUp.className='jizura-ghost up';pvStage.appendChild(gUp);
  var gDn=document.createElement('div');gDn.className='jizura-ghost dn';pvStage.appendChild(gDn);
 }`;
const INIT_NEW = `  var gUp=document.createElement('div');gUp.className='jizura-ghost up';pvStage.appendChild(gUp);
  var gDn=document.createElement('div');gDn.className='jizura-ghost dn';pvStage.appendChild(gDn);
  /* 全局粒子层 */
  var pl=document.createElement('div');pl.className='jz-particles';
  for(var pi=0;pi<14;pi++){
   var sp=document.createElement('i');
   var sz=(2+Math.random()*4).toFixed(1);
   sp.style.width=sz+'px';sp.style.height=sz+'px';
   sp.style.left=(Math.random()*96).toFixed(1)+'%';
   sp.style.top=(10+Math.random()*80).toFixed(1)+'%';
   sp.style.animationDuration=(7+Math.random()*9).toFixed(1)+'s';
   sp.style.animationDelay=(-Math.random()*10).toFixed(1)+'s';
   if(Math.random()<0.3)sp.className='sq';
   pl.appendChild(sp);
  }
  pvStage.appendChild(pl);
 }
 /* 封面取色（auto 风格时背景匹配封面主色） */
 _jzAmbient(window._jzCover);`;
const INIT2_OLD = ` _jzLastIdx=-1;
};`;
const INIT2_NEW = ` _jzLastIdx=-1;
};
/* 封面取色：8x8 采样算主色，混向主题背景 55%，CORS 失败静默 */
function _jzAmbient(url){
 var st=document.getElementById('pvStage');
 if(!st||!url)return;
 if(_jzStyle&&_jzStyle.id!=='auto')return;
 var img=new Image();img.crossOrigin='anonymous';
 img.onload=function(){
  try{
   var cv=document.createElement('canvas');cv.width=cv.height=8;
   var cx=cv.getContext('2d');cx.drawImage(img,0,0,8,8);
   var d=cx.getImageData(0,0,8,8).data,r=0,g=0,b=0,n=0;
   for(var i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];n++}
   r=Math.round(r/n);g=Math.round(g/n);b=Math.round(b/n);
   st.style.setProperty('--jz-bg','color-mix(in srgb, rgb('+r+','+g+','+b+') 32%, var(--card-bg))');
  }catch(e){}
 };
 img.src=url;
}`;

/* ============ 6. 骰子重摇时也刷新取色 ============ */
const OMAKASE_OLD = ` _jzApplyStyle(s);
 /* 强制重渲染当前行 */`;
const OMAKASE_NEW = ` _jzApplyStyle(s);
 _jzAmbient(window._jzCover);
 /* 强制重渲染当前行 */`;

/* ============ 7. 风格点手动切换时也取色（auto 才取） ============ */
const APPLY_OLD2 = ` if(s&&s.id==='auto'){
  var st0=document.getElementById('pvStage');
  if(st0){st0.style.removeProperty('--jz-bg');st0.style.removeProperty('--jz-fg');st0.style.removeProperty('--jz-acc');st0.style.background='';st0.style.color='';}
  return;
 }`;
const APPLY_NEW2 = ` if(s&&s.id==='auto'){
  var st0=document.getElementById('pvStage');
  if(st0){st0.style.removeProperty('--jz-bg');st0.style.removeProperty('--jz-fg');st0.style.removeProperty('--jz-acc');st0.style.background='';st0.style.color='';}
  _jzAmbient(window._jzCover);
  return;
 }`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, COVER_OLD, COVER_NEW, `${rel} 封面URL`);
  html = replaceOnce(html, PARTS_OLD, PARTS_NEW, `${rel} 部件注册`);
  html = replaceOnce(html, PILL_OLD, PILL_NEW, `${rel} pill前后行`);
  html = replaceOnce(html, INIT_OLD, INIT_NEW, `${rel} 粒子层`);
  html = replaceOnce(html, INIT2_OLD, INIT2_NEW, `${rel} 取色函数`);
  html = replaceOnce(html, OMAKASE_OLD, OMAKASE_NEW, `${rel} 骰子取色`);
  html = replaceOnce(html, APPLY_OLD2, APPLY_NEW2, `${rel} auto取色`);

  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + AMBIENT_CSS + "\n" + html.slice(cssIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 氛围升级完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
