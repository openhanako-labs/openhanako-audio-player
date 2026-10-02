# PV 文字层 —— 部件注册表与构建流程

> 从 `tools/inject-*.mjs` 的一次性字符串补丁迁移而来。迁移原因见文末「为什么换掉补丁链」。

## 一层一个槽，一个部件一个文件

一个 cut（一行歌词的演出）由 9 层组合而成，每层独立注册、独立抽签：

| 层 group | 管什么 | 现在的件数 | 默认件 |
|---|---|---|---|
| `style` | 配色（含 `auto` 跟随主题） | 9 | auto |
| `layout` | 字在画面上的位置与形态 | 21 | 抽签 |
| `enter` | 逐字如何进来 | 2 | rise（= 旧的 jzWin） |
| `hold` | 驻留期怎么活着 | 1 | none |
| `exit` | 如何离开 | 1 | none |
| `transition` | 行与行怎么接 | 2 | cut（= 旧的直接替换） |
| `camera` | 整屏镜头 | 1 | none |
| `decor` | 粒子、前后行 ghost 等可叠装饰 | 2 | particles |
| `treatment` | 逐字扫光等按帧处理 | 1 | sweep |

文件划分：

```
pv/
  build.mjs          构建：拆旧块 → 剥遗留 → 接核心钩子 → 插新块 → 自检 → 写盘
  serve.mjs           本地静态服务（宿主浏览器不吃 file://）
  make-test.mjs       从产物抽 PV 块，生成 test.html 预览台
  test.html           预览台：不放歌也能逐版式点着看
  src/00-engine.js    注册表、随机、ctx、配牌、渲染、帧循环
  src/01-styles.js    风格层（+ 封面取色）
  src/02-layouts.js   21 个版式
  src/03-layers.js    enter / hold / exit / camera / transition / decor / treatment
  src/04-chrome.js    骰子 / 标签 / ghost / 风格条
  src/05-api.js       对外接口与宿主接线
  css/base.css        层容器与舞台规则
  css/layouts.css     版式规则
  css/chrome.css      附件规则
  _legacy/            迁移前的一次性补丁脚本，只读，不再执行
```

## 怎么加一个新部件

在 `src/03-layers.js`（或新建 `src/3x-xxx.js` 并加进 `build.mjs` 的 `JS_ORDER`）里：

```js
PV.reg('hold', 'breathe', {
  nm: '呼吸', tags: ['calm', 'emotional'], w: 0.8,
  when: function (c) { return c.fx.motion > 0.3; },        // 抽签前置条件
  fit:  function (c) { return c.tokens.length <= 20; },     // 够不够格
  apply: function (c, el) { /* 起手：可返回一个 cleanup 函数 */ },
  frame: function (c) { /* 可选：每帧调用，c.lt 是本 cut 秒数 */ }
});
```

要配 CSS 就在 `css/layouts.css` 里加 `@keyframes`，类名一律用 `jv-` 前缀。然后：

```
node pv/build.mjs
node pv/make-test.mjs && node pv/serve.mjs 8778
node tools/bump-build.mjs
```

### ctx 契约（层之间只靠这些字段说话）

| 字段 | 含义 |
|---|---|
| `idx` `line` `text` `tokens` | 第几行、原始行对象（含 `time/end/words`）、整句、切好的词/字 |
| `el` `tokensEls` `track` `stage` | 本 cut 的容器、`i.jv-t` 列表、`.jv-track`、`#pvStage` |
| `style` | 当前风格件 |
| `fx` | `motion/glitch/chroma/decor/density/texture/bgSwitch`，0..1 |
| `audio` | `energy` 0..1 与 `beat {since,len,index}`，③ 接进 analyser 后由引擎灌值；没有时为 null |
| `stagger` | 逐字间隔 ms，`layout.pre()` 可覆写 |
| `lt` | 本 cut 已经过的秒数（frame 型部件用） |
| `lyrics` | 全表，取前后行用 |

**token 结构是两层的**：`<span class="jv-w">` 归版式（位置、字号、旋转），里面的 `<i class="jv-t">` 归登场/处理。旧实现把两件事写在同一个元素上，`jzWin` 的 `transform:none` 会永久吃掉散落/星散的旋转——那个缺陷在拆分时一并修掉了。

## 核心只认四个名字

`body.jizura-mode`、`window._jizuraLrcData`、`window.renderJizuraInit()`、`window.renderJizuraLine(idx)`。

其余接线集中在一处 `window.__pvCore`（由构建插入，锚点 `var _pvLineEls=[];`）：

```js
window.__pvCore = { render(), sync(i), idx(), lrc() }   // 核心闭包里的 renderPv / pvSync / _pvIdx / lrcData
```

PV 层渲染在自己的 `#pvJv` 里，**不碰 folia 的 `#pvTrack`**，所以退出 PV 只要摘掉 `jizura-mode` 再请核心重画一次即可。旧实现是 `innerHTML` 直接覆盖 `#pvTrack`，退出后停在上句不动——那个 dispatch 了却没人监听的 `jizura-exit` 事件就是它的残骸。

## 为什么换掉补丁链

迁移前 `tools/` 下 20 个 `inject-*.mjs` / `fix-*.mjs`，每个都是对 447 KB html 做一次性 `replaceOnce`。三个后果：

1. **不能重放**：锚点被自己替换掉后再跑就抛「命中 0 次」。`inject-jizura.mjs` 的锚点 `function renderPv(){ if(!pvTrack) return;` 在 HEAD 里已经不存在——脚本无法复现产物，html 成了唯一的、手改的源。
2. **数据双写**：`JZ_STYLES` 在 `inject-jizura.mjs` 和 `inject-jizura-ui.mjs` 各存一份，改一边就分叉。
3. **反向补丁叠正向补丁**：`fix-jizura-layout.mjs` 用 `transform:none !important` 锁死 `.pv-track` 来修舞台塌缩，等于把以后做镜头层的路先堵了。这次靠 `#pvJv` 独立层解决，不需要 `!important`。

现在的 `pv/build.mjs` 是幂等流水线：**先整对拆掉旧 PV 块，再剥遗留，再接核心钩子，最后插新块**，写盘前自锁四项（PV 标记恰好一对、旧 JIZURA 脚本已清、`__pvCore` 恰好一处、`.jz-gpill` 仍在），任何一项不对就拒写而不是写坏。连跑四次字节一致。

遗留剥离按选择器识别（`jz-` / `jizura` / `--jz` / `@keyframes jz*`），白名单 `.jz-gpill`——那是播放列表的组标签胶囊，和 PV 无关，只是撞了前缀。新代码全部用 `jv-` 前缀，命名空间不再互相污染。

## 已知未完成

- `hold` / `exit` / `camera` 只有默认件，槽挖好了还没填内容（②）。
- `PV.fx` 是死值，`audio.energy/beat` 还没有生产者（③）。
- 一行仍等于一个 cut，`/` 分切与拍对齐没做（④）。
- 字体表没做，PV 跟 App 字体（⑥）。
- `tools/` 里剩下的 `inject-*` / `fix-*` 仍是补丁链，只管非 PV 部分；下一步可以把同样的「拆-剥-插-验」形状搬过去。
