# hanako-audio-player 使用指南

音频播放器插件。提供侧边栏常驻播放器 + 三个 AI 可调工具。

## 可用工具

### `play` — 添加音频到播放列表

```json
{ "source": "path/to/file.mp3", "title": "曲目名（可选）" }
```

- `source`：本地文件路径或在线音频 URL
- `title`：可选，自动从文件名推导
- 本地文件会被复制到插件媒体目录，通过流式端点播放
- 在线 URL 直接注入播放器（需可访问的直链）

### `tts` — CosyVoice 语音合成

```json
{
  "text": "要合成的文本",
  "spk": "my_voice",
  "refAudio": "参考音频路径（零样本克隆用，可选）",
  "refText": "参考文本（零样本克隆用，可选）",
  "instruct": "情感指令：开心/温柔/低沉/激动"
}
```

- `text` 为必填，其余可选
- **`refText` 可留空**：只给 `refAudio` 不给 `refText` 时，executor 自动调用 Whisper base 转录，用户无需手动描述音频内容
- 合成成功后音频自动加入播放列表，侧边栏即可收听
- CosyVoice 项目根目录自动发现（无需设置环境变量），也可通过 `COSYVOICE_BASE` 环境变量显式指定
- 首次使用会自动搜索并缓存路径到插件数据目录
- 超时 120 秒（含模型加载 + 推理时间）

**合成模式说明**（由 `--mode` 参数控制，通常用默认 `auto`）：

| mode | 行为 |
|------|------|
| `auto` | 有 refAudio → 零样本克隆；有 instruct → Instruct；否则 SFT |
| `zero_shot` | 强制零样本克隆（refText 可留空，自动转录）|
| `instruct` | 强制情感控制合成 |
| `sft` | 强制使用已克隆的说话人 |

### `generate_speech` — 对话内嵌播放卡片

```json
{ "filePath": "path/to/audio.wav" }
```

- 将本地音频文件复制到媒体目录，返回 iframe 播放卡片嵌入对话
- 适用于简短音频的即时播放，不加入播放列表
- 流式播放（非 base64 内嵌），大文件也不会 OOM

## 用户侧流程

### 零样本语音克隆（推荐工作流）

1. 用户提供一段参考音频（人声清晰，3-10 秒）
2. AI 调用 `tts` 工具，填充 `text`（要合成的内容）和 `refAudio`（参考音频路径）
3. `refText` **留空**，executor 自动 Whisper 转录
4. 合成结果加入播放列表

### SFT 说话人克隆（一次性初始化 + 反复使用）

用户先手动运行 Python 脚本将音色克隆进模型：

```python
from cosyvoice.cli.cosyvoice import CosyVoice
cosy = CosyVoice(model_dir='models/CosyVoice2-0.5B')
cosy.add_zero_shot_spk('参考文本', '参考音频.wav', '说话人ID')
cosy.frontend.spk2info['说话人ID']['embedding'] = cosy.frontend.spk2info['说话人ID']['llm_embedding']
cosy.save_spkinfo()
```

之后调用 `tts` 时指定 `spk` 即可，无需再给参考音频和文本。

### 在线电台

播放器界面内置电台预设（起风了 / 夜に駆ける / Lemon）。用户也可通过 URL 输入框添加自定义电台并保存（自动持久化到 localStorage）。

支持 URL 格式：
- MP3 直链
- 网易云音乐外链：`https://music.163.com/song/media/outer/url?id={ID}.mp3`
- 任意可流式播放的音频链接

## 注意事项

- CosyVoice 项目根目录自动发现，也可通过 `COSYVOICE_BASE` 环境变量显式指定
- 首次合成会加载模型（数秒至数十秒），之后复用缓存
- Whisper base 模型首次转录时自动下载（~75MB），之后缓存
- 媒体文件目前无自动清理，长期使用可能累积
