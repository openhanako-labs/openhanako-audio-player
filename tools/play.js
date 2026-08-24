/**
 * hanako-audio-player/tools/play.js
 *
 * 播放工具 — 将音频加入播放器队列
 */

import fs from 'node:fs';
import path from 'node:path';

const name = 'play';
const description = '播放音乐：将音频添加到播放器播放列表。source 必须是真实存在的本地音频文件绝对路径（如 C:/Music/song.mp3）或可访问的在线音频 URL（http/https）。**不支持**歌名、歌手、随机等口语描述——这些无法播放。若用户想随机播放，请先调用 list_music 工具查看可用曲目，再把其中某首的 url 传给本工具；若用户给出歌名但库里查不到，直接询问用户提供文件路径或 URL。';

const parameters = {
  type: 'object',
  properties: {
    source: {
      type: 'string',
      description: '真实可播的音频资源：本地音频文件绝对路径（如 C:/Music/song.mp3，需文件真实存在）或在线音频 URL（http/https）。严禁传歌名、歌手名、随机、随便放等口语描述——本工具无法按歌名搜索，传了只会得到一条空记录。',
    },
    title: {
      type: 'string',
      description: '曲目名称（可选，用于播放列表显示）',
    },
  },
  required: ['source'],
};

async function execute({ source, title }, { sessionPath, pluginId, dataDir }) {
  // 空参数保护：快速路由不带参数时，返回友好提示而非崩溃
  if (!source) {
    return {
      content: [{ type: 'text', text: '请指定要播放的音频文件路径或在线 URL，比如：播放 C:/音乐/歌.mp3' }],
    };
  }
  const fileName = source.split('/').pop().split('\\').pop().split('?')[0] || '音频';
  const trackName = title || fileName;
  const isLocal = !source.startsWith('http://') && !source.startsWith('https://');

  const mediaDir = path.join(dataDir, 'media');
  const queuePath = path.join(dataDir, 'queue.json');

  let mediaUrl = source;
  let destPath = null;

  if (isLocal && fs.existsSync(source)) {
    fs.mkdirSync(mediaDir, { recursive: true });
    destPath = path.join(mediaDir, fileName);
    if (!fs.existsSync(destPath)) {
      try { fs.copyFileSync(source, destPath); } catch (e) { console.warn('[play] copyFile failed:', e.message); }
    }
    mediaUrl = `/api/plugins/${pluginId}/widget/media/${encodeURIComponent(fileName)}`;
  }

  let queue = [];
  try {
    if (fs.existsSync(queuePath)) {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
    }
  } catch (e) { console.warn('[play] queue read failed:', e.message); }

  if (!queue.some(t => t.url === mediaUrl)) {
    queue.push({ name: trackName, url: mediaUrl, mode: isLocal ? '本地' : '在线' });
    // 原子写入
    const tmpPath = queuePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(queue, null, 2), 'utf-8');
    fs.renameSync(tmpPath, queuePath);
  }

  // 生成对话内嵌播放卡片
  const cardRoute = isLocal
    ? `/play?file=${encodeURIComponent(fileName)}`
    : `/play?url=${encodeURIComponent(source)}&title=${encodeURIComponent(trackName)}`;

  // 尝试 stageFile（仅本地文件）
  if (isLocal && toolCtx.stageFile && toolCtx.sessionPath) {
    try {
      await toolCtx.stageFile({ sessionPath: toolCtx.sessionPath, filePath: destPath, label: trackName });
    } catch (_) {}
  }

  return {
    content: [{
      type: 'text',
      text: `🎵 ${trackName}`,
    }],
    details: {
      card: { type: 'iframe', route: cardRoute, aspectRatio: '10:3', pluginId: pluginId },
      media: { items: [] },
    },
  };
}

export { name, description, parameters, execute };
