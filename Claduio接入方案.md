# Claduio → hanako-audio-player 接入方案

> 基于现有 v0.4.0 代码升级，不推翻重建
> 撰写日期：2026-06-21

---

## 1. 现状诊断

### 1.1 已有能力

| 模块 | 文件 | 状态 |
|------|------|------|
| 播放器页面 | `routes/player.js` | ✅ widget 页面 + `/play` 流式音频 |
| TTS 合成 | `tools/tts.js` | ✅ 本地 CosyVoice Python 调用 |
| 语音生成 | `tools/generate_speech.js` | ✅ 存在，待确认接口 |
| 基础播放 | `tools/play.js` | ✅ 单次播放/队列追加 |
| 数据持久化 | `dataDir/media/` + `queue.json` | ✅ 文件系统 |

### 1.2 关键发现

- **CosyVoice 接口类型**：本地 Python 脚本调用（`executor.py`），不是 WS/HTTP 服务
  - 路径查找优先级：`dataDir/executor.py` → `plugin-data/hanako-audio-player/executor.py` → 环境变量 `HANAKO_AUDIO_PLAYER_DIR`
  - Python 解释器：`COSYVOICE_BASE/venv/Scripts/python.exe` 或系统 `python`
- **队列现状**：`queue.json` 数组，无状态机，无优先级，无持久化保障
- **TTS 降级链**：不存在，需要新建
- **可视化**：widget 页面是基础 HTML 播放器，无频谱/极光

### 1.3 工具分工确认

| 工具 | 职责 | 状态 |
|------|------|------|
| `play.js` | 播放音频 URL（在线/本地） | ✅ 已有 |
| `tts.js` | CosyVoice 本地合成语音 | ✅ 已有 |
| `generate_speech.js` | 播放本地已有音频文件（复制到 media 后播放） | ✅ 已有，与 `tts.js` 不重叠 |

**结论**：`generate_speech.js` 是"播放器"，`tts.js` 是"合成器"。bus 协议中：
- `say` → 调用 `tts-bus.js`（合成 + 播放）
- `play` → 调用 `play.js` 或 `generate_speech.js`（播放已有音频）

### 1.4 播放器形态

- **默认**：widget 嵌入式 iframe（现有路由 `/widget`）
- **扩展**：支持弹出独立全屏页面（同一页面加 `?mode=full` 参数或新路由 `/player`）
- 前端检测 `window.top !== window.self` 时显示"打开独立窗口"按钮

| 计划书功能 | 现状 | 差距 |
|------------|------|------|
| 总线协议 `{ say, play[], segue, reason }` | 无 | 需新建 bus 模块 |
| TTS 三层降级 | 无（仅本地 Python） | 需新建降级链 |
| 场景化节目编排 | 无 | 需新建 scheduler |
| 极光频谱可视化 | 无 | 需新建 |
| 网易云适配 | 无 | 可选，暂缓 |

---

## 2. 核心决策

### 2.1 总线协议实现：新建 `bus.js` 模块

**理由**：
- 现有 `play.js` 职责是"单次播放请求"，不应该塞入编排逻辑
- 新模块负责：解析 `{ say, play[], segue, reason }` → 驱动播放队列 → 回传状态
- `play.js` 降级为 bus 的底层执行器

**协议草稿**：

```js
// 输入（playlist 条目）
{
  type: "say",        // TTS 串场
    text: "...",
    spk?: "my_voice",
    instruct?: "温柔"
}
{
  type: "play",       // 播放音频
    url: "/api/plugins/.../media/xxx.mp3",
    name?: "曲名"
}
{
  type: "segue",      // 过渡（静音/淡入淡出/音效）
    duration?: 3000,  // 毫秒
    effect?: "fade"
}
{
  type: "reason",     // 解释/备注
    text: "切换原因"
}

// 输出（总线事件）
{ event: "track_start", item: {...} }
{ event: "track_end",   item: {...} }
{ event: "bus_error",   code: "tts_failed", message: "..." }
{ event: "bus_idle" }  // 队列清空
```

### 2.2 TTS 降级链：新建 `tts-bus.js`

**三层设计**：

| 层级 | 名称 | 实现 | 触发条件 |
|------|------|------|----------|
| L1 | CosyVoice 本地 | Python `executor.py` | 默认，优先使用 |
| L2 | HTTP TTS 接口 | 外部 API（如 Azure/Google/自建） | L1 超时/失败 |
| L3 | 浏览器原生 | Web Speech API `speechSynthesis` | L1+L2 均失败 |

**关键细节**：
- L1 已有实现，直接复用 `tools/tts.js` 的核心逻辑
- L2 留接口，暂不接具体服务（`process.env.TTS_HTTP_URL` 可配置）
- L3 在前端 widget 实现（`window.speechSynthesis`），不经过后端

### 2.3 可视化策略：CSS 简化版先行，Three.js 后续

**理由**：
- 现有 widget 是 iframe 页面，Three.js 开销大
- 用户明确"先别动手优化"，优先跑通编排逻辑
- CSS 频谱（`<canvas>` 绘制简易波形）够用且轻量

**简化版方案**：
- `<canvas>` 绘制实时波形（`AudioContext.createAnalyser()`）
- 播放时波形随音频跳动
- 配色沿用暖黄色主题
- Three.js 极光作为 v1.1 扩展

### 2.4 网易云适配：跳过，后续扩展

**理由**：
- 计划书已标注"可选"
- weapi 加密协议不稳定，维护成本高
- 本地音频 + TTS 已能覆盖核心场景

---

## 3. 架构设计

### 3.1 新增模块

