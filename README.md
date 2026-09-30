# hanako-audio-player v2 沙盒

`hanako-audio-player` 从 v1 插件迁移到 v2 App 的验证沙盒。Phase 1 最小骨架。

完整计划见 `W:\Games\Hanako\Work\projects\docs\hanako-audio-player-v2-execution-plan.md`。

## 已实现（Phase 1）

| 项 | 说明 |
|---|---|
| `manifest.json` | `manifestVersion: 2`，`contributes.cards` + `contributes.messageRenderers` |
| `index.js` | `export async function apply(ctx)`，注册工具与路由 |
| `tools/play.js` | 入队 + `session:send-custom` 投递播放卡 |
| `tools/list-music.js` | 列出队列 |
| `ui/player.html` | 播放卡（audio + 队列 + 横竖切换 + 歌词横幅入口） |
| `lib/register-routes.js` | `api/state` / `api/select` / `api/lyric-line` / `api/lyric-hide` |

## 安装

1. 把本目录复制到 `<HANA_HOME>/apps/hanako-audio-player-v2-sandbox`。
   **目录名必须一字不差等于 `manifest.id`。**
2. 打开 Market → Installed → App，批准该应用。
3. 之后改代码只需在详情页 Reload，不必重新批准。

最低 Hana 版本：`0.946.2`。

> v1 的 `hanako-audio-player` 与本沙盒是**两个不同的 id**，可以共存，不会互相抢。
> 迁到正式 id 时才需要先停掉 v1 版本。

## 与 v1 的关键差异

- v2 没有 `contributes.tools[]` → 工具由 `ctx.tools.register()` 编程式注册
- v2 没有 `ctx.bus.handle` → 卡片↔后端走 `ctx.routes`，卡片 2 秒轮询
- 工具 `execute` 是**单参数**：`execute({ ...args, context: { ... } })`
- 静态资源在 `ui/`（不是 `assets/`），URL 为 `/api/apps/<id>/ui<route>`
- 卡片不再由工具返回 `details.card.type`，而是 `contributes.messageRenderers` + `session:send-custom`
- 歌词横幅走 `ctx.inputBanner.set`，`text` 上限 200 字符

## 已知限制（Phase 1 范围）

- 本地文件只入队、不播放 —— 需要 Phase 2 的媒体路由
- 在线音频走直链 —— 防盗链与签名时效要 Phase 2 的宿主端代理
- 播放状态是单例，多会话并行播放会互相覆盖
- 卡片用轮询，不是事件推送
