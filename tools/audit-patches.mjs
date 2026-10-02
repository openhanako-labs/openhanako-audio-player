// 清点 tools/ 里的一次性补丁脚本：哪些已吃进 html、哪些还能重放、哪些已失效（以及为什么失效）
// 用法：
//   node tools/audit-patches.mjs            人读
//   node tools/audit-patches.mjs --json     额外写 tools/patches-audit.json
//
// 为什么要这个：这批 inject-*/fix-* 全是对 ui/index.html 的 replaceOnce 补丁。
// 锚点被自己替换掉之后就再也跑不动了，而「跑不动」有三种完全不同的含义，混在一起看就会误判：
//   applied       NEW 在、OLD 不在 → 正常已落地
//   injected      纯插入块，在页面里出现 1 次 → 已落地（重跑会变双份）
//   wrap-ok       OLD 是 NEW 的子串（在原地元素外套一层）→ 字面比对必然「并存」，属正常
//   superseded    钉的是旧 JIZURA 引擎，① 迁移时整块删了 → 作废，不是漂移
//   overwritten   被链上更后面的补丁改写了（能在别的脚本的 NEW 里找到它）→ 链式正常结果
//   replayable    OLD 还在、NEW 不在 → 真没跑过，还能重放
//   missing/both/duplicated → 上面都解释不了的，才需要人看
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['ui/index.html', 'ui/standalone.html'];
const SKIP = ['bump-build.mjs', 'audit-patches.mjs', 'list-music.js', 'play.js', 'bind-banner.js'];
const NL = String.fromCharCode(10);

/* 从脚本源码里抽两类内容：
 *  A) const X_OLD / const X_NEW 锚点对
 *  B) 没有锚点、整块插到 </style> / </body> 前的常量——这类重跑一次就是再注一份
 */
