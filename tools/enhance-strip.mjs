// enhance-strip.mjs —— 横版交互增强：音量滑杆 + 环seek + 触屏唤醒 + 背景B色带
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ══════ 1. DOM：controls 里加音量滑杆 ══════ */
const DOM_FROM = `<button class="strip-btn" id="stripVolBtn" title="音量" aria-label="音量"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 9.4h2.9L11.6 6v12L7.4 14.6H4.5z"/><path d="M15.4 9.7a3.6 3.6 0 0 1 0 4.6"/></svg></button>
</div>`;
const DOM_TO = `<button class="strip-btn" id="stripVolBtn" title="音量" aria-label="音量"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 9.4h2.9L11.6 6v12L7.4 14.6H4.5z"/><path d="M15.4 9.7a3.6 3.6 0 0 1 0 4.6"/></svg></button>
<div class="strip-volwrap" id="stripVolWrap"><input type="range" class="strip-vol-slider" id="stripVolSlider2" min="0" max="100" value="80" aria-label="音量大小"></div>
</div>`;

/* ══════ 2. 控制器 JS ══════ */
// 2a. 变量：加 volSliderEl
const JS_VAR_FROM = `var volBtn = document.getElementById('stripVolBtn');`;
const JS_VAR_TO = `var volBtn = document.getElementById('stripVolBtn');
var volSliderEl = document.getElementById('stripVolSlider2');`;

// 2b. 音量：滑杆 input → audio.volume，同时镜像竖卡 volumeSlider；syncVol 回读
const JS_VOL_FROM = `volBtn.addEventListener('click', function (e) { e.stopPropagation(); tap('volumeBtn'); });`;
const JS_VOL_TO = `volBtn.addEventListener('click', function (e) { e.stopPropagation(); tap('volumeBtn'); });
if (volSliderEl) {
  volSliderEl.addEventListener('input', function () {
    var a = document.getElementById('audio');
    var v = Number(volSliderEl.value);
    if (a) a.volume = v / 100;
    volSliderEl.style.setProperty('--vol', v + '%');
    var vs = document.getElementById('volumeSlider');
    if (vs && vs.value !== String(v)) vs.value = v;
  });
}`;

// 2c. syncVol 里回读滑杆（单行锚点，避免多行缩进不匹配）
const JS_SYNCVOL_FROM = `function syncVol() {`;
const JS_SYNCVOL_TO = `function syncVol() {
  var audio = document.getElementById('audio');
  if (!audio) return;
  if (volSliderEl && audio.volume != null) {
    var v = Math.round(audio.volume * 100);
    if (Number(volSliderEl.value) !== v) volSliderEl.value = v;
    volSliderEl.style.setProperty('--vol', v + '%');
  }`;
// 但函数体第一行 audio 已存在，以上插入会导致 audio 声明重复 → 改为在 vBtn 行前插
const JS_SYNCVOL_B = `var vBtn = document.getElementById('volumeBtn');`;
const JS_SYNCVOL_B2 = `var vBtn = document.getElementById('volumeBtn');
  if (volSliderEl && audio.volume != null) {
    var v = Math.round(audio.volume * 100);
    if (Number(volSliderEl.value) !== v) volSliderEl.value = v;
    volSliderEl.style.setProperty('--vol', v + '%');
  }`;

// 2d. 环 seek + 触屏唤醒（加在 refresh() 定义后）
const JS_SEEK_ANCHOR = `function refresh() { syncTrack(); syncPlay(); syncVol(); syncProgress(); syncLyric(); }`;
const JS_SEEK_ADD = `
// ── 封面环 seek（2026-10-21）：点/拖环 → audio.currentTime；环上浮时刻 ──
var stripCoverEl = document.getElementById('stripCover');
var ringFillEl = document.querySelector('.strip-ring-fill');
var curEl2 = document.getElementById('stripCur');
if (stripCoverEl) {
  stripCoverEl.addEventListener('pointerdown', function (e) {
    var a = document.getElementById('audio');
    if (!a || !a.duration) return;
    e.preventDefault();
    stripCoverEl.setPointerCapture(e.pointerId);
    strip.classList.add('seeking');
    function seekTo(x, y) {
      var r = stripCoverEl.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var ang = Math.atan2(y - cy, x - cx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      var t = ang / (Math.PI * 2);
      a.currentTime = t * a.duration;
      syncProgress();
    }
    function onMove(ev) { seekTo(ev.clientX, ev.clientY); }
    function onUp() {
      stripCoverEl.removeEventListener('pointermove', onMove);
      stripCoverEl.removeEventListener('pointerup', onUp);
      strip.classList.remove('seeking');
    }
    stripCoverEl.addEventListener('pointermove', onMove);
    stripCoverEl.addEventListener('pointerup', onUp);
    seekTo(e.clientX, e.clientY);
  });
}

// ── 触屏/点按唤醒（2026-10-21）：点条身空白或封面 → 醒控件；点条外收起 ──
function wake() { strip.classList.add('showing'); }
function sleep() { strip.classList.remove('showing'); }
strip.addEventListener('click', function (e) {
  if (e.target === strip || e.target.classList.contains('strip-identity') ||
      e.target.classList.contains('strip-lyric') || e.target.classList.contains('strip-time') ||
      e.target === stripCoverEl) {
    wake();
  }
});
document.addEventListener('click', function (e) {
  if (!strip.contains(e.target)) sleep();
});`;

