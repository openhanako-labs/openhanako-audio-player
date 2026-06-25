const fs = require('fs');
const p = 'W:/Games/Hanako/.hanako/plugins/hanako-audio-player/routes/player.js';
let c = fs.readFileSync(p, 'utf-8');

// ── Fix 1: 初始化后加 renderPL() ──
// 在 "如果播放列表为空" 之前插入 renderPL()
const fix1Old = '// 如果播放列表为空，添加测试数据';
const fix1New = 'renderPL();\n// 如果播放列表为空，添加测试数据';
if (c.includes(fix1Old)) {
  c = c.replace(fix1Old, fix1New);
  console.log('Fix 1: renderPL() added at init');
} else {
  console.log('Fix 1: target not found');
}

// ── Fix 2: load() 里 audio.src=t.url → audio.src=tok(t.url) ──
const fix2Old = 'if(t.url) { audio.src=t.url; audio.load(); }';
const fix2New = 'if(t.url) { audio.src=tok(t.url); audio.load(); audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)}); }';
if (c.includes(fix2Old)) {
  c = c.replace(fix2Old, fix2New);
  console.log('Fix 2: tok() + play() added in load()');
} else {
  console.log('Fix 2: target not found');
}

// ── Fix 3: full-url 后端 redirect → JSON ──
// 所有 c.redirect(httpsUrl) → c.json({ok:true, url:httpsUrl})
// 所有 c.redirect(fullUrl) → c.json({ok:true, url:fullUrl})
// 所有 c.redirect(fallback) → c.json({ok:true, url:fallback})
c = c.replace(/return c\.redirect\(httpsUrl\);/g, 'return c.json({ ok:true, url:httpsUrl });');
c = c.replace(/return c\.redirect\(fullUrl\);/g, 'return c.json({ ok:true, url:fullUrl });');
c = c.replace(/if \(fallback\) return c\.redirect\(fallback\);/g, 'if (fallback) return c.json({ ok:true, url:fallback });');
console.log('Fix 3: backend redirect → JSON');

// ── Fix 4: 前端 fetch full-url 改为 JSON 解析 ──
// load() 里的 searchKey 分支
const fix4aOld = `fetch(fullApi,{redirect:'manual'}).then(function(r){
            if((r.status===302||r.status===301)){var loc=r.headers.get('location');if(loc&&!loc.includes('/404')){t.url=loc;audio.src=t.url;audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});return;}}
            t.url=_metaUrl;audio.src=t.url;audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});
          }).catch(function(){t.url=_metaUrl;audio.src=t.url;audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});});`;
const fix4aNew = `fetch(fullApi).then(function(r){return r.json();}).then(function(d){
            if(d.ok&&d.url){t.url=d.url;audio.src=tok(t.url);audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});}
            else{t.url=_metaUrl;audio.src=tok(t.url);audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});}
          }).catch(function(){t.url=_metaUrl;audio.src=tok(t.url);audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});});`;
if (c.includes(fix4aOld)) {
  c = c.replace(fix4aOld, fix4aNew);
  console.log('Fix 4a: load() searchKey fetch → JSON');
} else {
  console.log('Fix 4a: target not found');
}

// tryFullUrl() 在搜索结果点击里
const fix4bOld = `fetch(fullUrlApi, {method:'HEAD', redirect:'manual'}).then(function(r){
      if (r.status === 302 || r.status === 301) {
        var loc = r.headers.get('location');
        if (loc && !loc.includes('/404')) { cb(loc); return; }
      }
      cb(metingUrl);
    }).catch(function(){ cb(metingUrl); });`;
const fix4bNew = `fetch(fullUrlApi).then(function(r){return r.json();}).then(function(d){
      if (d.ok && d.url && !d.url.includes('/404')) { cb(d.url); return; }
      cb(metingUrl);
    }).catch(function(){ cb(metingUrl); });`;
if (c.includes(fix4bOld)) {
  c = c.replace(fix4bOld, fix4bNew);
  console.log('Fix 4b: tryFullUrl() fetch → JSON');
} else {
  console.log('Fix 4b: target not found');
}

fs.writeFileSync(p, c, 'utf-8');
console.log('Done.');
