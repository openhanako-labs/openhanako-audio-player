# 🎵 hanako-audio-player

Hanako 音频播放器插件。侧边栏常驻播放器，支持本地音乐、在线流、音乐搜索、场景调度、Bus 编排。

## 功能

### 🎧 播放器核心
- ✅ **深色玻璃主题 + 亮色切换** — 暖琥珀色点缀，一键切亮色（#FFF8E7）
- ✅ **播放列表** — 曲目管理、删除、拖拽排序
- ✅ **收藏筛选** — ★/☆ 收藏，收藏置顶筛选
- ✅ **播放列表持久化** — localStorage 存储，刷新不丢失
- ✅ **URL/本地路径添加** — 粘贴链接或路径 → 添加
- ✅ **ID3v2 元数据读取** — Range 请求解析 TIT2，文件名美化回退
- ✅ **本地文件删除同步** — HEAD 检测本地文件是否仍存在
- ✅ **弹出独立窗口** ↗ — 不占面板位置
- ✅ **MutationObserver** — 自动修复父 iframe `writing-mode: vertical-lr` 注入

### 🔍 音乐搜索（Meting）
- ✅ **搜索歌曲/歌手** — 网易云 / QQ 双源
- ✅ **封面缩略图** — 搜索结果带专辑封面
- ✅ **一键操作** — ▶ 播放 / + 加入 Bus 队列 / ☾ 加入场景
- ✅ **导入歌单** — 粘贴歌单 ID 或链接 → 批量导入
- ✅ **歌单批量操作** — 全部播放 / 加入队列 / 加入场景

> 搜索功能通过 HTTP 代理访问公共 Meting 实例（api.i-meto.com），零本地依赖。
> 可通过环境变量 `METING_API_URL` 切换到自建实例。

### 🌙 场景调度
- ✅ **3 场景预设** — 💻 工作 / ☕ 休息 / 🌙 深夜
- ✅ **时段自动推荐** — 根据当前时间推荐最合适的场景
- ✅ **搜索结果加场景** — ☾ 按钮将歌曲追加到指定场景
- ✅ **场景持久化** — 自定义场景曲目存 localStorage

### 🚌 Bus 编排
- ✅ **播放/跳过/清空** — Bus 队列控制
- ✅ **队列 × 删除** — 点 × 移除单条，持久化到文件
- ✅ **Add URL** — 添加任意音频 URL 到编排队列
- ✅ **Segue 自动前进** — 过渡条目自动定时 next
- ✅ **Toast 通知** — 操作反馈 + TTS 失败提示

### 🛡 稳定性
- ✅ **Bus 文件直写** — 绕过 require 缓存问题，路由层完全接管文件读写
- ✅ **旧单例 no-op** — bus.js 的 _saveQueue/_saveState 改空操作，防旧定时器覆写
- ✅ **内存同步** — 写文件后同步旧单例内存（防御性）
- ✅ **Fetch 拦截器** — Authorization 只加本地 URL，外部流不加（修复 CORS）
- ✅ **AbortError 静默** — audio.play() 的 AbortError 不再刷控制台

## 技术栈

- **后端**: Node.js + Hono (Bun 兼容)
- **前端**: 原生 HTML/CSS/JS，CSS Custom Properties 主题系统
- **音乐搜索**: Meting-API HTTP 代理 (api.i-meto.com)
- **TTS**: CosyVoice 本地模型 / 浏览器原生 (降级链)

## 安装

### 开发模式

```bash
# 克隆到工作目录
git clone <repo> W:/Games/Hanako/Work/hanako-audio-player

# 在 Hana 中安装 dev 插件（通过 plugin_dev_install 或 UI）
# 修改后热加载：plugin_dev_reload
```

### 正式安装

```bash
cp -r hanako-audio-player ~/.hanako/plugins/hanako-audio-player
# 重启 Hana
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `METING_API_URL` | Meting 实例地址 | `https://api.i-meto.com/meting/api` |
| `METING_TOKEN` | Meting HMAC 鉴权密钥 | `token` |
| `NETEASE_COOKIE` | 网易云 cookie（获取完整音频，绕过试听限制） | 空（使用匿名试听） |
| `TENCENT_COOKIE` | QQ音乐 cookie（格式：uin=xxx; qqmusic_key=xxx） | 空 |
| `COSYVOICE_BASE` | CosyVoice 项目路径 | 自动搜索 |

## 文件结构

```
hanako-audio-player/
├── manifest.json        # 插件清单
├── index.js             # 入口 + 生命周期
├── README.md             # 本文件
├── routes/
│   └── player.js        # widget HTML + API 路由 + Bus 文件直写
├── tools/
│   ├── bus.js            # AudioBus 编排引擎 (singleton, _save* 已 no-op)
│   ├── generate_speech.js # 对话内嵌播放卡片
│   ├── play.js           # 添加音频到播放器
│   └── tts.js            # TTS Bus (L1 CosyVoice → L2 HTTP → L3 浏览器原生)
```

## API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/widget` | GET | 播放器 widget HTML |
| `/widget/api/queue` | GET | 返回 media 目录文件列表 |
| `/widget/api/speakers` | GET | 返回可用 TTS 说话人 |
| `/widget/api/bus/state` | GET | Bus 状态 (纯文件读取) |
| `/widget/api/bus/control` | POST | Bus 控制 (load/say/play/next/remove/clear) |
| `/widget/api/music/search` | GET | 音乐搜索 (keyword, server) |
| `/widget/api/music/playlist` | GET | 歌单导入 (id, server) |
| `/widget/api/music/url` | GET | 音频 URL 302 跳转 |
| `/widget/api/music/full-url` | GET | 完整音频 URL（带 cookie，回退到 Meting） |
| `/widget/api/music/pic` | GET | 封面图 302 跳转 |
| `/widget/api/music/lrc` | GET | 歌词文本 |
| `/widget/media/:filename` | GET | 本地音频文件服务 |

## 获取完整音频（绕过 30 秒试听）

默认使用公共 Meting 实例，未登录状态下平台只返回 30 秒试听片段。配置网易云 cookie 后可获取完整音频。

### 配置步骤

#### 网易云

1. 浏览器登录 [网易云网页版](https://music.163.com)
2. 打开开发者工具（F12）→ Network → 随便点一个请求 → 复制 Cookie 头
3. 提取 `MUSIC_U` 的值
4. 设置环境变量：

```bash
set NETEASE_COOKIE=MUSIC_U=你的值
```

#### QQ音乐

1. 浏览器登录 [QQ音乐网页版](https://y.qq.com)
2. 打开开发者工具（F12）→ Network → 随便点一个请求 → 复制 Cookie 头
3. 提取 `uin` 和 `qqmusic_key` 两个字段
4. 设置环境变量：

```bash
set TENCENT_COOKIE=uin=你的uin; qqmusic_key=你的key
```

5. 重启 Hanako

> Cookie 有效期通常数周到数月，过期后重新获取即可。
> 未配置 cookie 时自动回退到 Meting 试听 URL，不影响基本功能。

## 许可

MIT
