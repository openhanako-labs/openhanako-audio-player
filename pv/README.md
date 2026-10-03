# PV 文字层 —— 部件注册表与构建流程

> 从 `tools/inject-*.mjs` 的一次性字符串补丁迁移而来。为什么换，见文末。

## 一层一个槽，一个部件一个文件

一个 cut（一行歌词的演出）由 10 层组合，每层独立注册、独立抽签：

| group | 管什么 | 件数 | 默认件 |
|---|---|---|---|
| `mood` | 气氛：换抽签偏置 + 换一组 fx 预设 | 7 | — |
| `style` | 配色（含 `auto` 跟随主题） | 9 | auto |
| `face` | 字体（⑥，12 套本机字体栈） | 12 | 风格钉死优先，否则抽签；auto 不抢 |
| `bg` | 背景：最底下一层的图样与色块，逐段换（⑧） | 12 | `solid`，每 `PV.bgSwap` 概率换一件 |
| `look` | 字形外观：描边/阴影/填充/线与框（⑩） | 24 | `none`，逐件只写涂装属性 |
| `layout` | 字在画面上的位置与形态（⑨ 扩到 43 套） | 43 | 抽签 |
| `enter` | 逐字怎么进来（⑪ 扩到 21 件） | 21 | `rise`（= 旧 jzWin） |
| `hold` | 进来之后怎么活着 | 7 | `none` |
| `exit` | 上一行怎么走（⑫ 扩到 17 件） | 17 | `none`（= 旧的直接覆盖） |
| `transition` | 新旧两行怎么接 | 12 | `cut` |
| `camera` | 整屏镜头 | 8 | `none` |
| `decor` | 可叠 0..n 的附加图形（⑬ 扩到 40 件） | 40 | `particles` |
| `treatment` | 逐字 / 整屏处理（⑭ 扩到 25 件） | 25 | `sweep` |

共 237 件（13 层）。叠加上限：`PV.decorMax = 2`、`PV.treatMax = 1`（在默认那几件之外再抽几件）。实测手拉满五件处理会把字完全淹掉，**上限比数量重要**。

默认件就是 ① 之前旧实现的行为，所以不抽签时画面一模一样；变了的是**其余各层现在真的有事可做**。

```
pv/
  build.mjs          构建：拆旧块 → 剥遗留 → 接核心钩子 → 插新块 → 自锁校验 → 写盘
  serve.mjs          本地静态服务（宿主浏览器不吃 file://）
  make-test.mjs      从产物抽 PV 块，生成 test.html 预览台
  make-fixtures.mjs  用 ffmpeg 合成拍点测试音（pv/fixtures/，不入库）
  test.html          预览台产物（已 gitignore）：不放歌也能逐层逐件点着看
  src/00-engine.js   注册表、随机、ctx、配牌、渲染、帧循环、气氛与滑块
  src/01-styles.js   风格层 + 封面取色
  src/02-layouts.js  21 个版式
  src/03-enter.js    登场 9 件
  src/04-hold.js     保持 7 件
  src/05-exit.js     退场 7 件
  src/06-camera.js   镜头 8 件
  src/07-transition.js 衔接 9 件
  src/08-decor.js    装饰 4 件 + 处理 3 件
  src/09-chrome.js   骰子 / 标签 / ghost / 风格条
  src/10-api.js      对外接口与宿主接线
  src/11-audio.js    ③ 音频驱动：频谱 → energy/beat/bpm/confidence，并实时调制 fx
  src/12-cuts.js     ④ 分 cut：显式 / 与自动长句切分 + 拍对齐 + 帧推进
  src/13-syntax.js   ⑤ 歌词语法：/ 分段、*强调*、行末!、|注釈
  src/14-decor.js    ⑤ 装饰 18 件（开头有一段集中的一个元数据补标）
  src/15-treat.js    ⑤ 处理 11 件（扫描线 / 暗角 / 拍闪 / 缘光 / 故障条 / 套色 / 柔焦 / 细尘）
  src/16-trans.js    ⑤ 衔接补的三件：残影 / 切三 / 顶入
  src/17-faces.js    ⑥ 字体表：12 套本机字体栈（拉丁在前、中文在后）+ 探测只当报告
  src/18-audit.js    ⑦ 装配体检 PV.audit() 与装配守卫 fitGuard()
  src/19-bg.js       ⑧ 背景层 12 件 + PV.bgSwap / rollBg / useBg
  src/21-looks.js    ⑩ 字形外观 24 件（描边/阴影/填充/线与框），只写涂装
  src/22-layouts2.js ⑨ 版式扩充 22 件（下三分/阶梯/弧顶/螺旋/跑马/镜像/场记板…）
  src/23-enter2.js ⑪ 登场扩充 12 件（翻入/旋入/幕升/弹入/抖定/摆入…）
  src/24-exit2.js  ⑫ 退场扩充 10 件（上浮/侧飘/旋出/化开/倒序退/碎落/甩出…）
  src/25-decor2.js ⑬ 装饰扩充 22 件（裁切标/稿纸线/时间码/胶带/放射线/汉字水印…）
  src/26-treat2.js   ⑭ 处理扩充 14 件（大小律动/摇摆字/逐字填色/虚实推进/原稿用紙…）
  css/base.css       层容器与舞台规则
  css/layouts.css    版式规则
  css/chrome.css     附件规则
  css/parts.css      ② 新增部件用的样式
  css/decor.css      ⑤ 装饰与处理扩容用的样式
  css/fonts.css      ⑥ 字体层用的样式
  css/bg.css         ⑧ 背景层容器与 5 个背景动画
  css/look.css       ⑩ 字形外观的 24 件涂装
  css/decor2.css     ⑬ 新增 22 件装饰的形状（全用 fg/acc 混色，不写死色值）
  css/layouts2.css   ⑨ 新增 22 套版式的样式
  _legacy/           迁移前的 4 个 PV 补丁脚本，只读存档
```

## 气氛与滑块

`PV.setMood('glitch')` 做两件事：把 `fx` 设成该气氛的预设，并让带对应 tag 的件权重 ×2.6、不带的 ×0.45。抽的不是均匀随机，是有取向的随机。

