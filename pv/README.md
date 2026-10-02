# PV 文字层 —— 部件注册表与构建流程

> 从 `tools/inject-*.mjs` 的一次性字符串补丁迁移而来。为什么换，见文末。

## 一层一个槽，一个部件一个文件

一个 cut（一行歌词的演出）由 9 层组合，每层独立注册、独立抽签：

| group | 管什么 | 件数 | 默认件 |
|---|---|---|---|
| `style` | 配色（含 `auto` 跟随主题） | 9 | auto |
| `layout` | 字在画面上的位置与形态 | 21 | 抽签 |
| `enter` | 逐字怎么进来 | 2 | `rise`（= 旧 jzWin） |
| `hold` | 驻留期怎么活着 | 1 | `none` |
| `exit` | 怎么走 | 1 | `none` |
| `transition` | 行与行怎么接 | 2 | `cut`（= 旧的直接替换） |
| `camera` | 整屏镜头 | 1 | `none` |
| `decor` | 粒子、ghost 等可叠装饰 | 2 | `particles` |
| `treatment` | 逐字扫光等按帧处理 | 1 | `sweep` |

```
pv/
  build.mjs          构建：拆旧块 → 剥遗留 → 接核心钩子 → 插新块 → 自锁校验 → 写盘
  serve.mjs          本地静态服务（宿主浏览器不吃 file://）
  make-test.mjs      从产物抽 PV 块，生成 test.html 预览台
  test.html          预览台产物（已 gitignore）：不放歌也能逐版式点着看
  src/00-engine.js   注册表、随机、ctx、配牌、渲染、帧循环
  src/01-styles.js   风格层 + 封面取色
  src/02-layouts.js  21 个版式
  src/03-layers.js   enter / hold / exit / camera / transition / decor / treatment
  src/04-chrome.js   骰子 / 标签 / ghost / 风格条
  src/05-api.js      对外接口与宿主接线
  css/base.css       层容器与舞台规则
  css/layouts.css    版式规则
  css/chrome.css     附件规则
  _legacy/           迁移前的 4 个 PV 补丁脚本，只读存档，不再执行
```

## 加一个新部件

写进 `src/03-layers.js`（或新建 `src/3x-xxx.js` 并加进 `build.mjs` 的 `JS_ORDER`）：

```js
PV.reg('hold', 'breathe', {
  nm: '呼吸', tags: ['calm', 'emotional'], w: 0.8,      // w = 权重，tags = 气氛（② 用来偏置抽签）
  when: c => c.fx.motion > 0.3,                          // 抽签前置条件
  fit:  c => c.tokens.length <= 20,                      // 够不够格
  apply: (c, el) => { /* 起手，可返回 cleanup */ },
  frame: c => { /* 可选：每帧，c.lt 是本 cut 秒数 */ }
});
```

要配 CSS 就加进 `css/layouts.css`，类名一律 `jv-` 前缀。然后：

```
node pv/build.mjs
node pv/make-test.mjs && node pv/serve.mjs 8778     # 浏览器打开 /pv/test.html 看效果
node tools/bump-build.mjs                            # 构建号三处同步，开着的播放器卡片会热重载
```

## ctx 契约（层之间只靠这些字段说话）

| 字段 | 含义 |
|---|---|
| `idx` `line` `text` `tokens` | 第几行、原行对象（含 `time/end/words`）、整句、切好的词/字 |
| `el` `tokensEls` `track` `stage` | 本 cut 容器、`i.jv-t` 列表、`.jv-track`、`#pvStage` |
| `style` | 当前风格件 |
| `fx` | `motion/glitch/chroma/decor/density/texture/bgSwitch`，0..1 |
| `audio` | `energy` 0..1 与 `beat {since,len,index}`；③ 接 analyser 后由引擎灌值，未接入时为 null |
| `stagger` | 逐字间隔 ms，`layout.pre()` 可覆写 |
| `lt` | 本 cut 已过的秒数（frame 型部件用） |
| `lyrics` | 全表，取前后行用 |

