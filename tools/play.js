/**
 * hanako-audio-player/tools/play.js
 *
 * 播放工具 — 将音频添加到播放器播放列表，并返回播放卡片
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

function getPlayerHTML(displayName, audioSrc, isOnline) {
  const themeBg = isOnline ? '#1e1e22' : '#FFFBF5';
  const themeText = isOnline ? '#e4e4e7' : '#2c2c2c';
  const themeBorder = isOnline ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  
  return `<div style="width:100%;max-width:480px;background:${themeBg};border-radius:10px;overflow:hidden;font-family:system-ui,sans-serif;border:1px solid ${themeBorder}">
  <div style="height:2px;background:linear-gradient(90deg,#d49a6a,#c48454)"></div>
  <div style="padding:8px 14px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="width:26px;height:26px;border-radius:5px;background:linear-gradient(135deg,#d49a6a,#c48454);display:flex;align-items:center;justify-content:center;font-size:13px;color:white">♫</div>
      <div style="color:${themeText};font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(displayName)}</div>
    </div>
    <audio src="${escapeHtml(audioSrc)}" controls preload="auto" style="width:100%;height:36px;border-radius:6px;outline:none;background:${themeBg}"></audio>
  </div>
</div>`;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function execute({ source, title }, { sessionPath, pluginId, dataDir, stageFile }) {
  // 空参数保护
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

  // 加入播放队列
  let queue = [];
  try {
    if (fs.existsSync(queuePath)) {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
    }
  } catch (e) { console.warn('[play] queue read failed:', e.message); }

  if (!queue.some(t => t.url === mediaUrl)) {
    queue.push({ name: trackName, url: mediaUrl, mode: isLocal ? '本地' : '在线' });
    const tmpPath = queuePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(queue, null, 2), 'utf-8');
    fs.renameSync(tmpPath, queuePath);
  }

  // 在线音频使用 stream 代理 URL
  let playUrl = mediaUrl;
  if (!isLocal) {
    playUrl = `/widget/api/music/stream?url=${encodeURIComponent(source)}`;
  }
  
  // 生成播放卡片 HTML
  const cardHtml = getPlayerHTML(trackName, playUrl, isLocal);
  
  // 尝试 stageFile（仅本地文件）
  if (isLocal && stageFile && sessionPath && destPath) {
    try {
      await stageFile({ sessionPath: sessionPath, filePath: destPath, label: trackName });
    } catch (_) {}
  }

  // 返回文本 + 卡片
  return {
    content: [{
      type: 'text',
      text: `🎵 ${trackName}`,
    }],
    details: {
      card: { 
        type: 'iframe', 
        route: `/play?url=${encodeURIComponent(playUrl)}&title=${encodeURIComponent(trackName)}`,
        aspectRatio: '10:3',
        pluginId: pluginId,
      },
      media: { items: [] },
    },
  };
}

export { name, description, parameters, execute };
