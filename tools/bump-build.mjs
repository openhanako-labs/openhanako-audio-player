#!/usr/bin/env node
/**
 * bump-build.mjs — 构建号三处同步
 *
 * 教训（2026-09-30）：__HANA_BUILD 硬编码在 index.html / standalone.html 里，
 * _build.json 是轮询锚点。三处必须一起动——只改 _build.json 会让所有已开页面
 * 陷入「检测到新构建 → reload → 嵌的还是旧号 → 再 reload」的死循环（10 秒一刷，
 * 播放被反复重置）。
 *
 * 用法：node tools/bump-build.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date();
const pad = (n, w = 2) => String(n).padStart(w, "0");
const build =
  pad(now.getMonth() + 1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());

writeFileSync(join(root, "ui/_build.json"), JSON.stringify({ build }));

for (const name of ["ui/index.html", "ui/standalone.html"]) {
  const p = join(root, name);
  const html = readFileSync(p, "utf8");
  const next = html.replace(
    /window\.__HANA_BUILD = "[^"]*";/,
    `window.__HANA_BUILD = "${build}";`
  );
  if (next === html) throw new Error(`${name}: __HANA_BUILD 行没匹配上，格式可能变了`);
  writeFileSync(p, next);
}

console.log(`build = ${build}（_build.json + index.html + standalone.html 三处已同步）`);
