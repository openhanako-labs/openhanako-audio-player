// add-strip-lyric.mjs —— 给横条加回单行歌词（歌名下方第二行，窄时隐藏）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 1) DOM：在 strip-identity 里加歌词行
const DOM_FROM = `<div class="strip-identity" id="stripIdentity"><strong id="stripTitle">播放器</strong><span id="stripArtist"></span></div>`;
const DOM_TO = `<div class="strip-identity" id="stripIdentity"><strong id="stripTitle">播放器</strong><span id="stripArtist"></span><span class="strip-lyric" id="stripLyric"></span></div>`;

// 2) CSS：歌词行样式（默认透明，有词才显；窄档隐藏）
const CSS_ANCHOR = `#playerStrip .strip-identity span {\n  flex: 0 1 auto;\n  min-width: 0;\n  font-size: 11px;\n  color: var(--text-light, rgba(241,235,227,.62));\n  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\n}`;
const CSS_ADD = `
/* ── 单行歌词（2026-10-21 加回：极简≠藏歌词）── */
#playerStrip .strip-lyric {
  display: none;
  font-size: 10.5px;
  color: var(--text-muted, rgba(241,235,227,.48));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 46%;
}
#playerStrip .strip-lyric:not(:empty) { display: inline-block; }
#playerStrip[data-width="mini"] .strip-lyric,
#playerStrip[data-width="narrow"] .strip-lyric { display: none; }
`;

// 3) 控制器 JS：加 lyricEl + syncLyric + 在 refresh 里调用
const JS_ANCHOR = `var favBtn = document.getElementById('stripFav');`;
const JS_ADD = `var lyricEl = document.getElementById('stripLyric');`;
const JS_SYNC = `function syncLyric() {
  var lyr = document.getElementById('lyricBody');
  var cur = lyr ? lyr.querySelector('.lyric-line.current .l-main') : null;
  var txt = cur ? cur.textContent.trim() : '';
  if (!txt) {
    var pvLine = document.querySelector('.pv-line[data-d="0"]');
    txt = pvLine ? pvLine.textContent.trim() : '';
  }
  setText(lyricEl, txt);
}`;
const JS_REFRESH_FROM = `function refresh() { syncTrack(); syncPlay(); syncVol(); syncProgress(); }`;
const JS_REFRESH_TO = `function refresh() { syncTrack(); syncPlay(); syncVol(); syncProgress(); syncLyric(); }`;
const JS_OBSERVE_FROM = `var mo2 = new MutationObserver(function () { syncTrack(); });`;
const JS_OBSERVE_TO = `var mo2 = new MutationObserver(function () { syncTrack(); syncLyric(); });`;

for (const file of ['ui/index.html', 'ui/standalone.html']) {
  const fp = join(ROOT, file);
  let h = readFileSync(fp, 'utf8');

  // DOM
  if (h.includes(DOM_FROM) && !h.includes('id="stripLyric"')) {
    h = h.replace(DOM_FROM, DOM_TO);
    console.log(file + ': DOM 歌词行已加');
  } else if (h.includes('id="stripLyric"')) {
    console.log(file + ': DOM 歌词已在');
  } else {
    console.error(file + ': DOM 锚点未找到'); process.exit(1);
  }

  // 控制器 JS
  if (h.includes(JS_ANCHOR) && !h.includes('var lyricEl')) {
    h = h.replace(JS_ANCHOR, JS_ANCHOR + '\n' + JS_ADD);
  }
  if (h.includes(JS_REFRESH_FROM)) {
    h = h.replace(JS_REFRESH_FROM, JS_REFRESH_TO);
  } else { console.error(file + ': refresh 锚点未找到'); process.exit(1); }
  if (h.includes(JS_OBSERVE_FROM)) {
    h = h.replace(JS_OBSERVE_FROM, JS_OBSERVE_TO);
  } else { console.error(file + ': observer 锚点未找到'); process.exit(1); }
  // 插入 syncLyric 函数（放在 syncVol 定义后、syncProgress 前）
  const PROG_ANCHOR = `// ── 进度：环 + 时间 ──`;
  if (h.includes(PROG_ANCHOR) && !h.includes('function syncLyric()')) {
    h = h.replace(PROG_ANCHOR, JS_SYNC + '\n\n' + PROG_ANCHOR);
  }
  writeFileSync(fp, h, 'utf8');
  console.log(file + ': JS 已接');
}

// CSS（只改 style.css，双副本共享）
const cssPath = join(ROOT, 'ui', 'style.css');
let css = readFileSync(cssPath, 'utf8');
if (css.includes(CSS_ANCHOR) && !css.includes('.strip-lyric {')) {
  css = css.replace(CSS_ANCHOR, CSS_ANCHOR + CSS_ADD);
  writeFileSync(cssPath, css, 'utf8');
  console.log('style.css: 歌词样式已加');
} else if (css.includes('.strip-lyric {')) {
  console.log('style.css: 歌词样式已在');
} else {
  console.error('style.css: 锚点未找到'); process.exit(1);
}
console.log('完成');