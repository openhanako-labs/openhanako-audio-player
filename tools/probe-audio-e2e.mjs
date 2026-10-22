// probe-audio-e2e.mjs —— 在真实渲染里把歌喂给 <audio>，监听事件定位起播失败
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
// 收集网络请求 (可选)
await S('Emulation.setDeviceMetricsOverride',{width:1040,height:780,deviceScaleFactor:1,mobile:false});
await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?ae='+Date.now()});
await slp(2200);

// 直接操作主 audio：设 meting 源，监听事件 6 秒
const r=await S('Runtime.evaluate',{expression:`(async()=>{
  const audio=document.getElementById('audio');
  if(!audio) return{m:['no audio element']};
  const log=[];
  ['loadedmetadata','durationchange','canplay','canplaythrough','playing','error','stalled','waiting','abort','emptied','suspend'].forEach(ev=>{
    audio.addEventListener(ev,()=>log.push(ev+'@'+(audio.currentTime||0)));
  });
  audio.addEventListener('error',()=>{
    const e=audio.error; log.push('ERROR code='+(e?e.code:'?')+' msg='+(e?e.message:'?'));
  });
  const before={networkState:audio.networkState,readyState:audio.readyState,src:audio.currentSrc};
  const url='https://met.liiiu.cn/meting/api?server=netease&type=url&id=1431292823';
  audio.src=url;
  audio.crossOrigin='anonymous';
  try{await audio.play();}catch(e){log.push('play2 reject:'+e.name+':'+e.message);}
  await new Promise(res=>setTimeout(res,6000));
  return{
    before, after:{networkState:audio.networkState,readyState:audio.readyState,currentSrc:audio.currentSrc,currentTime:audio.currentTime,paused:audio.paused,duration:audio.duration,error:audio.error?(audio.error.code+':'+audio.error.message):null},
    log,
    mimeType: audio.currentSrc? (audio.getAttribute('src')||'').slice(0,90):''
  };
})()`,returnByValue:true,awaitPromise:true});
console.log(JSON.stringify(r.result.value,null,2));
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});