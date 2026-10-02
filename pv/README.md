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
| `transition` | 新旧两行怎么接 | 9 | `cut` |
| `camera` | 整屏镜头 | 8 | `none` |
| `decor` | 可叠 0..n 的附加图形 | 4 | `particles` |
| `treatment` | 逐字 / 整屏处理 | 3 | `sweep` |

默认件就是 ① 之前旧实现的行为，所以不抽签时画面一模一样；变了的是**其余各层现在真的有事可做**。

```
pv/
  build.mjs          构建：拆旧块 → 剥遗留 → 接核心钩子 → 插新块 → 自锁校验 → 写盘
  serve.mjs          本地静态服务（宿主浏览器不吃 file://）
  make-test.mjs      从产物抽 PV 块，生成 test.html 预览台
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
| `idx` `line` `text` `tokens` | 行号、原行对象（含 `time`/`end`/`words`）、整句、切好的词/字 |
| `el` `tokensEls` `track` `stage` | 本 cut 容器、`i.jv-t` 列表、`.jv-track`、`#pvStage` |
| `style` `fx` | 当前风格件；`motion/glitch/chroma/decor/density/texture/bgSwitch`（0..1） |
| `audio` | `energy`、`beat{since,len,index}`、`time`(ms)。③ 接 analyser 之前 `time` 由外部推；`pulse`/`beatZoom` 靠它，没数据时 `when` 不成立、抽不到 |
| `stagger` | 逐字间隔 ms，`layout.pre()` 可覆写 |
| `lt` | 本 cut 已过的秒数 |
| `lyrics` | 全表，取前后行 |
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

## 待填

- ③ `audio.energy/beat` 还没有生产者。App 的 analyser 链在 `ui/index.html` 约 11109 行，只喂了 spectrum / waveform 两个主题；`pulse` 与 `beatZoom` 已就位，接上就能用。
- ④ 一行 = 一个 cut；`/` 分切与拍对齐未做。
- ⑤ `decor` 4 件、`treatment` 3 件，JIZURA 那边是 130 + 62 + 69。
- ⑥ 没有字体表，PV 跟 App 字体。
- `exit` 的 `slice` 是文字复制品近似，不是真的切片遮罩。
- `tools/` 剩下的 `inject-*` / `fix-*` 仍是补丁链（只管非 PV 部分），可以搬同样的「拆-剥-插-验」形状。
