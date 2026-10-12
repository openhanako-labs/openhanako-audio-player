# 前端现状审计（2026-10-11）

> 目的：在动「双语歌词」与「沉浸播放页」之前摸清家底——有什么、缺什么、哪些是埋着的资产。
> 锚点行号以当前 feat/lyrics-ux 分支为准。

## 一、文件构成

| 文件 | 大小 | 行数 | 职责 |
|---|---|---|---|
| ui/index.html | 368 KB | 7,538 | 薄壳 DOM（~260 行）+ SDK 胶水 module（L12-1390）+ **PV 引擎 inline 注入（L2681-8533，5,852 行）** |
| ui/standalone.html | 368 KB | 7,538 | 与 index.html 字节级双胞胎（独立窗口用），构建时同步 |
| ui/app.js | 234 KB | 5,885 | 主逻辑：AudioPlayer 类 + 外挂 IIFE 群 |
| ui/style.css | 77 KB | 1,693 | 全部样式（分区见 §四） |
| ui/head.js | 51 KB | 1,485 | 卡片运行时：`__whenHana` 桥（L6）、高度上报（L116）、视图类（L182）、形态补判、探针数据（L1460） |
| ui/sdk.js | 49 KB | 1,361 | @hana/plugin-sdk（协议解析、订阅、postMessage） |
| ui/face-portrait.png | 59 KB | — | PV 立绘资产 |
| ui/_build.json | 1 行 | — | 构建号（bump-build.mjs 同步 head.js） |

构建：`pv/build.mjs` 把 pv/{css,src} 注入两个 html；`tools/bump-build.mjs` 刷构建号。**双副本由构建保证一致，但任何手改必须过 build**（曾发生手工漂移）。

## 二、DOM 骨架（index.html L2408-2675，仅 ~260 行）

```
body
└─ .player-container
   ├─ .player-left
   │  ├─ .header（L2416：标题 + header-actions 按钮组）
   │  ├─ .now-playing-section（L2444）
   │  │  ├─ .lyrics-section > #lyricBody.lyric-body（L2462，标准歌词滚动窗）
   │  │  └─ #pvStage > .pv-bg + .pv-track（L2465，PV 舞台）
   │  └─ .controls-section（L2469）
   └─ .player-right（L2507）
      ├─ .nav-tabs（L2510）
      └─ .tab-content（L2518：播放列表/搜索/场景/编排面板）
```

面板类 UI（歌词设置、搜索结果、编排等）全部由 JS 动态建 DOM。

## 三、三层形态系统（改视图前必读）

1. **宿主窗口形态**（head.js L182）：`body.view-compact / view-full`——由宿主 `__hanaGetView()` 决定
2. **演出三档**（app.js L4883-4930 + L6437）：`body.lyrics-mode`（PV）/ `body.jizura-mode`（纯歌词）→ 标准态；`lyricModeBtn` 点击循环 标准→PV→歌词，状态存 `hanako_audio_lyrics_mode`
3. **卡片断点**（app.js L4415 applyLayout）：`.player-container[data-layout=wide|compact|long]`（w≥720 / h<560 / 其余）+ `data-ctl=narrow|normal` 密度

三层各管一事，但 **CSS 里有大量三层交叉选择器**（如 L1827 compact × 歌词）——新增视图形态（沉浸页）必须决定挂在哪一层，不能造第四套并行机制。

## 四、style.css 分区地图

- L1-632：基础变量（:root 明暗）→ 组件（header/进度/控制/列表/歌词面板/分组/Toast/搜索）
- L633-1089：面板类（搜索/导入/场景/编排）+ 通用组件
- L1090-1225：**歌词模式 = PV 演出**（`body.lyrics-mode` 大段）
- L1226-1303：浓缩视图（`?view=compact`）
- L1304-1392：配色主题（背景层 + 面板）
- L1393-1869：**形态适配**（view-compact 专属排版 → data-layout 三档 → 控制密度）——`.is-current` 死选择器曾潜伏于此（已修，L1830/L1850）
- 动效合规：全局歌词层（L1571）只动 color/opacity/transform ✅；残留违规 6 处（height/width/font-size/flex/max-height，低频面板展开类，见 §八）

## 五、app.js 架构

