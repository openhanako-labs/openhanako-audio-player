// probe-play-gesture.mjs —— 模拟一次用户点击(activat)后 play，确认点播放能起播
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
await S('Emulation.setDeviceMetricsOverride',{width:1040,height:780,deviceScaleFactor:1,mobile:false});
await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?gs='+Date.now()});
await slp(2200);
const r=await S('Runtime.evaluate',{expression:`(async()=>{
  const audio=document.getElementById('audio');
  if(!audio) return{m:['no audio']};
  // 设源并等到 canplay（不 play，只是加载）
  audio.src='https://met.liiiu.cn/meting/api?server=netease&type=url&id=1431292823';
  await new Promise(res=>{function ok(){audio.removeEventListener('canplay',ok);res();}audio.addEventListener('canplay',ok);setTimeout(res,4000);});
  const log=[];
  // 模拟真实用户点击：先 dispatch 一个 click 在页面(提供 transient activation)
  const probe=document.createElement('button');document.body.appendChild(probe);
  probe.click(); // 产生 user activation
  try{ await audio.play(); log.push('play-after-click: OK paused='+audio.paused); }
  catch(e){ log.push('play-after-click REJECT:'+e.name+':'+e.message); }
  await new Promise(r2=>setTimeout(r2,800));
  log.push('final paused='+audio.paused+' ct='+audio.currentTime.toFixed(1)+' dur='+audio.duration.toFixed(0));
  return{readyState:audio.readyState,error:audio.error?audio.error.code:null,log};
})()`,returnByValue:true,awaitPromise:true});
console.log(JSON.stringify(r.result.value,null,2));
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});