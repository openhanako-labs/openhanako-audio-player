---
title: PV 引擎 · 层模型与扩展协议
---

# 一句话

一行歌词 = 一个 cut。一个 cut = **9 个层各自抽一次签**拼出来的，不是一坨写死的 HTML。

# 层

| 层 | 干什么 | 现在有几件 | 谁在用 |
|---|---|---|---|
| `style` | 配色（含 `auto` 跟随主题） | 9 | ① 已有，从旧实现平移 |
| `layout` | 字在画面上的位置与形态 | 21 | ① 已有 |
| `enter` | 字怎么进来 | 2（`none` / `rise`） | ① 默认 `rise` = 旧的 jzWin |
| `hold` | 进来之后怎么活着 | 1（`none`） | ② 要填 |
| `exit` | 怎么出去 | 1（`none`） | ② 要填 |
| `transition` | 上一行到下一行怎么接 | 2（`cut` / `fade`） | ② 要填 |
| `camera` | 整屏镜头 | 1（`none`） | ②/③ |
| `decor` | 附加图形 | 2（`none` / `particles`） | ⑤ 要填 |
| `treatment` | 逐字/整屏处理 | 1（`sweep` 扫光） | ③⑤ |

`PV.stats()` 会打印这个表的数量，`pv/test.html` 顶上那一行就是它。

# 注册一个部件

一个文件就够，只注册、不改核心（`pv/src/3x-<名字>.js`，然后加进 `build.mjs` 的 `JS_ORDER`）：

```js
(function () {
  'use strict';
  var PV = window.PV;

  PV.reg('hold', 'sway', {
    nm: '轻晃',
    tags: ['pop', 'graphic'],     // 气氛标签，② 的偏置抽签用
    w: 0.8,                      // 权重，0.4~1.5
    fit: function (c) { return c.tokens.length <= 18; },   // 够不够格被抽中
    when: function (c) { return c.fx.motion > 0.3; },       // 开关条件
    apply: function (c, el) {                              // 起手，可返回一个 stop 函数
      var amp = 3 + c.fx.motion * 6;
      return function () { el.style.transform = ''; };      // stop：切行时被调用
    },
    frame: function (c) {                                   // 每帧（全局一条 rAF 驱动）
      c.el.style.transform = 'translateY(' + (Math.sin(c.lt * 2) * 3).toFixed(2) + 'px)';
    }
  });
})();
```

CSS 自己配在 `pv/css/` 里（`@keyframes` 也写在那儿），构建时按 `CSS_ORDER` 拼接。

# ctx（`c`）里有什么

| 字段 | 含义 |
|---|---|
| `idx` `line` `text` `tokens` | 行号、原始行对象（含 `time`/`end`/`words`）、整句文本、切好的 token |
| `el` | 本 cut 的容器（`.jv-line.jv-<layout>`） |
| `tokensEls` | `i.jv-t` 元素数组 —— 登场与处理层动的就是它 |
| `track` `stage` | `.jv-track`（镜头层动它）、`#pvStage` |
| `style` | 当前风格件 `{id,nm,bg,fg,sub,acc,light}` |
| `fx` | 演出强度：`motion glitch chroma decor density texture bgSwitch`（0..1） |
| `audio` | `energy`（0..1 响度）与 `beat{since,len,index}`，③ 由 analyser 灌进来，现在是 null |
| `stagger` | 逐字间隔 ms，`layout.pre()` 可以覆写 |
| `lyrics` | 全表，取前后行用 |
| `lt` | 本 cut 已过的秒数（frame 型部件用） |
| `params` | 留给 `plan()` 存自己的排版决定 |

# 版式的两段式

`layout` 多两个钩子：

- `fit(c)` — 能不能用（字数、拉丁文判定的老规矩都在这）
- `pre(c)` — 抽签命中后、渲染前改 ctx（如 `c.stagger = 50`）
- `render(c)` — 返回 `.jv-line` 的**内部** HTML；外层容器由引擎生成

token 必须用 `PV.spans(c, extra)` 产出：外层 `span.jv-w` 归版式（位置/字号/旋转），内层 `i.jv-t` 归登场层。**别把 transform 写在 `jv-w` 上又指望它不被入场动画覆盖**——旧实现就栽在这上面。

# 宿主接线（只此一处）