// 2e. 背景 B 色带：在 refresh 前定义变量默认（纯 CSS 动画，JS 只需挂 data-bg）
const JS_BG_ANCHOR = `// ── 统一刷新 ──`;
const JS_BG_ADD = `// ── 背景动效：B 色带流动（CSS 动画，strip 上挂 data-bg="flow"）──
strip.setAttribute('data-bg', 'flow');
`;

/* ══════ 3. CSS ══════ */
const CSS_ANCHOR = `#playerStrip .strip-controls {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transform: translateX(5px);
  pointer-events: none;
  transition: opacity .2s ease, transform .2s ease;
}`;
const CSS_ADD = `
/* ── 音量滑杆（2026-10-21 加回）：悬停/唤醒展开 ── */
#playerStrip .strip-volwrap {
  width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  transition: width .2s ease;
}
#playerStrip.active .strip-volwrap,
#playerStrip.showing .strip-volwrap { width: 72px; }
#playerStrip .strip-vol-slider {
  -webkit-appearance: none; appearance: none;
  width: 66px; height: 3px; border-radius: 2px;
  background: linear-gradient(90deg, var(--accent, #c08a5a) var(--vol, 80%), rgba(255,255,255,.16) var(--vol, 80%));
  outline: none; cursor: pointer; margin: 0 4px 0 2px;
}
#playerStrip .strip-vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
  background: #fff; border: none;
}
#playerStrip .strip-vol-slider::-moz-range-thumb { width: 10px; height: 10px; border-radius: 50%; background: #fff; border: none; }

/* ── 封面环 seek：可拖动光标 + seeking 态 ── */
#playerStrip .strip-cover { cursor: pointer; }
#playerStrip .strip-cover.seeking { cursor: grabbing; }
#playerStrip.seeking .strip-ring-fill { stroke: #d59a66; }

/* ── 背景 B 色带流动（transform 平移，不 reflow）── */
#playerStrip { --strip-bgflow: rgba(192,138,90,.10); }
#playerStrip[data-bg="flow"]::before {
  content: "";
  position: absolute;
  top: 0; bottom: 0; left: -40%;
  width: 40%;
  background: linear-gradient(105deg, transparent 0%, var(--strip-bgflow) 50%, transparent 100%);
  pointer-events: none;
  animation: stripFlow 4.2s ease-in-out infinite;
  z-index: 0;
}
@keyframes stripFlow {
  0% { transform: translateX(0); opacity: .35; }
  50% { transform: translateX(340%); opacity: .75; }
  100% { transform: translateX(0); opacity: .35; }
}
`;

for (const file of ['ui/index.html', 'ui/standalone.html']) {
  const fp = join(ROOT, file);
  let h = readFileSync(fp, 'utf8');
  const errs = [];
  // DOM
  if (h.includes(DOM_FROM)) { h = h.replace(DOM_FROM, DOM_TO); } else errs.push('DOM 锚点');
  // JS
  if (h.includes(JS_VAR_FROM)) { h = h.replace(JS_VAR_FROM, JS_VAR_TO); } else errs.push('JS变量锚点');
  if (h.includes(JS_VOL_FROM)) { h = h.replace(JS_VOL_FROM, JS_VOL_TO); } else errs.push('JS音量锚点');
  if (h.includes(JS_SYNCVOL_B)) { h = h.replace(JS_SYNCVOL_B, JS_SYNCVOL_B2); } else errs.push('JS syncVol锚点');
  if (h.includes(JS_SEEK_ANCHOR)) { h = h.replace(JS_SEEK_ANCHOR, JS_SEEK_ANCHOR + JS_SEEK_ADD); } else errs.push('JS seek锚点');
  if (h.includes(JS_BG_ANCHOR)) { h = h.replace(JS_BG_ANCHOR, JS_BG_ADD + JS_BG_ANCHOR); } else errs.push('JS bg锚点');
  if (errs.length) { console.error(file + ': 未找到锚点 ' + errs.join(',')); process.exit(1); }
  writeFileSync(fp, h, 'utf8');
  console.log(file + ': DOM+JS 完成');
}

// CSS
const cssPath = join(ROOT, 'ui', 'style.css');
let css = readFileSync(cssPath, 'utf8');
if (css.includes(CSS_ANCHOR)) {
  css = css.replace(CSS_ANCHOR, CSS_ANCHOR + CSS_ADD);
  writeFileSync(cssPath, css, 'utf8');
  console.log('style.css: 完成');
} else { console.error('CSS 锚点未找到'); process.exit(1); }
console.log('全部完成');