**token 是两层结构**：`<span class="jv-w">` 归版式（位置、字号、旋转），里面的 `<i class="jv-t">` 归登场与处理。

## 核心只认四个名字

`body.jizura-mode`、`window._jizuraLrcData`、`window.renderJizuraInit()`、`window.renderJizuraLine(idx)`。

其余接线集中成一个 `window.__pvCore`（由构建插入，锚点 `var _pvLineEls=[];`）：

```js
window.__pvCore = { render(), sync(i), idx(), lrc() }   // 核心闭包里的 renderPv / pvSync / _pvIdx / lrcData
```

PV 渲染在自己的 `#pvJv` 层里，**不覆盖 folia 的 `#pvTrack`**：退出 PV 只需摘掉 `jizura-mode`，再请核心重画一次。

## 为什么换掉补丁链

迁移前 `tools/` 下 20 个 `inject-*.mjs` / `fix-*.mjs`，每个都是对 447 KB html 做一次性 `replaceOnce`。三个后果：

1. **不能重放**。锚点被自己替换掉后再跑就抛「命中 0 次」。`inject-jizura.mjs` 的锚点 `function renderPv(){ if(!pvTrack) return;` 在 HEAD 里已经不存在——脚本复现不出产物，html 成了唯一且只能手改的源。
2. **数据双写**。`JZ_STYLES` 在 `inject-jizura.mjs` 与 `inject-jizura-ui.mjs` 各存一份，改一边就分叉。
3. **反向补丁叠正向补丁**。`fix-jizura-layout.mjs` 用 `transform:none !important` 锁死 `.pv-track` 来修舞台塌缩，顺手把以后做镜头层的路堵了。现在靠独立层解决，不需要 `!important`。

现在 `build.mjs` 是幂等流水线：**先整对拆掉旧 PV 块 → 再剥遗留 → 接核心钩子 → 插新块 → 写盘前自锁**（PV 标记恰好一对、旧 JIZURA 脚本已清、`__pvCore` 恰好一处、`.jz-gpill` 仍在），任一项不对就拒写。连跑四次字节一致。

遗留剥离按选择器识别（`jz-` / `jizura` / `--jz` / `@keyframes jz*`），白名单 `.jz-gpill`——那是播放列表的组标签胶囊，跟 PV 无关，只是撞了前缀。新代码全部 `jv-` 前缀，两个命名空间不再互相污染。

## 顺手修掉的三个既有缺陷

| 现象 | 原因 | 现在 |
|---|---|---|
| 散落 / 星散 的随机旋转从未显示 | 版式把 `transform:rotate()` 写在 token 上，而 `jzWin` 的 `100%{transform:none}` + `fill:both` 永久覆盖它 | token 拆外层（版式）/ 内层（登场），互不抢占 |
| 切风格不生效 | `.pv-jv` 自声明 `--jv-bg: var(--card-bg)`，盖掉了从 `#pvStage` 继承来的内联值 | 兜底移到 `.pv-stage`，内联优先 |
| 抽出 `title` / `interlude` 就白屏 | 部件表和 CSS 里有，`switch` 里没有分支 | 补了 render；空行自动走间奏，两个专用件只由显式调用触发 |

另外：旧代码 dispatch 的 `jizura-exit` 事件没有任何监听者，退出 PV 后舞台会停在上句——现在由 `__pvCore.render()` 重建。

## 已知未完成（对应后续步骤）

- `hold` / `exit` / `camera` 只有默认件，槽挖好了内容没填 → **②**
- `PV.fx` 是固定值，`audio.energy / beat` 还没有生产者（App 里 analyser 链已存在，在 11109 行附近）→ **③**
- 一行 = 一个 cut，`/` 分切与拍对齐未做 → **④**
- `decor` / `treatment` 只有粒子与扫光 → **⑤**
- 字体表未做，PV 跟 App 字体 → **⑥**
- `tools/` 里剩下的 `inject-*` / `fix-*` 仍是补丁链，只管非 PV 部分；可以把同样的「拆-剥-插-验」形状搬过去
