// rewrite-strip-dom.mjs —— 把 #playerStrip 的旧结构替换为 C+D 新结构
// 同步 index.html + standalone.html 双副本（调用方处理编码回写）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const NEW_STRIP = `<div id="playerStrip" aria-label="横条播放器">
<button class="strip-cover" id="stripCover" type="button" aria-label="显示播放控件" style="z-index:3">
<svg class="strip-ring" viewBox="0 0 48 48" aria-hidden="true"><circle class="strip-ring-track" cx="24" cy="24" r="21"/><circle class="strip-ring-fill" cx="24" cy="24" r="21"/></svg>
<span class="strip-ring-glow"></span>
</button>
<div class="strip-identity" id="stripIdentity"><strong id="stripTitle">播放器</strong><span id="stripArtist"></span></div>
<div class="strip-time" id="stripTime"><span id="stripCur">0:00</span><span class="strip-time-sep">/</span><span id="stripTotal">0:00</span></div>
<div class="strip-controls" id="stripControls">
<button class="strip-btn" id="stripFav" title="收藏" aria-label="收藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19.6s-6.6-4.1-6.6-8.4A3.8 3.8 0 0 1 12 8.9a3.8 3.8 0 0 1 6.6 2.3c0 4.3-6.6 8.4-6.6 8.4z"/></svg></button>
<button class="strip-btn strip-play" id="stripPlay" title="播放/暂停" aria-label="播放/暂停">
<svg id="stripPlayIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M9.2 5.4v13.2L19 12z"/></svg>
<svg id="stripPauseIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="display:none"><path d="M9 5.5v13"/><path d="M15 5.5v13"/></svg>
</button>
<button class="strip-btn" id="stripVolBtn" title="音量" aria-label="音量"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 9.4h2.9L11.6 6v12L7.4 14.6H4.5z"/><path d="M15.4 9.7a3.6 3.6 0 0 1 0 4.6"/></svg></button>
</div>
</div>\n
`;

for (const file of ['ui/index.html', 'ui/standalone.html']) {
  const fp = join(ROOT, file);
  let html = readFileSync(fp, 'utf8');
  const start = html.indexOf('<div id="playerStrip"');
  if (start < 0) { console.error(file + ': #playerStrip 未找到'); process.exit(1); }
  const endMark = html.indexOf('<div class="player-right">', start);
  if (endMark < 0) { console.error(file + ': player-right 未找到'); process.exit(1); }
  // 保留 playerStrip 前的换行缩进，替换到 endMark（player-right 前）
  const before = html.slice(0, start);
  const after = html.slice(endMark);
  const newHtml = before + NEW_STRIP.trimEnd() + '\n\n' + after.replace(/^\s*\n/, '\n');
  writeFileSync(fp, newHtml, 'utf8');
  console.log(file + ': 替换完成, 块 ' + (endMark - start) + ' 字节 -> ' + NEW_STRIP.length + ' 字节');
}
console.log('双副本完成');