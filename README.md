# Hana Audio Player

Hana 的音频播放器 App：本地音乐与在线音乐播放，歌词驱动的双模式视觉舞台。

## 功能

**播放**
- 本地文件 / 文件夹扫描导入（mp3 / wav / ogg / flac / m4a，Range 流式播放，拖进度条不卡）
- 在线搜索与直链播放（网易云 / QQ / 酷狗，meting 公共节点，多节点自动降级）
- 粘贴链接直接导入：**歌单**（整张）和**单曲**都支持
- 播放列表分组：固定来源分组 + 自建分组（持久化，可右键移动 / 重命名 / 删除）

**歌词**
- 自动匹配：播放即按曲名搜索歌词，五源回退
- 逐字歌词：TTML（AMLL 歌词数据库）优先，行级 LRC 兜底
- **离线歌词库**：匹配过的歌词自动落盘（app-data/lyrics/），离线也能出词
- 歌词横幅：当前行实时推到会话输入框上方

**视觉舞台**（顶栏三模式胶囊切换）
- **标准**——黑胶唱盘（播放旋转 / 暂停即停）+ 队列
- **PV**——文字 PV 舞台：[JIZURA](https://github.com/852wa/JIZURA) 式随机排版引擎，21 种构图每行抽签（中央 / 竖排 / 斜带 / 円環 / 星散 / 連行…），🎲 骰子或 R 键一键重摇（おまかせ）。逐字扫光用 [folia](https://github.com/chthollyphile/folia-major) 的 MonetGlow 包络公式（smoothstep 升起→驻留→衰减），帧级同步音频（rAF 驱动，不走 4Hz 的 timeupdate）。封面取色背景、全局漂浮粒子、前后行参与排版
- **歌词**——AMLL 式滚动窗：当前行居中放大，焦外虚化，逐字高亮

**主题**
- 配色面板内置多套预设（含金夜 / 暗夜纯黑），PV 风格可独立于主题切换

## 安装

1. 把本仓库目录放进 `<HANA_HOME>/apps/openhanako-audio-player`（目录名须与 `manifest.id` 一致）
2. Hana → Market → Installed → 批准该应用
3. 之后改代码只需在详情页 Reload

最低 Hana 版本：`0.946.2`。

## 可选：完整音源

在 `app-data/hanako-audio-player/cookies.env` 里配置网易云 / 腾讯的登录 cookie，可向 full-url 端点换完整音频（没有则回退试听版）：

```
NETEASE_COOKIE=MUSIC_U=xxx; __csrf=xxx; ...
TENCENT_COOKIE=uin=xxx; qqmusic_key=xxx; ...
```

## 开发

```
tools/inject-*.mjs   功能注入脚本（可重复执行，断言锚点命中恰好 1 次）
tools/fix-*.mjs      修复脚本
tools/bump-build.mjs 构建号三处同步（_build.json + index.html + standalone.html）
```

**两条铁律**：
- `ui/index.html` 与 `ui/standalone.html` 是内容相同的双副本——改动必须同步，改完跑 `bump-build.mjs`
- 主 script 是一整个大 IIFE——需要访问内部变量的代码必须注入到 IIFE 内部（以现有代码为锚点），独立 script 块只能做纯 DOM/CSS 操作

## 致谢

- [JIZURA](https://github.com/852wa/JIZURA)（852話）——文字 PV 排版引擎的灵感与部件语义
- [folia-major](https://github.com/chthollyphile/folia-major)——Monet 动效公式（光晕包络 / 逐字插值 / 色调衰减）
- [AMLL TTML DB](https://github.com/Steve-xmh/amll-ttml-db)——逐字歌词数据库
- Meting 公共节点——搜索 / 歌词 / 直链

## License

MIT