| 气氛 | motion | glitch | chroma | texture | density | decor |
|---|---|---|---|---|---|---|
| 故障 glitch | .9 | .9 | .8 | .7 | .8 | .85 |
| 静 calm | .25 | 0 | .1 | .3 | .4 | .2 |
| 流行 pop | .85 | .15 | .25 | .2 | .6 | .6 |
| 平面 graphic | .5 | .1 | .2 | .1 | .5 | .7 |
| 编辑 editorial | .35 | 0 | .05 | .15 | .45 | .5 |
| 情绪 emotional | .55 | .2 | .3 | .35 | .5 | .45 |
| 恐怖 horror | .7 | .75 | .5 | .8 | .55 | .75 |

`decor` 这一列是用户两轮截图之后补上的。先前没有任何一档气氛设过它，于是它恒等于 1，
而一批件的门槛写的是 `fx.decor > 0.4/0.5`——**门槛恒真，等于没有门槛**，装饰抽得像筛子漏。
旋钮不接上就是假旋钮，现在气氛表与预览台都有它了。

滑块真的有人读：`motion` 控幅度与时长、`glitch` 门控抖动/闪灭/切片/甩镜/白闪、`chroma` 控色偏位移量与不透明度、`texture` 控纹理浓度、`density` 控粒子数。

`PV.rolling = {enter,hold,exit,transition,camera,decor}` 逐层开关：某层设 `false` 就永远用默认件。想「只要退场、不要镜头」，改这里，不要删件。

骰子（`R`）现在重掷：seed + 风格 + 气氛。

## 加一个新部件

写进对应层的文件（或新建 `src/3x-xxx.js` 并加进 `build.mjs` 的 `JS_ORDER`）：

```js
PV.reg('hold', 'sway', {
  nm: '轻摆',
  tags: ['pop', 'calm', 'emotional'],      // 气氛偏置用
  w: 1,                                    // 基础权重
  when: c => c.fx.motion > 0.18,           // 抽签前置条件
  fit:  c => c.tokens.length <= 20,        // 够不够格
  apply: (c, el) => { /* 起手，可返回 cleanup */ },
  frame: c => { /* 每帧，c.lt 是本 cut 秒数 */ }
});
```

**元素归属是硬规矩**：登场只动 `i.jv-t`，保持只动 `.jv-w` 或整行容器，镜头只动 `.jv-track`，背景只动 `.jv-bg-layer`，外观只动 `i.jv-t` 的涂装属性。五者不抢同一个元素才能叠——旧实现把版式定位和入场动画写在同一个元素上，于是入场把版式的旋转永久盖掉了（见文末缺陷表）。退场用 `play(ctx, el, drop)`，收尾必须调 `drop()`。配套 CSS 写进 `css/parts.css`，类名一律 `jv-`。

## ctx（`c`）里有什么

| 字段 | 含义 |
|---|---|
| `idx` `line` `text` `tokens` | 行号、原行对象（含 `time`/`end`/`words`）、**本段**文本、本段切好的词/字 |
| `cutI` `cutN` `t0` `t1` `explicitCut` | 第几段 / 共几段 / 本段起止 ms / 是不是作者写的 `/`（④） |
| `emph` `flash` `note` | `*强调*`、行末 `!`、`\|注釈` 三个记号解出的结果（⑤ 语法层） |
| `el` `tokensEls` `track` `stage` | 本 cut 容器、`i.jv-t` 列表、`.jv-track`、`#pvStage` |
| `style` `fx` | 当前风格件；`motion/glitch/chroma/decor/density/texture/bgSwitch`（0..1） |
| `audio` | `energy`、`beat{since,len,index}`、`time`(ms)。③ 接 analyser 之前 `time` 由外部推；`pulse`/`beatZoom` 靠它，没数据时 `when` 不成立、抽不到 |
| `stagger` | 逐字间隔 ms，`layout.pre()` 可覆写 |
| `lt` | 本 cut 已过的秒数 |
| `lyrics` | 全表，取邻行用——**取到的是原始文本，上画面前要先过 `PV.plain()`**（否则 `/`、`*` 会泄到画面上） |
| `params` | 留给 `plan()` 存自己的排版决定 |

版式另有 `fit(c)` / `pre(c)` / `render(c)`；token 必须用 `PV.spans(c, extra)` 产出。

## 宿主接线（只此一处）

核心只认四个名字：`body.jizura-mode`、`window._jizuraLrcData`、`window.renderJizuraInit()`、`window.renderJizuraLine(idx)`。

构建时另注入一个 `window.__pvCore`（锚点 `var _pvLineEls=[];`）：

```js
window.__pvCore = { render(), sync(i), idx(), lrc() }   // 核心闭包里的 renderPv / pvSync / _pvIdx / lrcData
```

PV 渲染在自己的 `#pvJv` 层里，**不写 folia 的 `#pvTrack`**：退出 PV 只需摘掉 `jizura-mode` 再请核心重画一次。

### 歌词表每帧对身份（`PV.syncTable`）

核心在换歌时是**重新赋值** `lrcData = parsed`，旧数组当场作废。接线早期写的是
`if (!PV.lyrics().length) PV.setLyrics(c.lrc())`——只有空表才灌，于是第一首歌灌满之后
换歌永远灌不进来：PV 拿着上一首的旧表反复演，行号还是按新曲时间查旧表，
看上去就是「歌词被固定住了」。

现在 `renderJizuraInit` / `renderJizuraLine` / `PV.enter` 三个入口每帧跑 `PV.syncTable(l)`：
**引用不同或首尾签名不同就重灌**，同一张表绝不重灌（`setLyrics` 会清 cut 缓存，
重灌等于重掷版式）。另外 `PV.setLyrics` 会把同步缓存作废——预览台、`PV.demo`、`PV.audit`
都会直接换成测试句，不作废的话体检跑完那句 “We are the champions” 就会赖在画面上不走。

## 构建与预览

```
node pv/build.mjs              # 幂等，可反复跑；写盘前自锁，不对就拒写
node pv/make-test.mjs          # 生成 pv/test.html（预览台，逐层逐件点着看）
node pv/serve.mjs 8778         # 宿主浏览器不吃 file:// 时用
node pv/make-fixtures.mjs      # 合成拍点测试音（ffmpeg，测③④用）
node pv/release.mjs            # 出两个包：dist/full 含 PV、dist/lite 不含
node tools/bump-build.mjs      # 构建号三处同步，开着的播放器卡片自己热重载
```

