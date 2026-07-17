/**
 * hanako-audio-player/tools/track-ref.js
 *
 * AUDIO-13: 统一曲目来源模型
 *
 * TrackRef — 所有来源的曲目进入同一队列结构的统一接口。
 * 来源适配器（本地 / 在线搜索 / TTS）产出 TrackRef，
 * UI 层只依赖 TrackRef，不直接依赖供应商响应。
 *
 * JSON Schema 见文件末尾 export const SCHEMA。
 */

// ═══════════════════════════════════════════════════════════
// 类型常量
// ═══════════════════════════════════════════════════════════

export const SOURCE = Object.freeze({
  LOCAL:    "local",
  SEARCH:   "search",
  TTS:      "tts",
});

export const MODE = Object.freeze({
  OFFLINE:  "offline",   // 本地文件 / 已下载
  ONLINE:   "online",    // 流地址 / 需网络
  SYNTH:    "synth",     // TTS 实时合成
});

export const TRACK_TYPE = Object.freeze({
  PLAY: "play",          // 可播放音频
  SAY:  "say",           // TTS 文本 → 语音
  SEGUE:"segue",         // 过渡
  REASON:"reason",       // 说明/占位
});

// ═══════════════════════════════════════════════════════════
// TrackRef 接口定义
// ═══════════════════════════════════════════════════════════

/**
 * 构建一个 TrackRef 对象。
 * @param {Object} opts
 * @param {string} opts.id        — 唯一标识（UUID v4 或来源自增 ID）
 * @param {SOURCE} opts.source    — 来源: "local" | "search" | "tts"
 * @param {string} opts.title     — 标题
 * @param {string} [opts.artist]  — 作者/艺术家
 * @param {string} [opts.album]   — 专辑名
 * @param {number} [opts.duration]— 时长（秒），0 表示未知
 * @param {string} [opts.cover]   — 封面图片 URL
 * @param {string} [opts.lrcUrl]  — 歌词引用 URL
 * @param {string} [opts.streamUrl]— 流地址（播放用）
 * @param {string|string[]} [opts.groupIds] — 分组 ID 列表，用于随机播放范围
 * @param {Object} [opts.meta]    — 来源特有字段（不暴露给 UI）
 * @returns {TrackRef}
 */
export function createTrackRef(opts) {
  if (!opts || !opts.id || !opts.source || !opts.title) {
    throw new Error(`createTrackRef: id, source, title are required. Got: ${JSON.stringify(opts)}`);
  }

  return Object.freeze({
    id:        opts.id,
    source:    opts.source,
    title:     opts.title,
    artist:    opts.artist || "",
    album:     opts.album || "",
    duration:  Number(opts.duration) || 0,
    cover:     opts.cover || "",
    lrcUrl:    opts.lrcUrl || "",
    streamUrl: opts.streamUrl || "",
    groupIds:  Array.isArray(opts.groupIds) ? opts.groupIds : [opts.groupIds || ""],
    meta:      opts.meta || {},
    createdAt: opts.createdAt || Date.now(),
  });
}

// ═══════════════════════════════════════════════════════════
// 迁移脚本：旧对象 → TrackRef
// ═══════════════════════════════════════════════════════════

/**
 * 将旧的曲目对象转换为 TrackRef。
 * 支持以下输入格式：
 *   1. bus.js _normalize 产物: { type, id, url, name, mode, dur, group, lrcUrl, pic, searchKey, searchServer }
 *   2. 前端 playlist JSON:       { name, url, mode, dur, group, lrcUrl, pic, searchKey, searchServer }
 *   3. 原始搜索 API 结果:         { title, author, album, duration, url, pic, lrc, ... }
 *
 * @param {Object} oldObj — 任意格式的旧曲目对象
 * @returns {TrackRef}
 */
