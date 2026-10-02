// 单曲导入 + 删除失效平台（百度/酷我）
// 用法：node tools/inject-single-song.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. 删除失效平台按钮（kuwo/baidu） ============ */
const DEAD_PLATFORMS = `      <button class="platform-btn" data-server="kuwo">酷我</button>
      <button class="platform-btn" data-server="baidu">百度</button>
`;
const DEAD_PLATFORMS_NEW = ``;

/* ============ 2. 单曲导入 DOM：插在 playlist-import 后、local-import 前 ============ */
const IMPORT_ANCHOR = `      <button class="import-btn" id="playlistGo">导入歌单</button>
    </div>`;
const IMPORT_NEW = `      <button class="import-btn" id="playlistGo">导入歌单</button>
    </div>
    <div class="playlist-import">
      <input type="text" class="import-input" id="songInput" placeholder="粘贴单曲链接…">
      <button class="import-btn" id="songGo">导入单曲</button>
    </div>`;

/* ============ 3. 单曲导入 JS：跟在 doPlaylistImport 事件绑定后 ============ */
const JS_ANCHOR = `document.getElementById('playlistInput').addEventListener('keydown', function(e){ if(e.key==='Enter') doPlaylistImport(); });`;
const JS_NEW = `document.getElementById('playlistInput').addEventListener('keydown', function(e){ if(e.key==='Enter') doPlaylistImport(); });

document.getElementById('songGo').addEventListener('click', doSongImport);
document.getElementById('songInput').addEventListener('keydown', function(e){ if(e.key==='Enter') doSongImport(); });

function doSongImport(){
  var raw=document.getElementById('songInput').value.trim();
  if(!raw) return;
  var sv=document.getElementById('musicServer').value;
  var el=document.getElementById('musicResults');
  el.innerHTML='<div class="music-loading">获取单曲中…</div>';
  fetch(API+'/widget/api/music/song?id='+encodeURIComponent(raw)+'&server='+sv).then(function(r){return r.json();}).then(function(res){
    if(!res.ok||!res.track||!res.track.url){ el.innerHTML='<div class="music-empty">无法获取该单曲</div>'; return; }
    var t=res.track;
    // 去重：已在队列则只提示
    var exists=trks.some(function(x){return x.url===t.url;});
    if(exists){ el.innerHTML='<div class="music-empty">已在队列中</div>'; return; }
    trks.push({ name:(t.title||'未命名')+(t.author?(' - '+t.author):''), url:t.url, pic:t.pic||'', lrcUrl:t.lrc||'', mode:'在线', dur:0, group:'在线音乐' });
    saveTrks(); renderPL();
    el.innerHTML='<div class="music-empty">已加入队列：'+(t.title||'')+'</div>';
    document.getElementById('songInput').value='';
  }).catch(function(){ el.innerHTML='<div class="music-empty">获取失败</div>'; });
}`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");
  html = replaceOnce(html, DEAD_PLATFORMS, DEAD_PLATFORMS_NEW, `${rel} 失效平台`);
  html = replaceOnce(html, IMPORT_ANCHOR, IMPORT_NEW, `${rel} 单曲导入 DOM`);
  html = replaceOnce(html, JS_ANCHOR, JS_NEW, `${rel} 单曲导入 JS`);
  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 单曲导入 + 删失效平台 完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
