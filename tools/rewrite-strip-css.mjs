// rewrite-strip-css.mjs —— 把 style.css 的旧横条块(约 2018-2922 行)替换为 C+D 干净层
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = join(ROOT, 'ui', 'style.css');

const START_MARK = '/* ════════════════════════════════════════════════════════════════════\n   横条形态';
const END_MARK = '/* ═══ 顶栏右上角安全区';

const NEW_CSS = `/* ════════════════════════════════════════════════════════════════════
   横条形态（data-layout="strip"）C+D 终版 —— 进度环封面 / 单行 / 悬停三键
   2026-10-21 重写：并入旧的 v9–v15 十余层定稿为一版，删除色场/星光/歌词/prev/next。
   设计：封面外圈进度环(C) + 单行歌名/来源(D)·平时克制、悬停才给控件(D)。
   ════════════════════════════════════════════════════════════════════ */

/* ── 盒子：跟随容器高度（syncStripHeight 写回 --strip-height）── */
.player-container[data-layout="strip"] { overflow: hidden; }
.player-container[data-layout="strip"] > .stage,
.player-container[data-layout="strip"] > .controls,
.player-container[data-layout="strip"] > .player-left,
.player-container[data-layout="strip"] > .player-right,
.player-container[data-layout="strip"] .player-backdrop { display: none !important; }

#playerStrip {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px 0 12px;
  --strip-h: min(64px, 100%);
  overflow: hidden;
  isolation: isolate;
}
.player-container[data-layout="strip"] > #playerStrip { display: flex; min-width: 312px; }

/* ── 封面 + 进度环（C）── */
#playerStrip .strip-cover {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  padding: 0;
  border: 0;
  background: linear-gradient(148deg, #6d5d4c 0%, #3a3229 46%, #241f19 100%);
  background-size: cover;
  background-position: center;
  position: relative;
  cursor: pointer;
}
#playerStrip .strip-cover.has-art { box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
#playerStrip .strip-cover:not(.has-art)::after {
  content: '\\266A';
  position: absolute; inset: 0;
  display: grid; place-items: center;
  color: rgba(255,255,255,.45);
  font-size: 17px;
}
#playerStrip .strip-ring {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  transform: rotate(-90deg);
  pointer-events: none;
}
#playerStrip .strip-ring circle { fill: none; stroke-width: 2; stroke-linecap: round; }
#playerStrip .strip-ring-track { stroke: rgba(255,255,255,.14); }
#playerStrip .strip-ring-fill {
  stroke: var(--accent, #c08a5a);
  stroke-dasharray: 0 132;
  transition: stroke-dashoffset .1s linear, stroke .2s ease;
}
#playerStrip .strip-cover:hover .strip-ring-fill { stroke: #d59a66; }

/* ── 单行歌名 / 来源（D 的信息层）── */
#playerStrip .strip-identity {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  overflow: hidden;
}
#playerStrip .strip-identity strong {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: .005em;
  color: var(--text, #f1ebe3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#playerStrip .strip-identity span {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--text-light, rgba(241,235,227,.62));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── 时间：常驻，压住右侧留白（精确进度靠它兜）── */
#playerStrip .strip-time {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--mono, ui-monospace, Consolas, monospace);
  font-size: 10px;
  color: rgba(255,255,255,.5);
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
  transition: opacity .2s ease;
}
#playerStrip .strip-time-sep { opacity: .5; }
#playerStrip.active .strip-time { opacity: .5; }

/* ── 控件：默认透明占位（不跳版），悬停/聚焦淡入（D）── */
#playerStrip .strip-controls {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transform: translateX(5px);
  pointer-events: none;
  transition: opacity .2s ease, transform .2s ease;
}
#playerStrip.active .strip-controls,
#playerStrip:focus-within .strip-controls {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
#playerStrip .strip-btn {
  width: 28px; height: 28px;
  flex: 0 0 28px;
  display: grid; place-items: center;
  padding: 0; border: 0; border-radius: 50%;
  background: transparent;
  color: rgba(241,235,227,.72);
  cursor: pointer;
  transition: color .15s ease, background .15s ease;
}
#playerStrip .strip-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
#playerStrip .strip-btn:hover { color: var(--text, #f1ebe3); background: rgba(255,255,255,.08); }
#playerStrip .strip-btn:focus-visible { outline: 2px solid var(--accent, #c08a5a); outline-offset: -2px; }
#playerStrip .strip-btn.strip-play {
  background: linear-gradient(150deg, #c08a5a, #8a5f3c);
  color: #fff;
  border-radius: 50%;
}
#playerStrip .strip-btn.strip-play svg { stroke: none; fill: #fff; stroke-width: 0; }
#playerStrip .strip-btn.strip-play:hover { filter: brightness(1.08); }
#playerStrip .strip-btn.is-accent { color: #ff7a6e; }

/* ── 极窄档（<360px）：隐藏来源与时间，保住播放可点 ── */
#playerStrip[data-width="mini"] .strip-identity span { display: none; }
#playerStrip[data-width="mini"] .strip-time { display: none; }
#playerStrip[data-width="narrow"] .strip-time { display: none; }

/* ── 键盘可达：条本身不抢焦点，但按钮焦点可见 ── */

`;

let css = readFileSync(CSS, 'utf8');
const s = css.indexOf(START_MARK);
if (s < 0) { console.error('起点标记未找到'); process.exit(1); }
const e = css.indexOf(END_MARK, s);
if (e < 0) { console.error('终点标记未找到'); process.exit(1); }
const newCss = css.slice(0, s) + NEW_CSS + '\n' + css.slice(e);
writeFileSync(CSS, newCss, 'utf8');
console.log('替换完成: 清除 ' + (e - s) + ' 字节旧横条CSS -> ' + NEW_CSS.length + ' 字节新层');