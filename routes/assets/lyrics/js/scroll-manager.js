/**
 * scroll-manager.js
 * 滚动管理器 — AUDIO-09 独立歌词舞台
 * 
 * 管理歌词自动滚动，支持用户手动滚动暂停/恢复
 */

class ScrollManager {
  /**
   * @param {HTMLElement} container - 可滚动容器
   * @param {object} [config]
   * @param {string} config.behavior - 'smooth' | 'auto'
   * @param {string} config.block - 'center' | 'nearest' | 'start' | 'end'
   * @param {number} config.threshold - 触发滚动的最小偏移(px)
   */
  constructor(container, config) {
    this.container = container;
    this.behavior = (config && config.behavior) || 'smooth';
    this.block = (config && config.block) || 'center';
    this.threshold = (config && config.threshold) || 20;
    this._paused = false;
    this._userScrolling = false;
    this._scrollTimeout = null;

    // 监听用户手动滚动 → 暂停自动滚动
    this._bindUserScroll();
  }

  /**
   * 滚动到指定索引的歌词行
   * @param {number} index - 歌词行索引（非翻译行）
   */
  scrollTo(index) {
    if (this._paused || this._userScrolling) return;
    
    const lines = this.container.querySelectorAll('.lyric-line:not(.lyric-line--translate)');
    if (index < 0 || index >= lines.length) return;

    const target = lines[index];
    if (!target) return;

    const containerRect = this.container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top - containerRect.height / 2;

    if (Math.abs(offset) > this.threshold) {
      target.scrollIntoView({ block: this.block, behavior: this.behavior });
    }
  }

  /**
   * 暂停自动滚动
   */
  pause() {
    this._paused = true;
  }

  /**
   * 恢复自动滚动
   */
  resume() {
    this._paused = false;
  }

  /**
   * 销毁
   */
  destroy() {
    if (this._scrollTimeout) clearTimeout(this._scrollTimeout);
  }

  _bindUserScroll() {
    let scrollStart = 0;

    this.container.addEventListener('scroll', () => {
      this._userScrolling = true;
      this.pause();

      if (this._scrollTimeout) clearTimeout(this._scrollTimeout);
      this._scrollTimeout = setTimeout(() => {
        this._userScrolling = false;
        this.resume();
      }, 2000); // 2 秒无操作后恢复自动滚动
    }, { passive: true });
  }
}

// 浏览器全局导出
if (typeof window !== 'undefined') {
  window.ScrollManager = ScrollManager;
}
