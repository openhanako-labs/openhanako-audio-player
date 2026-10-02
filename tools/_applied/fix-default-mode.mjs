// 修默认模式：启动时不自动进 JIZURA，只恢复标准/PV
// 用法：node tools/fix-default-mode.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

const OLD = `    try{
      if(localStorage.getItem(KEY)==='1'){ openPanel(); apply(true); }
    }catch(e){}`;

const NEW = `    try{
      var saved=localStorage.getItem(KEY);
      // 只恢复标准/PV，不自动进 JIZURA（jizura-mode 不持久化）
      if(saved==='1'){ openPanel(); apply(true); }
      // 清掉可能残留的 jizura-mode
      document.body.classList.remove('jizura-mode');
      updateBtnIcon();
    }catch(e){}`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");
  html = replaceOnce(html, OLD, NEW, `${rel} 默认模式`);
  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 默认模式修复完成`);
}

console.log("两文件已同步。接下来跑 node tools/bump-build.mjs");
