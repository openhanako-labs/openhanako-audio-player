/**
 * lyrics-match-chain.js — AUDIO-08 歌词匹配链
 *
 * 分层歌词来源链：
 *   P1: 音频内嵌歌词（ID3 USLT / Vorbis Comment）
 *   P2: 同目录同名 .lrc 文件
 *   P3: 在线匹配（音乐 API 歌词接口）
 *   P4: 用户手动修正（本地文件 / 粘贴文本 / 指定 URL）
 *   P5: 降级 — 无歌词
 *
 * 封面、歌词、元数据三源独立修正，手动匹配结果持久化到 localStorage。
 */

const fs = require("fs");
const path = require("path");

// ──────────────────────────────────────
// 常量
// ──────────────────────────────────────

const LRC_CACHE_KEY = "hanako_audio_lrc_cache";
const MANUAL_MATCHES_KEY = "hanako_audio_manual_matches";
const PROBE_TIMEOUT_MS = 8000;

const ONLINE_SERVERS = ["netease", "tencent", "kugou", "kuwo", "baidu"];

// ──────────────────────────────────────
// ID3v2 内嵌歌词读取
// ──────────────────────────────────────

/**
 * 从 ArrayBuffer 中提取 ID3v2 内嵌歌词（USLT 帧）。
 * @param {ArrayBuffer} buf
 * @returns {{ format: string, content: string } | null}
 */
function tryReadEmbeddedLyrics(buf) {
  if (!buf || buf.byteLength < 10) return null;
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // 检查 ID3v2 签名
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;

  const majorVersion = bytes[3];
  if (majorVersion < 2 || majorVersion > 4) return null;

  // 计算 ID3 头长度
  let headerLen = 10;
  if (majorVersion >= 3) {
    // Extended header size
    const extSize = readSynchSafeInt(bytes, 6);
    headerLen += 6 + extSize;
  } else {
    headerLen += 3;
  }

  // 扫描帧
  let offset = headerLen;
  while (offset + 10 <= bytes.length) {
    const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    let frameSize;
    if (majorVersion === 2) {
      frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
    } else {
      frameSize = readSynchSafeInt(bytes, offset + 4);
    }

    if (frameSize <= 0 || offset + 10 + frameSize > bytes.length) break;

    if (frameId === "USLT" || frameId === "ULT") {
      // USLT: Unsynchronised Lyric/Song-text
      try {
        const encoding = bytes[offset + 10];
        let textOffset = offset + 11;
        // Skip language (3 bytes)
        const lang = String.fromCharCode(bytes[textOffset], bytes[textOffset + 1], bytes[textOffset + 2]);
        textOffset += 3;
        // Skip descriptor null bytes
        while (textOffset < offset + 10 + frameSize && bytes[textOffset] === 0) textOffset++;
        // Skip title null bytes
        while (textOffset < offset + 10 + frameSize && bytes[textOffset] === 0) textOffset++;
        // Extract text
        const textBytes = new Uint8Array(buf, textOffset, offset + 10 + frameSize - textOffset);
        const decoder = new TextDecoder(encoding === 0 ? "utf-8" : "latin1");
        let raw = decoder.decode(textBytes).split("\0")[0].trim();
        if (raw) {
          return { format: "lrc", content: raw };
        }
      } catch (e) { /* skip */ }
    }

    offset += 10 + frameSize;
  }
  return null;
}

/**
 * 读取 ID3v2 SyncSafe integer (4 bytes → 28-bit int)
 */
function readSynchSafeInt(bytes, offset) {
  return (bytes[offset] << 21) | (bytes[offset + 1] << 14) | (bytes[offset + 2] << 7) | bytes[offset + 3];
}

/**
 * 从 ArrayBuffer 中提取 Vorbis Comment 的 LYRICS tag。
 * @param {ArrayBuffer} buf
 * @param {string} audioPath
 * @returns {{ format: string, content: string } | null}
 */
