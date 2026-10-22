// probe-accent.mjs —— 横栏色带/环跟随 --accent
const CDP='http://127.0.0.1:9222';
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
await S('Emulation.setDeviceMetricsOverride',{width:1040,height:60,deviceScaleFactor:1,mobile:false});
await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?ac2='+Date.now()});
await slp(2200);
const read=()=>S('Runtime.evaluate',{expression:`(()=>{const r=document.documentElement;const s=document.getElementById('playerStrip');const gb=getComputedStyle(s,'::before').backgroundImage;const ring=getComputedStyle(document.querySelector('.strip-ring-fill')).stroke;const bandVar=getComputedStyle(s).getPropertyValue('--strip-bgflow').trim();return{accentCS:getComputedStyle(r).getPropertyValue('--accent').trim(),bandVar,bandImg:gb.slice(0,70),ring};})()`,returnByValue:true});
const a=await read();console.log('默认:',JSON.stringify(a.result.value));
await S('Runtime.evaluate',{expression:`document.documentElement.style.setProperty('--accent','#3b7dd8')`});
await slp(300);
const b=await read();console.log('改蓝:',JSON.stringify(b.result.value));
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});