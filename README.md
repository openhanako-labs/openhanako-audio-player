# 音频播放器 (hanako-audio-player)

Hana 的音频播放应用 —— 本地音乐与在线音乐播放、歌词横幅、播放凭证。

从 v1 插件迁移到 **v2 App 架构**（`manifestVersion: 2`）。

## 功能

| 功能 | 说明 |
|---|---|
| **在线音乐** | 经 Meting 节点搜索/播放，302 直链，不经后端代理 |
| **本地音乐** | 导入本机文件（`ctx.resources` 读取，复制进 `media/`） |
| **播放列表** | 持久化到 `app-data/`，支持分组 / 收藏 / 搜索 |
| **歌词横幅** | 播放时把当前歌词行推到会话输入框上方（`ctx.inputBanner`） |
| **播放凭证** | 配置 cookie 后可取高音质音频（网易云 / QQ 音乐） |
| **三套主题** | default / spectrum / waveform（内联在 `ui/index.html`） |
| **横竖版** | 卡片右上角 ⇆ 切换 |

## 安装

1. 把本目录（或解压后的 zip）放进 `<HANA_HOME>/apps/`。
   **目录名必须一字不差等于 `manifest.id`（`hanako-audio-player`）。**
2. 打开 Market → Installed → App，批准该应用。
3. 之后改代码在详情页 Reload 即可（改 `tools/` 或 `index.js` 需重启宿主）。

最低 Hana 版本：`0.946.2`。

## 播放凭证（高音质）

在 `app-data/hanako-audio-player/cookies.env` 里填登录 cookie：

```
NETEASE_COOKIE=MUSIC_U=xxx; __csrf=xxx; ...
TENCENT_COOKIE=uin=xxx; qqmusic_key=xxx; ...
```

- **不填也能用** —— 走试听版，`full-url` 端点自动回退。
- 文件格式：每行 `KEY=VALUE`，`#` 开头是注释。
- 登录态失效时，播放器会 toast 提示。

## 目录结构

```
manifest.json          应用清单（v2）
index.js               入口：apply(ctx)
lib/
  state.js             播放队列 + 会话粘性
  meting.js            Meting 节点搜索 / 歌词
  cookies.js           播放凭证读取
  register-tools.js    工具注册
  register-routes.js   后端路由
tools/
  play.js              audio_play：入队 + 投递播放卡
  list-music.js        audio_list_music：读播放列表
ui/
  index.html           主卡（自包含：CSS/JS/主题全内联）
  standalone.html      拆窗版（同内容，body class 不同）
  sdk.js               卡片侧 SDK
  face.png             卡片封面
  _build.json          构建标记（看门狗自刷新用）
assets/icon.svg        应用图标
```

## 工具接口

| 工具 | 说明 |
|---|---|
| `audio_play` | 播放音频。`source` 传本地路径或在线 URL |
| `audio_list_music` | 列播放列表，支持 `keyword` / `group` / `limit` |

## 实现要点

- **在线播放不代理**：Meting 节点 302 到 CDN 直链，前端 `<audio>` 直接播，
  绕开 v2 的响应体上限（`ctx.network.fetch` 默认 5 MiB）。
- **卡片鉴权**：v2 的 app 路由全部要求凭据。iframe URL 带 `appSurfaceSession`，
  但 `<audio src>` / `<img src>` / ESM import 是浏览器自发请求、不带票 —— 
  `ui/index.html` 里注入了补票 shim 处理这三种情况。
- **会话粘性**：卡片拿不到 `sessionPath`（宿主只给 `appId/slot/cardInstanceId`），
  所以经 `ctx.bus.subscribe` 的回调第二参数自动捕获，并持久化。
- **自刷新**：`ui/_build.json` + 页面轮询，构建标记变化时自动 reload，
  改 UI 不必重启宿主。

## 许可证

见 `LICENSE`。商用授权见 `COMMERCIAL-LICENSE.md`。
