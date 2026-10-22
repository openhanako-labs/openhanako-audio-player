#!/usr/bin/env node
/**
 * tools/make-entry.mjs — 生成市场用的 .entry.json
 *
 * 为什么需要：
 *   pv/release.mjs 只打 zip，不产出 entry.json。
 *   而市场（liliMozi/hana-marketplace）要求 Release 里同时有
 *   <kind>-<id>-<version>.entry.json 和对应 zip，sha256 必须与实际包一致。
 *
 * 结构参照 v0.11.8 那份已上架的 entry.json：
 *   kind / id / name / publisher / description / version /
 *   permissions[{capability}] / compatibility{minAppVersion} / icon(dataURL) / archive{url,sha256,size,format}
 *
 * 注意：
 *   - archive.url 里写 {{BASE_URL}} 占位，市场侧会替换成实际 Release 地址
 *   - sha256 从实际 zip 算，不手填
 *   - icon 转成 data URL（PNG 内联）
 *
 * 用法：node tools/make-entry.mjs
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const man = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

const kind = 'app';
const id = man.id;
const version = man.version;
const zipName = `${id}-${version}.zip`;
const zipPath = join(ROOT, 'dist', 'full', zipName);

if (!existsSync(zipPath)) {
  console.error(`找不到安装包：${zipPath}`);
  console.error('先跑：node pv/release.mjs full');
  process.exit(1);
}

// ── 计算 sha256 与大小（从实际文件，不手填）──
const buf = readFileSync(zipPath);
const sha256 = createHash('sha256').update(buf).digest('hex');
const size = statSync(zipPath).size;

// ── 图标转 data URL ──
// 市场详情页显示这个图标；没有就留空字符串（不编造）。
let icon = '';
const iconPath = join(ROOT, 'assets', 'icon.png');
if (existsSync(iconPath)) {
  icon = 'data:image/png;base64,' + readFileSync(iconPath).toString('base64');
}

// ── 权限：manifest 的 capabilities 直接映射 ──
const permissions = (man.capabilities || []).map((c) => ({ capability: c }));

const entry = {
  kind,
  id,
  name: man.name,
  publisher: 'Yuexiye',
  description: man.description,
  version,
  permissions,
  compatibility: {
    minAppVersion: man.minAppVersion,
  },
  icon,
  archive: {
    // 市场侧把 {{BASE_URL}} 换成实际 Release 资产地址
    url: `{{BASE_URL}}/${zipName}`,
    sha256,
    size,
    format: 'zip',
  },
};

const outName = `${kind}-${id}-${version}.entry.json`;
const outPath = join(ROOT, 'dist', 'full', outName);
writeFileSync(outPath, JSON.stringify(entry, null, 2) + '\n', 'utf8');

console.log(`entry: dist/full/${outName}`);
console.log(`  version : ${version}`);
console.log(`  sha256  : ${sha256}`);
console.log(`  size    : ${size}`);
console.log(`  icon    : ${icon ? (icon.length / 1024).toFixed(1) + ' KB data URL' : '(无)'}`);
console.log(`  perms   : ${permissions.length} 项`);
