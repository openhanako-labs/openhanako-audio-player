// JIZURA 布局修复：舞台塌缩 + 封面背景 + PV/歌词语义交换 + 英文禁竖排 + 署名词表扩充
// 用法：node tools/fix-jizura-layout.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["ui/index.html", "ui/standalone.html"];

/* ============ 1. CSS：修 pvTrack 塌缩 + 背景 ============ */
const FIX_CSS = `
/* ===== JIZURA 舞台塌缩修复 ===== */
/* pvTrack 在 folia 里靠内容撑高，JIZURA 的行是 absolute 不撑高 → 铺满舞台 */
body.jizura-mode:not(.view-compact) .pv-track { position:absolute !important; inset:0 !important; height:auto !important; transform:none !important; }
/* JIZURA 模式不要封面糊开背景，用风格底色 */
body.jizura-mode:not(.view-compact) .pv-bg { display:none; }
body.jizura-mode:not(.view-compact) .pv-stage { background:var(--jz-bg) !important; color:var(--jz-fg); }
`;

/* ============ 2. fits：拉丁文行禁用竖排/压扁/铺满（块字专属构图） ============ */
const FITS_OLD = `function _jzFits(p,txt){var n=[...txt].length;
 if(p==='tategaki'||p==='ring')return n>=3&&n<=16;
 if(p==='tile')return n>=6;`;
const FITS_NEW = `function _jzFits(p,txt){var n=[...txt].length;
 var latin=/[a-zA-Z]{3,}/.test(txt);
 if(p==='tategaki')return !latin&&n>=3&&n<=16;
 if(p==='cond')return !latin&&n<=10;
 if(p==='tile')return !latin&&n>=6;
 if(p==='ring')return n>=3&&n<=16;`;

/* ============ 3. 交换 PV/歌词语义：PV=JIZURA 文字PV(mode 2)，歌词=folia 滚动(mode 1) ============ */
const CAPS_OLD = `[['标准',0],['PV',1],['歌词',2]]`;
const CAPS_NEW = `[['标准',0],['PV',2],['歌词',1]]`;

const TITLE_OLD = `      if(hasJiz){
        btn.style.color='var(--accent)';
        btn.title='歌词模式（JIZURA）— 点击退出';
      }else if(hasLyr){
        btn.style.color='var(--accent)';
        btn.title='PV 模式 — 点击进歌词模式';
      }else{`;
const TITLE_NEW = `      if(hasJiz){
        btn.style.color='var(--accent)';
        btn.title='PV 模式（文字PV）— 点击退出';
      }else if(hasLyr){
        btn.style.color='var(--accent)';
        btn.title='歌词模式 — 点击进 PV';
      }else{`;

/* ============ 4. 署名词表扩充（Recording Producer/Scoring/乐器 等漏网） ============ */
const CREDIT_OLD = `|OP|SP|词|曲)/i;`;
const CREDIT_NEW = `|OP|SP|词|曲|Recording|Scoring|谱务|乐器|独奏|Violin|Cello|Saxophone|Trumpet|Trombone|Harmonica|Keyboard|Synthesizer|Program|Programming|Editing|Chorus|Backing|Percussion|Viola|Flute|Oboe|Clarinet|Harp|Organ|Accordion|Lute|二胡|琵琶|古筝|笛|箫|唢呐|扬琴|柳琴|阮|埙|编钟)/i;`;

function replaceOnce(html, oldStr, newStr, label) {
  const count = html.split(oldStr).length - 1;
  if (count !== 1) throw new Error(`${label}: 命中 ${count} 次（期望 1 次）`);
  return html.replace(oldStr, newStr);
}

for (const rel of targets) {
  const p = join(root, rel);
  let html = readFileSync(p, "utf8");

  html = replaceOnce(html, FITS_OLD, FITS_NEW, `${rel} fits`);
  html = replaceOnce(html, CAPS_OLD, CAPS_NEW, `${rel} 胶囊语义`);
  html = replaceOnce(html, TITLE_OLD, TITLE_NEW, `${rel} 按钮提示`);
  html = replaceOnce(html, CREDIT_OLD, CREDIT_NEW, `${rel} 署名词表`);

  const cssIdx = html.lastIndexOf("</style>");
  if (cssIdx < 0) throw new Error(`${rel}: 找不到 </style>`);
  html = html.slice(0, cssIdx) + FIX_CSS + "\n" + html.slice(cssIdx);

  writeFileSync(p, html, "utf8");
  console.log(`${rel}: JIZURA 布局修复完成`);
}

console.log("接下来跑 node tools/bump-build.mjs");
