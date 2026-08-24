/**
 * hanako-audio-player/tools/list_music.js
 *
 * 音乐库查询工具 — 列出可播放的在线曲目（名称 + URL）。
 *
 * 用途：LLM 在调 play 之前先查库，拿到真实可播的 url 再传给 play 的 source，
 * 避免把歌名/"随机"等口语描述直接塞给 play 造成"空播/错播"（Bug B）。
 * 只返回 http(s) 在线曲目；widget media 相对路径是 TTS 产物，不列为可播项。
 */

import fs from 'node:fs';
import path from 'node:path';

const name = 'list_music';
const description = '列出音频播放器音乐库中的可播放曲目（名称+在线URL）。播放前先调用本工具查找真实可播的曲目，再把返回的 url 传给 play 工具作为 source。支持按关键词/分组过滤。';

const parameters = {
  type: 'object',
  properties: {
    keyword: {
      type: 'string',
      description: '可选，按曲目名称关键词过滤，如 钢琴、纯音乐、summer。不传返回全部（截取前 limit 条）',
    },
    group: {
      type: 'string',
      description: '可选，按分组过滤，如 在线音乐 / 英文 / 纯音乐 / 我的喜欢 / 本地音乐 / 电台流',
    },
    limit: {
      type: 'number',
      description: '返回条数上限，默认 20，最大 50',
      default: 20,
    },
  },
};

async function execute({ keyword, group, limit }, { dataDir }) {
  const playlistPath = path.join(dataDir, 'playlist.json');
  let tracks = [];
  try {
    if (fs.existsSync(playlistPath)) {
      tracks = JSON.parse(fs.readFileSync(playlistPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('[list_music] playlist read failed:', e.message);
  }
  if (!Array.isArray(tracks)) {
    tracks = [];
  }
  const max = Math.max(1, Math.min(50, Number(limit) || 20));
  const kw = String(keyword || '').trim().toLowerCase();
  const grp = String(group || '').trim();

  // 只列真实可播的在线曲目（http/https）
  let filtered = tracks.filter(
    (t) => t && typeof t === 'object' && typeof t.url === 'string' && t.url.startsWith('http')
  );
  if (grp) {
    filtered = filtered.filter((t) => String(t.group || '') === grp);
  }
  if (kw) {
    filtered = filtered.filter((t) => String(t.name || '').toLowerCase().includes(kw));
  }

  const sample = filtered.slice(0, max).map((t) => ({
    name: String(t.name || ''),
    url: String(t.url || ''),
    group: String(t.group || ''),
  }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(
        { total: filtered.length, returned: sample.length, tracks: sample },
        null, 2,
      ),
    }],
  };
}

export { name, description, parameters, execute };
