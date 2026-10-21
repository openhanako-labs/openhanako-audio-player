// probe-live.mjs —— 确认控制器是否活着 + MutationObserver 是否触发
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
await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?live='+Date.now()});
await slp(2500);
// 抓取控制器脚本是否执行：看 stripCover 上有没有被控制器设置过的痕迹 + npCover 观察器
const r=await S('Runtime.evaluate',{expression:`(()=>{
  const sc=document.getElementById('stripCover');
  const pc=document.querySelector('.player-container');
  // 判断控制器 IIFE 是否运行：它会给 #playerStrip 注册 pointerenter 监听
  const listeners = (function(){ let c=0; /* 无法直接数,但数据属性可查 */ return null; })();
  return {
    layout: pc.getAttribute('data-layout'),
    stripBtnCount: document.querySelectorAll('#stripControls .strip-btn').length,
    // 控制器 syncTrack 初始 refresh() 会设歌名:stripTitle 应显示'播放器'或竖卡的值
    stripTitle: document.getElementById('stripTitle').textContent,
    // 关键: stripCover 有没有被 refresh() 初始化过 (syncTrack 设 cover.style.backgroundImage='' )
    scInlineBgStyle: sc.getAttribute('style'),
    hasEnvelope: !!window.__hana,
  };
})()`,returnByValue:true});
console.log(JSON.stringify(r.result.value,null,2));
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});