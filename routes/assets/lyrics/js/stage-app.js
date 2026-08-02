/**
 * stage-app.js
 * AUDIO-09 独立歌词舞台 — 应用入口
 * 
 * 订阅事件总线 → 渲染歌词 → 高亮滚动 → 主题同步
 * 零依赖播放器核心，崩溃自愈
 */
(function() {
  "use strict";

  // ── DOM refs ──
  const bodyEl = document.getElementById('lyricBody');
  const trackNameEl = document.getElementById('trackName');
  const trackModeEl = document.getElementById('trackMode');
  const progressTextEl = document.getElementById('progressText');
  const translateToggleBtn = document.getElementById('translateToggle');
  const placeholderEl = document.getElementById('placeholder');

  // ── Error boundary ──
  window.addEventListener('error', function(e) {
    console.warn('[LyricsStage] Caught error:', e.message);
    if (bodyEl && !bodyEl.querySelector('.lyric-error')) {
      bodyEl.innerHTML = '<div class="lyric-error">歌词渲染异常</div>';
    }
  });

  // ── State + BusClient ──
  const state = {};
  const bus = new BusClient({
    'track-change': function(detail) {
      trackNameEl.textContent = detail.trackName || '未知曲目';
      trackModeEl.textContent = detail.mode || '';
      
      if (detail.hasLyrics && detail.lrcData && detail.lrcData.length) {
        placeholderEl.style.display = 'none';
      } else {
        placeholderEl.textContent = detail.hasLyrics ? '' : '暂无歌词';
        placeholderEl.style.display = detail.hasLyrics ? 'none' : '';
      }
    },
    'progress': function(detail) {
      progressTextEl.textContent = fmtTime(detail.currentTime) + ' / ' + fmtTime(detail.duration);
    },
    'theme': function(detail) {
      document.documentElement.setAttribute('data-theme', detail.theme);
    }
  });

  // ── Renderer + ScrollManager ──
  const renderer = new LyricRenderer(bodyEl, state);
  const scroller = new ScrollManager(bodyEl, { behavior: 'smooth', block: 'center', threshold: 15 });

  // ── 进度驱动高亮 ──
  let lastProgressMs = -1;

  window.audioEventBus.on('progress', function(detail) {
    if (detail.currentTime === lastProgressMs) return;
    lastProgressMs = detail.currentTime;
    
    renderer.highlight(detail.currentTime);
    scroller.scrollTo(renderer.activeIndex);
  });

  // ── 曲目切换 → 重新渲染 ──
  window.audioEventBus.on('track-change', function(detail) {
    renderer.render(detail.lrcData || [], bus.state.showTranslate);
    renderer.activeIndex = -1;
    lastProgressMs = -1;
  });

  // ── 翻译显隐切换 ──
  translateToggleBtn.addEventListener('click', function() {
    bus.state.showTranslate = !bus.state.showTranslate;
    translateToggleBtn.classList.toggle('active', bus.state.showTranslate);
    translateToggleBtn.textContent = bus.state.showTranslate ? '译' : '中';
    renderer.toggleTranslate(bus.state.showTranslate);
    bus.sendToggleTranslate(bus.state.showTranslate);
  });

  // ── 初始状态：从缓存恢复 ──
  (function restoreFromCache() {
    if (!window.audioEventBus) return;
    const lastTrack = window.audioEventBus.getLastTrackChange();
    const lastProgress = window.audioEventBus.getLastProgress();
    
    if (lastTrack) {
      trackNameEl.textContent = lastTrack.trackName || '未知曲目';
      trackModeEl.textContent = lastTrack.mode || '';
      if (lastTrack.hasLyrics && lastTrack.lrcData && lastTrack.lrcData.length) {
        renderer.render(lastTrack.lrcData, bus.state.showTranslate);
        placeholderEl.style.display = 'none';
      } else {
        placeholderEl.textContent = lastTrack.hasLyrics ? '' : '暂无歌词';
        placeholderEl.style.display = lastTrack.hasLyrics ? 'none' : '';
      }
    }
    
    if (lastProgress) {
      progressTextEl.textContent = fmtTime(lastProgress.currentTime) + ' / ' + fmtTime(lastProgress.duration);
    }
  })();

  // ── 通知宿主就绪 ──
  try { parent.postMessage({ type: 'ready' }, '*'); } catch(e) {}
  
  if (window.ResizeObserver) {
    new ResizeObserver(function() {
      try {
        parent.postMessage({ type: 'resize-request', payload: { height: document.body.scrollHeight } }, '*');
      } catch(e) {}
    }).observe(document.body);
  }

  setTimeout(notifySize, 300);

  function notifySize() {
    try {
      parent.postMessage({ type: 'resize-request', payload: { height: document.body.scrollHeight } }, '*');
    } catch(e) {}
  }

  function fmtTime(ms) {
    if (!ms || !isFinite(ms)) return '0:00';
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0');
  }
})();
