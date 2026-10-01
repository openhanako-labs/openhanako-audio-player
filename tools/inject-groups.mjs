// 分组持久化：tab 栏动态显示自建组 + 自建组过滤 + 单曲导入走选组
// 用法：node tools/inject-groups.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ A. group-selector 追加自建组容器 + 新建按钮 ============ */
const DOM_OLD = `    <button class="group-tab" data-group="favorites">我的喜欢</button>
  </div>`;
const DOM_NEW = `    <button class="group-tab" data-group="favorites">我的喜欢</button>
    <span id="customGroupTabs" style="display:contents"></span>
    <button class="group-tab" id="groupAddBtn" title="新建分组" style="border-style:dashed;opacity:.7">+</button>
  </div>`;

/* ============ B. 自建组过滤：groupMap 查不到就直接用 currentGroup 当组名 ============ */
const FILTER_OLD = `    var targetGroup = groupMap[currentGroup];
    if (targetGroup) {`;
const FILTER_NEW = `    var targetGroup = groupMap[currentGroup] || currentGroup;
    if (targetGroup) {`;

/* ============ C. 单曲导入走选组 ============ */
const SONG_OLD = `    trks.push({ name:(t.title||'未命名')+(t.author?(' - '+t.author):''), url:t.url, pic:t.pic||'', lrcUrl:t.lrc||'', mode:'在线', dur:0, group:'在线音乐' });
    saveTrks(); renderPL();`;
const SONG_NEW = `    showGroupPicker(function(groupName){
      if(!groupName){ el.innerHTML='<div class="music-empty">已取消（未选分组）</div>'; return; }
      trks.push({ name:(t.title||'未命名')+(t.author?(' - '+t.author):''), url:t.url, pic:t.pic||'', lrcUrl:t.lrc||'', mode:'在线', dur:0, group:groupName });
      saveTrks(); renderPL();
      el.innerHTML='<div class="music-empty">已加入「'+groupName+'】：'+(t.title||'')+'</div>';
      document.getElementById('songInput').value='';
    });`;

/* ============ D. </body> 前注入：自建组 tab 动态渲染 ============ */
const GROUP_JS = `
<script>
/* ===== 自建分组 tab（持久化 + 过滤 + 新建 + 右键删除） ===== */
(function(){
'use strict';
if(typeof trks==='undefined'||typeof renderPL!=='function')return;
var CKEY='hanako_audio_custom_groups';
var FIXED=['本地音乐','在线音乐','TTS/语音','电台流','默认','我的喜欢'];
function loadG(){try{return JSON.parse(localStorage.getItem(CKEY))||[]}catch(e){return[]}}
function saveG(l){try{localStorage.setItem(CKEY,JSON.stringify(l))}catch(e){}}
function knownGroups(){
  var l=loadG().slice(),seen={};l.forEach(function(g){seen[g]=1});
  trks.forEach(function(t){var g=t&&t.group;if(g&&FIXED.indexOf(g)<0&&!seen[g]){seen[g]=1;l.push(g)}});
  return l;
}
function renderTabs(){
  var box=document.getElementById('customGroupTabs');if(!box)return;
  box.innerHTML='';
  knownGroups().forEach(function(g){
    var b=document.createElement('button');
    b.className='group-tab'+(currentGroup===g?' active':'');
    b.textContent=g;b.title='点击过滤 · 右键删除';
    b.onclick=function(){
      document.querySelectorAll('.group-tab').forEach(function(x){x.classList.remove('active')});
      b.classList.add('active');
      currentGroup=g;
      renderPL();
    };
    b.oncontextmenu=function(e){
      e.preventDefault();
      if(!confirm('删除分组「'+g+'」？组内曲目归入「默认」。'))return;
      trks.forEach(function(t){if(t.group===g)t.group='默认'});
      saveG(loadG().filter(function(x){return x!==g}));
      if(currentGroup===g){currentGroup='all'}
      saveTrks();renderPL();renderTabs();
    };
    box.appendChild(b);
  });
}
var addBtn=document.getElementById('groupAddBtn');
if(addBtn){addBtn.onclick=function(){
  if(typeof showGroupPicker==='function'){
    showGroupPicker(function(g){
      if(g){var l=loadG();if(l.indexOf(g)<0){l.push(g);saveG(l)}}
      renderTabs();
    });
  }
}}
if(typeof showGroupPicker==='function'&&!showGroupPicker._jzWrapped){
  var _o=showGroupPicker;
  window.showGroupPicker=function(cb){
    _o(function(g){
      if(g){var l=loadG();if(l.indexOf(g)<0){l.push(g);saveG(l)}}
      renderTabs();
      if(cb)cb(g);
    });
  };
  window.showGroupPicker._jzWrapped=1;
}
renderTabs();
})();
</`+`script>
`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");
  html = replaceOnce(html, DOM_OLD, DOM_NEW, `${rel} DOM`);
  html = replaceOnce(html, FILTER_OLD, FILTER_NEW, `${rel} 过滤`);
  html = replaceOnce(html, SONG_OLD, SONG_NEW, `${rel} 单曲选组`);
  const jsIdx = html.lastIndexOf("</body>");
  if (jsIdx < 0) throw new Error(`${rel}: 找不到 </body>`);
  html = html.slice(0, jsIdx) + GROUP_JS + "\n" + html.slice(jsIdx);
  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 分组持久化注入完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
