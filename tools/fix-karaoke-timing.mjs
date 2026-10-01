// 修行切换延迟：highlightLrc 从 timeupdate（~4Hz）挪进 karaokeLoop（rAF 每帧）
// 用法：node tools/fix-karaoke-timing.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

const OLD = `  (function karaokeLoop() {
    try {
      if (!audio.paused) updateKaraoke(audio.currentTime * 1000);
    } catch (e) {}
    requestAnimationFrame(karaokeLoop);
  })();

  audio.addEventListener('timeupdate',function(){
    if(!lrcData.length||!lyricOpen) return;
    highlightLrc(audio.currentTime*1000);
  });`;

const NEW = `  (function karaokeLoop() {
    try {
      if (!audio.paused) {
        var _t = audio.currentTime * 1000;
        updateKaraoke(_t);
        // 行切换也走帧循环（原来挂 timeupdate，只有 ~4Hz，行入场最多慢 250ms）
        // highlightLrc 幂等：行没变时 pvSync 里 idx===_pvIdx 直接返回，重复调零成本
        if (lrcData.length && lyricOpen) highlightLrc(_t);
      }
    } catch (e) {}
    requestAnimationFrame(karaokeLoop);
  })();`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");
  html = replaceOnce(html, OLD, NEW, `${rel} 帧循环`);
  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 行切换提速完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
