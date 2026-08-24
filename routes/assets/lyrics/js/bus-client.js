/**
 * bus-client.js
 * AUDIO-05 事件总线客户端 — AUDIO-09 独立歌词舞台
 * 
 * 订阅播放器事件，维护本地状态缓存
 * 支持重连恢复（崩溃后从缓存恢复最新状态）
 */

class BusClient {
  /**
   * @param {object} handlers - 事件处理器 { 'track-change': fn, ... }
   */
  constructor(handlers) {
    this.handlers = handlers || {};
    this.state = {
      trackName: '',
      trackMode: '',
      lrcData: [],
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      theme: 'dark',
      showTranslate: true,
    };
    this._unsubs = [];
    this._reconnectTimer = null;
    this._init();
  }

  _init() {
    const eventTypes = ['track-change', 'progress', 'play-state', 'theme'];
    
    for (const type of eventTypes) {
      const handler = this.handlers[type] || (() => {});
      const unsub = window.audioEventBus.on(type, (detail) => {
        this._onEvent(type, detail);
        handler(detail);
      });
      this._unsubs.push(unsub);
    }

    // 重连心跳：每 5 秒检查一次，如果长时间未收到 track-change 则尝试恢复
    this._startReconnectHeartbeat();
  }

  _onEvent(type, detail) {
    switch (type) {
      case 'track-change':
        this.state.trackName = detail.trackName || '';
        this.state.trackMode = detail.mode || '';
        this.state.lrcData = detail.lrcData || [];
        break;
      case 'progress':
        this.state.currentTime = detail.currentTime || 0;
        this.state.duration = detail.duration || 0;
        this.state.isPlaying = detail.isPlaying || false;
        break;
      case 'play-state':
        this.state.isPlaying = !!detail.playing;
        break;
      case 'theme':
        this.state.theme = detail.theme || 'dark';
        break;
    }
  }

  /**
   * 发送翻译显隐切换回播放器
   * @param {boolean} showTranslate
   */
  sendToggleTranslate(showTranslate) {
    if (window.audioEventBus) {
      window.audioEventBus.emit('lyrics-toggle', null, { showTranslate });
    }
  }

  /**
   * 重连：重新订阅所有事件
   */
  reconnect() {
    this._stopReconnectHeartbeat();
    
    // 取消旧订阅
    if (this._unsubs) {
      this._unsubs.forEach(fn => { try { fn(); } catch(e) {} });
      this._unsubs = [];
    }
    
    // 立即恢复最后一次已知状态
    this._restoreFromCache();
    
    // 重新订阅
    this._init();
  }

  /**
   * 从总线缓存恢复状态（用于崩溃后重连）
   */
  _restoreFromCache() {
    if (!window.audioEventBus) return;
    
    const lastTrack = window.audioEventBus.getLastTrackChange();
    const lastProgress = window.audioEventBus.getLastProgress();
    
    if (lastTrack) {
      this.state.trackName = lastTrack.trackName;
      this.state.trackMode = lastTrack.mode;
      this.state.lrcData = lastTrack.lrcData || [];
    }
    
    if (lastProgress) {
      this.state.currentTime = lastProgress.currentTime;
      this.state.duration = lastProgress.duration;
      this.state.isPlaying = lastProgress.isPlaying;
    }
  }

  /**
   * 启动重连心跳
   */
  _startReconnectHeartbeat() {
    this._reconnectTimer = setInterval(() => {
      // 如果超过 10 秒没收到任何事件，尝试重连
      if (Date.now() - (this._lastEventTime || 0) > 10000) {
        this.reconnect();
      }
    }, 5000);
  }

  /**
   * 停止重连心跳
   */
  _stopReconnectHeartbeat() {
    if (this._reconnectTimer) {
      clearInterval(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  /**
   * 销毁客户端，清理所有资源
   */
  destroy() {
    this._stopReconnectHeartbeat();
    if (this._unsubs) {
      this._unsubs.forEach(fn => { try { fn(); } catch(e) {} });
      this._unsubs = [];
    }
  }
}

// 浏览器全局导出
if (typeof window !== 'undefined') {
  window.BusClient = BusClient;
}
