# 🎵 openhanako-audio-player

Hanako 音频播放器插件。侧边栏常驻播放器，支持 TTS 结果播放、本地音乐、在线音乐。

参考了 Hanako 内置的「语音合成」插件（edge-tts）的对话播放器实现。

## 功能

- ✅ **侧边栏常驻播放器** — 像 TODO 插件一样固定在面板
- ✅ **播放列表** — 曲目管理、删除、切换
- ✅ **在线电台** — 预设电台 + 自定义 URL 存为电台
- ✅ **本地音频** — 路径添加本地音乐
- ✅ **弹出独立窗口** ↗ — 不占面板位置
- ✅ **播放队列持久化** — 重启后保留
- ✅ **对话内嵌播放器** — TTS 合成结果直接在对话中播放
- ✅ **CosyVoice TTS 集成**（可选）— 零样本语音克隆 + 情感控制

## 依赖

对话播放卡片依赖「语音合成」插件（由群友「梅小板」开发，`tts_generate_speech` 工具），请确保该插件已安装并启用。

## 安装

### 1. 复制插件到 Hanako

```bash
cp -r openhanako-audio-player ~/.hanako/plugins/hanako-audio-player
```

### 2. 重启 Hanako

重启后在侧边栏可见「音频播放器」图标。

## 使用方法

### 播放器界面

| 操作 | 方式 |
|------|------|
| 播放/暂停 | 点击 ▶ ⏸ 或按空格键 |
| 切换曲目 | ⏮ ⏭ 按钮 |
| 播放列表 | 点击标题栏展开/收起 |
| 添加 URL | 粘贴到输入框 → 点击「添加」|
| 存为电台 | 填写名称 → 点击「存为电台」|
| 删除电台 | 悬停电台 → 点击 ✕ |
| 弹出窗口 | 点击 ↗ 按钮 |

### 工具命令

```bash
# 添加音频到播放器
play source="path/to/audio.mp3" title="曲目名"

# CosyVoice TTS 合成（需额外配置）
tts text="你好世界" spk="my_voice"
tts text="你好" spk="丹瑾" instruct="开心"
```

### 在线电台 URL 格式

```
# 网易云音乐
https://music.163.com/song/media/outer/url?id={歌曲ID}.mp3

# 任意直链 MP3
https://example.com/song.mp3
```


### 环境要求

- Python 3.10+
- CosyVoice 项目（建议 CosyVoice2-0.5B）
- CUDA 可用 GPU（推荐）

### 安装依赖

```bash
cd /path/to/CosyVoice
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install soundfile openai-whisper
```

### 设置环境变量（可选）

```bash
# 通常不需要设置，executor 会自动搜索 CosyVoice 项目
# 如需指定：
set COSYVOICE_BASE=D:/path/to/CosyVoice
set COSYVOICE_MODEL_DIR=D:/path/to/models/CosyVoice2-0.5B
```

`executor.py` 会自动搜索 CosyVoice 项目（按 `COSYVOICE_BASE` 环境变量 → 缓存文件 → 当前目录向上搜索 → 用户目录 → 驱动器根目录），首次找到后缓存路径。

模型目录自动检测，优先级：`CosyVoice2-0.5B` → `CosyVoice3-0.5B` → `CosyVoice-300M`。

### 合成模式

| mode | 行为 |
|------|------|
| `auto`（默认） | 有 refAudio → 零样本克隆；有 instruct → Instruct；否则 SFT |
| `zero_shot` | 强制零样本克隆（需 `refAudio`，`refText` 可选）|
| `instruct` | 强制情感控制（需 `instruct` 参数）|
| `sft` | 强制使用已克隆的说话人 |

> **自动转录**：`zero_shot` 或 `auto` 模式下，只需提供 `refAudio`（参考音频），
> `refText` 留空时 executor 会自动调用 Whisper base 进行中文语音转录，
> 结果写回任务文件供后续复用。

### 克隆音色（SFT 模式用）

参考 CosyVoice 官方文档，以下代码将音色添加到模型：

```python
from cosyvoice.cli.cosyvoice import CosyVoice
cosy = CosyVoice(model_dir='models/CosyVoice2-0.5B')
cosy.add_zero_shot_spk('参考文本', '参考音频.wav', '说话人ID')
cosy.frontend.spk2info['说话人ID']['embedding'] = cosy.frontend.spk2info['说话人ID']['llm_embedding']
cosy.save_spkinfo()
```

### 启动执行器

```bash
python executor.py --input <taskId> --mode auto
```

执行器由 `tts` 工具自动调用，通常不需要手动执行。

## 文件结构

```
hanako-audio-player/
├── manifest.json        # 插件清单
├── index.js             # 入口
├── SKILL.md             # AI 使用指南
├── routes/
│   └── player.js        # widget 页面 + 播放路由 + 队列 API
├── tools/
│   ├── generate_speech.js # 对话内嵌播放卡片
│   ├── play.js          # 添加音频到播放器
│   └── tts.js           # CosyVoice TTS 合成
└── README.md
```

## 许可

MIT
