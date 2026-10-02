// 出两个包：完整（含 PV）与 lite（不含 PV 模式）
// 用法：
//   node pv/release.mjs            两个都出
//   node pv/release.mjs full       只出完整版
//   node pv/release.mjs lite       只出 lite
//   node pv/release.mjs --check    只验不写 zip
//
// 结构上的前提：PV 是「标记块 + 声明式核心钩子」，lite 不是另一份代码，
// 而是同一份 html 去掉 PV 块与 data-pv 标记。核心钩子全部带 window.PV 判断，
// 没有 PV 块时自然降级成两档（标准 / 歌词），所以两个包共用同一套核心。
//
// manifest.id 必须等于解压出来的目录名——这是 Hana 的安装合同。
// 两个包要能并存，所以 lite 用自己的 id 与名字。
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const PV = dirname(fileURLToPath(import.meta.url));
const ROOT = join(PV, '..');
const DIST = join(ROOT, 'dist');
const CHECK = process.argv.includes('--check');
const KEEP = process.argv.includes('--keep');   // 留下解压目录，方便直接跑包里的 html 验证
const WANT = process.argv.filter(a => a === 'full' || a === 'lite');
const want = (a) => !WANT.length || WANT.includes(a);

const CSS_B = '/* ===== PV:BEGIN 文字PV引擎（pv/ 目录构建产物，勿手改） ===== */';
const CSS_E = '/* ===== PV:END ===== */';
const JS_B = '<!-- ===== PV:BEGIN 文字PV引擎（pv/ 目录构建产物，勿手改） ===== -->';
const JS_E = '<!-- ===== PV:END ===== -->';

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const VER = manifest.version;

/* 与 .github/workflows/package.yml 同一份排除规则——两边不一致就会出现「本地能装 CI 装不上」 */
const EX_DIR = ['.git', '.github', 'dist', 'node_modules', '_extract', '_pack', '__pycache__', 'plugin-data', 'pv'];
const EX_FILE = ['.gitignore', '.gitattributes', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md',
  'COMMERCIAL-LICENSE.md', 'bus-queue.json', 'bus-state.json', 'test.html'];
const EX_SUFFIX = ['.env', '.bak', '.pyc', '.log'];
function excluded(rel) {
  const parts = rel.split('/').filter(Boolean);
  if (!parts.length) return false;
  if (parts.some(p => EX_DIR.includes(p))) return true;
  const base = parts[parts.length - 1];
  if (EX_FILE.includes(base)) return true;
  if (base.endsWith('.bak') || base.includes('.bak-')) return true;
  if (EX_SUFFIX.some(s => base.endsWith(s))) return true;
  /* 开发用的注入/构建脚本不进包，但 tools/*.js 是运行时依赖（register-tools.js 在 import 它） */
  if (parts[0] === 'tools' && base.endsWith('.mjs')) return true;
  return false;
}
const TOP = [
  'manifest.json', 'index.js', 'package.json', 'lib', 'themes', 'tools', 'ui',
  'assets', 'README.md'
];

function cut(html, begin, end, rel) {
  for (;;) {
    const b = html.indexOf(begin);
    if (b < 0) break;
    const e = html.indexOf(end, b);
    if (e < 0) throw new Error(`${rel}: PV 块有 BEGIN 无 END，拒绝出包`);
    let i = e + end.length;
    if (html[i] === '\n') i++;
    html = html.slice(0, b) + html.slice(i);
  }
  return html;
}

function liteHtml(text, rel) {
  let out = cut(text, CSS_B, CSS_E, rel);
  out = cut(out, JS_B, JS_E, rel);
  out = out.replace('<html lang="zh-CN" data-pv="1">', '<html lang="zh-CN">');
  return out;
}

function assert(cond, msg) { if (!cond) { console.error('✗ ' + msg); process.exit(1); } }

function build(kind) {
  const lite = kind === 'lite';
  const id = lite ? manifest.id + '-lite' : manifest.id;
  const version = lite ? VER + '-lite' : VER;
  const outDir = join(DIST, kind);
  const stage = join(outDir, id);
  const zip = join(outDir, id + '-' + version + '.zip');

  rmSync(stage, { recursive: true, force: true });
  rmSync(zip, { force: true });
  mkdirSync(outDir, { recursive: true });
  mkdirSync(stage, { recursive: true });

  for (const name of TOP) {
    const src = join(ROOT, name);
    try { statSync(src); } catch (e) { continue; }
    cpSync(src, join(stage, name), {
      recursive: true,
      /* cpSync 的 filter 只拿到条目内部的相对路径（不带条目名），
       * 所以「tools 下的 .mjs 不进包」这条得把条目名本身拼进去判 */
      filter: (p) => {
        const inner = p.slice(src.length).replace(/^([\/\\])+/, '').replace(/\\/g, '/');
        const rel = name + (inner ? '/' + inner : '');
        return !excluded(rel);
      }
    });
  }

  /* ui 双副本按变体重写 */
  for (const f of ['ui/index.html', 'ui/standalone.html']) {
    const p = join(stage, f);
    let text = readFileSync(p, 'utf8');
    if (lite) {
      text = liteHtml(text, f);
      assert(!text.includes('PV:BEGIN'), `${f}: lite 包里还有 PV 块`);
      assert(!text.includes('data-pv="1"'), `${f}: lite 包里还有 data-pv 标记`);
      // 核心钩子留在原地——它们全部经 window.PV 判断，没 PV 块时自动降级
      assert(text.includes('window.__pvCore'), `${f}: lite 包不该动核心钩子`);
    } else {
      assert(text.includes('PV:BEGIN') && text.includes('data-pv="1"'), `${f}: 完整包缺 PV 块或标记`);
    }
    writeFileSync(p, text, 'utf8');
  }

  const man = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'));
  man.id = id;
  man.version = version;
  if (lite) {
    man.name = '音频播放器（无 PV）';
    man.description = '音频播放器精简版：本地与在线播放、歌词滚动、配色主题、音频反应。不含文字 PV 演出层。';
  }
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(man, null, 2) + '\n', 'utf8');

  /* pv/ 是开发目录（PV 已内联进 ui/*.html），不在包里 */

  const bytes = readFileSync(join(stage, 'ui', 'index.html')).length;
  if (CHECK) {
    console.log(`${kind}: ${id}@${version}  ui/index.html ${(bytes / 1024).toFixed(0)} KB（--check 未打包）`);
    return;
  }
  /* 暂存目录与 zip 同层：zip 里只能有一层顶层目录，那就是 manifest.id */
  execFileSync('tar', ['-a', '-c', '-f', zip, '-C', outDir, id], { stdio: 'inherit' });
  if (!KEEP) rmSync(stage, { recursive: true, force: true });
  const z = statSync(zip).size;
  console.log(`${kind}: ${relative(ROOT, zip)}  ${(z / 1024 / 1024).toFixed(2)} MB  (html ${(bytes / 1024).toFixed(0)} KB)`);
}

if (!CHECK) { rmSync(DIST, { recursive: true, force: true }); mkdirSync(DIST, { recursive: true }); }
if (want('full')) build('full');
if (want('lite')) build('lite');
console.log(CHECK ? '（--check：只验不写）' : '产物在 dist/');
