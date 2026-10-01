// 主 UI 视觉对齐：封面黑胶化（旋转 + 中央孔 + 纹理 + 播放暂停联动）
// 用法：node tools/inject-vinyl.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. CSS：黑胶纹理（插到最后一个 </style> 前） ============ */
const VINYL_CSS = `
/* ===== 黑胶封面（主 UI 对齐设计稿） ===== */
body:not(.view-compact) .np-cover {
  border-radius: 50% !important;
  position: relative;
  box-shadow: 0 0 0 5px var(--card-bg, #141210), 0 0 0 6px var(--border), 0 12px 32px rgba(0,0,0,.45) !important;
}
body:not(.view-compact) .np-cover::before {
  content: '';
  position: absolute; inset: 0; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, rgba(0,0,0,.14) 0deg 2deg, transparent 2deg 5deg);
  pointer-events: none;
}
body:not(.view-compact) .np-cover::after {
  content: '';
  position: absolute; inset: 41%; border-radius: 50%;
  background: var(--card-bg, #141210);
  box-shadow: inset 0 0 0 2px var(--border);
  pointer-events: none;
}
body:not(.view-compact) .np-cover.spinning {
  animation: vinylSpin 14s linear infinite;
}
@keyframes vinylSpin { to { transform: rotate(360deg); } }
/* 封面图在黑胶里保持圆形 */
body:not(.view-compact) .np-cover img { border-radius: 50%; }
`;

/* ============ 2. JS：播放/暂停联动旋转（</body> 前） ============ */
const VINYL_JS = `
<script>
/* ===== 黑胶旋转联动 ===== */
(function(){
'use strict';
var cover=document.getElementById('npCover');
var audio=document.querySelector('audio');
if(!cover||!audio)return;
function sync(){ cover.classList.toggle('spinning',!audio.paused); }
audio.addEventListener('play',sync);
audio.addEventListener('pause',sync);
sync();
})();
</`+`script>
`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + VINYL_CSS + "\n" + html.slice(cssIdx);

  const jsIdx = html.lastIndexOf("</body>");
  if (jsIdx < 0) throw new Error(`${rel}: 找不到 </body>`);
  html = html.slice(0, jsIdx) + VINYL_JS + "\n" + html.slice(jsIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 黑胶封面注入完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
