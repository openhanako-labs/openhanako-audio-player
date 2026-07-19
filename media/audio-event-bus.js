/**
 * audio-event-bus.js
 * 统一音频事件总线
 * 
 * 为音频播放器提供标准化事件发射和订阅机制
 * 支持桌宠、视觉层、状态栏、歌词舞台等消费方
 * 
 * AUDIO-09 独立歌词舞台扩展：
 * - track-change: 曲目切换时发射，携带完整歌词数据
 * - progress: 播放进度更新（调用方节流）
 * - play-state: 播放/暂停状态变化
 * - theme: 主题变更
 * - lyrics-toggle: 翻译显隐切换（舞台→播放器）
 */

class AudioEventBus {
  constructor() {
    this.listeners = new Map();
    this.debug = false;
    this.currentTrackId = null;
    this.currentTrackName = null;
    this.currentAudioType = 'music';
    // AUDIO-09: 缓存最近一次 track-change 数据，供舞台重连时恢复
    this._lastTrackChange = null;
    this._lastProgress = null;
  }

  /**
   * 发射音频事件
   * @param {string} type - 事件类型
   * @param {string} audioType - 音频类型（music/tts/notification）
   * @param {object} payload - 事件数据
   */
  emit(type, audioType, payload = {}) {
    const event = new CustomEvent('audio-event', {
      detail: {
        type,
        timestamp: Date.now(),
        audioType: audioType || this.currentAudioType,
        trackId: this.currentTrackId,
        trackName: this.currentTrackName,
        payload
      },
      bubbles: true,
      cancelable: false
    });

    // 发射到当前窗口
    window.dispatchEvent(event);

    // 尝试冒泡到父窗口（iframe场景）
    try {
      if (window.parent && window.parent !== window) {
        window.parent.dispatchEvent(event);
      }
    } catch (e) {
      // 跨域限制，忽略
    }

    if (this.debug) {
      console.log('[AudioEventBus]', type, event.detail);
    }
  }

  /**
   * 订阅音频事件
   * @param {string} type - 事件类型（可选，不传则监听所有）
   * @param {function} callback - 回调函数
   * @returns {function} 取消订阅函数
   */
  on(type, callback) {
    const handler = (event) => {
      if (!type || event.detail.type === type) {
        callback(event.detail);
      }
    };

    window.addEventListener('audio-event', handler);

    // 返回取消订阅函数
    return () => {
      window.removeEventListener('audio-event', handler);
    };
  }

  /**
   * 一次性订阅
   * @param {string} type - 事件类型
   * @param {function} callback - 回调函数
   */
  once(type, callback) {
    const unsubscribe = this.on(type, (detail) => {
      unsubscribe();
      callback(detail);
    });
  }

  /**
   * 设置当前播放曲目信息
   * @param {string} trackId - 曲目ID
   * @param {string} trackName - 曲目名称
   */
  setTrack(trackId, trackName) {
    this.currentTrackId = trackId;
    this.currentTrackName = trackName;
  }

  /**
   * 设置当前音频类型
   * @param {string} audioType - 音频类型（music/tts/notification）
   */
  setAudioType(audioType) {
    this.currentAudioType = audioType;
  }

  /**
   * 开启调试模式
   */
  enableDebug() {
    this.debug = true;
  }

  /**
   * 关闭调试模式
   */
  disableDebug() {
    this.debug = false;
  }

  /**
   * 获取当前播放信息
   * @returns {object} 当前播放信息
   */
  getCurrentInfo() {
    return {
      trackId: this.currentTrackId,
      trackName: this.currentTrackName,
      audioType: this.currentAudioType
    };
  }

  // ═══════════════════════════════════════════
  // AUDIO-09 扩展方法
  // ═══════════════════════════════════════════

  /**
   * 发射曲目切换事件
   * @param {object} trackInfo - 曲目信息
   * @param {Array} lrcData - 歌词数据 [{time, text, translate?}]
   */
  emitTrackChange(trackInfo, lrcData) {
    const data = {
      trackId: trackInfo.url || trackInfo.name || String(Date.now()),
      trackName: trackInfo.name || '未知曲目',
      mode: trackInfo.mode || '在线',
      lrcData: lrcData || [],
      hasLyrics: !!(lrcData && lrcData.length > 0)
    };
    
    this._lastTrackChange = data;
    this.setTrack(data.trackId, data.trackName);
    this.emit('track-change', null, data);
  }

  /**
   * 发射进度事件（调用方负责节流）
   * @param {number} currentTime - 当前秒数
   * @param {number} duration - 总时长秒数
   * @param {boolean} isPlaying - 是否正在播放
   */
  emitProgress(currentTime, duration, isPlaying) {
    const data = {
      currentTime: Math.round(currentTime * 1000), // ms
      duration: Math.round(duration * 1000),        // ms
      isPlaying: !!isPlaying
    };
    
    this._lastProgress = data;
    this.emit('progress', null, data);
  }

  /**
   * 发射播放状态事件
   * @param {boolean} playing - 是否正在播放
   */
  emitPlayState(playing) {
    this.emit('play-state', null, { playing: !!playing });
  }

  /**
   * 发射主题事件
   * @param {string} theme - 'dark' | 'light'
   */
  emitTheme(theme) {
    this.emit('theme', null, { theme: theme || 'dark' });
  }

  /**
   * 获取缓存的最近一次曲目切换数据（用于舞台重连恢复）
   * @returns {object|null}
   */
  getLastTrackChange() {
    return this._lastTrackChange;
  }

  /**
   * 获取缓存的最近一次进度数据
   * @returns {object|null}
   */
  getLastProgress() {
    return this._lastProgress;
  }
}

// 全局单例
if (!window.audioEventBus) {
  window.audioEventBus = new AudioEventBus();
}

// 导出（支持模块化）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioEventBus;
}
