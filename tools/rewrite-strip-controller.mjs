// rewrite-strip-controller.mjs —— 重写横条控制器 JS，适配 C+D 新结构
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const NEW_CONTROLLER = `<!-- 横条形态控制器（C+D 重写：进度环 / 单行 / 悬停三键）
     纯 DOM/CSS 操作，不依赖 app.js 内部变量。
     只复用既有播放/收藏接口（按 id 取元素并触发其既有 click/handler）。-->
<script>
(function () {
'use strict';
var strip = document.getElementById('playerStrip');
if (!strip) return;
var player = document.querySelector('.player-container');
var cover = document.getElementById('stripCover');
var ringFill = document.querySelector('.strip-ring-fill');
var nameEl = document.getElementById('stripTitle');
var artistEl = document.getElementById('stripArtist');
var curEl = document.getElementById('stripCur');
var totalEl = document.getElementById('stripTotal');
var playBtn = document.getElementById('stripPlay');
var playIcon = document.getElementById('stripPlayIcon');
var pauseIcon = document.getElementById('stripPauseIcon');
var favBtn = document.getElementById('stripFav');
var volBtn = document.getElementById('stripVolBtn');

// ── 信封驱动断点 ──
var lastLayout = null;
function layoutFromEnvelope(env) {
  var w = null, h = null;
  try {
    if (env && env.width)  w = env.width.value != null ? env.width.value : (env.width.max != null ? env.width.max : null);
    if (env && env.height) h = env.height.value != null ? env.height.value : (env.height.max != null ? env.height.max : null);
  } catch (e) {}
  if (w == null) w = window.innerWidth || document.documentElement.clientWidth || 0;
  if (h == null) h = window.innerHeight || document.documentElement.clientHeight || 0;
  if (h <= 0 || w <= 0) return lastLayout || 'long';
  var next;
  if (h <= 156 && w >= h * 1.6) next = 'strip';
  else next = w >= 720 ? 'wide' : (h < 560 ? 'compact' : 'long');
  return next;
}
function syncStripHeight() {
  if (!strip) return;
  var isStrip = player && player.getAttribute('data-layout') === 'strip';
  if (!isStrip) return;
  var h = strip.getBoundingClientRect().height;
  if (!h || h <= 0) {
    requestAnimationFrame(syncStripHeight);
    return;
  }
  var capped = Math.min(64, Math.max(40, Math.round(h)));
  strip.style.setProperty('--strip-height', capped + 'px');
}

// ── 标题栏交互区域上报 ──
function reportInteractiveRegions() {
  try {
    var surf = window.__hana && window.__hana.surface;
    if (!surf || typeof surf.setInteractiveRegions !== 'function') return;
    var rects = [];
    var seen = 0;
    var all = document.querySelectorAll('button, [role="button"], input[type="range"], .nav-tab, .mc, .strip-btn, .icon-btn');
    all.forEach(function (b) {
      if (seen >= 60) return;
      var r = b.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      var cs = getComputedStyle(b);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
      if (r.top > 160) return;
      rects.push({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
      seen++;
    });
    var isStrip = player && player.getAttribute('data-layout') === 'strip';
    if (isStrip) {
      var btns = strip.querySelectorAll('.strip-btn');
      btns.forEach(function (b) {
        var r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) rects.push({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
      });
    }
    surf.setInteractiveRegions(rects);
  } catch (e) {}
}
window.addEventListener('resize', function () { syncStripHeight(); reportInteractiveRegions(); });
window.addEventListener('resize', function () { applyEnvelopeResize(); });
function applyEnvelopeResize() {
  var next = layoutFromEnvelope();
  if (next !== lastLayout) { lastLayout = next; if (player) player.setAttribute('data-layout', next); refresh(); }
  syncStripHeight(); reportInteractiveRegions();
}
try {
  if (window.__hana && window.__hana.envelope && window.__hana.envelope.subscribe) {
    window.__hana.envelope.subscribe(function (env) {
      var next = layoutFromEnvelope(env);
      if (next !== lastLayout) { lastLayout = next; if (player) player.setAttribute('data-layout', next); refresh(); }
      syncStripHeight(); reportInteractiveRegions();
    });
  }
} catch (e) {}

// ── 悬停/聚焦交互态：指针进条/获焦显示控件 ──
function setActive(on) { strip.classList.toggle('active', on); }
strip.addEventListener('pointerenter', function () { setActive(true); });
strip.addEventListener('pointerleave', function () { setActive(false); });
strip.addEventListener('focusin', function () { setActive(true); });
strip.addEventListener('focusout', function (e) { if (!strip.contains(e.relatedTarget)) setActive(false); });

// ── 复用既有控件：派发 click，行为与竖卡一致 ──
function tap(id) { var el = document.getElementById(id); if (el) el.click(); }
playBtn.addEventListener('click', function () { tap('playBtn'); });
favBtn.addEventListener('click', function (e) { e.stopPropagation(); tap('favBtn'); });
volBtn.addEventListener('click', function (e) { e.stopPropagation(); tap('volumeBtn'); });

// ── 镜像竖卡状态：歌名/歌手/封面/播放态/收藏 ──
function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
var lastCover = null;
function syncTrack() {
  var tn = document.getElementById('trackName');
  var tm = document.getElementById('trackMode');
  setText(nameEl, tn ? tn.textContent : '播放器');
  setText(artistEl, tm ? tm.textContent : '');
  var nc = document.getElementById('npCover');
  var img = nc ? nc.querySelector('img') : null;
  var src = img ? img.getAttribute('src') : null;
  if (src !== lastCover) {
    lastCover = src;
    cover.style.backgroundImage = src ? 'url("' + src.replace(/\\"/g, '') + '")' : '';
    cover.classList.toggle('has-art', !!src);
    cover.setAttribute('aria-label', src ? '' : '显示播放控件');
  }
  var fv = document.getElementById('favBtn');
  favBtn.classList.toggle('is-accent', !!(fv && fv.classList && fv.classList.contains('is-accent')));
}
function syncPlay() {
  var audio = document.getElementById('audio');
  var playing = audio && !audio.paused;
  playIcon.style.display = playing ? 'none' : 'block';
  pauseIcon.style.display = playing ? 'block' : 'none';
}
function syncVol() {
  var audio = document.getElementById('audio');
  if (!audio) return;
  var vBtn = document.getElementById('volumeBtn');
  if (vBtn && vBtn.querySelector('svg')) {
    var dim = vBtn.querySelector('svg').style.opacity === '0.3';
    volBtn.style.opacity = dim ? '0.4' : '1';
  }
}

// ── 进度：环 + 时间 ──
function syncProgress() {
  var audio = document.getElementById('audio');
  if (!audio) return;
  var p = audio.duration ? (audio.currentTime / audio.duration) : 0;
  p = p < 0 ? 0 : (p > 1 ? 1 : p);
  if (ringFill) {
    var R = 21, CIRC = 2 * Math.PI * R;
    ringFill.style.strokeDasharray = CIRC;
    ringFill.style.strokeDashoffset = CIRC * (1 - p);
  }
  curEl.textContent = fmtTime(audio.currentTime);
  totalEl.textContent = fmtTime(audio.duration);
}
function fmtTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

// ── 统一刷新 ──
function refresh() { syncTrack(); syncPlay(); syncVol(); syncProgress(); }

// ── 订阅播放/时间/音量事件 ──
var audio = document.getElementById('audio');
if (audio) {
  audio.addEventListener('play', function () { syncPlay(); });
  audio.addEventListener('pause', function () { syncPlay(); });
  audio.addEventListener('timeupdate', function () { syncProgress(); });
  audio.addEventListener('volumechange', function () { syncVol(); });
  audio.addEventListener('loadedmetadata', function () { syncProgress(); });
}

// ── 竖卡 DOM 变化 → 同步横条 ──
var mo2 = new MutationObserver(function () { syncTrack(); });
var npc = document.getElementById('npCover');
if (npc) mo2.observe(npc, { childList: true });
var tnm = document.getElementById('trackName');
if (tnm) mo2.observe(tnm, { childList: true });
var tmm = document.getElementById('trackMode');
if (tmm) mo2.observe(tmm, { childList: true });
var fvb = document.getElementById('favBtn');
if (fvb) mo2.observe(fvb, { attributes: true, attributeFilter: ['class', 'style'] });
// 布局切换时全量刷新
var mo3 = new MutationObserver(function () { refresh(); syncStripHeight(); reportInteractiveRegions(); });
if (player) mo3.observe(player, { attributes: true, attributeFilter: ['data-layout'] });

refresh();
document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
})();
</script>
`;

for (const file of ['ui/index.html', 'ui/standalone.html']) {
  const fp = join(ROOT, file);
  let html = readFileSync(fp, 'utf8');
  const start = html.indexOf('<!-- 横条形态控制器');
  if (start < 0) { console.error(file + ': 控制器注释未找到'); process.exit(1); }
  // 控制器注释到下一个 </script> 结束
  const closeTag = html.indexOf('</script>', start);
  if (closeTag < 0) { console.error(file + ': 控制器闭合未找到'); process.exit(1); }
  const end = closeTag + '</script>'.length;
  const newHtml = html.slice(0, start) + NEW_CONTROLLER + html.slice(end);
  writeFileSync(fp, newHtml, 'utf8');
  console.log(file + ': 控制器替换完成, ' + (end - start) + ' -> ' + NEW_CONTROLLER.length);
}
console.log('双副本控制器完成');