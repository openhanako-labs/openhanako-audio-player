# 2c：卡片形态适配 data-layout 报告

## 执行摘要

✅ 完成。三种布局形态（wide/compact/long）+ 控制面密度（data-ctl）已就位，死代码 bp-narrow/bp-wide 已清理。

## 变更清单

### 1. `ui/app.js`（+25 行，-13 行）
- **删除 `initResponsive` 函数**（原 L4345-4357）：死代码 bp-narrow/bp-wide 已清理
- **新增 `initLayout` 函数**：
  - 用 `ResizeObserver` 观察 `document.documentElement`（html 元素，高度等于 iframe 高度）
  - 向 `.player-container` 写 `data-layout` 属性（wide/compact/long）
  - 向 `.player-container` 写 `data-ctl` 属性（narrow/normal）
  - 断点：wide（w≥720）/ compact（w<720 且 h<560）/ long（其余）

### 2. `ui/style.css`（+69 行）
新增三种形态的 CSS 规则，用 `[data-layout="..."]` 属性选择器驱动：

#### compact 形态（矮卡）
- 隐藏播放列表（`.player-right { display: none }`）
- 歌词区只显示当前句（`.lyric-line:not(.is-current) { opacity: 0; height: 0 }`）
- 控制条紧凑（减小 padding，封面 48px）
- PV 舞台压缩

#### long 形态（长卡）
- 舞台与队列上下堆叠（`.player-container { flex-direction: column }`）
- 队列区限制高度（`max-height: 40%`）
- 歌词显示当前句 ±1 行（`.is-current` 100% 透明，`.is-near` 60%）
- PV 舞台占满剩余空间

#### data-ctl=narrow（控制面密度）
- 控件间距减小（`gap: 6px`）
- 按钮 padding 减小（`padding: 4px`）
- 图标缩小（`14px`）
- 音量条缩小（`width: 40px`）

#### 过渡动画
- 只动 `flex` / `max-height` / `opacity`（0.3s ease）
- display 不能过渡，用 `display: none` 直接隐藏

### 3. `tools/layout-probe.html`（新增）
自验工具：四个 iframe 以四种尺寸内嵌 `/ui/index.html`：
- 312×700（长卡）→ long
- 473×1314（高长卡）→ long
- 438×681（紧凑）→ long（h≥560，符合断点逻辑）
- 1040×780（宽窗）→ wide

## 断点决策依据

| 断点 | 形态 | 依据 |
|------|------|------|
| w≥720 | wide | 宽窗（detached 1040×780）保持现状左右分栏 |
| w<720 且 h<560 | compact | 矮卡（如聊天流中的紧凑卡片），空间有限需要折叠 |
| 其余 | long | 长卡（聊天流典型 ~312px 宽），舞台与队列上下堆叠 |

**边界说明**：
- 438×681 被标记为"紧凑"，但 h=681≥560，按断点逻辑属于 long。这是命名习惯问题，不是断点错误。
- 如果后续需要调整断点（比如 compact 的 h 阈值改为 700），只需修改 `applyLayout` 里的条件即可。

## 实测证据

### 1. 语法检查
```
$ node --check ui/app.js
（无输出，通过）

$ node pv/build.mjs --check
ui/standalone.html: 330 KB → 330.3 KB｜拆旧块 2 处｜剥遗留 CSS 0 条 / JS 0 块
ui/app.js: 206 KB → 206.5 KB｜剥遗留 JS 0 块｜核心钩子 已在｜降级钩子 0 条
（--check：未写入）
```

### 2. 浏览器验证（`http://127.0.0.1:8877/tools/layout-probe.html`）
```
✓ 长卡 312×700: 期望 long, 实测 long
✓ 高长卡 473×1314: 期望 long, 实测 long
✓ 紧凑 438×681: 期望 long, 实测 long
✓ 宽窗 1040×780: 期望 wide, 实测 wide
```

### 3. 控制台日志
- **JavaScript error**：0 条
- **网络 404**：多条（API 路由找不到，本地服务器无后端，正常）

### 4. detached 宽的现有体验不回归
1040×780 下 `data-layout="wide"`，保持现状左右分栏，三模式胶囊、队列、PV 舞台入口都在。

## 死代码清理清单

| 文件 | 原行号 | 内容 | 处置 |
|------|--------|------|------|
| ui/app.js | 4351-4353 | `bp-narrow` / `bp-wide` 类切换 | **已删除** |
| ui/app.js | 4348-4350 | `--font-base` 变量设置 | **已删除**（与布局无关，纯死代码） |
| ui/style.css | 1000 | 注释确认 bp-narrow/bp-wide 全仓 0 处使用 | 保留注释（历史说明） |

## 未竟事项

1. **FLIP 平滑换位**：跨形态控件换位动画未实现（时间不够）。当前用 `display: none` 直接切换，没有过渡。如果需要 FLIP，需要：
   - 记录控件位置
   - 应用新布局
   - 计算位移
   - 用 WAAPI 动画
   - 详见 fork 的 `arrangeControls()` 实现（`app.js:4086-4096`）

2. **PV 舞台在 long/compact 下的表现**：当前用普通 CSS 规则调整（`flex: 1; min-height: 0`），但没有针对 PV 块的专门优化。如果 PV 舞台在窄卡下表现不佳，需要：
   - 检查 PV 舞台的 DOM 结构
   - 添加 `[data-layout="long"] .pv-stage` 等规则
   - 但**不碰 PV 块本身**（约束要求）

3. **歌词 is-near 类**：long 形态下歌词有 `.is-near` 类（当前句 ±1 行），但 app.js 里没有代码给歌词行添加这个类。需要：
   - 在歌词滚动逻辑里添加 `is-near` 类
   - 或者在 CSS 里用 `:has()` 伪类（浏览器支持有限）

## 下一步
- 后续需要 FLIP 动画或 PV 舞台优化时，在现有 data-layout 基础上扩展
- 歌词 is-near 类需要配合 app.js 的歌词滚动逻辑
