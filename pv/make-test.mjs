// 生成 pv/test.html —— 不依赖播放器的 PV 预览台
// 用法：node pv/make-test.mjs   然后浏览器打开 pv/test.html（或在 Hana 里开）
// 作用：从 ui/index.html 里取出构建好的 PV 块，套一个假的 #pvStage，
//       可以逐版式点着看、跑 selftest，不用先有歌有词。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PV = dirname(fileURLToPath(import.meta.url));
const ROOT = join(PV, '..');
const src = readFileSync(join(ROOT, 'ui', 'index.html'), 'utf8');

const CSS_B = '/* ===== PV:BEGIN 文字PV引擎（pv/ 目录构建产物，勿手改） ===== */';
const CSS_E = '/* ===== PV:END ===== */';
const JS_B = '<!-- ===== PV:BEGIN 文字PV引擎（pv/ 目录构建产物，勿手改） ===== -->';
const JS_E = '<!-- ===== PV:END ===== -->';

function slice(t, a, b) {
  const i = t.indexOf(a), j = t.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('在 ui/index.html 里找不到 PV 块，先跑 node pv/build.mjs');
  return t.slice(i, j + b.length);
}

const css = slice(src, CSS_B, CSS_E).replace(CSS_B, '').replace(CSS_E, '');
const jsFull = slice(src, JS_B, JS_E);
const js = jsFull.slice(jsFull.indexOf('<script>') + 8, jsFull.lastIndexOf('</' + 'script>'));

const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>PV 预览台</title>
<style>
  :root { --card-bg:#141210; --text:#F2EDE4; --accent:#D4AF37; --border:#2c2823; --text-dim:#8a8378; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0b0a09; color:var(--text); font-family:system-ui,"Microsoft YaHei",sans-serif; }
  header { padding:14px 18px; border-bottom:1px solid var(--border); display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  header b { font-size:13px; letter-spacing:.08em; }
  header .stat { font-family:monospace; font-size:11px; color:var(--text-dim); }
  #err { color:#ff6b6b; font-family:monospace; font-size:11px; padding:8px 18px; white-space:pre-wrap; }
  #row { display:flex; gap:6px; padding:10px 18px; flex-wrap:wrap; border-bottom:1px solid var(--border); }
  #row button { background:#1b1917; color:var(--text); border:1px solid var(--border); border-radius:6px;
    padding:5px 9px; font-size:11px; cursor:pointer; font-family:inherit; }
  #row button:hover { border-color:var(--accent); }
  #stageWrap { padding:18px; }
  /* 假舞台：尺寸与播放器一致，类名沿用核心用到的那几个 */
  .pv-stage { position:relative; width:min(960px,92vw); aspect-ratio:16/9; margin:0 auto;
    background:var(--card-bg); color:var(--text); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
  .pv-track { position:absolute; inset:0; }
  .np-title { display:none; }
</style>
<style>
${css}
</style>
</head>
<body class="lyrics-mode">
<header>
  <b>PV 预览台</b>
  <span class="stat" id="stat">—</span>
</header>
<div id="row"></div>
<div id="err"></div>
<div id="stageWrap">
  <div id="pvStage" class="pv-stage">
    <div id="pvTrack" class="pv-track"></div>
  </div>
</div>
<script>
window.__errs = [];
window.onerror = function (m, s, l, c) { window.__errs.push(m + ' @' + l + ':' + c); document.getElementById('err').textContent = window.__errs.join('\n'); };
</script>
<script>
(function(){'use strict';
${js}
})();
</script>
<script>
(function () {
  var LINES = [
    { text: '夜明けの色を 覚えてる', time: 0, end: 4000 },
    { text: 'We are the champions, my friends', time: 4000, end: 8000 },
    { text: '就算前面是深渊', time: 8000, end: 12000 },
    { text: '', time: 12000, end: 16000 }
  ];
  var savedStyle = 'gold';   // file:// 下 localStorage 会被禁，预览台自己记
  document.body.classList.add('jizura-mode');
  PV.setLyrics(LINES);
  PV.useStyle(savedStyle);
  PV.seed(20261002);

  var stat = document.getElementById('stat');
  stat.textContent = Object.entries(PV.stats()).map(function (e) { return e[0] + ' ' + e[1]; }).join('  ·  ');

  var row = document.getElementById('row');
  function btn(label, fn) {
    var b = document.createElement('button');
    b.textContent = label; b.onclick = fn; row.appendChild(b);
  }
  btn('おまかせ', function () { PV.seed(Date.now() % 1e9); PV.setLastLayout(''); PV.show(0, { force: true }); });
  PV.parts('style').forEach(function (s) {
    btn(s.nm, function () { PV.useStyle(s.id); savedStyle = s.id; });
  });
  PV.parts('layout').forEach(function (l) {
    btn(l.nm + (l.sp ? ' *' : ''), function () { PV.setLyrics(LINES); PV.show(l.key === 'interlude' ? 3 : 0, { force: true, layout: l.key }); });
  });
  btn('逐字扫光（无音频，静态）', function () { PV.show(0, { force: true, layout: 'center' }); });

  window.PV_TEST = { lines: LINES };
})();
</script>
</body>
</html>
`;

writeFileSync(join(PV, 'test.html'), html, 'utf8');
console.log(`pv/test.html 已生成（CSS ${(css.length/1024).toFixed(1)} KB / JS ${(js.length/1024).toFixed(1)} KB）`);