function pairsOf(src) {
  const out = [];
  const bag = {};
  const re = /const\s+([A-Za-z0-9_]+?)_(OLD|NEW)\s*=\s*`([\s\S]*?)`\s*;?/g;
  let m;
  while ((m = re.exec(src))) {
    bag[m[1]] = bag[m[1]] || {};
    bag[m[1]][m[2]] = m[3];
    bag[m[1]].interp = bag[m[1]].interp || /\$\{/.test(m[3]);
  }
  const named = new Set();
  for (const k of Object.keys(bag)) {
    if (bag[k].OLD != null && bag[k].NEW != null) {
      out.push({ name: k, old: bag[k].OLD, next: bag[k].NEW, interp: !!bag[k].interp });
      named.add(k);
    }
  }
  /* B 类按反引号切分源码来找（奇数段就是模板体），省掉一层转义地狱 */
  const chunks = src.split('`');
  for (let i = 1; i < chunks.length; i += 2) {
    const body = chunks[i];
    if (body.length < 40 || body.indexOf(NL) < 0) continue;
    const nm = /const\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*$/.exec(chunks[i - 1]);
    if (!nm) continue;
    // A 类的 X_OLD / X_NEW 本身也是多行模板，不能再当插块收一遍
    if (/_OLD$|_NEW$/.test(nm[1]) || named.has(nm[1]) || named.has(nm[1].replace(/_OLD$|_NEW$/, ''))) continue;
    named.add(nm[1]);
    out.push({ name: nm[1], block: body, interp: body.indexOf('$' + '{') >= 0 });
  }
  return out;
}

const norm = (s) => s.replace(/\r\n/g, NL).replace(/[ \t]+$/gm, '');
const htmls = {};
for (const t of TARGETS) htmls[t] = norm(readFileSync(join(ROOT, t), 'utf8'));

const files = [];
for (const dir of ['tools', 'tools/_applied']) {
  let list = [];
  try { list = readdirSync(join(ROOT, dir)); } catch (e) { continue; }
  for (const f of list) if (f.endsWith('.mjs') && !SKIP.includes(f)) files.push(dir + '/' + f);
}

/* 所有脚本的 NEW 面：用来判「被后续补丁吃掉」 */
const allNew = [];
for (const file of files) {
  for (const p of pairsOf(readFileSync(join(ROOT, file), 'utf8'))) {
    allNew.push({ file, text: norm(p.next || p.block || '') });
  }
}
function eatenBy(self, old) {
  // 逐步缩短探针：后续补丁往往只保留 OLD 的头几行，后文已自已被改写
  for (const n of [Math.min(160, old.length), 80, old.split(NL)[0].length]) {
    if (n < 12) break;
    const probe = old.slice(0, n);
    const hit = allNew.find(x => x.file !== self && x.text.includes(probe));
    if (hit) return hit.file;
  }
  return null;
}

const report = [];
const total = { settled: 0, replayable: 0, interp: 0, needsEye: 0 };

for (const f of files) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  const pvRelated = /jz[-_]|_jz[A-Z]|JIZURA|jizura/.test(src);
  const allPairs = pairsOf(src);
  const rows = allPairs.map((p) => {
    /* 同脚本后面另一步的 NEW：用来判「自己把节点又插回来」这种正常情旧 */
    const mineNew = allPairs.filter(x => x.name !== p.name).map(x => norm(x.next || x.block || ''));
    const st = TARGETS.map((t) => {
      const html = htmls[t];
      if (p.interp) return 'interp';
      if (p.block) {
        const n = html.split(norm(p.block)).length - 1;
        if (n === 0) return pvRelated ? 'superseded' : 'block-drift';   // 旧引擎的注入块已被 pv/ 取代
        return n > 1 ? 'duplicated:' + n : 'injected';
      }
      const old = norm(p.old), next = norm(p.next);
      const hasOld = html.includes(old), hasNew = html.includes(next);
      if (hasNew && !hasOld) return 'applied';
      if (hasOld && !hasNew) {
        /* 短锚点（小于 40 字）往往就是数组项的前缀，命中不等于「没跑」；
         * 再看 NEW 首行在不在：在 → 已跑过、只是后续改动让整块对不上，不是待重放 */
        const f1 = next.split(NL).map(s => s.trim()).filter(Boolean)[0] || '';
        if (f1.length >= 18 && html.includes(f1)) return 'applied-drift';
        if (old.trim().length < 40) return 'anchor-weak';
        return 'replayable';
      }
      if (hasOld && hasNew) {
        if (old.includes(next) || next.includes(old)) return 'wrap-ok';
        // 同脚本后面另一步又把同名节点插回来（fix-tab-rows：步骤1 改名、步骤2 重建）
        if (mineNew.some(x => x.includes(old))) return 'self-chain-ok';
        return 'both';
      }
      // 两头都不在：若 NEW 的头一行还在，就是「功能已落地、函数体后被手改」（实测 inject-lrc-disk 就这一种）
      const first = next.split(NL).map(s => s.trim()).filter(Boolean)[0] || '';
      if (first.length >= 18 && html.includes(first)) return 'applied-drift';
      if (pvRelated) return 'superseded';
      const by = eatenBy(f, old);
      return by ? 'overwritten-by:' + by : 'missing';
    });
    return { name: p.name, kind: p.block ? 'block' : 'pair', state: st.join('/') };
  });

  const cnt = (k) => rows.filter(r => r.state.startsWith(k)).length;
  const needsEye = cnt('missing') + cnt('both') + cnt('duplicated');
  const explained = cnt('superseded') + cnt('overwritten-by') + cnt('block-drift');
  const settled = cnt('applied') + cnt('injected') + cnt('wrap-ok') + cnt('self-chain-ok') + cnt('applied-drift') + cnt('anchor-weak');
  let verdict;
  if (!rows.length) verdict = '抽不出锚点或插块（纯手工改 html？）';
  else if (needsEye) verdict = '要人看：' + needsEye + ' 处解释不了';
  else if (cnt('replayable') === rows.length) verdict = '仍可重放';
  else if (cnt('interp') === rows.length) verdict = '锚点带插值，字面比对不了';
  else if (settled === rows.length) verdict = '全部已落地（可归档）';
  else if (settled + explained === rows.length) verdict = `已落地；另有 ${explained} 处旧块/旧锚点已作废（pv 取代、链覆盖或块漂移）`;
  else verdict = '混合状态';

  total.settled += settled + explained;
  total.replayable += cnt('replayable');
  total.interp += cnt('interp');
  total.needsEye += needsEye;
  report.push({ file: f.replace('tools/', ''), pairs: rows.length, verdict, detail: rows });
}

if (process.argv.includes('--json'))
  writeFileSync(join(ROOT, 'tools', 'patches-audit.json'), JSON.stringify(report, null, 2));

for (const r of report) {
  console.log(`${r.file.padEnd(26)} 锚点 ${String(r.pairs).padStart(2)}  ${r.verdict}`);
  r.detail.filter(d => /^(missing|both|duplicated|superseded|overwritten|applied-drift|block-drift|anchor-weak)/.test(d.state))
    .forEach(d => console.log(`    · ${d.name}(${d.kind}) → ${d.state}`));
}
console.log(`
合计：已落地 ${total.settled}、仍可重放 ${total.replayable}、带插值 ${total.interp}、要人看 ${total.needsEye}`);
console.log(total.needsEye ? '还有解释不了的，先别动这些脚本。' : '没有解释不了的：这批脚本都已落地或作废，可安全归档。');
if (process.argv.includes('--json')) console.log('明细已写 tools/patches-audit.json');
