// shot-light-strip.mjs —— 浅色主题下横条截图 + 关键元素计算色
const CDP='http://127.0.0.1:9222';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT=join(dirname(fileURLToPath(import.meta.url)),'..','..','..','shots');
class C{constructor(ws){this.ws=ws;this.id=0;this.p=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&this.p.has(m.id)){this.p.get(m.id)(m.result);this.p.delete(m.id);}});}
send(m,x,sid){const id=++this.id;const o={id,method:m,params:x};if(sid)o.sessionId=sid;this.ws.send(JSON.stringify(o));return new Promise(r=>this.p.set(id,r));}}
const open=u=>new Promise((r,j)=>{const w=new WebSocket(u);w.addEventListener('open',()=>r(w));w.addEventListener('error',j);});
const slp=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
const bws=await open((await(await fetch(CDP+'/json/version')).json()).webSocketDebuggerUrl);
const c=new C(bws);const{targetId}=await c.send('Target.createTarget',{url:'about:blank'});
const{sessionId}=await c.send('Target.attachToTarget',{targetId,flatten:true});
const S=(m,x)=>c.send(m,x,sessionId);
await S('Page.enable');await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride',{width:1040,height:60,deviceScaleFactor:2,mobile:false});
await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?ls='+Date.now()});
await slp(2200);
// 浅色主题 + mock 状态
await S('Runtime.evaluate',{expression:`(()=>{
  const r=document.documentElement;
  r.setAttribute('data-theme','light');
  // 封面
  const npc=document.getElementById('npCover');
  const img=document.createElement('img');img.src='data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';npc.appendChild(img);
  // 歌词
  const lyr=document.getElementById('stripLyric');lyr.textContent='その叫びも 届かなくて 静かに揺れる';
  // 进度环
  document.querySelector('.strip-ring-fill').style.strokeDashoffset=50;
  // 唤醒
  document.getElementById('playerStrip').classList.add('active');
  return true;
})()`});
await slp(400);
// 关键元素计算色
const pr=await S('Runtime.evaluate',{expression:`(()=>{
  const s=document.getElementById('playerStrip');
  const title=document.getElementById('stripTitle'),src=document.getElementById('stripArtist'),lyr=document.getElementById('stripLyric');
  const play=document.getElementById('stripPlay'),ring=document.querySelector('.strip-ring-fill');
  const gcs=e=>{const cs=getComputedStyle(e);return{color:cs.color,bg:cs.backgroundColor,opacity:cs.opacity};};
  return {
    stripBg:getComputedStyle(s).backgroundColor,
    stripBefore:getComputedStyle(s,'::before').backgroundImage.slice(0,50),
    title:gcs(title),src:gcs(src),lyr:gcs(lyr),
    playBg:getComputedStyle(play).backgroundImage.slice(0,40),
    playIcon:getComputedStyle(play.querySelector('svg')).stroke||getComputedStyle(play.querySelector('svg')).fill,
    ringStroke:ring.style.strokeDashoffset,
  };
})()`,returnByValue:true});
console.log('--- 关键元素 ---');console.log(JSON.stringify(pr.result.value,null,2));
const png=await S('Page.captureScreenshot',{format:'png'});
const f=join(OUT,'strip-LIGHT-active.png');
writeFileSync(f,Buffer.from(png.data,'base64'));console.log('saved',f);
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});