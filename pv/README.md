# PV 文字层 —— 部件注册表与构建流程

> 从 `tools/inject-*.mjs` 的一次性字符串补丁迁移而来。为什么换，见文末。

## 一层一个槽，一个部件一个文件

一个 cut（一行歌词的演出）由 10 层组合，每层独立注册、独立抽签：

| group | 管什么 | 件数 | 默认件 |
|---|---|---|---|
| `mood` | 气氛：换抽签偏置 + 换一组 fx 预设 | 7 | — |
| `style` | 配色（含 `auto` 跟随主题） | 9 | auto |
| `layout` | 字在画面上的位置与形态 | 21 | 抽签 |
| `enter` | 逐字怎么进来 | 9 | `rise`（= 旧 jzWin） |
| `hold` | 进来之后怎么活着 | 7 | `none` |
| `exit` | 上一行怎么走 | 7 | `none`（= 旧的直接覆盖） |
| `transition` | 新旧两行怎么接 | 12 | `cut` |
| `camera` | 整屏镜头 | 8 | `none` |
| `decor` | 可叠 0..n 的附加图形 | 18 | `particles` |
| `treatment` | 逐字 / 整屏处理 | 11 | `sweep` |

共 109 件。叠加上限：`PV.decorMax = 2`、`PV.treatMax = 1`（在默认那几件之外再抽几件）。实测手拉满五件处理会把字完全淹掉，**上限比数量重要**。

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
  css/parts.css      ② 新增部件用的样式
  css/decor.css      ⑤ 装饰与处理扩容用的样式
  css/base.css       层容器与舞台规则
  css/layouts.css    版式规则
  css/chrome.css     附件规则
  css/parts.css      ② 新增部件的样式
  _legacy/           迁移前的 4 个 PV 补丁脚本，只读存档
```

## 气氛与滑块

`PV.setMood('glitch')` 做两件事：把 `fx` 设成该气氛的预设，并让带对应 tag 的件权重 ×2.6、不带的 ×0.45。抽的不是均匀随机，是有取向的随机。

| 气氛 | motion | glitch | chroma | texture | density |
|---|---|---|---|---|---|
| 故障 glitch | .9 | .9 | .8 | .7 | .8 |
| 静 calm | .25 | 0 | .1 | .3 | .4 |
| 流行 pop | .85 | .15 | .25 | .2 | .6 |
| 平面 graphic | .5 | .1 | .2 | .1 | .5 |
| 编辑 editorial | .35 | 0 | .05 | .15 | .45 |
| 情绪 emotional | .55 | .2 | .3 | .35 | .5 |
| 恐怖 horror | .7 | .75 | .5 | .8 | .55 |

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

**元素归属是硬规矩**：登场只动 `i.jv-t`，保持只动 `.jv-w` 或整行容器，镜头只动 `.jv-track`。三者不抢同一个元素才能叠——旧实现把版式定位和入场动画写在同一个元素上，于是入场把版式的旋转永久盖掉了（见文末缺陷表）。退场用 `play(ctx, el, drop)`，收尾必须调 `drop()`。配套 CSS 写进 `css/parts.css`，类名一律 `jv-`。

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

## 构建与预览

```
node pv/build.mjs              # 幂等，可反复跑；写盘前自锁，不对就拒写
node pv/make-test.mjs          # 生成 pv/test.html
node pv/serve.mjs 8778         # 宿主浏览器不吃 file://
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

## 待填

- ⑤ 已做到 decor 18 / treatment 11 / transition 12；JIZURA 那边是 layout 184 + enter 125 + decor 130 + fx 69……数量上仍是零头，但层已经齐了，剩下的是一类一类往里填。
- ⑥ 没有字体表，PV 跟 App 字体：版式的「字体性格」缺位。
- `exit` 的 `slice` 与 `transition` 的 `sliceIn` 都是文字复制品近似，不是真的遮罩切片。
- ⑥ 没有字体表，PV 跟 App 字体。
- `exit` 的 `slice` 是文字复制品近似，不是真的切片遮罩。
- 真人真歌的准确度待听：合成拍点音没有和声、人声与混响，onset 会比真实流行乐干净得多。
- `tools/` 剩下的 `inject-*` / `fix-*` 仍是补丁链（只管非 PV 部分），可以搬同样的「拆-剥-插-验」形状。
