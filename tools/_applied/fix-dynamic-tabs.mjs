// 分组 tab 彻底动态化：来源排只留「全部/本地/在线」，电台流/我的喜欢挪进动态区（有内容才显示）
// 用法：node tools/fix-dynamic-tabs.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. 删掉硬编码的「电台流」「我的喜欢」按钮 ============ */
const DOM_OLD = `    <button class="group-tab" data-group="radio">电台流</button>
    <button class="group-tab" data-group="favorites">我的喜欢</button>
    <span id="customGroupTabs"`;
const DOM_NEW = `    <span id="customGroupTabs"`;

/* ============ 2. IIFE 内 renderTabs：动态补「电台流」（有曲目时）和「我的喜欢」（有收藏时） ============ */
const TABS_OLD = `    function renderTabs(){
      var box=document.getElementById('customGroupTabs');if(!box)return;
      box.innerHTML='';
      knownGroups().forEach(function(g){`;
const TABS_NEW = `    function renderTabs(){
      var box=document.getElementById('customGroupTabs');if(!box)return;
      box.innerHTML='';
      /* 条件动态 tab：电台流（有曲目时）、我的喜欢（有收藏时）——不再钉死在来源排 */
      function addCondTab(label, dataGroup, show){
        if(!show) return;
        var b=document.createElement('button');
        b.className='group-tab'+(currentGroup===dataGroup?' active':'');
        b.textContent=label;
        b.onclick=function(){
          document.querySelectorAll('.group-tab').forEach(function(x){x.classList.remove('active')});
          b.classList.add('active');
          currentGroup=dataGroup;
          renderPL();
        };
        box.appendChild(b);
      }
      addCondTab('电台流','radio', trks.some(function(t){return t.group==='电台流'}));
      try{ addCondTab('我的喜欢','favorites', (JSON.parse(localStorage.getItem('hanako_audio_favs')||'[]')).length>0); }catch(e){}
      knownGroups().forEach(function(g){`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");
  html = replaceOnce(html, DOM_OLD, DOM_NEW, `${rel} DOM`);
  html = replaceOnce(html, TABS_OLD, TABS_NEW, `${rel} renderTabs`);
  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 分组 tab 动态化完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
