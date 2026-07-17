/**
 * audio-event-bus.js
 * 统一音频事件总线
 * 
 * 为音频播放器提供标准化事件发射和订阅机制
 * 支持桌宠、视觉层、状态栏等消费方
 */

class AudioEventBus {
  constructor() {
    this.listeners = new Map();
    this.debug = false;
    this.currentTrackId = null;
    this.currentTrackName = null;
    this.currentAudioType = 'music';
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
}

// 全局单例
if (!window.audioEventBus) {
  window.audioEventBus = new AudioEventBus();
}

// 导出（支持模块化）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioEventBus;
}