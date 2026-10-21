// shot-strip-active.mjs —— 截图横条悬停态（强制 .active 显示按钮）
const CDP='http://127.0.0.1:9222';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)),'..','..','..','shots');
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
await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?sa='+Date.now()});
await slp(2000);
await S('Runtime.evaluate',{expression:`(()=>{const s=document.getElementById('playerStrip');s.classList.add('active');s.style.setProperty('--strip-height','60px');return true;})()`});
await slp(400);
mkdirSync(OUT,{recursive:true});
const png=await S('Page.captureScreenshot',{format:'png'});
const f=join(OUT,'strip-C+D-active.png');
writeFileSync(f,Buffer.from(png.data,'base64'));
console.log('saved',f);
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});