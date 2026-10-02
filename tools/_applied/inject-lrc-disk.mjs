// 歌词落盘 UI 注入：改 _loadLineLrc（先读盘后走网络）+ 自动搜索落盘 + 主循环传 trackName
// 用法：node tools/inject-lrc-disk.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. _loadLineLrc 加 trackName 参数 + 先读盘 ============ */
const LOAD_LRC_OLD = `function _loadLineLrc(lrcUrl){
    if(!lrcUrl) return;
    var cached=_cachedLrcByUrl(lrcUrl);
    if(cached){ lrcData=cached; renderLrc(); return; }
    var proxyUrl=API+'/widget/api/music/lrc-proxy?url='+encodeURIComponent(lrcUrl);
    fetch(proxyUrl).then(function(r){return r.text();}).then(function(raw){
      if(!raw||raw.length<10) return;
      var parsed=parseLrc(raw);
      _saveLrcCache(lrcUrl, parsed);
      lrcData=parsed;
      renderLrc();
    }).catch(function(){});
  }`;

const LOAD_LRC_NEW = `function _loadLineLrc(lrcUrl, trackName){
    if(!lrcUrl) return;
    var cached=_cachedLrcByUrl(lrcUrl);
    if(cached){ lrcData=cached; renderLrc(); return; }
    // 先读盘（离线歌词库）
    if(trackName){
      fetch(API+'/widget/api/lrc/load?name='+encodeURIComponent(trackName)).then(function(r){
        if(r.ok) return r.json();
        throw new Error('not on disk');
      }).then(function(res){
        if(res.ok && res.lrc){
          var parsed=parseLrc(res.lrc);
          _saveLrcCache(lrcUrl, parsed);
          lrcData=parsed;
          renderLrc();
        }else{
          throw new Error('no lrc');
        }
      }).catch(function(){
        // 读盘失败 → 走网络
        var proxyUrl=API+'/widget/api/music/lrc-proxy?url='+encodeURIComponent(lrcUrl);
        fetch(proxyUrl).then(function(r){return r.text();}).then(function(raw){
          if(!raw||raw.length<10) return;
          var parsed=parseLrc(raw);
          _saveLrcCache(lrcUrl, parsed);
          lrcData=parsed;
          renderLrc();
          // 网络拉到后落盘
          fetch(API+'/widget/api/lrc/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:trackName,lrc:raw})}).catch(function(){});
        }).catch(function(){});
      });
      return;
    }
    // 无 trackName（兼容旧调用）→ 直接走网络
    var proxyUrl=API+'/widget/api/music/lrc-proxy?url='+encodeURIComponent(lrcUrl);
    fetch(proxyUrl).then(function(r){return r.text();}).then(function(raw){
      if(!raw||raw.length<10) return;
      var parsed=parseLrc(raw);
      _saveLrcCache(lrcUrl, parsed);
      lrcData=parsed;
      renderLrc();
    }).catch(function(){});
  }`;

/* ============ 2. 主循环 _loadLineLrc(lrcUrl) → _loadLineLrc(lrcUrl, t.name) ============ */
const MAIN_LOOP_OLD = `    _loadLineLrc(lrcUrl);
  },800);`;

const MAIN_LOOP_NEW = `    _loadLineLrc(lrcUrl, t.name);
  },800);`;

/* ============ 3. 自动搜索成功后落盘 ============ */
const AUTO_SEARCH_OLD = `res.results && res.results.length) {
          for(var j=0;j<res.results.length;j++){
            if(res.results[j].lrc) { t.lrcUrl=res.results[j].lrc; saveTrks(); break; }
          }
        }`;

const AUTO_SEARCH_NEW = `res.results && res.results.length) {
          for(var j=0;j<res.results.length;j++){
            if(res.results[j].lrc) {
              t.lrcUrl=res.results[j].lrc;
              saveTrks();
              // 歌词落盘：拉到原文后写入离线歌词库
              (function(name, url){
                fetch(API+'/widget/api/music/lrc-proxy?url='+encodeURIComponent(url)).then(function(r){return r.text();}).then(function(raw){
                  if(raw && raw.length>=10){
                    fetch(API+'/widget/api/lrc/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,lrc:raw})}).catch(function(){});
                  }
                }).catch(function(){});
              })(t.name, t.lrcUrl);
              break;
            }
          }
        }`;

/* ============ 4. TTML 成功分支也传 trackName（让回退时能读盘） ============ */
const TTML_FALLBACK_OLD = `            _loadLineLrc(lrcUrl);
          }
        }).catch(function(){ _loadLineLrc(lrcUrl); });`;

const TTML_FALLBACK_NEW = `            _loadLineLrc(lrcUrl, t.name);
          }
        }).catch(function(){ _loadLineLrc(lrcUrl, t.name); });`;

/* ============ 注入逻辑 ============ */
function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, LOAD_LRC_OLD, LOAD_LRC_NEW, `${rel} _loadLineLrc`);
  html = replaceOnce(html, MAIN_LOOP_OLD, MAIN_LOOP_NEW, `${rel} 主循环`);
  html = replaceOnce(html, AUTO_SEARCH_OLD, AUTO_SEARCH_NEW, `${rel} 自动搜索`);
  html = replaceOnce(html, TTML_FALLBACK_OLD, TTML_FALLBACK_NEW, `${rel} TTML 回退`);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 歌词落盘注入完成（_loadLineLrc + 主循环 + 自动搜索 + TTML 回退）`);
}

console.log("两文件已同步。接下来跑 node tools/bump-build.mjs");
