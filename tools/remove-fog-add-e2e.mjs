// remove-fog-add-e2e.mjs —— 删白雾渐隐 + edge-to-edge 顶部安全区
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = join(ROOT, 'ui', 'style.css');
let css = readFileSync(CSS, 'utf8');

// 1) 删白雾：整段 [data-theme="dark"] body::before 及其配套
const FOG_START = '[data-theme="dark"] body::before {\n';
const FOG_END = '[data-theme="dark"] .header { position: relative; z-index: 9999; }\n';
const s = css.indexOf(FOG_START);
const e = css.indexOf(FOG_END);
if (s >= 0 && e >= 0) {
  css = css.slice(0, s) + css.slice(e + FOG_END.length);
  console.log('白雾 body::before 已删');
} else { console.error('白雾段边界未找到', s, e); }

// 2) 删配套 strip 关雾补丁
const P1 = `/* 横条贴顶时不套这条渐变：横条是深色自身，不该被顶部浅色渐隐染色（2026-10-21） */`;
const p1 = css.indexOf(P1);
const p1end = css.indexOf('\n}\n', p1) + 3;
if (p1 >= 0) {
  css = css.slice(0, p1) + css.slice(p1end);
  console.log('strip 关雾补丁已删');
} else { console.error('strip补丁未找到'); }

// 3) 加 edge-to-edge 顶部安全区（宿主悬浮控件盖窗口上缘时，给竖卡 header 让位）
css += `
/* ── edge-to-edge 顶部安全区（2026-10-21）：宿主不画标题栏后，悬浮控件
     仍可能盖窗口上缘。给竖卡 header 顶部留 8px 呼吸，strip 形态除外。 */
body.eframe .header,
.player-container:not([data-layout="strip"]) .header {
  padding-top: 10px;
}
`;
writeFileSync(CSS, css, 'utf8');
console.log('edge-to-edge 顶部安全区已加');
console.log('白雾残留:', css.includes('height: 78px'));