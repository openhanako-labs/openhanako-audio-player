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
  document.getElementById('err').textContent = window.__errs.join('\\n');
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
    { text: '就算前面是深渊也别回头，我一直都在这里等', time: 8000, end: 12000 },
    { text: '风也/停了/星也落了', time: 12000, end: 16000 },
    { text: '*烧成灰也要亮一下*|现场版 2026', time: 16000, end: 20000 },
    { text: '够了!|喊完就安静', time: 20000, end: 22000 },
    { text: '', time: 22000, end: 26000 }
  ];
  var line = 0, savedStyle = 'gold';
  /* 预览台没有 core 的频谱链，清掉那个开关免得白等 6 秒才自建图 */
  try { localStorage.removeItem('hana_audio_reactive'); } catch (e) { }
  /* 预览台里 PV 自己接元素是安全的（这里没有 core 会输）；App 里这个开关默认 false */
  PV.audioOwn = true;
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

  var gFace = group('字体');
  btn(gFace, '自动（跟 App）', function () { PV.setFaceManual(false); PV.show(line, { force: true }); show(); });
  PV.parts('face').forEach(function (f) {
    var tag = f.hit.length ? f.hit.join(' → ') : (f.unknown.length ? '只能靠汉字判：' + f.unknown.join(' ') : '本机判不到任何一个候选');
    var b = btn(gFace, f.nm, function () {
      PV.setFaceManual(f.key); PV.show(line, { force: true }); show();
    });
    b.title = f.nm + ' · ' + tag + (f.miss.length ? ' ｜本机无：' + f.miss.join(' ') : '');
    if (!f.hit.length && !f.unknown.length) { b.style.opacity = '.4'; }
  });
  var fr = document.createElement('span'); fr.className = 'stat';
  fr.textContent = '本机可用 ' + PV.parts('face').reduce(function (a, f) { return a + f.hit.length; }, 0) +
    ' 族 / 共 ' + PV.parts('face').reduce(function (a, f) { return a + f.hit.length + f.miss.length; }, 0) +
    ' 候选（量不到的已保留在栏里，由 CSS 自己跳）';
  gFace.appendChild(fr);

  var gBg = group('背景');
  PV.parts('bg').forEach(function (b) {
    btn(gBg, b.nm, function () { PV.show(line, { force: true, bg: b.key }); show(); });
  });
  var sw = document.createElement('input');
  sw.type = 'range'; sw.min = '0'; sw.max = '1'; sw.step = '0.05'; sw.value = String(PV.bgSwap);
  var swv = document.createElement('span'); swv.className = 'fxv'; swv.textContent = sw.value;
  var swl = document.createElement('span'); swl.className = 'fxv'; swl.textContent = '换率';
  sw.oninput = function () { PV.bgSwap = Number(sw.value); swv.textContent = sw.value; };
  gBg.appendChild(swl); gBg.appendChild(sw); gBg.appendChild(swv);

  var gLook = group('外观');
  PV.parts('look').forEach(function (d) {
    btn(gLook, d.nm, function () { PV.show(line, { force: true, look: d.key }); show(); });
  });

  var gFx = group('滑块');
  ['motion', 'glitch', 'chroma', 'texture', 'density', 'decor'].forEach(function (k) {
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
    var ci = PV.cutsInfo ? PV.cutsInfo() : { cut: 0, n: 1 };
    planEl.textContent = 'cut ' + (ci.cut + 1) + '/' + ci.n + '  ⟵  ' +
      [p.layout.key, p.face ? 'face:' + p.face.key : 'face:—', p.look ? 'look:' + p.look.key : 'look:—', p.bg ? 'bg:' + p.bg.key : 'bg:—',
      p.enter.key, p.hold.key, p.exit.key, p.transition.key, p.camera.key,
      'decor[' + p.decor.map(function (d) { return d.key; }).join(',') + ']',
      'treat[' + p.treatment.map(function (d) { return d.key; }).join(',') + ']'].join(' / ');
    var bh = PV.bgHost ? PV.bgHost() : null;
    if (bh) stat.textContent = Object.entries(PV.stats()).map(function (e) { return e[0] + ' ' + e[1]; }).join('  ·  ') + '   当前背景:' + (bh.dataset.bg || '—');
    var ct = document.getElementById('cutPlan');
    if (ct) ct.textContent = (ci.times || []).map(function (t, k) {
      return (k === ci.cut ? '▶' : ' ') + (k + 1) + ' [' + (t[0] / 1000).toFixed(2) + '→' + (t[1] / 1000).toFixed(2) + ']';
    }).join('  ');
  }

  document.getElementById('stat').textContent =
    Object.entries(PV.stats()).map(function (e) { return e[0] + ' ' + e[1]; }).join('  ·  ');
  var cutRow = document.createElement('div');
  cutRow.className = 'row';
  cutRow.innerHTML = '<span class="lb">cut 时间</span><span class="stat" id="cutPlan">—</span>' +
    '<label class="fxv" style="width:auto"><input type="checkbox" id="cbSnap" checked> beatSnap</label>' +
    '<label class="fxv" style="width:auto"><input type="checkbox" id="cbAuto" checked> autoSplit</label>' +
    '<span class="fxv">maxChars</span><input type="range" id="rgMax" min="6" max="24" step="1" value="13">' +
    '<span class="fxv" id="rgMaxV">13</span>';
  rows.insertBefore(cutRow, rows.children[1]);
  document.getElementById('cbSnap').onchange = function (e) { PV.beatSnap = e.target.checked; PV.show(line, { force: true }); show(); };
  document.getElementById('cbAuto').onchange = function (e) { PV.autoSplit = e.target.checked; PV.show(line, { force: true }); show(); };
  document.getElementById('rgMax').oninput = function (e) {
    PV.maxCutChars = Number(e.target.value); document.getElementById('rgMaxV').textContent = e.target.value;
    PV.show(line, { force: true }); show();
  };
  btn(rows.children[0], '⏵ 推 +0.4s', function () { PV.audio.time = (PV.audio.time || 0) + 400; });
  PV.show(line, { force: true }); show();
})();
</script>
</body>
</html>
`;

writeFileSync(join(PV, 'test.html'), html, 'utf8');
console.log(`pv/test.html 已生成（CSS ${(css.length / 1024).toFixed(1)} KB / JS ${(js.length / 1024).toFixed(1)} KB）`);