export function migrateToTrackRef(oldObj) {
  if (!oldObj) {
    throw new Error("migrateToTrackRef: input is null/undefined");
  }

  const name = oldObj.name || oldObj.title || "未知曲目";
  const url = oldObj.url || "";
  const mode = oldObj.mode || "";
  const dur = Number(oldObj.dur) || 0;
  const group = oldObj.group || "";
  const pic = oldObj.pic || "";
  const lrcUrl = oldObj.lrcUrl || oldObj.lrc || "";
  const searchKey = oldObj.searchKey || "";
  const searchServer = oldObj.searchServer || "";

  // 判断来源
  let source = SOURCE.LOCAL;
  if (searchKey || searchServer) {
    source = SOURCE.SEARCH;
  } else if (mode === "TTS" || mode === "编排" || oldObj._origin) {
    source = SOURCE.TTS;
  } else if (url && url.startsWith("http")) {
    source = SOURCE.SEARCH; // 在线 URL 来自搜索
  }

  // 判断模式
  let playMode = MODE.OFFLINE;
  if (source === SOURCE.SEARCH) playMode = MODE.ONLINE;
  if (source === SOURCE.TTS) playMode = MODE.SYNTH;

  // 分组处理
  let groupIds = [];
  if (group) groupIds.push(group);
  // TTS 来源默认分组
  if (source === SOURCE.TTS && !groupIds.length) groupIds.push("TTS/语音");
  // 从 meta 中提取额外分组
  if (oldObj.groupIds && Array.isArray(oldObj.groupIds)) {
    groupIds = [...new Set([...groupIds, ...oldObj.groupIds])];
  }

  // 元数据：保留来源特有字段但不暴露给 UI
  const meta = {};
  if (searchServer) meta.searchServer = searchServer;
  if (searchKey) meta.searchKey = searchKey;
  if (oldObj._origin) meta.origin = oldObj._origin;
  if (oldObj.layer) meta.ttsLayer = oldObj.layer;
  if (mode) meta.rawMode = mode;
  if (oldObj.type && oldObj.type !== "play") meta.busType = oldObj.type;

  return createTrackRef({
    id:        oldObj.id || `migrated_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    source,
    title:     name,
    artist:    oldObj.artist || oldObj.author || "",
    album:     oldObj.album || "",
    duration:  dur,
    cover:     pic,
    lrcUrl,
    streamUrl: url,
    groupIds,
    meta,
  });
}

/**
 * 批量迁移播放列表。
 * @param {Array<Object>} tracks — 旧格式曲目数组
 * @returns {TrackRef[]}
 */
export function migratePlaylist(tracks) {
  if (!Array.isArray(tracks)) return [];
  return tracks.map(t => migrateToTrackRef(t));
}

// ═══════════════════════════════════════════════════════════
// 来源适配器
// ═══════════════════════════════════════════════════════════

/**
 * 本地文件适配器 — 从媒体目录扫描产出 TrackRef
 */
export class LocalSourceAdapter {
  constructor(ctx) {
    this.ctx = ctx;
    this.pluginId = ctx.pluginId;
  }

  /**
   * 从本地文件信息创建 TrackRef
   * @param {Object} fileInfo — { name, url, size, mtime }
   * @returns {TrackRef}
   */
  adapt(fileInfo) {
    const baseName = fileInfo.name.replace(/\.\w+$/, "");
    return createTrackRef({
      id:        `local_${this._hash(fileInfo.url)}`,
      source:    SOURCE.LOCAL,
      title:     baseName,
      artist:    fileInfo.artist || "",
      album:     fileInfo.album || "",
      duration:  fileInfo.duration || 0,
      cover:     fileInfo.cover || "",
      lrcUrl:    "",
      streamUrl: fileInfo.url,
      groupIds:  ["本地音乐"],
      meta: {
        size:      fileInfo.size || 0,
        mtime:     fileInfo.mtime || "",
        filePath:  fileInfo.filePath || "",
      },
    });
  }

  /**
   * 从媒体目录批量适配
   * @param {Array<Object>} files
   * @returns {TrackRef[]}
   */
  adaptBatch(files) {
    return files.map(f => this.adapt(f));
  }

  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * 在线搜索适配器 — 从搜索结果产出 TrackRef
 */
export class SearchSourceAdapter {
  constructor(ctx) {
    this.ctx = ctx;
    this.pluginId = ctx.pluginId;
  }

  /**
   * 从搜索结果项创建 TrackRef
   * @param {Object} result — API 返回的单条结果
   * @param {string} [server] — 搜索源: "netease" | "tencent" | "kugou" | ...
   * @returns {TrackRef}
   */
  adapt(result, server) {
    return createTrackRef({
      id:        `search_${server || "unknown"}_${result.id || this._hash(result.url || result.title)}`,
      source:    SOURCE.SEARCH,
      title:     result.title || result.name || "未知曲目",
      artist:    result.author || result.artist || result.singer || "",
      album:     result.album || result.albumName || "",
      duration:  Number(result.duration) || 0,
      cover:     result.pic || result.cover || result.albumPic || "",
      lrcUrl:    result.lrc || result.lyric || "",
      streamUrl: result.url || result.audio || "",
      groupIds:  [result.group || "在线音乐"],
      meta: {
        searchServer: server,
        searchKey:    result.searchKey || "",
        rawResult:    result,       // 原始 API 响应（UI 不直接读）
        quality:      result.quality || "standard",
      },
    });
  }

  adaptBatch(results, server) {
    return results.map(r => this.adapt(r, server));
  }

  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * TTS 适配器 — 从 TTS 合成结果产出 TrackRef
 */
export class TTSSourceAdapter {
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * 从 TTS 合成结果创建 TrackRef
   * @param {Object} ttsResult — { ok, layer, url, filename, taskId, text, spk, instruct }
   * @returns {TrackRef}
   */
  adapt(ttsResult) {
    const text = ttsResult.text || "";
    const shortTitle = text.length > 30 ? text.slice(0, 30) + "…" : text;

    return createTrackRef({
      id:        `tts_${ttsResult.taskId || this._hash(text)}`,
      source:    SOURCE.TTS,
      title:     shortTitle,
      artist:    ttsResult.spk || "AI",
      album:     "",
      duration:  0, // TTS 实时合成，时长在合成后回填
      cover:     "",
      lrcUrl:    ttsResult.translate ? `tts_translate_${this._hash(ttsResult.translate)}` : "",
      streamUrl: ttsResult.url || "",
      groupIds:  ["TTS/语音"],
      meta: {
        ttsLayer:  ttsResult.layer || "",
        taskId:    ttsResult.taskId || "",
        filename:  ttsResult.filename || "",
        instruct:  ttsResult.instruct || "",
        spk:       ttsResult.spk || "my_voice",
        translate: ttsResult.translate || "",
        fullText:  text, // 截断前的完整文本
        kind:      ttsResult.kind || "", // "browser-native" 等
      },
    });
  }

  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════

/**
 * 按 groupIds 过滤曲目
 */
export function filterByGroups(tracks, groupIds) {
  if (!groupIds || groupIds.length === 0) return tracks;
  const set = new Set(groupIds);
  return tracks.filter(t => t.groupIds.some(g => set.has(g)));
}

/**
 * 获取曲目所属分组标签
 */
export function getGroupLabels(track) {
  return track.groupIds.join(",");
}

/**
 * 检查 TrackRef 是否有效（有流地址或可播放）
 */
export function isValidTrack(track) {
  if (!track) return false;
  if (!track.streamUrl) return false;
  if (track.source === SOURCE.TTS) return false;
  return true;
}

/**
 * 比较两个 TrackRef 是否指向同一曲目（按裸 URL + 标题）
 */
export function isSameTrack(a, b) {
  if (!a || !b) return false;
  const bareA = (a.streamUrl || "").split("?")[0].split("&")[0];
  const bareB = (b.streamUrl || "").split("?")[0].split("&")[0];
  return bareA === bareB && a.title === b.title;
}

// ═══════════════════════════════════════════════════════════
// JSON Schema（用于验证）
// ═══════════════════════════════════════════════════════════

export const SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "TrackRef",
  description: "AUDIO-13 统一曲目来源模型。所有来源的曲目进入同一队列结构。",
  type: "object",
  required: ["id", "source", "title", "streamUrl", "groupIds"],
  properties: {
    id: {
      type: "string",
      description: "唯一标识符",
      examples: ["local_a1b2c3", "search_netease_x9y8z7", "tts_abc123"],
    },
    source: {
      type: "string",
      enum: Object.values(SOURCE),
      description: "曲目来源",
    },
    title: {
      type: "string",
      description: "曲目标题",
      minLength: 1,
    },
    artist: {
      type: "string",
      description: "作者/艺术家",
    },
    album: {
      type: "string",
      description: "专辑名",
    },
    duration: {
      type: "number",
      description: "时长（秒）",
      minimum: 0,
    },
    cover: {
      type: "string",
      format: "uri",
      description: "封面图片 URL",
    },
    lrcUrl: {
      type: "string",
      description: "歌词引用 URL",
    },
    streamUrl: {
      type: "string",
      description: "流地址（播放用）",
    },
    groupIds: {
      type: "array",
      items: { type: "string" },
      description: "分组 ID 列表，用于随机播放范围取样",
    },
    meta: {
      type: "object",
      description: "来源特有字段，UI 不直接依赖",
      additionalProperties: true,
    },
    createdAt: {
      type: "number",
      description: "创建时间戳",
    },
  },
  additionalProperties: false,
};

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

export default {
  createTrackRef,
  migrateToTrackRef,
  migratePlaylist,
  LocalSourceAdapter,
  SearchSourceAdapter,
  TTSSourceAdapter,
  filterByGroups,
  getGroupLabels,
  isValidTrack,
  isSameTrack,
  SOURCE,
  MODE,
  TRACK_TYPE,
  SCHEMA,
};