预览台顶部有每层每件的按钮、气氛、五个滑块，右上角一行是当前 cut 的配牌（`layout/enter/hold/exit/transition/camera/decor/treat`）。24 次连点おまかせ后 `document.getAnimations()` 在 11–37 之间波动不单调增长，切行 10 次后 `.jv-track` 只剩 1 个子元素——没有堆积。

## 为什么换掉补丁链

迁移前 `tools/` 下 20 个 `inject-*.mjs` / `fix-*.mjs`，每个都对 447 KB html 做一次 `replaceOnce`：

1. **不能重放**：锚点被自己替换掉后再跑就抛「命中 0 次」。`inject-jizura.mjs` 的锚点 `function renderPv(){ if(!pvTrack) return;` 在 HEAD 里已经不存在——脚本复现不出产物，html 成了唯一且只能手改的源。
2. **数据双写**：`JZ_STYLES` 在 `inject-jizura.mjs` 与 `inject-jizura-ui.mjs` 各存一份。
3. **反向补丁叠正向补丁**：`fix-jizura-layout.mjs` 用 `transform:none !important` 锁死 `.pv-track` 修舞台塌缩，顺手堵死镜头层。现在 PV 用自己的层，那条规则整条不需要了。

现在 `build.mjs` 是幂等流水线：先整对拆掉旧块 → 再剥遗留 → 接钩子 → 插新块 → 写盘前四道自锁（PV 标记恰好一对、旧 JIZURA 脚本已清、`__pvCore` 恰好一处、`.jz-gpill` 仍在），任一道不对就拒写。

遗留剥离按选择器识别（`jz-` / `jizura` / `--jz` / `@keyframes jz*`），白名单 `.jz-gpill`——那是播放列表的组标签胶囊，跟 PV 无关，只是撞了前缀。

## 跑出来才发现的四个缺陷

| 现象 | 原因 | 现在 |
|---|---|---|
| 散落 / 星散 / 波迹 的旋转位移从未显示 | 版式把 `transform` 写在 token 上，`jzWin` 的 `100%{transform:none}` + `fill:both` 长期覆盖内联值 | token 拆外层（版式）/ 内层（登场） |
| 点风格条切配色不生效 | `.pv-jv` 自声明 `--jv-bg: var(--card-bg)`，元素自身的自定义属性优先于继承，盖掉了 `#pvStage` 设下来的内联值 | 兜底移到 `.pv-stage` |
| 抽到 `title` / `interlude` 就白屏 | 部件表与 CSS 里都在，`switch` 里没有分支；`sp:1` 让它们永不进随机池，所以多年没人发现 | 补了 render，空行走间奏，两个专用件仍只走显式调用 |
| HUD 在竖写版式里变成竖排 | 装饰挂在 `.jv-line` 内，继承了版式的 `writing-mode: vertical-rl` | `.jv-hud` / `.jv-slice` 钉回 `horizontal-tb` |

另外：`jizura-exit` 事件被 dispatch 却没有任何监听者，退出 PV 会停在上句——现在由 `__pvCore.render()` 重建。

## ③ 音频驱动（pv/src/11-audio.js）

`PV.audio` 现在有生产者了，不再只是留给外部的空字段：

| 字段 | 含义 |
|---|---|
| `energy` | 0..1，低频为主，用 p10..p95 百分位区间归一化 |
| `beat` | `{since, len, index}`：`since` 是距上一个瞬态的秒数，`len` 取 IOI 中位数 |
| `bpm` | 估计值（60/len），只当参考，不当目标 |
| `confidence` | 0..1，由 IOI 离散度算；静默或瞬态断开时归 0 |
| `time` | ms，扫光层的时间源（没推值时回落 DOM 的 `<audio>`） |
| `low/mid/high` | 三个频段的归一化能量，调参用 |

`pulse`（hold）与 `beatZoom`（camera）之前因 `when` 不成立而永远抽不到，现在数据一到位就进池。`PV.audioModulate = false` 可关能量对 fx 的实时调制；面板改滑块要走 `PV.setFxBase(k, v)`——直接写 `PV.fx` 会被下一帧的调制覆掉。

**频谱从哪来**：先用 core 那条音频反应链——它每帧把 `getByteFrequencyData` 的结果摊在 `window.__reactiveBins` 上，PV 只读不建。只有它不可用时 PV 才自建 `MediaElementSource`，而且两条约束：

- 用户开了音频反应（`localStorage.hana_audio_reactive === '1'`）且**正在播放**时，PV 让位 4 秒再自建。一个 `<audio>` 只能被 `createMediaElementSource` 接一次，谁先接谁赢——实测就是 PV 先接上、把 core 的链顶死了。
- 只对同源 / blob 源自建。跳源无 CORS 的媒体一接 `MediaElementSource`，Chrome 直接静音，那比没节拍严重得多。

**为什么不用 BPM 网格**（两种都试过，数据在案）：IOI 直方图消不了八度歧义——瞬态全落在八分音符上时，0.625s 那格根本没样本，96 BPM 报成 191.6；改成网格命中（取达标最长周期）又往漂，长周期容差天然大，实测在 176→64→79→160 之间跳。所以不猜绝对 BPM，**把检到的瞬态直接当拍**：`since` 天然零漂移， subdivision 猜错也仍踩在音乐上。瞬态门限是四重 AND（均值+2σ、达近期峰值 40%、绝对地板 0.02、`hp > 0.05`）加 0.18s 峰选取确认——一个嗑鼓的衰减会造两个峰，不做峰选取周期就被折半（实测 229.6 / 189）。

自检命令：`PV.audio.stats()`（mode / energy / bpm / conf / failed / err）、`PV.audio.diag()`（onsets / period / thr / rebases / clock）。

实测（`pv/fixtures/` 里 ffmpeg 合成的拍点音，`node pv/make-fixtures.mjs` 重建，不入库）：

| 测试音 | 真值 | 检出 | 走哪条链 |
|---|---|---|---|
| bpm-96 | 96 | 95.8 | PV 自建 analyser |
| bpm-120 | 120 | 120.1 | PV 自建 analyser |
| bpm-140 | 140 | 139.8 | PV 自建 analyser |
| bpm-140 | 140 | 139.7 – 140.0 | **core 的 `__reactiveBins`** |