function tryReadVorbisLyrics(buf, audioPath) {
  if (!audioPath.toLowerCase().endsWith(".ogg") && !audioPath.toLowerCase().endsWith(".flac")) return null;
  const bytes = new Uint8Array(buf);
  const decoder = new TextDecoder("utf-8");

  // FLAC: 查找 vorbis_comment block
  if (audioPath.toLowerCase().endsWith(".flac")) {
    // FLAC metadata blocks
    let pos = 36; // skip 4-byte magic + 32-bit stream info
    while (pos < bytes.length) {
      const isLast = (bytes[pos] & 0x80) !== 0;
      const type = bytes[pos] & 0x7f;
      const blockSize = (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
      pos += 4;

      if (type === 4) { // VORBIS_COMMENT
        try {
          const commentStr = decoder.decode(bytes.slice(pos, pos + blockSize));
          const lines = commentStr.split("\r\n").join("\n").split("\n");
          for (const line of lines) {
            const idx = line.indexOf("=");
            if (idx === -1) continue;
            const key = line.slice(0, idx).toUpperCase();
            if (key === "LYRICS") {
              const value = line.slice(idx + 1).trim();
              if (value) return { format: "lrc", content: value };
            }
          }
        } catch (e) { /* skip */ }
      }

      pos += blockSize;
      if (isLast) break;
    }
  }

  // OGG Vorbis: 查找 vorbis_comment packet
  if (audioPath.toLowerCase().endsWith(".ogg")) {
    const marker = Buffer.from("vorbis");
    let idx = 0;
    while ((idx = bytes.indexOf(marker, idx)) !== -1) {
      // 向前找 OGG page header
      let pageStart = idx;
      while (pageStart > 0 && bytes[pageStart - 1] !== 0x03) pageStart--;
      if (pageStart < 4) break;
      // 跳过 OGM flags + granule position + serial + pageSeq + checksum + segmentTable
      const segCount = bytes[idx - 1];
      let commentStart = idx + 7; // "vorbis" + 1 byte
      const vendorLen = (bytes[commentStart] << 24) | (bytes[commentStart + 1] << 16) | (bytes[commentStart + 2] << 8) | bytes[commentStart + 3];
      commentStart += 4 + vendorLen + 1; // vendor string + user field count
      const userComments = (bytes[commentStart] << 24) | (bytes[commentStart + 1] << 16) | (bytes[commentStart + 2] << 8) | bytes[commentStart + 3];
      commentStart += 4;
      for (let u = 0; u < userComments; u++) {
        const ucLen = (bytes[commentStart] << 24) | (bytes[commentStart + 1] << 16) | (bytes[commentStart + 2] << 8) | bytes[commentStart + 3];
        commentStart += 4;
        if (commentStart + ucLen > idx + segCount + 1) break;
        const line = decoder.decode(bytes.slice(commentStart, commentStart + ucLen));
        commentStart += ucLen;
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).toUpperCase();
        if (key === "LYRICS") {
          const value = line.slice(eqIdx + 1).trim();
          if (value) return { format: "lrc", content: value };
        }
      }
      break;
    }
  }
  return null;
}

// ──────────────────────────────────────
// P2: 同目录同名 LRC 匹配
// ──────────────────────────────────────

/**
 * 尝试在同目录下查找同名 .lrc 文件。
 * @param {string} mediaDir - 媒体目录路径
 * @param {string} audioUrl - 音频 URL（如 /widget/media/song.mp3）
 * @returns {{ path: string, content: string } | null}
 */
function tryLocalLrc(mediaDir, audioUrl) {
  if (!mediaDir || !audioUrl) return null;

  // 从 URL 提取文件名
  let fileName = audioUrl.split("/").pop();
  if (!fileName) return null;

  const baseName = fileName.replace(/\.\w+$/, "");
  const ext = fileName.slice(fileName.lastIndexOf("."));

  // 尝试多种变体
  const candidates = [
    baseName + ".lrc",
    baseName + ext.replace(".", "") + ".lrc", // song → songlrc (rare)
    baseName + " [lrc].lrc",
    baseName + " (lrc).lrc",
    // 去除特殊字符变体
    baseName.replace(/[（）(){}\[\]【】]/g, "").replace(/\s+/g, " ").trim() + ".lrc",
  ];

  for (const candidate of candidates) {
    const lrcPath = path.join(mediaDir, candidate);
    if (fs.existsSync(lrcPath)) {
      try {
        const content = fs.readFileSync(lrcPath, "utf-8");
        if (content.trim().length > 0) {
          return { path: candidate, content };
        }
      } catch (e) { /* skip */ }
    }
  }
  return null;
}

