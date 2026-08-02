/**
 * hanako-audio-player/tools/generate_speech.js
 *
 * 系统级工具 — 播放本地音频文件，显示对话内嵌播放卡片
 */
import path from "node:path";
import fs from "node:fs";

const name = "generate_speech";
const description = "播放本地音频文件，自动通过对话内嵌卡片播放。";

const parameters = {
  type: "object",
  properties: {
    filePath: {
      type: "string",
      description: "本地音频文件路径（wav/mp3/ogg 等）",
    },
  },
  required: ["filePath"],
};

async function execute(input, toolCtx) {
  try {
    const filePathInput = input.filePath || "";
    if (!filePathInput) throw new Error("请提供 filePath");
    if (filePathInput.includes('..')) throw new Error("路径不合法");

    if (!fs.existsSync(filePathInput)) throw new Error(`文件不存在: ${filePathInput}`);

    const ext = path.extname(filePathInput).slice(1) || "wav";
    const filename = `play_${Date.now()}.${ext}`;
    const mediaDir = path.join(toolCtx.dataDir, 'media');
    await fs.promises.mkdir(mediaDir, { recursive: true });
    const destPath = path.join(mediaDir, filename);
    await fs.promises.copyFile(filePathInput, destPath);

    // 提取原文件名（不含扩展名）作为显示名
    const origBasename = path.basename(filePathInput, path.extname(filePathInput));

    // 写入 _names.json 映射
    const namesPath = path.join(mediaDir, '_names.json');
    try {
      const namesMap = fs.existsSync(namesPath) ? JSON.parse(fs.readFileSync(namesPath, 'utf-8')) : {};
      namesMap[filename] = origBasename;
      const tmpNames = namesPath + '.tmp.' + process.pid;
      fs.writeFileSync(tmpNames, JSON.stringify(namesMap, null, 2), 'utf-8');
      fs.renameSync(tmpNames, namesPath);
    } catch (e) { console.warn('[generate_speech] _names.json write failed:', e.message); }

    if (toolCtx.stageFile && toolCtx.sessionPath) {
      try {
        await toolCtx.stageFile({ sessionPath: toolCtx.sessionPath, filePath: destPath, label: "audio" });
      } catch (_) {}
    }

    const cardRoute = `/play?file=${encodeURIComponent(filename)}`;

    return {
      content: [{ type: "text", text: `🔊 ${path.basename(filePathInput)}` }],
      details: {
        card: { type: "iframe", route: cardRoute, aspectRatio: "10:3" },
        media: { items: [] },
      },
    };
  } catch (err) {
    return { content: [{ type: "text", text: `播放失败: ${err.message}` }] };
  }
}

export { name, description, parameters, execute };