## ④ 分 cut 与拍对齐（pv/src/12-cuts.js）

一行不再等于一个 cut。`PV.splitLine(line, i)` 返回该行的若干段，每段自己抽签、自己上场：

1. **显式 `/` 优先**：歌词里写 `风也/停了/星也落了` 就切三段（`/` 本身不显示）；
2. **没写就按字数自动切**：超过 `PV.maxCutChars`（默认 13）才动，在标点 / 空格 / 拉丁词边界处断，最多 `PV.maxCuts`（3）段；短句一律不碰；
3. **时间**：有 TTML `words` 用词的真实起止，否则按字符权重在行的起止之间分配；
4. **拍对齐**：`PV.beatSnap`（默认开）且节拍 `confidence ≥ 0.35` 时，把每段起点吸到最近的拍点，最多吸半拍，且不跑过上一段的头（每段至少站 320ms）；
5. **推进**：帧循环里的 `PV.cutTick` 看 `PV.audio.time` 越过下段起点就换段。没有播放时钟（没歌、没接音频）时一行就是一段，行为与 ③ 之前一致。

开关：`PV.beatSnap` / `PV.autoSplit` / `PV.maxCutChars` / `PV.maxCuts`，预览台上都有（含一行手动 `⏵ 推 +0.4s`，不放歌也能看推进）。自检看 `PV.cutsInfo()`。

实测（`就算前面是深渊也别回头，我一直都在这里等`，行时 8000→12000，拍周期 625ms）：

| | 第一段 | 第二段 |
|---|---|---|
| 不吸附 | 8000 | 10400 |
| 吸附后 | 8000 | **10625**（拍点 10500 与 11125 之间取近者） |

推进序列：`0000011111`（20 字行）、`00011222222`（显式三切）；标签同时变成 `LAYOUT · 破框 · 2/2`。

一个附带修正：切开后逐字扫光的时间窗要跟着变。扫光原来读 `line.time/end`，一行拆三段后若还用整行窗口，每段都只会亮开头几个字。现在 `cutN > 1` 时用 `ctx.t0/t1`，TTML 逐词时序只在整行不被切开时生效。

## ⑤ 装饰与处理扩容 + 歌词语法

装饰 4→18，处理 3→11，衔接补三件。**元素归属先定死**：`decor` 挂在本次 cut 的 `.jv-line` 里（元素随段生灭，不用自己卸载）；`treatment` 挂在 `#pvJv` 上（整屏、可复用），用 `PV.onFrame` 的必须返回 cleanup 调 `PV.offFrame`。实测 763 次渲染后 `PV.frameCount()` 从 3 变 4，没积堆。

### 语法层（pv/src/13-syntax.js）

JIZURA 的行内记号现在同样吃：

| 写法 | 作用 |
|---|---|
| `今夜/我还在这里` | 分 cut（④） |
| `*透明*` | 强调：该段优先抽带 `impact` 的冲击型件（权重 ×2.4） |
| 行末 `!` | 闪：同上，并让白闪衔接进入候选 |
| `歌词\|注釈` | 注釈：行级小字，交 `decor/note`（只挂第一段） |

关键取舍：**不先把记号剥掉再切段**。那样“哪一段被强调”的位置信息就丢了，所以 `*` 与 `!` 留在 token 流里，`splitLine` 切完段再打标（`cut.emph` / `cut.flash`）并清字符；`|` 是行级的，先摘出来。

### ⑤ 跑出来的两个坑

1. **记号会泄到邻行上**。连行 / 胶囊 / ghost 显示的是邻行原始文本，实测画面上直接出现 `风也/停了/星也落了` 的斜杠。新增 `PV.plain(text)`，凡“引用别的行”一律过它。测过 7 行 13 个切段，泄露 0。
2. **装饰子层会被竖写版式带走文字方向**。① 的 HUD 已经踩过一次（`writing-mode: vertical-rl` 继承），⑤ 统一用 `.jv-d` / `.jv-t` 两条规则钉成 `horizontal-tb`，新件不再需要各自记这条。

### 元数据补标

`14-decor.js` 开头有一张 `IMPACT` 表，给分散在五个文件里的既有件集中打 `impact:1`。只加元数据、不改行为——比回头改十几个定义干清，也让“强调行该抽什么”这件事有一处可读的清单。

实测：72 件（enter/hold/exit/transition/camera/decor/treatment）× 7 行 = 504 次渲染，异常 0。

## ⑥ 字体表（pv/src/17-faces.js + css/fonts.css）

离线优先：不拉 Google Fonts，只用本机已装字体。`face` 是一层（12 件），默认不抢——`auto` 风格连字体一起让给 App。

**一个变量搞定中英混排**：一条 `font-family` 里拉丁 display 在前、中文 display 在后、generic 收尾。CSS 逐字往下找：Impact 没有汉字，汉字就顺到下一个族——不必拆两个变量。

**探测只用于报告，不删栏**。踩过两层：
1. 基线不能用裸 `monospace`，要用一个必然不存在的族名——否则黑体/宋体这类与系统回退走宽相同的字体会被误杀（实测误杀 SimHei）。
2. 改了基线之后仍有一类量不出来：CJK 字体的汉字进宽恒为 1em，只有**拉丁段**能区分。所以本机 Chrome 认 `华文隶书`/`等线`/`微软雅黑`/`方正舒体`，却认不了 `SimHei`/`SimSun`/`KaiTi`/`YouYuan`——**英文名与本地化名不等价**，栈里两种都得带。

风格可以钉死字体（`style.face`）：新闻→黑体、墨与朱→行楷、金夜→宋体、蒸汽→圆体、合成80s→西洋黑。优先级：本段指定 > 风格钉死 > 手动锁定 > 气氛抽签。

自检：`PV.facesReport()`（命中/未命中清单）、`PV.faceHas('Impact')`、`PV.setFaceManual('kai')`（`'auto'` 解除）。标签栏会显示当前字体名。

## 两版发布（含 PV / 不含 PV）

`node pv/release.mjs` 一次出两个包：`dist/full/`（`hanako-audio-player`）与 `dist/lite/`（`hanako-audio-player-lite`）。