- L17 `AudioEventBus` + AudioPlayer 主类（AUDIO-09 扩展方法 L143 起）——事件：track-change / progress / play-state / theme / **lyrics-toggle（翻译显隐，L14 注释，未见消费方）**
- 外挂 IIFE 群按功能段分布：歌词设置对话框（L2362-2733，支持 .lrc/.txt/.vtt/.ttml/.json）、Server 歌单同步（L3121）、单一播放者（L3228）、紧凑壳兜底（L3312）、播放模式/本地导入/分组/标签页（L3823-4410）、形态适配（L4408）、歌词模式（L4883）、主题（L5850+）、顶栏三模式胶囊（L6437）
- 与 index.html 内 PV 引擎的关系：app.js 通过 `window.PV` 调 `pvSync(idx)`，PV 引擎自管部件注册与渲染

## 六、歌词数据管线（双语歌词的地基——比预想完整）

```
选曲 → _wordSourceOf(track)                    （L5371，判定是否有 B站/在线逐字源）
  ├─ 有 → GET /widget/api/music/ttml           （L5376，AMLL DB 后端代理）
  │        → parseTtml() L5040：
  │           行级 {time, end, text, tran, words[]}
  │           tran  = x-translation span（译文已提取！）
  │           words = 逐字时间轴；x-bg 背景声部跳过；署名过滤 looksLikeCredit L4999
  └─ 无 → GET lrc → parseLrc() L5007（纯 [{time,text}]）
      → 双路缓存（ttml:platform:id / url 键）
      → renderLrc() L5178：**只渲染 l.text —— tran 在标准视图被丢弃**
```

- 译文渲染现状：**只有 PV 舞台有**（L5115 `.pv-tran`），标准视图无
- 逐字（words）同样只喂 PV/卡拉OK 层
- `lyrics-toggle` 事件（L14）定义为「翻译显隐切换」，无消费方——开关 UI 也不存在

**结论：双语歌词 = renderLrc 渲染 tran + 显隐开关（接 lyrics-toggle）+ CSS 两行排版。数据层零新增。**

## 七、与目标形态的承接评估

**双语歌词（小）**：动 renderLrc（+tran 行 DOM）、标准视图 CSS（译文小字行）、PV 舞台已有可对齐样式；开关挂 header 或歌词面板。预计纯增量，无结构风险。

**沉浸播放页（大）**：目标是「封面铺满 + 歌词叠印 + 悬浮信息/控制」。承接点：
- 封面皮肤已有代理取色背景（`__currentCoverUrl` + CoverColorExtractor）可复用为沉浸底
- 歌词叠印 = lyrics-mode 的 PV 舞台变体，但 CanCan 形态是「整窗」——**需决定挂在三层形态系统的哪层**：建议 `body.immersive-mode` 第四档（与 lyrics-mode 平级，lyricModeBtn 循环扩为四档）或替代 jizura-mode（纯歌词与沉浸功能重叠度高）
- 悬浮控制条：controls-section 的定位/材质改造，data-layout 断点选择器需全部复查

**歌单抽屉 + 标签筛选（中）**：.player-right 已有 tab 体系，「最近播放」需播放史持久化（后端 state.js 或 localStorage）；标签筛选是分组查询的变体。

## 八、技术债清单

1. **standalone.html 双副本**：368KB×2，构建同步但 diff 噪音大（曾漂移）
2. **PV 引擎 5,852 行 inline 在 html 内**：占 index.html 78%，无法 tree-shake；lite 版整段移除靠 pack 脚本
3. **动效违规 6 处**：height(L221/283)、width(L227)、font-size(已修)、flex(L1868)、max-height×4——均为低频面板展开，优先级低但记着
4. **head.js 1,485 行职责混杂**：桥 + 上报 + 探针 + 形态补判，宜拆
5. **死代码**：`lyrics-toggle` 事件、AudioEventBus 部分事件无消费方
6. **`.is-current` 教训**：2c 从 fork 抄选择器命名未对齐 JS——**跨文件类名契约无校验**，宜在建 verify-ui 式脚本时加「CSS 类名 ↔ JS toggle 对账」断言

## 九、建议施工序

1. 双语歌词（数据在、渲染缺）——半天量级
2. 歌词浏览态验收补全（已做主体）+ 类名对账断言起步
3. 沉浸播放页立项：先定档位归属（第四档 vs 替换 jizura-mode），再拆 brief
4. 歌单抽屉/最近播放（依赖播放史持久化设计）
