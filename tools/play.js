/**
 * hanako-audio-player/tools/play.js
 *
 * 播放工具 — 将音频加入播放器队列
 */

import fs from 'node:fs';
import path from 'node:path';

const name = 'play';
const description = '将音频添加到播放器播放列表';

const parameters = {
  type: 'object',
  properties: {
    source: {
      type: 'string',
      description: '音频文件路径或在线 URL',
    },
    title: {
      type: 'string',
      description: '曲目名称（可选）',
    },
  },
  required: ['source'],
};

async function execute({ source, title }, { sessionPath, pluginId, dataDir }) {
  const fileName = source.split('/').pop().split('\\').pop().split('?')[0] || '音频';
  const trackName = title || fileName;
  const isLocal = !source.startsWith('http://') && !source.startsWith('https://');

  const mediaDir = path.join(dataDir, 'media');
  const queuePath = path.join(dataDir, 'queue.json');

  let mediaUrl = source;

  if (isLocal && fs.existsSync(source)) {
    fs.mkdirSync(mediaDir, { recursive: true });
    const dst = path.join(mediaDir, fileName);
    if (!fs.existsSync(dst)) {
      try { fs.copyFileSync(source, dst); } catch (e) { console.warn('[play] copyFile failed:', e.message); }
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

  return {
    content: [{
      type: 'text',
      text: `🎵 已添加「${trackName}」到播放器\n侧边栏点「音频播放器」即可收听`,
    }],
  };
}

export { name, description, parameters, execute };