**lite 不是另一套代码**：同一份 html 去掉两个 PV 标记块与 `<html data-pv="1">`。核心里那五个 PV 接入点全部由 `pv/build.mjs` 的 `HOOKS` 声明式注入，每条都要求锚点恰好命中一次，且都带可用性判断：

| 钩子 | 作用 |
|---|---|
| `renderPv 分支` / `pvSync 分支` | `window.PV&&PV.available` 不在就不走 PV |
| 三档循环可降级 | 中间档进不去 → 标准↔歌词 两档循环 |
| 按钮提示可降级 | 标题不再写「点击进 PV」 |
| 胶囊按可用性出档 | 靠 `document.documentElement.dataset.pv==='1'` 判 |

最后一条本来写的也是 `window.PV&&PV.available`，结果三档被误降成两档——**胶囊比 PV 块先执行**，那时 `window.PV` 还不存在。所以得用构建期就写好的标记，不能拿运行时对象判。

包内不带 `pv/`、`tools/*.mjs`、测试音、预览台；但 `tools/*.js` 是运行时依赖（`lib/register-tools.js` 在 import），不能剔。CI 发 tag 前先校 `pv/build.mjs` 跑两遍字节一致。

## ⑦ 装配体检与守卫（pv/src/18-audit.js）

件堆多之后真正的隐患不是「哪件坏了」，而是**装配出来的几何**：没人量过每套版式吃各种长度的歌词会不会顶出边界，也没人算过入场能不能在本段跑完。

`PV.audit()` 一次跑完 12 条样例行 × 全部版式（样例行故意堆了短/中/长/超长/拉丁/混合/带记号各种形状），报四类：

| 项 | 含义 | 现状 |
|---|---|---|
| 溢出 | 字的矩形出舞台（含旋转后的实际占位） | 0 |
| 边缘挤压 | 字贴着边界 <6px | 0 |
| 入场超时 | `dur + stagger×(n-1)` 超过本段 90% | 0 |
| 空段 | 该有字的段一个 token 都没出 | 0 |
| 入场挤压 | 本段装不下逐字，引擎把 dur 与间隔一起缩（tempo < .45） | 0 |

另报 `跳过`：体检强制每套版式吃每一行，但 `fit()` 本来就会拒掉一部分组合（22 字塞竖写），那些真实配牌里抽不到，报出来是假问题——现在 34 个组合先按 `fit()` 滤掉。

### 装配守卫 fitGuard

几何量歪了就得有兜底：`fitGuard(ctx)` 在**登场动画启动之前**跑（那时只有版式写好的位置与旋转，量到的就是落点），把越界的字收回安全区；整行并集还是出界就先缩 `--fk` 再平移 `--fx/--fy`。

只写 `left/top` 与 `--fx/--fy/--fk`——`transform` 归版式（旋转）与镜头，抓不得；`--drift-*` 归保持层。CSS 里用独立的 `translate`/`scale` 属性合成，镜头与呼吸能跟守卫叠加而不互相覆盖。

### 体检把自己也拓出来了

1. **cut 缓存不记归属行**：`keepCuts` 只看缓存存不存在，跳行时沿用上一行的 cuts → `planLine(5,{cutI:1})` 拿到的是上一行的第 0 段，时间窗全错。现在缓存带 `cutsLine`，`setLyrics` 一并清空。
2. **守卫拿 `.jv-line` 自己的 rect 判越界**：它是 `inset:0`，永远“贴边”，于是每段都无脑缩一点，而且自己写的位移被下一轮量进去 → 不幂等，实测 `--fk` 一路缩到 0.58。现在量前先抹自己的变量。
3. **用布局盒 + 自算旋转包围盒量不准**：判定说 0 越界，真实矩形却漏出 17px（token 的 `offsetParent` 可能与版式自己的定位层有关，偏移原点与舞台差着一层 padding）。改成直接量 `getBoundingClientRect`：浏览器算好的矩形就是答案。
4. **拿动画中的矩形量会报假溢出**：入场把字停在半空，19/19 全“越界”。现在守卫跑在 `enter.apply` 之前，只量落点。

3、4 两条都是我先写错了再被自己的体检打回来的——先信推算、后信矩形。

## ⑧ 背景层（pv/src/19-bg.js + css/bg.css）

之前整块底自始至终是风格纯色 + 粒子，这就是「只有那一排在变」的根因——那不是调参能补的，是缺一层。

| 件 | 干什么 | 强度靠 |
|---|---|---|
| `solid` | 纯色（默认，权重最高） | — |
| `duo` | 主/次色斜向渐变 | 角度抽签 |
| `vig` | 晕影 | 固定 |
| `grid` | 网格 | `density` 定间距、`texture` 定透明度 |
| `stripes` | 斜纹 | 间距抽签 |
| `blocks` | 几个大色块 | 数量与位置抽签 |
| `beam` | 扫光带 | 周期抽签，走 `background-position` |
| `rings` | 同心圈 | `scale` 动画 |
| `scan` | 扫描线 | `texture > 0.15` 才进池 |
| `dust` | 浮尘 | `texture > 0.18` 才进池 |
| `hue` | 偏色（soft-light） | `chroma > 0.3` 才进池 |
| `pulse` | 能量底 | `PV.audio.energy` + 拍点；没音频数据不进池 |

三条规矩：

- **只建一个 `.jv-bg-layer`**（`inset:0`、`z-index:0`；`.jv-track` 是 2、粒子是 1），换件靠抹旧属性而不是堆节点。实测全页始终 1 个。
- **`PV.bgSwap` 说多少就得是多少**。定 0.45 却只跑出 0.33——因为「决定换了」之后重抽还有概率抽回同一件。现在最多避开 3 次重抽，实测 0.44。旋钮骗人比旋钮难用更难发现。
- **逐段换不是越勤越好**。段段换会眼晕，默认 0.45 大致每两三段换一次；预览台有「换率」滑块可拉到 1 对比。

`pulse` 是唯一逐帧的：它返一个清理函数，`PV.useBg` 透给 `applyIn` 挂进 stops，换件与退出都会 `PV.offFrame`。实测帧消费者不涨。

体检里背景不参与几何（它不影响字的矩形），但 `PV.audit()` 强制 `bg:'solid'`，让抽签序列可复现。

