/**
 * stage-contract.js
 * Stage / Now Playing 契约实现
 * 
 * 音频播放器的核心运行时，管理播放状态、队列、歌词同步
 */

class AudioStage {
  constructor() {
    this.bus = window.audioEventBus;
    this.trackRef = window.trackRef;
    this.internalState = {
      mediaSessionId: null,
      queue: [],
      currentIndex: -1,
      status: 'idle', // idle | playing | paused | buffering | error
      progress: {
        current: 0,
        duration: 0,
        percentage: 0,
      },
      mode: {
        repeat: 'off', // off | one | all
        shuffle: false,
      },
      volume: {
        level: 1.0,
        muted: false,
      },
      lyrics: {
        hasLyrics: false,
        currentLine: 0,
        lines: [],
      },
      updatedAt: Date.now(),
    };
    
    this.audioEngine = null;
    this.authGateway = new StageAuthGateway(this);
  }

  /**
   * 健康检查
   * @returns {Promise<HealthReport>}
   */
  async health() {
    return {
      ok: true,
      version: '1.0.0',
      mediaSessionId: this.internalState.mediaSessionId,
      queueLength: this.internalState.queue.length,
      status: this.internalState.status,
      engine: {
        audioElementReady: !!this.audioEngine,
        canPlayType: ['mp3', 'ogg', 'wav'],
        error: null,
      },
      memory: {
        trackRefs: this.internalState.queue.length,
        cachedBytes: 0,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * 获取完整状态
   * @param {object} [opts]
   * @returns {NowPlayingState}
   */
  state(opts = {}) {
    const snapshot = this.deepClone(this.internalState);
    if (!opts.includeQueue) {
      snapshot.queue = { total: 0, currentIndex: 0, nextTrack: null, prevTrack: null };
    }
    return snapshot;
  }

  /**
   * 加载歌词
   * @param {string} trackId
   * @param {string} [lrcUrl]
   * @returns {Promise<LyricsResult>}
   */
  async loadLyrics(trackId, lrcUrl) {
    const track = this.findTrackById(trackId);
    if (!track) {
      throw new Error(`LYRICS_NOT_FOUND: track ${trackId} not in queue`);
    }
    
    const url = lrcUrl || track.lrcUrl;
    if (!url) {
      this._emit('lyrics', { hasLyrics: false });
      return { hasLyrics: false, lines: [] };
    }
    
    try {
      const lines = await this.fetchAndParseLRC(url);
      this.internalState.lyrics = {
        hasLyrics: true,
        currentLine: 0,
        lines,
      };
      
      this._emit('lyrics', { hasLyrics: true, lines, trackId });
      return { hasLyrics: true, lines, trackId };
    } catch (e) {
      console.warn('Failed to load lyrics:', e);
      this._emit('lyrics', { hasLyrics: false });
      return { hasLyrics: false, lines: [] };
    }
  }

  /**
   * 加载播放会话
   * @param {string} sessionId
   * @returns {Promise<SessionLoadResult>}
   */
  async loadSession(sessionId) {
    const saved = await this.loadFromStorage(sessionId);
    if (!saved) {
      throw new Error(`SESSION_NOT_FOUND: ${sessionId}`);
    }
    
    // 迁移旧格式到 TrackRef
    const tracks = this.migratePlaylist(saved.tracks);
    
    // 重建队列
    this.internalState.mediaSessionId = sessionId;
    this.internalState.queue = tracks;
    this.internalState.status = 'idle';
    this.internalState.mode = saved.mode || { repeat: 'off', shuffle: false };
    this.internalState.volume = saved.volume ?? { level: 1.0, muted: false };
    
    // 如果之前有播放位置，记录但不自动恢复
    if (saved.playedAt != null) {
      this.internalState.resumePosition = saved.playedAt;
    }
    
    this._emit('session-loaded', { sessionId, trackCount: tracks.length });
    return {
      sessionId,
      trackCount: tracks.length,
      resumePosition: this.internalState.resumePosition ?? null,
      mode: this.internalState.mode,
      volume: this.internalState.volume,
    };
  }

  /**
   * 搜索曲目
   * @param {string} query
   * @param {object} [options]
   * @returns {Promise<SearchResult>}
   */
  async search(query, options = {}) {
    const adapter = new window.SearchSourceAdapter({ pluginId: 'hanako-audio-player' });
    const results = await this.onlineSearch(query, options.server, options.limit);
    
    // 转换为 TrackRef
    const trackRefs = results.map(r => adapter.adapt(r, options.server));
    
    this._emit('search-results', { query, count: trackRefs.length, server: options.server });
    return {
      query,
      server: options.server,
      tracks: trackRefs,
      totalCount: trackRefs.length,
    };
  }

  /**
   * 播放指定曲目
   * @param {TrackRef | number} target
   * @param {object} [options]
   * @returns {Promise<PlayResult>}
   */
  async play(target, options = {}) {
    let track;
    let index;
    
    if (typeof target === 'number') {
      // 按索引播放
      index = target;
      track = this.internalState.queue[index];
      if (!track) {
        throw new Error(`PLAY_INDEX_OUT_OF_RANGE: ${index}`);
      }
    } else {
      // 按 TrackRef 播放
      track = target;
      index = this.internalState.queue.findIndex(t => t.id === track.id);
      if (index < 0) {
        // TrackRef 不在队列中，先入队
        index = this.internalState.queue.length;
        this.internalState.queue.push(track);
      }
    }
    
    if (options.mode === 'replace') {
      this.internalState.queue = [track];
      this.internalState.mediaSessionId = this.generateMediaSessionId();
    }
    
    this.internalState.status = 'buffering';
    this.internalState.currentIndex = index;
    
    // 设置媒体会话
    this.setMediaSession({
      id: this.internalState.mediaSessionId,
      title: track.title,
      artist: track.artist,
      cover: track.cover,
      duration: track.duration,
    });
    
    // 开始播放
    if (this.audioEngine) {
      await this.audioEngine.load(track.streamUrl);
      await this.audioEngine.play();
    }
    
    this.internalState.status = 'playing';
    
    // 尝试加载歌词
    if (track.lrcUrl) {
      this.loadLyrics(track.id).catch(() => {});
    }
    
    this._emit('play', {
      trackId: track.id,
      index,
      mode: options.mode,
      mediaSessionId: this.internalState.mediaSessionId,
    });
    
    return {
      trackId: track.id,
      index,
      mediaSessionId: this.internalState.mediaSessionId,
      status: 'playing',
    };
  }

  /**
   * 入队
   * @param {TrackRef | TrackRef[]} tracks
   * @param {object} [options]
   * @returns {EnqueueResult}
   */
  enqueue(tracks, options = {}) {
    const refs = Array.isArray(tracks) ? tracks : [tracks];
    const position = options.position || 'end';
    let insertIndex;
    
    switch (position) {
      case 'end':
        insertIndex = this.internalState.queue.length;
        break;
      case 'next':
        insertIndex = Math.min(this.internalState.currentIndex + 1, this.internalState.queue.length);
        break;
      case 'index':
        insertIndex = Math.max(0, Math.min(options.index, this.internalState.queue.length));
        break;
      default:
        insertIndex = this.internalState.queue.length;
    }
    
    // 去重检查
    const existingIds = new Set(this.internalState.queue.map(t => t.id));
    const uniqueTracks = refs.filter(t => !existingIds.has(t.id));
    
    this.internalState.queue.splice(insertIndex, 0, ...uniqueTracks);
    
    this._emit('enqueue', {
      inserted: uniqueTracks.length,
      position,
      index: insertIndex,
      mediaSessionId: this.internalState.mediaSessionId,
    });
    
    return {
      inserted: uniqueTracks.length,
      queueLength: this.internalState.queue.length,
      mediaSessionId: this.internalState.mediaSessionId,
    };
  }

  /**
   * 清空队列
   * @param {object} [options]
   * @returns {ClearResult}
   */
  clear(options = {}) {
    const stop = options.stop !== false;
    
    if (stop) {
      this.internalState.status = 'idle';
      if (this.audioEngine) {
        this.audioEngine.stop();
      }
      this.setMediaSession(null);
    }
    
    const clearedCount = this.internalState.queue.length;
    this.internalState.queue = [];
    this.internalState.currentIndex = 0;
    
    this._emit('clear', {
      stopped: stop,
      clearedCount,
      mediaSessionId: this.internalState.mediaSessionId,
    });
    
    return {
      stopped: stop,
      clearedCount,
      mediaSessionId: this.internalState.mediaSessionId,
    };
  }

  /**
   * 暂停播放
   */
  pause() {
    if (this.internalState.status === 'playing') {
      this.internalState.status = 'paused';
      if (this.audioEngine) {
        this.audioEngine.pause();
      }
      this._emit('pause', {
        trackId: this.getCurrentTrack()?.id,
        mediaSessionId: this.internalState.mediaSessionId,
      });
    }
  }

  /**
   * 恢复播放
   */
  resume() {
    if (this.internalState.status === 'paused') {
      this.internalState.status = 'playing';
      if (this.audioEngine) {
        this.audioEngine.play();
      }
      this._emit('resume', {
        trackId: this.getCurrentTrack()?.id,
        mediaSessionId: this.internalState.mediaSessionId,
      });
    }
  }

  /**
   * 停止播放
   */
  stop() {
    this.internalState.status = 'idle';
    if (this.audioEngine) {
      this.audioEngine.stop();
    }
    this.setMediaSession(null);
    this._emit('stop', {
      mediaSessionId: this.internalState.mediaSessionId,
    });
  }

  /**
   * 下一首
   */
  next() {
    const { queue, currentIndex, mode } = this.internalState;
    
    if (queue.length === 0) return;
    
    let nextIndex;
    if (mode.shuffle) {
      // 随机播放
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      // 顺序播放
      nextIndex = (currentIndex + 1) % queue.length;
    }
    
    this.play(nextIndex);
  }

  /**
   * 上一首
   */
  prev() {
    const { queue, currentIndex } = this.internalState;
    
    if (queue.length === 0) return;
    
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    this.play(prevIndex);
  }

  /**
   * 设置音量
   * @param {number} level
   */
  setVolume(level) {
    this.internalState.volume.level = Math.max(0, Math.min(1, level));
    if (this.audioEngine) {
      this.audioEngine.setVolume(this.internalState.volume.level);
    }
  }

  /**
   * 静音/取消静音
   */
  toggleMute() {
    this.internalState.volume.muted = !this.internalState.volume.muted;
    if (this.audioEngine) {
      this.audioEngine.setMuted(this.internalState.volume.muted);
    }
  }

  /**
   * 设置循环模式
   * @param {string} mode
   */
  setRepeatMode(mode) {
    this.internalState.mode.repeat = mode;
  }

  /**
   * 切换随机播放
   */
  toggleShuffle() {
    this.internalState.mode.shuffle = !this.internalState.mode.shuffle;
  }

  /**
   * 获取当前曲目
   * @returns {TrackRef | null}
   */
  getCurrentTrack() {
    const { queue, currentIndex } = this.internalState;
    return queue[currentIndex] || null;
  }

  /**
   * 查找曲目
   * @param {string} trackId
   * @returns {TrackRef | null}
   */
  findTrackById(trackId) {
    return this.internalState.queue.find(t => t.id === trackId) || null;
  }

  /**
   * 生成媒体会话ID
   * @returns {string}
   */
  generateMediaSessionId() {
    return crypto.randomUUID?.() || 
           `ms_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * 设置媒体会话
   * @param {object} metadata
   */
  setMediaSession(metadata) {
    if (!('mediaSession' in navigator)) return;
    
    if (metadata == null) {
      try { navigator.mediaSession.metadata = null; } catch {}
      return;
    }
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: metadata.title,
      artist: metadata.artist,
      album: '',
      artwork: metadata.cover ? [{ src: metadata.cover }] : [],
    });
    
    // 注册媒体控制
    navigator.mediaSession.setActionHandler('play', () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
  }

  /**
   * 深拷贝
   * @param {object} obj
   * @returns {object}
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * 发射事件
   * @param {string} type
   * @param {object} payload
   */
  _emit(type, payload) {
    if (this.bus) {
      this.bus.emit(type, this.internalState.currentAudioType || 'music', {
        ...payload,
        mediaSessionId: this.internalState.mediaSessionId,
      });
    }
  }

  /**
   * 加载歌词（模拟）
   * @param {string} url
   * @returns {Promise<Array>}
   */
  async fetchAndParseLRC(url) {
    // 模拟实现
    return [];
  }

  /**
   * 加载会话（模拟）
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async loadFromStorage(sessionId) {
    // 模拟实现
    return null;
  }

  /**
   * 迁移播放列表（模拟）
   * @param {Array} tracks
   * @returns {Array}
   */
  migratePlaylist(tracks) {
    // 模拟实现
    return tracks || [];
  }

  /**
   * 在线搜索（模拟）
   * @param {string} query
   * @param {string} server
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async onlineSearch(query, server, limit) {
    // 模拟实现
    return [];
  }
}

/**
 * 鉴权网关
 */
class StageAuthGateway {
  constructor(stage) {
    this.stage = stage;
    this.tokens = new Map();
    this.auditLog = [];
  }

  /**
   * 注册调用方
   * @param {string} source
   * @param {string} token
   * @param {string[]} permissions
   */
  register(source, token, permissions) {
    this.tokens.set(token, { source, permissions, registeredAt: Date.now() });
    this.auditLog.push({ action: 'register', source, timestamp: Date.now() });
  }

  /**
   * 执行带鉴权的调用
   * @param {string} method
   * @param {string} token
   * @param {...any} args
   * @returns {Promise<any>}
   */
  async call(method, token, ...args) {
    const entry = this.tokens.get(token);
    
    if (!entry) {
      this._audit('deny', method, token, 'INVALID_TOKEN');
      throw new Error(`AUTH_DENIED: invalid token for ${method}`);
    }
    
    // 权限检查
    if (!this._hasPermission(entry, method)) {
      this._audit('deny', method, token, 'PERMISSION_DENIED');
      throw new Error(`AUTH_DENIED: ${entry.source} lacks permission for ${method}`);
    }
    
    // 审计日志
    this._audit('allow', method, token, null);
    
    // 执行调用
    const stageMethod = this.stage[method];
    if (typeof stageMethod !== 'function') {
      throw new Error(`UNKNOWN_METHOD: ${method}`);
    }
    
    return stageMethod.apply(this.stage, args);
  }

  /**
   * 检查权限
   * @param {object} entry
   * @param {string} method
   * @returns {boolean}
   */
  _hasPermission(entry, method) {
    const publicMethods = ['health', 'state'];
    if (publicMethods.includes(method)) return true;
    
    const requiredPermissions = {
      play: ['playback.control'],
      enqueue: ['queue.manage'],
      clear: ['queue.manage'],
      loadLyrics: ['lyrics.read'],
      loadSession: ['session.restore'],
      search: ['search.execute'],
    };
    
    const needed = requiredPermissions[method];
    if (!needed) return true;
    
    return needed.some(p => entry.permissions.includes(p));
  }

  /**
   * 审计日志
   * @param {string} action
   * @param {string} method
   * @param {string} token
   * @param {string} reason
   */
  _audit(action, method, token, reason) {
    this.auditLog.push({
      action,
      method,
      tokenHash: this.hashToken(token),
      source: this.tokens.get(token)?.source || 'unknown',
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * 哈希token
   * @param {string} token
   * @returns {string}
   */
  hashToken(token) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}

// 全局单例
if (!window.audioStage) {
  window.audioStage = new AudioStage();
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioStage, StageAuthGateway };
}