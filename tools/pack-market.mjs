#!/usr/bin/env node
/**
 * tools/pack-market.mjs — 出「市场发布包」：app-<id>-<version>.zip + .entry.json
 *
 * 背景：市场（liliMozi/hana-marketplace）只按 approvals.json 里的 tag 读某个
 * Release 的两个附件——`app-<id>-<version>.zip` 与同名 `.entry.json`；
 * 它校验「entry.archive.sha256 == 实际 zip 哈希 == approvals.json 登记的 sha256」三方一致。
 * pv/release.mjs 出的 zip 是给用户下载安装的，市场那两个附件必须另生成。
 * 本脚本把这件事固化，省得每次手工拼。
 *
 * 用法：
 *   node tools/pack-market.mjs              # 出包 + 打印 sha256（供 approvals.json 用）
 *   node tools/pack-market.mjs --upload     # 出包后 gh release upload 到 v<version>
 *   node tools/pack-market.mjs --check      # 只校验环境与产物，不写盘
 *
 * 前置：先跑 node pv/build.mjs 与 node pv/release.mjs（或本脚本自动补跑 release）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const UPLOAD = ARGS.includes('--upload');
const CHECK = ARGS.includes('--check');
const PUBLISHER = (() => {
  const i = ARGS.indexOf('--publisher');
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : 'Yuexiye';
})();
const REPO = (() => {
  const i = ARGS.indexOf('--repo');
  if (i >= 0 && ARGS[i + 1]) return ARGS[i + 1];
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const m = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    return m ? m[1] : '';
  } catch { return ''; }
})();

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const ID = man.id;
const VER = man.version;
const TAG = 'v' + VER;

const fullZip = path.join(ROOT, 'dist', 'full', `${ID}-${VER}.zip`);
if (!fs.existsSync(fullZip)) {
  if (CHECK) fail(`缺少 ${path.relative(ROOT, fullZip)}，先跑 node pv/release.mjs`);
  console.log('· 未找到 full 包，先跑 pv/release.mjs…');
  execFileSync(process.execPath, [path.join(ROOT, 'pv', 'release.mjs'), 'full'], { cwd: ROOT, stdio: 'inherit' });
}
if (!fs.existsSync(fullZip)) fail(`pv/release.mjs 未产出 ${path.relative(ROOT, fullZip)}`);

const outDir = path.join(ROOT, 'dist', 'market');
fs.mkdirSync(outDir, { recursive: true });
const appZipName = `app-${ID}-${VER}.zip`;
const appZipPath = path.join(outDir, appZipName);

if (CHECK) {
  console.log(`（--check）将产出 ${path.relative(ROOT, appZipPath)} + entry.json，tag=${TAG}`);
  process.exit(0);
}

fs.copyFileSync(fullZip, appZipPath);
const buf = fs.readFileSync(appZipPath);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
const size = buf.length;

// icon → data URI（entry.json 要内联）
let icon = '';
try { icon = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'icon.png')).toString('base64'); }
catch { console.warn('! assets/icon.png 读取失败，entry.json 的 icon 将为空'); }

const entry = {
  kind: 'app',
  id: ID,
  name: man.name,
  publisher: PUBLISHER,
  description: man.description,
  version: VER,
  permissions: (man.capabilities || []).map((c) => ({ capability: c })),
  compatibility: { minAppVersion: man.minAppVersion },
  icon,
  archive: { url: `{{BASE_URL}}/${appZipName}`, sha256, size, format: 'zip' },
};
const entryPath = path.join(outDir, `app-${ID}-${VER}.entry.json`);
fs.writeFileSync(entryPath, JSON.stringify(entry, null, 2) + '\n', 'utf8');

console.log('');
console.log('✓ 市场包已生成');
console.log('  zip    : ' + path.relative(ROOT, appZipPath));
console.log('  entry  : ' + path.relative(ROOT, entryPath));
console.log('  size   : ' + size + ' 字节');
console.log('  sha256 : ' + sha256);
console.log('');
console.log('下一步：');
console.log('  1) 把下面两条填进市场 approvals.json（id=' + ID + '）：');
console.log('       "tag": "' + TAG + '",');
console.log('       "sha256": "' + sha256 + '"');
console.log('  2) 上传两个附件到 Release ' + TAG + '：');
if (UPLOAD) {
  if (!REPO) fail('无法确定仓库（用 --repo owner/name 指定）');
  console.log('     → 正在上传到 ' + REPO + ' ' + TAG + ' …');
  execFileSync('gh', ['release', 'upload', TAG,
    appZipPath, entryPath,
    '--repo', REPO, '--clobber'], { stdio: 'inherit' });
  console.log('  ✓ 上传完成');
} else {
  console.log('       gh release upload ' + TAG + ' "' + path.relative(ROOT, appZipPath).replace(/\\/g, '/') + '" "' + path.relative(ROOT, entryPath).replace(/\\/g, '/') + '" --clobber');
  console.log('     （加 --upload 参数可让本脚本直接上传）');
}
