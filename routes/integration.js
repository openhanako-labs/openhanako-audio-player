/**
 * integration.js
 * 集成主题注册表、AI主题生成器和Stage接口到播放器
 */

// ═══════════════════════════════════════════════════════════
// 主题注册表集成
// ═══════════════════════════════════════════════════════════

// 注册内置主题
function initThemeRegistry() {
  if (!window.themeRegistry) return;
  
  // 注册默认主题
  if (window.defaultTheme) {
    window.themeRegistry.register(window.defaultTheme);
  }
  
  // 注册波形主题
  if (window.waveformTheme) {
    window.themeRegistry.register(window.waveformTheme);
  }
  
  // 注册频谱主题
  if (window.spectrumTheme) {
    window.themeRegistry.register(window.spectrumTheme);
  }
  
  console.log('[Theme] Registered', window.themeRegistry.listThemes().length, 'themes');
}

// ═══════════════════════════════════════════════════════════
// AI主题生成器集成
// ═══════════════════════════════════════════════════════════

// 初始化AI主题生成器
function initAIThemeGenerator() {
  if (!window.aiThemeGenerator) return;
  
  // 从localStorage恢复启用状态
  const enabled = localStorage.getItem('hanako_ai_theme_enabled');
  if (enabled !== null) {
    window.aiThemeGenerator.setEnabled(enabled === 'true');
  }
  
  console.log('[AI Theme] Initialized, enabled:', window.aiThemeGenerator.enabled);
}

// 为当前曲目生成主题
async function generateThemeForCurrentTrack() {
  if (!window.aiThemeGenerator || !window.audioStage) return;
  
  const currentTrack = window.audioStage.getCurrentTrack();
  if (!currentTrack) return;
  
  try {
    const theme = await window.aiThemeGenerator.generateForTrack(currentTrack);
    console.log('[AI Theme] Generated for track:', currentTrack.title);
    return theme;
  } catch (e) {
    console.warn('[AI Theme] Failed to generate:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Stage接口集成
// ═══════════════════════════════════════════════════════════

// 初始化Stage接口
function initStageInterface() {
  if (!window.audioStage) return;
  
  // 设置音频引擎引用
  window.audioStage.audioEngine = {
    load: async (url) => {
      const audio = document.getElementById('audio');
      if (audio) {
        audio.src = url;
        await new Promise((resolve, reject) => {
          audio.oncanplay = resolve;
          audio.onerror = reject;
        });
      }
    },
    play: async () => {
      const audio = document.getElementById('audio');
      if (audio) {
        await audio.play();
      }
    },
    pause: () => {
      const audio = document.getElementById('audio');
      if (audio) {
        audio.pause();
      }
    },
    stop: () => {
      const audio = document.getElementById('audio');
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    },
    setVolume: (level) => {
      const audio = document.getElementById('audio');
      if (audio) {
        audio.volume = level;
      }
    },
    setMuted: (muted) => {
      const audio = document.getElementById('audio');
      if (audio) {
        audio.muted = muted;
      }
    },
  };
  
  console.log('[Stage] Initialized');
}

// ═══════════════════════════════════════════════════════════
// 事件总线集成
// ═══════════════════════════════════════════════════════════

// 初始化事件总线
function initEventBus() {
  if (!window.audioEventBus) return;
  
  // 监听播放状态变化
  window.audioEventBus.on('audio:play', (event) => {
    console.log('[EventBus] Play:', event.trackName);
    // 触发AI主题生成
    generateThemeForCurrentTrack();
  });
  
  window.audioEventBus.on('audio:pause', (event) => {
    console.log('[EventBus] Pause');
  });
  
  window.audioEventBus.on('audio:ended', (event) => {
    console.log('[EventBus] Ended');
  });
  
  console.log('[EventBus] Initialized');
}

// ═══════════════════════════════════════════════════════════
// 设置面板集成
// ═══════════════════════════════════════════════════════════

// 创建主题设置面板
function createThemeSettingsPanel() {
  if (!window.SettingsPanelGenerator || !window.themeRegistry) return;
  
  const currentTheme = window.themeRegistry.getCurrentTheme();
  if (!currentTheme) return;
  
  const panel = window.SettingsPanelGenerator.generate(
    currentTheme.settingsSchema,
    window.themeRegistry.getCurrentSettings() || currentTheme.defaultSettings,
    (key, value) => {
      // 设置变更回调
      console.log('[Settings] Changed:', key, value);
      // 这里可以实现实时预览
    }
  );
  
  return panel;
}

// ═══════════════════════════════════════════════════════════
// 性能档位集成
// ═══════════════════════════════════════════════════════════

// 初始化性能档位
function initPerformanceTier() {
  if (!window.themeRegistry) return;
  
  // 从localStorage恢复性能档位
  const tier = localStorage.getItem('hanako_performance_tier') || 'medium';
  window.themeRegistry.setPerformanceTier(tier);
  
  // 监听性能档位变化
  window.addEventListener('performance-tier-change', (event) => {
    const { tier } = event.detail;
    window.themeRegistry.setPerformanceTier(tier);
    console.log('[Performance] Tier changed:', tier);
  });
  
  console.log('[Performance] Initialized, tier:', tier);
}

// ═══════════════════════════════════════════════════════════
// 主初始化函数
// ═══════════════════════════════════════════════════════════

function initAll() {
  console.log('[Integration] Initializing all modules...');
  
  // 初始化主题注册表
  initThemeRegistry();
  
  // 初始化AI主题生成器
  initAIThemeGenerator();
  
  // 初始化Stage接口
  initStageInterface();
  
  // 初始化事件总线
  initEventBus();
  
  // 初始化性能档位
  initPerformanceTier();
  
  console.log('[Integration] All modules initialized');
}

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

// 全局导出
window.integration = {
  initAll,
  initThemeRegistry,
  initAIThemeGenerator,
  initStageInterface,
  initEventBus,
  initPerformanceTier,
  generateThemeForCurrentTrack,
  createThemeSettingsPanel,
};

// 自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}