```
hanako-audio-player/
├── index.js                    # 插件入口（不变）
├── manifest.json               # 版本 bump
├── executor.py                 # CosyVoice 执行器（不变）
├── routes/
│   └── player.js               # 播放器页面（扩展示例播放 + bus 控制）
├── tools/
│   ├── play.js                 # 单次播放（降级为 bus 底层）
│   ├── tts.js                  # 单次 TTS（降级为 bus 底层）
│   ├── generate_speech.js      # 语音生成（待确认用途）
│   ├── bus.js                  # 🆕 总线协议解析器 + 队列状态机
│   └── tts-bus.js              # 🆕 TTS 降级链
└── dataDir/
    ├── media/                  # 音频文件
    ├── queue.json              # 当前播放队列（bus 写入）
    └── bus-state.json          # 🆕 bus 运行状态（调试用）
```

### 3.2 bus.js 核心逻辑

```js
// bus.js — 节目编排引擎
export class AudioBus {
  constructor(ctx) {
    this.ctx = ctx;
    this.queue = [];      // 待播放条目
    this.current = null;  // 当前播放
    this.history = [];    // 已播放
    this.listeners = {};  // event emitter
  }

  // 解析 playlist（支持 say/play/segue/reason 混合）
  load(playlist) { ... }

  // 播放下一首
  async next() { ... }

  // 插入 say → play[] → segue 序列
  say(text, opts) { ... }
  play(url, opts) { ... }
  segue(duration, effect) { ... }

  // 事件监听
  on(event, fn) { ... }
  emit(event, data) { ... }
}
```

### 3.3 tts-bus.js 核心逻辑

```js
// tts-bus.js — TTS 降级链
export class TTSBus {
  constructor(ctx) { this.ctx = ctx; }

  async synthesize(text, opts = {}) {
    // L1: CosyVoice 本地
    try {
      return await this.cosyVoice(text, opts);
    } catch (e) {
      console.warn('[TTS] L1 failed, fallback to L2', e.message);
    }

    // L2: HTTP TTS（预留接口）
    if (process.env.TTS_HTTP_URL) {
      try {
        return await this.httpTTS(text, opts);
      } catch (e) {
        console.warn('[TTS] L2 failed, fallback to L3', e.message);
      }
    }

    // L3: 浏览器原生（返回 special marker，前端处理）
    return { kind: 'browser-native', text, opts };
  }

  async cosyVoice(text, opts) {
    // 复用 tools/tts.js 的 executor.py 调用逻辑
    // 返回 { url: '/api/plugins/.../media/xxx.wav' }
  }

  async httpTTS(text, opts) {
    // 预留：fetch POST to TTS_HTTP_URL
    // 返回 { url: 'https://...' }
  }
}
```

---

## 4. 实施阶段

### Phase 1：Bus 协议骨架（预计 2h）

- [x] 方案文档审查（本文件）
- [ ] `tools/bus.js` 实现 `AudioBus` 类
- [ ] `tools/tts-bus.js` 实现 `TTSBus` 类（含 L1/L2/L3 接口）
- [ ] `routes/player.js` 新增 `/bus/state` 和 `/bus/control` 端点
- [ ] 前端 widget 新增 Bus 控制面板（播放/暂停/下一首/队列列表）

### Phase 2：场景编排（预计 3h）

- [ ] 定义 3 个内置场景：`work` / `chill` / `late_night`
- [ ] 场景配置：时段感知 + 情绪标签
- [ ] 示例播放列表生成器
- [ ] `say` → `play` → `segue` 端到端测试

### Phase 3：可视化升级（预计 2h）

- [ ] `<canvas>` 实时波形（AudioContext + AnalyserNode）
- [ ] 暖黄色配色适配
- [ ] 播放状态联动（波形随播放跳动）

### Phase 4：打磨与文档（预计 1h）

- [ ] 错误边界处理（bus 卡住时自动跳过）
- [ ] 日志输出（`bus-state.json` 调试用）
- [ ] README 更新

---

## 5. 验收标准

- [ ] `AudioBus.load(playlist)` 能正确解析 `say/play/segue/reason` 混合序列
- [ ] `TTSBus.synthesize()` 在 CosyVoice 可用时走 L1，不可用时自动降级
- [ ] 浏览器原生 TTS（L3）在前端正确执行
- [ ] 场景切换（work/chill/late_night）生成不同风格的播放列表
- [ ] Canvas 波形随音频实时跳动
- [ ] 队列清空后自动停止，无内存泄漏

---

## 6. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| CosyVoice 超时导致 bus 卡住 | 中 | 高 | 超时自动跳过，记录到 history |
| executor.py 路径变动 | 低 | 中 | 多路径查找 + 环境变量兜底 |
| AudioContext 浏览器兼容 | 低 | 低 | 降级为静态波形图 |
| 队列文件并发写入 | 中 | 中 | 写 `.tmp` → `rename` 原子操作 |

---

## 7. 待确认事项

> 以下事项已在 2026-06-21 审查中确认。

1. **`generate_speech.js` 用途**：播放本地已有音频文件（复制到 media 目录后播放），与 `tts.js`（CosyVoice 合成）不重叠。bus 协议中：`play` 类型调用 `play.js` 或 `generate_speech.js`，`say` 类型调用 `tts-bus.js`。
2. **TTS HTTP 接口**：纯预留，暂不接入具体服务（Azure/火山引擎等）。`tts-bus.js` 中 L2 留 `process.env.TTS_HTTP_URL` 接口，后续按需扩展。
3. **播放器形态**：默认 widget 嵌入式 iframe（`/widget`），支持弹出独立全屏页面（`?mode=full` 参数或新路由 `/player`）。前端检测 `window.top !== window.self` 时显示"打开独立窗口"按钮。

---

*本文档为实施方案，确认后按 Phase 执行。*