## ⑧ 之后：用户实测打回来的三件事

### 1. 「竖线还在，有时候左右都有」

上一轮我以为是 `decor/rule`（引线）的 writing-mode 泄漏，修了——但用户又看到，而且**左右都会出现**。
那一句就是答案：`decor/barcode` 自己就在选 `side = 'l' | 'r'`。量到它的框是 `11% × 46%`，
22 根满高竖条、零遮罩、硬边矩形——这不是装饰，这是一块“不知道哪里来的 bug”。

处理：`sp: 1` 摘出随机池（预览台按钮与 `decor:['barcode']` 仍可用），条高改逐根随机，
高度 46% → 24%，加 radial mask 抹四边，不透明度真的接上 `fx.decor`。实测 80 段随机配牌命中 0 次。

### 2. `fx.decor` 是个死旋钮

没有一档气氛设过它，它恒等于 1。所有写 `when: PV.fx.decor > 0.5` 的件永远进池。
修的不是某个件，而是这张表：七档气氛都给了 decor（.2 – .85），默认从 1 降到 .5，预览台补了滑块。
**一个没人读的旋钮比没有旋钮更糟**：它让门槛看上去存在，于是再也没人查它。

### 3. 「切到 PV 还是没声音」——上一版的修法建立在一条错误的假设上

我上一版写的是「接上后跑不起来就拆桥，把声音还给原生出口」。**还不回去**：
`createMediaElementSource` 是不可逆的，元素一旦被接进图，它的声音就只能从图里出；
`disconnect()` + `close()` 得到的不是“归还”，而是一个绑在已关闭图上的元素——
**整页到关掉为止全哑**，而 core 再来接会报 InvalidStateError。所以那一版不只是没修好，
它比不修更坏：它把一个能响的页面固定成不能响。

现在的规矩只有一条：**App 里 PV 绝不接元素。** `PV.audioOwn` 默认 `false`，
自建图只留给没有 core 的预览台（`pv/make-test.mjs` 里显式开）。拍点与能量全部读
 core 的 `window.__reactiveBins`；core 的频谱已存在时第二重锁也不允许接。
 代价很明硬：用户关了「音频反应」就没有拍点驱动——宁可不驱动，也不能替用户把声音弄没。

标签行现在带一个读数：`音:core`（core 接手，正常）/ `音:pv`（PV 自建，只应该出现在预览台）/
`音:wait`（开播了但还没等到频谱）/ `音:off`（谁都没接，声音一定正常）。
实测 App 页面里 `audioOwn:false`，整页只有一行 `createMediaElementSource` 调用，来自 core。

### 顺带：点名不该被门槛拦住

`stack('decor'/'treatment')` 里显式传的件也要过 `when`，于是预览台上点了「扫描线」「纹理」
一类钮在 texture 不够时**默默没反应**。门槛是给抽签用的，不是给人点名用的：
显式只过 `fit`（几何上装不下的才算），不再过 `when`。

## ⑩ 字形外观层（pv/src/21-looks.js + css/look.css）

先纠正一句我之前说错的话：JIZURA 的 `11p_looks.js` **不是**一个纯字形包，它是 85 条的混合包——
前面约 24 条才是真「字形外观」（袋文字/立体/傍点/マーカー…），后面混着背景、镜头、转场、后处理。
而那 24 条对应的能力，我们**一件都没有**：133 件里没有一个改变文字本身涂装的层。所以这层是补空白。

24 件分四族：描边（袋文字/缘取/二重缘/点线缘/轮廓回响）、阴影（立体/长影/偏移影/柔影/发光）、
填充（纵向渐变/上下二色/网点/条纹/斜线/荧光标记）、线与框（下划线/删除线/箱组/傍点/交互色/斜体/镂空）。
傍点用的是 CJK 原生的 `text-emphasis`，不需要素材。

规矩：**只写涂装**。`-webkit-text-stroke` / `text-shadow` / `background-clip:text` /
`text-decoration` / `text-emphasis` / `font-style`，全部由 `.pv-jv[data-look=…]` 作用到 `i.jv-t`，
幅度走 `--lk-*` 变量（可以是 `vars(ctx)` 函数，每件在自己那段里掷幅度）。
不碰 transform、不碰 left/top 与 `--fx/--fy/--fk`、不碰 `--drift-*`——所以外观能和呼吸、拍震、守卫叠加。

实测：240 段里 24 件全被抽到，且逐件校过计算样式，**没有一件是点了没反应的**。

## ⑩ 同时把三个工具缺陷撞出来了

1. **体检不播种**：`PV.audit()` 继承页面当前随机流，同一页连跑两次能得 14 / 16 两种数。
   现在按（版式 × 行 × 段）固定播种，每条发现带 `[seed …]`，报出来的都能一键回放。
2. **体检不钉上游**：`mood` 与 `fx` 会改 `when` 门槛（谁在池里）与版式幅度（摆多远），
   不钉住它们，光播种还是能量出 10 和 0 两种结果。现在气氛清空、强度回 `PV.FX0`、字体钉住，跑完全部还原。
   另一个坑：字体必须逐格 `opts.face` 指定——`faceManual` 的优先级排在「风格钉死」之后，
   而 `style:auto` 又会把字体判回 App 字体（现在显式指定赢过 auto）。
   还加了 `opts.eachFace`：拿 12 套字体各扫一遍，钉字体换来的「0 溢出」不算答案。
3. **守卫的平移方向写反了**：`fitGuard` 在非缩放分支上直接拿溢出量当 `--fx/--fy`，
   字越出下边界时它把整行**又往下推**（实测 `--fy: +6.9px`）。改成 `sideFix(over0, over1) = -(a+b)`，
   并且**两侧同时越界就不平移**（那是尺寸本身就装不下，平移只是按下葫芦翘起瓢）；
   缩放后不预测边界，而是**改一次重测一次**，迭代三轮收敛。溢出从 120 → 2 → 0。
4. （顺手）`.jv-scatter` / `.jv-cad` 把**行元素自己的** `position:absolute` 重写成 `relative`，
   三条线（当前行 + 前后幽灵行）从叠在一起变成竖着排队，后两条直接排到舞台外（token 落在 y=1161/1483）。
   体检原先只量当前行，完全看不到——现在量**所有可见行**。400 段真实配牌压测：出界 52 人次 → 0。

