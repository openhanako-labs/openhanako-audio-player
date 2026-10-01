// 修正双排归属：条件 tab（电台流/我的喜欢）在来源排末尾，自建组在自建排
// 用法：node tools/fix-tab-rows.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. DOM：原位置的 customGroupTabs 换成 condGroupTabs；customGroupTabs 挪到 addBtn 前（自建排） ============ */
const DOM1_OLD = `    <span id="customGroupTabs" style="display:contents"></span>
    <button class="group-tab" id="groupAddBtn"`;
const DOM1_NEW = `    <span id="condGroupTabs" style="display:contents"></span>
    <span id="customGroupTabs" style="display:contents"></span>
    <button class="group-tab" id="groupAddBtn"`;
// 等等——这样两个容器相邻。真正要的是：condGroupTabs 在固定按钮后（来源排末尾），customGroupTabs 在自建 label 后。
// D3 运行时把 break 和「自建」label 插在 addBtn 前 → 运行 DOM：...固定3个, customGroupTabs, condGroupTabs?, break, label, addBtn
// 上面的替换让两个 span 相邻都在 addBtn 前——break 会在它们前面（D3 insertBefore(br, addBtn) 是在原 customGroupTabs 之后）
// 实际运行序：固定3, condGroupTabs, [D3 break], [D3 label], customGroupTabs, addBtn？——不对，D3 的 insertBefore(br,addBtn) 会把 br 插在 addBtn 正前。
// 原 DOM 序：固定3, condGroupTabs(原custom), customGroupTabs(新), addBtn
// D3 执行后：固定3, condGroupTabs, customGroupTabs, break, label, addBtn ——customGroupTabs 又在第一排！
// 正确做法：第一步只把原 customGroupTabs 改名 condGroupTabs；第二步在 addBtn 锚点前插 customGroupTabs，
// 且保证它在 break/label 之后 → 但 D3 每次 insertBefore(addBtn) 会把 break/label 插到 customGroupTabs 之后……
// 检查 D3 顺序：gs.insertBefore(br,addBtn); gs.insertBefore(l2,addBtn); → 运行序 addBtn 前是 l2(label)，label 前是 br。
// 若 DOM 已有 customGroupTabs 紧挨 addBtn，D3 插完后：customGroupTabs, break, label, addBtn —— 错。
// 所以 DOM 必须写成：condGroupTabs（原位置）... addBtn 前是 customGroupTabs，D3 的 break/label 插在 customGroupTabs 之前：
// 即 DOM 写为：固定3, condGroupTabs, customGroupTabs占位?, ...——混乱了。
// 简化：第一步改原 span 为 condGroupTabs；第二步在 addBtn 前插 customGroupTabs。
// D3 已有逻辑会把 break/label 插在 addBtn 前（customGroupTabs 之后）——顺序变成：condTabs, customTabs, break, label, addBtn，仍错。
// 最终方案：改 D3 的插入点，把 break/label 插到 customGroupTabs 之前而非 addBtn 之前。

/* 步骤 1：原 customGroupTabs → condGroupTabs */
const STEP1_OLD = `    <span id="customGroupTabs" style="display:contents"></span>`;
const STEP1_NEW = `    <span id="condGroupTabs" style="display:contents"></span>`;

/* 步骤 2：addBtn 前插 customGroupTabs（自建排内容区） */
const STEP2_OLD = `    <button class="group-tab" id="groupAddBtn"`;
const STEP2_NEW = `    <span id="customGroupTabs" style="display:contents"></span>
    <button class="group-tab" id="groupAddBtn"`;

/* 步骤 3：D3 的插入点从 addBtn 改为 customGroupTabs（break/label 落在自建组容器之前） */
const D3_OLD = `var addBtn=document.getElementById('groupAddBtn');
if(gs&&addBtn&&!gs.querySelector('.gs-label')){
  var l1=document.createElement('span');l1.className='gs-label';l1.textContent='来源';
  gs.insertBefore(l1,gs.firstChild);
  var br=document.createElement('div');br.className='gs-break';
  var l2=document.createElement('span');l2.className='gs-label';l2.textContent='自建';
  gs.insertBefore(br,addBtn);
  gs.insertBefore(l2,addBtn);
}`;
const D3_NEW = `var addBtn=document.getElementById('groupAddBtn');
var customBox=document.getElementById('customGroupTabs');
if(gs&&customBox&&!gs.querySelector('.gs-label')){
  var l1=document.createElement('span');l1.className='gs-label';l1.textContent='来源';
  gs.insertBefore(l1,gs.firstChild);
  var br=document.createElement('div');br.className='gs-break';
  var l2=document.createElement('span');l2.className='gs-label';l2.textContent='自建';
  gs.insertBefore(br,customBox);
  gs.insertBefore(l2,customBox);
}`;

/* ============ 2. renderTabs：条件 tab → condGroupTabs，自建组 → customGroupTabs ============ */
const TABS_OLD = `      var box=document.getElementById('customGroupTabs');if(!box)return;
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
      }`;
const TABS_NEW = `      var box=document.getElementById('customGroupTabs');if(!box)return;
      var condBox=document.getElementById('condGroupTabs');
      box.innerHTML='';
      if(condBox)condBox.innerHTML='';
      /* 条件动态 tab：电台流（有曲目时）、我的喜欢（有收藏时）——渲染在来源排末尾 */
      function addCondTab(label, dataGroup, show){
        if(!show||!condBox) return;
        var b=document.createElement('button');
        b.className='group-tab'+(currentGroup===dataGroup?' active':'');
        b.textContent=label;
        b.onclick=function(){
          document.querySelectorAll('.group-tab').forEach(function(x){x.classList.remove('active')});
          b.classList.add('active');
          currentGroup=dataGroup;
          renderPL();
        };
        condBox.appendChild(b);
      }`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");
  html = replaceOnce(html, STEP1_OLD, STEP1_NEW, `${rel} 步骤1`);
  html = replaceOnce(html, STEP2_OLD, STEP2_NEW, `${rel} 步骤2`);
  html = replaceOnce(html, D3_OLD, D3_NEW, `${rel} 步骤3`);
  html = replaceOnce(html, TABS_OLD, TABS_NEW, `${rel} renderTabs`);
  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 双排归属修正完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
