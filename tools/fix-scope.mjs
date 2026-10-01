// 修作用域：分组 tab/行胶囊移进主 IIFE 内部；胶囊防挤压；PV 模式布局修正；金夜 light 变体
// 用法：node tools/fix-scope.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. 主 IIFE 内注入：自建组 tab + 行内胶囊（锚点=分组选择器绑定块尾） ============ */
const SCOPE_ANCHOR = `    currentGroup = this.dataset.group;
    renderPL();
  });
});`;
const SCOPE_NEW = `    currentGroup = this.dataset.group;
    renderPL();
  });
});

// ── 自建分组 tab（主 IIFE 内，直接访问 trks/currentGroup/renderPL/showGroupPicker） ──
(function(){
    var CKEY='hanako_audio_custom_groups';
    var FIXED=['本地音乐','在线音乐','TTS/语音','电台流','默认','我的喜欢'];
    function loadG(){try{return JSON.parse(localStorage.getItem(CKEY))||[]}catch(e){return[]}}
    function saveG(l){try{localStorage.setItem(CKEY,JSON.stringify(l))}catch(e){}}
    function knownGroups(){
      var l=loadG().slice(),seen={};l.forEach(function(g){seen[g]=1});
      trks.forEach(function(t){var g=t&&t.group;if(g&&FIXED.indexOf(g)<0&&!seen[g]){seen[g]=1;l.push(g)}});
      return l;
    }
    function injectPills(){
      var plBody=document.getElementById('plBody');
      if(!plBody)return;
      plBody.querySelectorAll('.pl-group-body').forEach(function(body){
        var g=body.getAttribute('data-group')||'';
        if(!g)return;
        body.querySelectorAll('.pl-item').forEach(function(item){
          if(item.querySelector('.jz-gpill'))return;
          var name=item.querySelector('.pl-name');
          if(!name)return;
          var pill=document.createElement('span');
          pill.className='jz-gpill';pill.textContent=g;
          name.after(pill);
        });
      });
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
          if(currentGroup==='' || currentGroup===g){currentGroup='all'}
          saveTrks();renderPL();
        };
        box.appendChild(b);
      });
    }
    var addBtn=document.getElementById('groupAddBtn');
    if(addBtn)addBtn.onclick=function(){
      showGroupPicker(function(g){
        if(g){var l=loadG();if(l.indexOf(g)<0){l.push(g);saveG(l)}}
        renderTabs();
      });
    };
    var _rpl=renderPL;
    renderPL=function(){
      _rpl.apply(this,arguments);
      renderTabs();
      injectPills();
    };
    renderTabs();
  })();`;

/* ============ 2. 删除失效的独立 GROUP_JS 块（它在主 IIFE 外，typeof 检查直接 return） ============ */
function removeDeadGroupBlock(html, label) {
  const mark = "/* ===== 自建分组 tab（持久化";
  const mid = html.indexOf(mark);
  if (mid < 0) { console.log(`${label}: 死块已不存在，跳过`); return html; }
  const start = html.lastIndexOf("<script>", mid);
  const endMark = "</scr" + "ipt>";
  const end = html.indexOf(endMark, mid);
  if (start < 0 || end < 0) throw new Error(`${label}: 死块边界找不到`);
  return html.slice(0, start) + html.slice(end + endMark.length);
}

/* ============ 3. CSS：胶囊防挤压 + PV 模式布局修正 ============ */
const FIX_CSS = `
/* ===== 主 UI 修正 ===== */
.mode-caps { flex-shrink:0; }
.mode-caps .mc { white-space:nowrap; padding:4px 12px; }
/* PV/歌词模式下撤销唱盘机纵排，让舞台铺满 */
body.lyrics-mode:not(.view-compact) .now-playing-section { align-items:stretch !important; text-align:left !important; }
body.lyrics-mode:not(.view-compact) .np-info { display:none !important; }
body.lyrics-mode:not(.view-compact) .pv-stage { flex:1 !important; width:100% !important; }
`;

/* ============ 4. 金夜预设加 light 变体（明暗切换时背景跟随） ============ */
const PRESET_OLD = `      background: { kind: "gradient", from: "#0A0907", to: "#17130C", angle: 160 },`;
const PRESET_NEW = `      background: { kind: "gradient", from: "#0A0907", to: "#17130C", angle: 160,
        light: { kind: "gradient", from: "#F6EEDC", to: "#EDE0C2", angle: 160 } },`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, SCOPE_ANCHOR, SCOPE_NEW, `${rel} IIFE内注入`);
  html = removeDeadGroupBlock(html, `${rel} 死块清理`);
  html = replaceOnce(html, PRESET_OLD, PRESET_NEW, `${rel} light变体`);

  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + FIX_CSS + "\n" + html.slice(cssIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 作用域修复完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
