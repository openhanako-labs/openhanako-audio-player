// 生成 pv/test.html —— 不依赖播放器的 PV 预览台
// 用法：node pv/make-test.mjs，然后开 pv/serve.mjs 8778 用浏览器看 pv/test.html
// 作用：从 ui/index.html 里取出构建好的 PV 块，套一个假的 #pvStage，
//       不放歌也能逐件看、逐层试、拖 fx 滑块。
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
  header { padding:12px 16px; border-bottom:1px solid var(--border); display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  header b { font-size:13px; letter-spacing:.08em; }
  header .stat { font-family:monospace; font-size:11px; color:var(--text-dim); }
  #err { color:#ff6b6b; font-family:monospace; font-size:11px; padding:6px 16px; white-space:pre-wrap; }
  .row { display:flex; gap:6px; padding:8px 16px; flex-wrap:wrap; align-items:center; border-bottom:1px solid #1b1917; }
  .row .lb { font-size:10px; color:var(--text-dim); font-family:monospace; letter-spacing:.14em; width:78px; flex:none; }
  .row button { background:#1b1917; color:var(--text); border:1px solid var(--border); border-radius:6px;
    padding:4px 8px; font-size:11px; cursor:pointer; font-family:inherit; }
  .row button:hover { border-color:var(--accent); }
  .row button.on { border-color:var(--accent); background:#2a2318; }
  .row input[type=range] { width:92px; accent-color: var(--accent); }
  .row .fxv { font-family:monospace; font-size:10px; color:var(--text-dim); width:30px; }
  #stageWrap { padding:18px; }
  .pv-stage { position:relative; width:min(960px,92vw); aspect-ratio:16/9; margin:0 auto;
    background:var(--card-bg); color:var(--text); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
  .pv-track { position:absolute; inset:0; }
  .np-title, .np-artist { display:none; }
</style>
<style>
${css}
</style>
</head>
<body class="lyrics-mode">
<header>
  <b>PV 预览台</b>
  <span class="stat" id="stat">—</span>
  <span class="stat" id="plan">—</span>
</header>
<div id="err"></div>
<div id="rows"></div>
<div id="stageWrap">
  <div id="pvStage" class="pv-stage">
    <div id="pvTrack" class="pv-track"></div>
  </div>
</div>
<script>
window.__errs = [];
window.onerror = function (m, s, l, c) {
  window.__errs.push(m + ' @' + l + ':' + c);
  document.getElementById('err').textContent = window.__errs.join('\n');
};
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
    { text: '就算前面是深渊也别回头', time: 8000, end: 12000 },
    { text: '', time: 12000, end: 16000 }
  ];
  var line = 0, savedStyle = 'gold';
  /* 预览台没有 core 的频谱链，清掉那个开关免得白等 6 秒才自建图 */
  try { localStorage.removeItem('hana_audio_reactive'); } catch (e) { }
  document.body.classList.add('jizura-mode');
  PV.setLyrics(LINES);
  PV.useStyle(savedStyle);
  PV.seed(20261002);

  var rows = document.getElementById('rows');
  function group(label) {
    var d = document.createElement('div');
    d.className = 'row';
    var s = document.createElement('span');
    s.className = 'lb'; s.textContent = label;
    d.appendChild(s);
    rows.appendChild(d);
    return d;
  }
  function btn(host, text, fn, id) {
    var b = document.createElement('button');
    b.textContent = text; if (id) b.id = id;
    b.onclick = fn; host.appendChild(b); return b;
  }

  var gMain = group('控制');
  btn(gMain, 'おまかせ', function () { PV.omakase(); show(); });
  btn(gMain, '上一行', function () { line = (line + LINES.length - 1) % LINES.length; PV.show(line, { force: true }); show(); });
  btn(gMain, '下一行', function () { line = (line + 1) % LINES.length; PV.show(line, { force: true }); show(); });

  var gMood = group('气氛');
  PV.parts('mood').forEach(function (m) {
    btn(gMood, m.nm, function () { PV.setMood(m.key); PV.setLastLayout(''); PV.show(line, { force: true }); show(); });
  });

  var gStyle = group('风格');
  PV.parts('style').forEach(function (s) {
    btn(gStyle, s.nm, function () { PV.useStyle(s.id); savedStyle = s.id; });
  });

  ['layout', 'enter', 'hold', 'exit', 'transition', 'camera', 'decor', 'treatment'].forEach(function (g) {
    var host = group(g);
    PV.parts(g).forEach(function (d) {
      var o = {}; o[g] = d.key;
      btn(host, d.nm + (d.sp ? ' *' : ''), function () { PV.show(line, Object.assign({ force: true }, o)); show(); });
    });
  });

  var gFx = group('滑块');
  ['motion', 'glitch', 'chroma', 'texture', 'density'].forEach(function (k) {
    var s = document.createElement('input');
    s.type = 'range'; s.min = '0'; s.max = '1'; s.step = '0.05'; s.value = String(PV.fx[k]);
    var v = document.createElement('span'); v.className = 'fxv'; v.textContent = s.value;
    /* 写 base 不写 PV.fx：③ 的强度调制每帧重算 PV.fx，直接改会被下一帧抹掉 */
    s.oninput = function () { PV.setFxBase(k, Number(s.value)); v.textContent = s.value; PV.show(line, { force: true }); show(); };
    var lb = document.createElement('span'); lb.className = 'fxv'; lb.textContent = k;
    gFx.appendChild(lb); gFx.appendChild(s); gFx.appendChild(v);
  });

  /* ---- ③ 音频驱动：同源拍点测试音，验证检出来的 BPM ---- */
  var gAu = group('音频');
  var au = document.createElement('audio');
  au.id = 'audio'; au.controls = true; au.preload = 'auto';
  au.style.height = '28px'; au.style.width = '300px';
  var sel = document.createElement('select');
  [['bpm-96', '96 BPM'], ['bpm-120', '120 BPM'], ['bpm-140', '140 BPM']].forEach(function (f) {
    var o = document.createElement('option'); o.value = f[0]; o.textContent = f[1]; sel.appendChild(o);
  });
  var auStat = document.createElement('span'); auStat.className = 'stat';
  function loadFix() { au.src = 'fixtures/' + sel.value + '.wav'; PV.audioStop(); PV.audioStart(); }
  sel.onchange = loadFix;
  /* 播放必须装在按钮的 click 里：合成事件不算用户手势，AudioContext 会被挂起 */
  btn(gAu, '▶ 播放测试音', function () { au.currentTime = 0; au.play().catch(function (e) { auStat.textContent = '播放被拒：' + e.message; }); }, 'auPlay');
  btn(gAu, '⏸', function () { au.pause(); });
  gAu.appendChild(sel); gAu.appendChild(au); gAu.appendChild(auStat);
  loadFix();
  setInterval(function () {
    var st = PV.audio.stats();
    auStat.textContent = 'mode ' + (st.mode || '—') + ' · energy ' + st.energy + ' · bpm ' + st.bpm + ' · conf ' + st.confidence;
    var m = document.getElementById('audioMod'); if (m) m.textContent = 'motion ' + PV.fx.motion.toFixed(2) + ' / chroma ' + PV.fx.chroma.toFixed(2);
  }, 400);
  var mod = document.createElement('span'); mod.className = 'stat'; mod.id = 'audioMod'; gAu.appendChild(mod);

  var planEl = document.getElementById('plan');
  function show() {
    var p = PV.plan();
    if (!p) return;
    planEl.textContent = [p.layout.key, p.enter.key, p.hold.key, p.exit.key, p.transition.key, p.camera.key,
      'decor[' + p.decor.map(function (d) { return d.key; }).join(',') + ']',
      'treat[' + p.treatment.map(function (d) { return d.key; }).join(',') + ']'].join(' / ');
  }

  document.getElementById('stat').textContent =
    Object.entries(PV.stats()).map(function (e) { return e[0] + ' ' + e[1]; }).join('  ·  ');
  PV.show(line, { force: true }); show();
})();
</script>
</body>
</html>
`;

writeFileSync(join(PV, 'test.html'), html, 'utf8');
console.log(`pv/test.html 已生成（CSS ${(css.length / 1024).toFixed(1)} KB / JS ${(js.length / 1024).toFixed(1)} KB）`);