核心只认四个名字：`body.jizura-mode`、`window._jizuraLrcData`、`window.renderJizuraInit()`、`window.renderJizuraLine(idx)`。

构建时额外注入一个钩子，把闭包里的 `renderPv / pvSync / _pvIdx / lrcData` 暴露成 `window.__pvCore`，PV 层退出时靠它重建 folia。

PV 渲染在自己的 `#pvJv` 层里，**不写 `#pvTrack`**。旧的「退出后停在上一句」是因为它直接 innerHTML 覆盖了 folia 的行。

# 构建

```
node pv/build.mjs              # 拆旧块 → 剥遗留 → 接钩子 → 插新块 → 自检 → 写盘
node pv/build.mjs --check      # 只校验不写
node pv/make-test.mjs          # 生成 pv/test.html（预览台，file:// 打开即可点着看）
node pv/serve.mjs 8778         # 宿主浏览器不吃 file:// 时用
node tools/bump-build.mjs      # 构建号三处同步，已开的播放器会自己重载
```

`build.mjs` 可反复重放：它先把 `PV:BEGIN/END` 之间的旧块整对拆掉，再做遗留剥离，最后插回来。写盘前有四道自锁（标记对数、旧脚本是否清干净、`__pvCore` 是否恰好一处、`.jz-gpill` 是否还在），任何一道不对就**拒写**而不是把 html 弄成残块。

# 为什么不再是 `tools/inject-*.mjs`

旧链 20 个脚本，每个都对 447 KB 的 html 做一次 `replaceOnce`。锚点被自己替换掉之后就不能重跑（`inject-jizura.mjs` 现在跑必然抛「命中 0 次」），于是 html 漂出了脚本能复现的范围；`JZ_STYLES` 还在两个脚本里各存了一份。旧的 `fix-jizura-layout.mjs` 更是用 `!important` 锁死 `.pv-track` 来修舞台塌缩，把镜头层的路堵住了——新层容器从根上不需要那条规则。

`pv/_legacy/` 里留着那四个 PV 相关的旧脚本，只作历史参考，不再执行。

# 这一步顺手修掉的三个既有缺陷

| 现象 | 原因 | 现在 |
|---|---|---|
| 散落 / 星散 / 波迹 的旋转与位移从来没显示过 | 版式把 `transform` 写在 token 上，而入场动画 `jzWin` 的 `100%{transform:none}` + `fill:both` 会长期覆盖内联值 | token 拆外层（版式）/ 内层（登场），两者不抢同一个属性 |
| 点风格条切配色不生效 | `.pv-jv` 自己声明了 `--jv-bg: var(--card-bg)`，元素上的自定义属性优先于继承，把从 `#pvStage` 设下来的内联值盖掉了 | 兜底声明移到 `.pv-stage`，内联值能正常继承下来 |
| 抽到 `title` / `interlude` 就白屏 | 部件表和 CSS 里有这两个名字，但 `switch` 里没有对应分支（且 `sp:1` 让它们永远不进随机池，于是长期没人发现） | 补了 render；两个仍标 `sp` 只走显式调用，空行自动走间奏 |

另：`jizura-exit` 事件被 dispatch 却没有任何监听者，所以退出 PV 后舞台会停在上句。现在 PV 用自己的 `#pvJv` 层、不覆盖 `#pvTrack`，退出只需 `__pvCore.render()` 让核心重画一次。

# 待填（按 ②③④⑤⑥ 的顺序）

- ②：`hold` / `exit` / `transition` 还是只有一件默认。入口已备好：`PV.defaults` 改默认件，`PV.reroll({hold:'…'})` 单行重掷。
- ③：`PV.fx` 仍是固定值，`audio.energy / beat` 没有生产者。App 里的 analyser 链已经在 `ui/index.html` 约 11109 行处，只喂了 spectrum / waveform 两个主题，接过来成本最低。
- ④：一行 = 一个 cut。`/` 分切与拍对齐未做。
- ⑤：`decor` 只有粒子，`treatment` 只有扫光。
- ⑥：没有字体表，PV 跟 App 字体。
- 另：`tools/` 里剩下的 `inject-*` / `fix-*` 仍是补丁链（只管非 PV 部分），可以把同样的「拆-剥-插-验」形状搬过去。