// ──────────────────────────────────────
// P3: 在线匹配
// ──────────────────────────────────────

/**
 * 歌词搜索缓存读写
 */
function getLrcCache() {
  try {
    const raw = localStorage.getItem(LRC_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function setLrcCache(key, value) {
  try {
    const cache = getLrcCache();
    cache[key] = { ...value, matchedAt: Date.now() };
    localStorage.setItem(LRC_CACHE_KEY, JSON.stringify(cache));
  } catch (e) { /* quota exceeded */ }
}

function getLrcCacheResult(key) {
  const cache = getLrcCache();
  const entry = cache[key];
  if (!entry) return null;
  // 缓存有效期 30 天
  if (Date.now() - (entry.matchedAt || 0) > 30 * 24 * 3600 * 1000) {
    delete cache[key];
    try { localStorage.setItem(LRC_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    return null;
  }
  return entry;
}

/**
 * 通过 music API 搜索歌词。
 * @param {string} keyword - 搜索关键词（歌名或歌名+歌手）
 * @param {string} apiBase - API 基础路径
 * @param {string[]} [servers] - 要尝试的服务器列表
 * @returns {Promise<{ ok: boolean, lrcUrl?: string, server?: string, title?: string }>}
 */
async function searchLyricsOnline(keyword, apiBase, servers) {
  servers = servers || ONLINE_SERVERS;
  for (const server of servers) {
    try {
      const url = `${apiBase}/widget/api/music/search?keyword=${encodeURIComponent(keyword)}&server=${server}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      const data = await resp.json();
      if (data.ok && data.results && data.results.length) {
        // 取第一个有 lrc URL 的结果
        for (const r of data.results) {
          if (r.lrc) {
            return { ok: true, lrcUrl: r.lrc, server, title: r.title || r.name || "" };
          }
        }
      }
    } catch (e) {
      // 该服务器超时/失败，继续下一个
      console.warn(`[LrcChain] ${server} search failed for "${keyword}":`, e.message);
    }
  }
  return { ok: false };
}

// ──────────────────────────────────────
// P4: 用户手动修正持久化
// ──────────────────────────────────────

function getManualMatches() {
  try {
    const raw = localStorage.getItem(MANUAL_MATCHES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveManualMatch(trackKey, matchData) {
  try {
    const matches = getManualMatches();
    matches[trackKey] = { ...matchData, appliedAt: Date.now() };
    localStorage.setItem(MANUAL_MATCHES_KEY, JSON.stringify(matches));
  } catch (e) { /* quota */ }
}

function getManualMatch(trackKey) {
  const matches = getManualMatches();
  return matches[trackKey] || null;
}

// ──────────────────────────────────────
// Probe API — 探测所有可用来源
// ──────────────────────────────────────

/**
 * 探测指定音频可用的歌词来源。
 * @param {object} options
 * @param {string} options.audioUrl - 音频 URL
 * @param {string} options.audioName - 音频名称
 * @param {string} options.mediaDir - 媒体目录路径
 * @param {string} options.apiBase - API 基础路径
 * @param {boolean} options.fetchEmbedded - 是否尝试读取内嵌歌词（需要 ArrayBuffer）
 * @param {ArrayBuffer} [options.audioBuffer] - 音频文件 ArrayBuffer（用于 P1）
 * @returns {Promise<{ embedded: boolean, local: boolean, localPath?: string, online: Array<{server, lrcUrl, confidence, title}> }>}
 */
async function probeLyricsSources(options) {
  const { audioUrl, audioName, mediaDir, apiBase, fetchEmbedded, audioBuffer } = options;
  const result = { embedded: false, local: false, localPath: "", online: [] };

  // P1: 内嵌歌词
  if (fetchEmbedded && audioBuffer) {
    const embedded = tryReadEmbeddedLyrics(audioBuffer) || tryReadVorbisLyrics(audioBuffer, audioUrl);
    if (embedded) result.embedded = true;
  }

  // P2: 同目录 LRC
  const local = tryLocalLrc(mediaDir, audioUrl);
  if (local) {
    result.local = true;
    result.localPath = local.path;
  }

  // P3: 在线匹配（只探测不缓存）
  if (audioName) {
    for (const server of ONLINE_SERVERS.slice(0, 3)) { // 只探测前 3 个源
      try {
        const url = `${apiBase}/widget/api/music/search?keyword=${encodeURIComponent(audioName)}&server=${server}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
        const data = await resp.json();
        if (data.ok && data.results && data.results.length) {
          for (const r of data.results) {
            if (r.lrc) {
              result.online.push({
                server,
                lrcUrl: r.lrc,
                confidence: 0.9,
                title: r.title || r.name || "",
              });
              break;
            }
          }
        }
      } catch (e) { /* skip */ }
    }
  }

  return result;
}

// ──────────────────────────────────────
// 主匹配链 — 按优先级依次尝试
// ──────────────────────────────────────

/**
 * 执行完整的歌词匹配链。
 * @param {object} track - TrackRef 对象
 * @param {object} ctx - 上下文
 * @param {string} ctx.mediaDir - 媒体目录绝对路径
 * @param {string} ctx.apiBase - API 基础路径
 * @param {string} ctx.audioBuffer - (可选) 音频文件 ArrayBuffer
 * @param {Function} ctx.fetchFn - (可选) 自定义 fetch（用于服务端调用）
 * @returns {Promise<{ success: boolean, source: string, lrcContent?: string, lrcUrl?: string, lrcSource: string }>}
 */
async function runMatchChain(track, ctx) {
  const { mediaDir, apiBase, audioBuffer, fetchFn: _customFetch } = ctx;
  const trackKey = track.url || track.name || "";
  const fetch = _customFetch || window?.fetch;

  // 前置检查：已有 lrcContent（手动修正缓存命中）
  if (track.lrcContent && track.lrcContent.trim()) {
    return { success: true, source: track.lrcSource || "manual", lrcContent: track.lrcContent, lrcSource: track.lrcSource || "manual" };
  }

  // 前置检查：已有 lrcUrl（之前在线匹配过）
  if (track.lrcUrl) {
    return { success: true, source: track.lrcUrl, lrcUrl: track.lrcUrl, lrcSource: track.lrcSource || "online" };
  }

  // P1: 内嵌歌词
  if (audioBuffer) {
    try {
      const embedded = tryReadEmbeddedLyrics(audioBuffer) || tryReadVorbisLyrics(audioBuffer, track.url);
      if (embedded) {
        return { success: true, source: "embedded", lrcContent: embedded.content, lrcSource: "embedded" };
      }
    } catch (e) { /* skip */ }
  }

  // P2: 同目录 LRC
  const local = tryLocalLrc(mediaDir, track.url);
  if (local) {
    return { success: true, source: "local", lrcContent: local.content, lrcSource: "local" };
  }

  // P3: 在线匹配
  const cacheKey = track.name || trackKey;
  const cached = getLrcCacheResult(cacheKey);
  if (cached && cached.lrcUrl) {
    return { success: true, source: "online", lrcUrl: cached.lrcUrl, lrcSource: "online" };
  }

  // 搜索
  if (typeof fetch === "function") {
    const result = await searchLyricsOnline(cacheKey, apiBase);
    if (result.ok) {
      setLrcCache(cacheKey, { lrcUrl: result.lrcUrl, server: result.server });
      return { success: true, source: "online", lrcUrl: result.lrcUrl, lrcSource: "online" };
    }
  }

  // P5: 降级
  return { success: false, source: "none", lrcSource: "none" };
}

// ──────────────────────────────────────
// 导出
// ──────────────────────────────────────

module.exports = {
  tryReadEmbeddedLyrics,
  tryReadVorbisLyrics,
  tryLocalLrc,
  searchLyricsOnline,
  getLrcCache,
  setLrcCache,
  getLrcCacheResult,
  getManualMatches,
  saveManualMatch,
  getManualMatch,
  probeLyricsSources,
  runMatchChain,
};
