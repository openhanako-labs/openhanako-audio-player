/**
 * renderer.js
 * 歌词渲染引擎 — AUDIO-09 独立歌词舞台
 * 
 * 负责歌词列表渲染、行高亮、主题切换
 */

class LyricRenderer {
  /**
   * @param {HTMLElement} container - 歌词容器 DOM
   * @param {object} state - BusClient 状态引用
   */
  constructor(container, state) {
    this.container = container;
    this.state = state;
    this.activeIndex = -1;
    this._renderScheduled = false;
    this._escapeHtml = this._escapeHtml.bind(this);
  }

  /**
   * 渲染歌词列表（全量）
   * @param {Array<{time: number, text: string, translate?: string}>} lrcData
   * @param {boolean} showTranslate - 是否显示翻译
   */
  render(lrcData, showTranslate) {
    if (!lrcData || !lrcData.length) {
      this.container.innerHTML = '<div class="lyric-placeholder">暂无歌词</div>';
      this.activeIndex = -1;
      return;
    }

    let html = '';
    for (let i = 0; i < lrcData.length; i++) {
      const line = lrcData[i];
      html += `<div class="lyric-line" data-idx="${i}">${this._escapeHtml(line.text)}</div>`;
      if (line.translate && showTranslate !== false) {
        html += `<div class="lyric-line lyric-line--translate" data-idx="${i}">${this._escapeHtml(line.translate)}</div>`;
      }
    }

    this.container.innerHTML = html;
    this.activeIndex = -1;
  }

  /**
   * 根据当前时间找到并高亮对应行
   * @param {number} timeMs - 当前播放时间（毫秒）
   */
  highlight(timeMs) {
    const lrcData = this.state.lrcData || [];
    if (!lrcData.length) return;

    // 找到当前时间对应的行索引
    let idx = 0;
    for (let i = 0; i < lrcData.length; i++) {
      if (lrcData[i].time <= timeMs) idx = i;
      else break;
    }

    if (idx === this.activeIndex) return; // 无变化
    this.activeIndex = idx;

    // 更新 DOM — 只切换 class，不重建 DOM
    const lines = this.container.querySelectorAll('.lyric-line');
    lines.forEach((el) => {
      const lineIdx = parseInt(el.dataset.idx, 10);
      el.classList.toggle('active', lineIdx === idx);
    });
  }

  /**
   * 设置主题
   * @param {string} theme - 'dark' | 'light'
   */
  setTheme(theme) {
    this.state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
  }

  /**
   * 切换翻译显隐
   * @param {boolean} showTranslate
   */
  toggleTranslate(showTranslate) {
    this.state.showTranslate = showTranslate;
    const transLines = this.container.querySelectorAll('.lyric-line--translate');
    transLines.forEach((el) => {
      el.classList.toggle('hidden', !showTranslate);
    });
  }

  /**
   * HTML 转义
   */
  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// 浏览器全局导出
if (typeof window !== 'undefined') {
  window.LyricRenderer = LyricRenderer;
}
