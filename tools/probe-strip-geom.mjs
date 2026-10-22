// probe-strip-geom.mjs —— 横栏 offселив: 各元素rect, 找重叠
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
await S('Page.navigate',{url:'http://127.0.0.1:8778/ui/standalone.html?sg='+Date.now()});
await slp(2200);
await S('Runtime.evaluate',{expression:`document.getElementById('playerStrip').classList.add('active')`});
await slp(400);
const r=await S('Runtime.evaluate',{expression:`(()=>{
  const ids=['stripCover','stripIdentity','stripTitle','stripArtist','stripLyric','stripTime','stripCur','stripTotal','stripControls','stripFav','stripPlay','stripVolBtn','stripVolWrap'];
  const out={};
  ids.forEach(id=>{const el=document.getElementById(id);if(!el){out[id]='absent';return;}const rc=el.getBoundingClientRect();out[id]={x:Math.round(rc.x),y:Math.round(rc.y),w:Math.round(rc.width),h:Math.round(rc.height),r:Math.round(rc.right),b:Math.round(rc.bottom)};});
  // 重叠检测
  const boxes={};
  ids.forEach(id=>{const el=document.getElementById(id);if(el){const rc=el.getBoundingClientRect();if(rc.width>0)boxes[id]=rc;}});
  const overlap=[];
  const keys=Object.keys(boxes);
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
    const a=boxes[keys[i]],b=boxes[keys[j]];
    const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if(ox>3&&oy>3)overlap.push(keys[i]+'～'+keys[j]+'('+Math.round(ox)+'x'+Math.round(oy)+')');
  }
  out._overlaps=overlap;
  return out;
})()`,returnByValue:true});
console.log(JSON.stringify(r.result.value,null,2));
await c.send('Target.closeTarget',{targetId});bws.close();}
main().catch(e=>{console.error('FAIL:',e.message);process.exit(2);});