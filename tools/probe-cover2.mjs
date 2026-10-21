// probe-cover2.mjs —— 模拟 npCover 有图，验证 stripCover 显示 url 封面
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
await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?cv2='+Date.now()});
await slp(2000);
// 模拟 npCover 出现封面图
await S('Runtime.evaluate',{expression:`(()=>{
  const npc=document.getElementById('npCover');
  npc.innerHTML='<img src="data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'><rect width=\'60\' height=\'60\' fill=\'%234d7ea8\'/></svg>" alt="">';
  return true;
})()`});
await slp(300);
const r=await S('Runtime.evaluate',{expression:`(()=>{
  const sc=document.getElementById('stripCover');
  return {
    stripCoverBg: getComputedStyle(sc).backgroundImage,
    hasArt: sc.classList.contains('has-art'),
    inlineBg: sc.style.backgroundImage,
  };
})()`,returnByValue:true});
console.log(JSON.stringify(r.result.value,null,2));
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});