// probe-report.mjs —— 验证 reportInteractiveRegions 会调用 setInteractiveRegions 且含顶部按钮
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
// 模拟宿主 surface
await S('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
  window.__hana = { surface: { setInteractiveRegions: function(rects){ window.__lastRegions = rects; } } };
})()`});
await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?rp='+Date.now()});
await slp(2500);
const r=await S('Runtime.evaluate',{expression:`(()=>{
  const rects=window.__lastRegions||[];
  // 顶部按钮（mode-caps 标准/PV/歌词）
  const top=Rects=>Rects.filter(r=>r.y<80);
  return { reportedCount:rects.length, topCount:rects.filter(r=>r.y<80).length, topRects:rects.filter(r=>r.y<80).slice(0,6) };
})()`,returnByValue:true});
console.log(JSON.stringify(r.result.value,null,2));
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});