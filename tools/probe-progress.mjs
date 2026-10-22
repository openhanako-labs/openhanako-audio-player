// probe-progress.mjs —— 竖卡进度区 time-row vs progress-bar 实际盒子
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
for(const sz of [{w:1040,h:780},{w:420,h:780}]){
  await S('Emulation.setDeviceMetricsOverride',{width:sz.w,height:sz.h,deviceScaleFactor:1,mobile:false});
  await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?pg='+Date.now()+sz.w});
  await slp(2000);
  const r=await S('Runtime.evaluate',{expression:`(()=>{
    const tr=document.querySelector('.time-row'),pb=document.querySelector('.progress-bar');
    if(!tr||!pb)return{err:'missing',tr:!!tr,pb:!!pb,layout:document.querySelector('.player-container').getAttribute('data-layout')};
    const trR=tr.getBoundingClientRect(),pbR=pb.getBoundingClientRect();
    return{
      layout:document.querySelector('.player-container').getAttribute('data-layout'),
      timeRow:{y:Math.round(trR.top),b:Math.round(trR.bottom),l:Math.round(trR.left),r:Math.round(trR.right),h:Math.round(trR.height)},
      progressBar:{y:Math.round(pbR.top),b:Math.round(pbR.bottom),l:Math.round(pbR.left),r:Math.round(pbR.right),h:Math.round(pbR.height)},
      overlap: !(trR.bottom<=pbR.top+1||pbR.bottom<=trR.top+1),
      timeDisplay:tr.textContent.trim().replace(/\\s+/g,' ').slice(0,30),
    };
  })()`,returnByValue:true});
  console.log('---',sz.w+'x'+sz.h,'---');console.log(JSON.stringify(r.result.value,null,2));
}
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});