## ⑨ 版式扩充（pv/src/22-layouts2.js + css/layouts2.css）

从 JIZURA 的 270+ 套版式里挑结构上真不同的吸了 22 套进来，版式 21 → 43。挑的三条标准：
与已有 21 套的**构图逻辑**不重复（只换皮的话，抽到了也看不出来）；纯 CSS/DOM 能表达，
不吃贴图与 canvas；能被 fitGuard 兜住（绝对定位的都标 `spread:1`，让守卫按单字回收）。

下三分 · 阶梯 · 之字 · 弧顶 · 螺旋 · 宫格 · 头字下沉 · 两端对齐 · 框中框 · 气泡 · 跑马 ·
对分 · 镜像 · 横倒 · 点阵 · 双栏 · 拼贴 · 纵深堆 · 短册 · 场记板 · 胶片 · 警示

镜像用 `box-reflect`，场记板/胶片/警示的斜条与齿孔全是 `repeating-linear-gradient`，
跑马是把正文排两遍做无缝滚动——全都不依赖素材，离线优先守住。

### 一条血规矩

这些版式类是打在**行元素自己**上的（`.jv-line.jv-l3`），而 `.jv-line` 已经是
`position:absolute; inset:0`。**绝不能在版式类上重写 position。**
上一轮 `.jv-scatter` / `.jv-cad` 把它改成 `relative`，三条线（当前行 + 前后幽灵行）
从叠在一起变成竖着排队，后两条直接排到舞台外（token 落在 y=1161 / 1483，而舞台只有 540 高）。
百分比 `top` 需要一个已定位的包含块，`.jv-line` 本身就是，不需要再包一层。

### 裁切感知：守卫与体检共用一个判据

跑马这类版式故意把内容探出窗口，由 `overflow:hidden` 的祖先切掉。体检一量就是
 6 条溢出 + 4 条挤压，全是假警报；更糟的是 fitGuard 会试图把它拽回来，动画直接废。

判据取通用的一个，**不让版式自己标 flag**（`fx.decor` 那种没人读的旋钮刚批评过）：
`PV._clippedIn(node, stage, sb)` ——从节点往上走到舞台，遇到第一个裁切祖先，
若它自己还在台上，这个 token 就是“被裁掉的”，既不进守卫的账也不进体检的账；
裁切祖先自己出界才算真错。两边用同一个函数，不各写一版各错一版。

写这个判据时自己错过一次：第一版把 DOMRect 当元素传进去，`stop.parentElement` 是 undefined，
循环走到 null 就退出，等于完全没判——**改判据前先确认量具**。

实测：22 件逐个渲染 4 行文本全部出字、0 出界、行 position 仍为 absolute；
43 版式 × 9 行 228 格体检 0/0/0/0（跳过 101 个被 fit 拒的组合）；
500 段真实配牌压测出界 0，41 套可抽版式全部出现过；跑马 `jvTick` 仍在跑且 `--fx` 为空。

## ⑪⑫ 登场与退场扩充（pv/src/23-enter2.js、pv/src/24-exit2.js）

登场 9 → 21：翻入 旋入 左滑入 右滑入 斜切入 弹入 幕升 幕落 抖定 展开 摆入 浪入。
退场 7 → 17：上浮 侧飘 收缩 旋出 擦出 折出 化开 倒序退 碎落 甩出。
只动 transform / opacity / clip-path / filter，**不碰 text-shadow 与颜色**——
动画优先级压过普通作者样式，一写就把 ⑩ 外观层的涂装永久盖掉（⑦ 那轮是 transform，同一颗雷的另一半）。

### 引擎算得出超支，却什么都不做（真 bug）

旧代码：`gapMax = (availMs*0.62 - dur) / (nt-1); if (gapMax > 4) 收 stagger;`——
`gapMax > 4` 一不过就干脆不收。900ms 的段配 19 字：rise 成本 1310ms，预算只有 558ms，
引擎算出了超支然后交差。而且光收间隔也没用：间隔收到 0，字全叠一起，时长仍超。

现在改成 **同时收 tempo**：装不下就把 dur 与间隔按同一个系数一起缩，
成本必然回到预算内（`ani()` 必须读 `c.tempo`，不读等于引擎白收——写完引擎才查出来旧 helper 没接）。
实测 900ms 窗口：超预算 29/168 → **0/168**；最小 tempo 0.41（19 字挤 900ms 是真没法逐字，
把这个数如实报出来，不假装能治）。

体检跟着改两处：时间检从「只测 rise」改成**逐件测**；`enterCost` 乘上 tempo（不乘就报一片假超时）。
tempo 一乘之后「入场超时」成了永真等式，所以加第五项 **入场挤压**：`tempo < 0.45` 单独记——
能量化的不是「有没有崩」，而是「为了不崩牺牲了多少」。

### 顶部那行字是什么

`.jv-tag` 是**配牌读数**（调试用，不是演出内容）：版式 · 字体 · 外观 · 背景 · 气氛 · 第几段 · 音频链。
原本 `pointer-events:none` 根高点不动。现在：空闲 1.4s 自动淡到 .2（重掷或鼠标靠近回到全量）；
点一下循环 全量 → 只留版式 → 关掉；`PV.tagOn=false` 也可强制关。右上角是 🎲（R 键），
那排竖条是 `decor/刻度`。

验证：17 件退场逐个查「换段后 DOM 还剩几行」全部为 1（`drop()` 没一个漏）；
400 段随机配牌里登场与退场**全部出现过**；PV.audit() 五项全 0；帧消费者不涨。

## ⑬ 装饰扩充（pv/src/25-decor2.js + css/decor2.css）

decor 18 → 40 件。JIZURA 那边是 100 件（按 `DEF.xxx = { name: ... }` 数出来的），这次挑 22 件，
三条标准：纯 CSS 画得出（不吃 SVG 路径与贴图）、形状不与已有件撞、绝对定位的走 `jv-d` 兑底。

纸面印张：裁切标 套准标 稿纸线 色标 正字计数 · 标测量：尺寸线 标尺 参考线 时间码 日期戳
手绘贴纸：胶带 手绘圈 手绘线 隅付き括号 落款 · 光与几何：漏光 放射线 同心方 加号阵 市松带 汉字水印 音符

