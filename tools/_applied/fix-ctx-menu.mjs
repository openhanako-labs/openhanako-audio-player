// 修右键菜单背景透明（--card 变量不存在 → --card-bg）
// 用法：node tools/fix-ctx-menu.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

const CSS = `
/* 右键菜单背景：--card 变量不存在导致透明，改用 --card-bg */
.pl-ctx-menu { background: var(--card-bg) !important; }
`;

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");
  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + CSS + "\n" + html.slice(cssIdx);
  writeFileSync(p, html, "utf8");
  console.log(`${rel}: 右键菜单背景修复完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