日期戳用 `new Date()`（不把今天的日期写进代码）；括号用 `fit`（拉丁行不配直角引号），不造恒真的 `when`。

### 这轮挖出来的两个真 bug

**镜头不擦自己的现场。** `.jv-track` 是全层共用的常驻元素，镜头件把 transform 写在它上面，
而 `camera:'none'` 不清场——上一段的推镜/荷兰角**永久留在后面每一段上**。
实测 track 停在 `1030x628@-35,-44`，满幅装饰被顶出舞台（裁切标的角标跑到 y=-31，等于看不见）。
修法和背景/外观同一条规矩：换件前先 `removeProperty`。

**`.jv-d` 基类是 `inset:0`（四边钉死）。** 新装饰只写 `left/bottom` 时另两边还是 0：
“正字计数”被拉成 975×102、“时间码”横贯全宽；改用 `inset:auto` 后小构件容器又塌成 0×0
（子元素全是 absolute），得量子元素而不是量容器。⑤ 为 HUD 治过同一个雷，这次又踩——
**同类问题要在定规矩的那一处收口，不能逐件打补丁。**

### 量具也错过两次

· 判“画没画出来”第一版只看 `background-image` / `border` / `textContent`，漏了
  `background-color` 与 SVG stroke，误报五件“0 像素”。补全判据后 22 件都有真实几何。
· 压测报“最大出界 998px”，追下去是**镜头把字带出画外**（在推镜过程中量矩形）——
  ⑦ 早就记过这条，我自己写完又忘了用。钉住镜头的压测是真 0。

验证（这轮用 CDP 直连 headless Chrome 跑，browser 工具连着掉实例，不跟它耗）：
17 件退场 `drop()` 漏 0；500 段自由配牌里登场/退场/版式全部出现过；
`PV.audit()` 五项 0/0/0/0/0；600 段压测（钉镜头）出界 0；帧消费者 2 不涨。

### 配牌读数：降噪不等于去掉

`.jv-tag` 是调试件，先前我做的是“空闲淡到 20%”——用户一句「不是应该去除吗」点破。
现在 `PV.tagOn` 默认 false，App 里进 PV 什么都不显示；**按 T 开关**。
上版加的“点一下循环三态”也撤了：默认不显示的东西留个隐形热区，只会误触。
预览台反过来默认开着（`pv/make-test.mjs` 里 `PV.tagOn = true`）。

## ⑭ 处理扩充（pv/src/26-treat2.js）

JIZURA 的 27 件文字处理是 **canvas 逐字画的**（`ctx.save/translate/vbands`），我们这层是 DOM/CSS，
所以搬的是**效果不是代码**——14 件全用 CSS 原语重写：

节奏姿态：大小律动(scale) · 摇摆字(rotate) · 基线错落(translateY) · 逐字抖动(逐帧)
时间进度：逐字填色(clip-path) · 虚实推进(blur) · 余韵渐隐(filter opacity) · 逐字换色(hue-rotate)
印刷切版：错位切断 · 逐字色版错位(drop-shadow) · 原稿用紙(outline) · 逐字圈 · 字距拉开 · 一字加亮

### 归属先划清（⑩ 学的教训）

| 属性 | 归谁 |
|---|---|
| `.jv-w` transform | 版式（位置与旋转） |
| `.jv-w` translate | 守卫 `--gdx/--gdy` + 本层 `--ttx/--tty`（在 base.css 里合成） |
| `.jv-w` rotate / scale | 本层 `--ttrot` / `--ttscale` |
| `i.jv-t` transform / opacity / filter | 登场层（WAAPI） |
| `i.jv-t` 涂装（stroke/shadow/clip） | ⑩ 外观层 |

所以本层**不碰 opacity、不碰 transform、不碰 text-shadow**：要淡用 `filter: opacity()`，
要糊用 `filter: blur()`，填色用 `clip-path`（外观层的点线缘用 mask，不撞）。

### 两个自己犯的错，都是量具拓出来的

1. `style.setProperty('clipPath', …)` **静默失效**——setProperty 只认 CSS 写法（`clip-path`）。
   karaokeFill 就这样整件没作用而且不报错。判据是「每件到底改到几个字的内联样式」。
2. `softfocus` 的门槛 `texture>.45 && motion<.6` 七档气氛**没有一档能同时满足**——
   等于永远抽不到，是死旋钮的件版。放宽到 `.3` 后 calm 与 emotional 可达。
   顺手拿「注入假音频」把八层扫了一遍：处理/装饰/背景/保持/镜头**未出现列表全空**，
   门槛没有一件是死的。

验证：14 件逐件量作用字数全部生效、换件后无残留；注入假音频 800 段零遗漏；
1200 段帧消费者 2–3 波动不累积；`PV.audit()` 五项 0/0/0/0/0。

## 待填

- ⑥ 已做：12 套本机字体栈 + 风格钉死 + 探测只当报告。还欠的是打包字体（woff2 子集）——现在完全依赖本机装了什么，换台机器会退化。
- ⑤⑨⑩ 做到现在：layout 43 / enter 9 / hold 7 / exit 7 / transition 12 / decor 18 / treatment 11 / bg 12 / look 24 / face 12，合计 179 件。
  JIZURA 那边数了一轮：`src/11p_*.js` 里 `name:` 条目约 **800 件**（layout 167+、exit 105、decor 100、enter 87、looks 87、bgcam 49、treattrans 47、fx 34），
  各包 header 自报数与计数一致，所以量级可信。**我们是零头的零头**，但层已经对齐了，剩下的是一类一类往里填。
- `exit` 的 `slice` 与 `transition` 的 `sliceIn` 都是文字复制品近似，不是真的遮罩切片。
- 真人真歌的准确度待听：合成拍点音没有和声、人声与混响，onset 会比真实流行乐干净得多。
- ⑧ 的图样还是 CSS 合成为主；JIZURA 那边有真纹理图与视频背景。离线优先之下要么继续合成，要么自带子集。

（以前下面两条已做完：⑥ 字体表见 `src/17-faces.js`；`tools/` 的 15 个一次性补丁已清点并归档到 `tools/_applied/`，账本命令 `node tools/audit-patches.mjs`。）
