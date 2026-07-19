// === audio-event-bus.js ===
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

// === theme-registry.js ===
/**
 * theme-registry.js
 * 歌词视觉主题注册表
 * 
 * 为音频播放器提供主题注册、加载、性能检查和fallback机制
 */

class ThemeRegistry {
  constructor() {
    this.themes = new Map();
    this.loadedModules = new Map();
    this.currentTheme = null;
    this.currentSettings = null;
    this.performanceTier = 'medium';
    this.fallbackManager = new FallbackManager(this);
  }

  /**
   * 注册主题
   * @param {ThemeDefinition} theme - 主题定义
   */
  register(theme) {
    if (!theme.id) throw new Error('Theme must have an id');
    this.themes.set(theme.id, theme);
  }

  /**
   * 批量注册主题
   * @param {ThemeDefinition[]} themes
   */
  registerBatch(themes) {
    themes.forEach(t => this.register(t));
  }

  /**
   * 获取主题列表
   * @returns {ThemeDefinition[]}
   */
  listThemes() {
    return Array.from(this.themes.values());
  }

  /**
   * 获取主题
   * @param {string} themeId
   * @returns {ThemeDefinition | undefined}
   */
  getTheme(themeId) {
    return this.themes.get(themeId);
  }

  /**
   * 加载主题（懒加载）
   * @param {string} themeId
   * @returns {Promise<ThemeDefinition>}
   */
  async loadTheme(themeId) {
    // 检查是否已加载
    if (this.loadedModules.has(themeId)) {
      return this.loadedModules.get(themeId);
    }

    // 获取主题定义
    const theme = this.themes.get(themeId);
    if (!theme) {
      throw new Error(`Theme not found: ${themeId}`);
    }

    // 检查性能要求
    if (!this.checkRequirements(theme)) {
      console.warn(`Theme ${themeId} requires higher performance, using fallback`);
      return this.loadTheme(theme.fallback || 'default-theme');
    }

    // 动态加载渲染器模块
    if (theme.renderer.module) {
      const module = await import(theme.renderer.module);
      theme.renderer = { ...theme.renderer, ...module.default };
    }

    this.loadedModules.set(themeId, theme);
    return theme;
  }

  /**
   * 检查性能要求
   * @param {ThemeDefinition} theme
   * @returns {boolean}
   */
  checkRequirements(theme) {
    const tierOrder = { low: 0, medium: 1, high: 2 };
    const current = tierOrder[this.performanceTier] || 1;
    const required = tierOrder[theme.requirements.minTier] || 0;
    
    if (current < required) return false;
    
    // 检查特性支持
    if (theme.requirements.features) {
      for (const feature of theme.requirements.features) {
        if (!this.checkFeatureSupport(feature)) return false;
      }
    }
    
    return true;
  }

  /**
   * 检查特性支持
   * @param {string} feature
   * @returns {boolean}
   */
  checkFeatureSupport(feature) {
    switch (feature) {
      case 'canvas':
        return !!document.createElement('canvas').getContext;
      case 'webgl':
        try {
          const canvas = document.createElement('canvas');
          return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch (e) {
          return false;
        }
      case 'css-animations':
        return CSS.supports('animation', 'test');
      default:
        return true;
    }
  }

  /**
   * 应用主题
   * @param {string} themeId
   * @param {HTMLElement} container
   * @param {object} settings
   */
  async applyTheme(themeId, container, settings = {}) {
    // 销毁当前主题
    if (this.currentTheme) {
      this.currentTheme.renderer.destroy();
    }

    // 加载新主题
    const theme = await this.loadTheme(themeId);
    
    // 合并设置
    const mergedSettings = { ...theme.defaultSettings, ...settings };
    
    // 初始化渲染器
    theme.renderer.init(container, mergedSettings);
    
    this.currentTheme = theme;
    this.currentSettings = mergedSettings;
    
    return theme;
  }

  /**
   * 渲染当前主题
   * @param {object} state - 歌词状态
   */
  render(state) {
    if (this.currentTheme) {
      this.currentTheme.renderer.render(state);
    }
  }

  /**
   * 设置性能档位
   * @param {string} tier
   */
  setPerformanceTier(tier) {
    this.performanceTier = tier;
  }

  /**
   * 获取当前主题
   * @returns {ThemeDefinition | null}
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * 获取当前设置
   * @returns {object | null}
   */
  getCurrentSettings() {
    return this.currentSettings;
  }
}

/**
 * Fallback管理器
 */
class FallbackManager {
  constructor(registry) {
    this.registry = registry;
  }

  /**
   * 获取可用主题（带fallback）
   * @param {string} themeId
   * @returns {Promise<ThemeDefinition>}
   */
  async getAvailableTheme(themeId) {
    const visited = new Set();
    let currentId = themeId;
    
    while (currentId) {
      if (visited.has(currentId)) {
        // 循环检测，使用默认主题
        console.warn('Theme fallback loop detected, using default');
        return this.registry.getTheme('default-theme');
      }
      
      visited.add(currentId);
      const theme = this.registry.getTheme(currentId);
      
      if (!theme) {
        // 主题不存在，使用默认
        console.warn(`Theme ${currentId} not found, using default`);
        return this.registry.getTheme('default-theme');
      }
      
      // 检查性能要求
      if (this.registry.checkRequirements(theme)) {
        return theme;
      }
      
      // 降级到fallback
      console.warn(`Theme ${currentId} requires higher performance, falling back to ${theme.fallback}`);
      currentId = theme.fallback;
    }
    
    // 所有fallback都失败，使用默认
    return this.registry.getTheme('default-theme');
  }
}

// 全局单例
if (!window.themeRegistry) {
  window.themeRegistry = new ThemeRegistry();
}

// 导出（支持模块化）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeRegistry, FallbackManager };
}
// === settings-panel.js ===
/**
 * settings-panel.js
 * 设置面板生成器
 * 
 * 从schema自动生成设置UI
 */

class SettingsPanelGenerator {
  /**
   * 从schema生成设置面板
   * @param {object} schema - settingsSchema
   * @param {object} currentValues - 当前设置值
   * @param {Function} onChange - 设置变更回调
   * @returns {HTMLElement}
   */
  static generate(schema, currentValues = {}, onChange = null) {
    const panel = document.createElement('div');
    panel.className = 'theme-settings-panel';
    panel.style.cssText = `
      padding: 16px;
      background: var(--surface, #2a2a2a);
      border-radius: 8px;
      border: 1px solid var(--border, #3a3a3a);
    `;
    
    // 标题
    const title = document.createElement('h3');
    title.textContent = '主题设置';
    title.style.cssText = `
      margin: 0 0 16px 0;
      color: var(--text, #e0e0e0);
      font-size: 16px;
    `;
    panel.appendChild(title);
    
    // 生成字段
    for (const [key, prop] of Object.entries(schema.properties)) {
      const field = this.createField(key, prop, currentValues[key], onChange);
      panel.appendChild(field);
    }
    
    return panel;
  }

  /**
   * 创建单个字段
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createField(key, prop, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-field';
    wrapper.style.cssText = `
      margin-bottom: 12px;
    `;
    
    // 标签
    const label = document.createElement('label');
    label.textContent = prop.title || key;
    label.style.cssText = `
      display: block;
      margin-bottom: 4px;
      color: var(--text-dim, #888);
      font-size: 12px;
    `;
    wrapper.appendChild(label);
    
    // 输入控件
    let input;
    switch (prop.type) {
      case 'string':
        if (prop.format === 'color') {
          input = this.createColorInput(key, prop, value, onChange);
        } else {
          input = this.createTextInput(key, prop, value, onChange);
        }
        break;
      case 'number':
        input = this.createNumberInput(key, prop, value, onChange);
        break;
      case 'boolean':
        input = this.createCheckboxInput(key, prop, value, onChange);
        break;
      default:
        input = this.createTextInput(key, prop, value, onChange);
    }
    
    wrapper.appendChild(input);
    
    return wrapper;
  }

  /**
   * 创建颜色输入
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createColorInput(key, prop, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value ?? prop.default ?? '#000000';
    input.style.cssText = `
      width: 32px;
      height: 32px;
      border: 1px solid var(--border, #3a3a3a);
      border-radius: 4px;
      cursor: pointer;
    `;
    
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = value ?? prop.default ?? '#000000';
    hexInput.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      background: var(--bg, #1a1a1a);
      border: 1px solid var(--border, #3a3a3a);
      border-radius: 4px;
      color: var(--text, #e0e0e0);
      font-size: 12px;
    `;
    
    // 同步颜色选择器和文本输入
    input.addEventListener('input', (e) => {
      hexInput.value = e.target.value;
      if (onChange) {
        onChange(key, e.target.value);
      }
    });
    
    hexInput.addEventListener('change', (e) => {
      const hex = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        input.value = hex;
        if (onChange) {
          onChange(key, hex);
        }
      }
    });
    
    wrapper.appendChild(input);
    wrapper.appendChild(hexInput);
    
    return wrapper;
  }

  /**
   * 创建文本输入
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createTextInput(key, prop, value, onChange) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value ?? prop.default ?? '';
    input.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      background: var(--bg, #1a1a1a);
      border: 1px solid var(--border, #3a3a3a);
      border-radius: 4px;
      color: var(--text, #e0e0e0);
      font-size: 12px;
    `;
    
    input.addEventListener('change', (e) => {
      if (onChange) {
        onChange(key, e.target.value);
      }
    });
    
    return input;
  }

  /**
   * 创建数字输入
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createNumberInput(key, prop, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const input = document.createElement('input');
    input.type = 'range';
    input.min = prop.minimum ?? 0;
    input.max = prop.maximum ?? 100;
    input.step = prop.step ?? 1;
    input.value = value ?? prop.default ?? 0;
    input.style.cssText = `
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      background: var(--border, #3a3a3a);
      border-radius: 2px;
      outline: none;
    `;
    
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = input.value;
    valueDisplay.style.cssText = `
      min-width: 30px;
      text-align: right;
      color: var(--text, #e0e0e0);
      font-size: 12px;
    `;
    
    input.addEventListener('input', (e) => {
      valueDisplay.textContent = e.target.value;
      if (onChange) {
        onChange(key, parseFloat(e.target.value));
      }
    });
    
    wrapper.appendChild(input);
    wrapper.appendChild(valueDisplay);
    
    return wrapper;
  }

  /**
   * 创建复选框输入
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createCheckboxInput(key, prop, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value ?? prop.default ?? false;
    input.style.cssText = `
      width: 16px;
      height: 16px;
      cursor: pointer;
    `;
    
    const label = document.createElement('span');
    label.textContent = input.checked ? '开启' : '关闭';
    label.style.cssText = `
      color: var(--text, #e0e0e0);
      font-size: 12px;
    `;
    
    input.addEventListener('change', (e) => {
      label.textContent = e.target.checked ? '开启' : '关闭';
      if (onChange) {
        onChange(key, e.target.checked);
      }
    });
    
    wrapper.appendChild(input);
    wrapper.appendChild(label);
    
    return wrapper;
  }

  /**
   * 收集设置值
   * @param {HTMLElement} panel
   * @param {object} schema
   * @returns {object}
   */
  static collectValues(panel, schema) {
    const values = {};
    
    for (const [key, prop] of Object.entries(schema.properties)) {
      const field = panel.querySelector(`[data-key="${key}"]`);
      if (!field) continue;
      
      switch (prop.type) {
        case 'string':
          if (prop.format === 'color') {
            values[key] = field.value;
          } else {
            values[key] = field.value;
          }
          break;
        case 'number':
          values[key] = parseFloat(field.value);
          break;
        case 'boolean':
          values[key] = field.checked;
          break;
      }
    }
    
    return values;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsPanelGenerator;
} else if (typeof window !== 'undefined') {
  window.SettingsPanelGenerator = SettingsPanelGenerator;
}
// === ai-theme-generator.js ===
/**
 * ai-theme-generator.js
 * AI主题参数生成器
 * 
 * 从封面主色、歌词情绪和用户偏好生成受约束的主题JSON
 */

class AIThemeGenerator {
  constructor() {
    this.cache = new ThemeCacheManager();
    this.enabled = true;
    this.coverColorExtractor = new CoverColorExtractor();
    this.lyricsMoodAnalyzer = new LyricsMoodAnalyzer();
    this.themeParameterGenerator = new ThemeParameterGenerator();
  }

  /**
   * 为曲目生成主题
   * @param {TrackRef} track
   * @param {object} userPreferences
   * @returns {Promise<ThemeOutput>}
   */
  async generateForTrack(track, userPreferences = {}) {
    // 检查是否启用AI主题
    if (!this.enabled) {
      return this.getDefaultTheme();
    }
    
    // 检查用户覆盖
    const userOverride = UserOverrideManager.getOverride(track.id);
    if (userOverride && userOverride.meta?.source === 'manual') {
      // 用户手动覆盖，直接使用
      return userOverride;
    }
    
    // 检查缓存
    const cacheKey = ThemeCacheManager.generateKey(track.id, track.cover);
    const cached = this.cache.get(cacheKey) || ThemePersistence.load(cacheKey);
    if (cached) {
      // 合并用户覆盖
      return UserOverrideManager.merge(cached, userOverride);
    }
    
    // 收集输入
    const inputs = await this.collectInputs(track, userPreferences);
    
    // 生成参数
    const theme = this.themeParameterGenerator.generate(inputs);
    
    // 缓存结果
    this.cache.set(cacheKey, theme);
    ThemePersistence.save(cacheKey, theme);
    
    // 合并用户覆盖
    return UserOverrideManager.merge(theme, userOverride);
  }

  /**
   * 收集输入
   * @param {TrackRef} track
   * @param {object} userPreferences
   * @returns {Promise<ThemeInputs>}
   */
  async collectInputs(track, userPreferences) {
    // 提取封面颜色
    let coverColors = this.coverColorExtractor.getDefaultColors();
    if (track.cover) {
      try {
        coverColors = await this.coverColorExtractor.extract(track.cover);
      } catch (e) {
        console.warn('Failed to extract cover colors:', e);
      }
    }
    
    // 分析歌词情绪
    let lyricsMood = this.lyricsMoodAnalyzer.getDefaultMood();
    if (track.lrcUrl) {
      try {
        // 这里需要先加载歌词
        // const lyrics = await loadLyrics(track.lrcUrl);
        // lyricsMood = this.lyricsMoodAnalyzer.analyze(lyrics);
      } catch (e) {
        console.warn('Failed to analyze lyrics mood:', e);
      }
    }
    
    return {
      coverColors,
      lyricsMood,
      userPreferences: {
        themeStyle: 'warm',
        animationLevel: 'medium',
        colorIntensity: 0.8,
        contrastLevel: 0.7,
        ...userPreferences,
      },
      audioType: track.source || 'music',
      trackInfo: {
        title: track.title,
        artist: track.artist,
        genre: track.meta?.genre || '',
      },
    };
  }

  /**
   * 获取默认主题
   * @returns {ThemeOutput}
   */
  getDefaultTheme() {
    return {
      colors: {
        primary: '#d49a6a',
        secondary: '#c48454',
        accent: '#e0b088',
        background: '#1a1a1a',
        text: '#e0e0e0',
        highlight: '#d49a6a',
        gradient: ['#d49a6a', '#c48454'],
      },
      layout: {
        fontSize: 16,
        lineHeight: 1.8,
        padding: 16,
        borderRadius: 8,
        spacing: 8,
      },
      animation: {
        level: 'medium',
        speed: 1.0,
        easing: 'ease-out',
        intensity: 0.5,
        particles: false,
        waveform: true,
      },
      effects: {
        blur: 0,
        glow: 0.2,
        shadow: 0.1,
        opacity: 1.0,
      },
      meta: {
        generatedAt: Date.now(),
        source: 'default',
        confidence: 0.5,
      },
    };
  }

  /**
   * 启用/禁用AI主题
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem('hanako_ai_theme_enabled', enabled);
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
    ThemePersistence.clear();
  }
}

/**
 * 封面颜色提取器
 */
class CoverColorExtractor {
  /**
   * 从封面图片提取主色
   * @param {string} imageUrl - 封面图片URL
   * @returns {Promise<CoverColors>}
   */
  async extract(imageUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 缩小图片以提高性能
        const size = 50;
        canvas.width = size;
        canvas.height = size;
        
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = imageData.data;
        
        // 提取颜色
        const colors = this.extractColors(pixels);
        resolve(colors);
      };
      
      img.onerror = () => {
        // 提取失败，返回默认颜色
        resolve(this.getDefaultColors());
      };
      
      img.src = imageUrl;
    });
  }

  /**
   * 从像素数据提取颜色
   * @param {Uint8ClampedArray} pixels
   * @returns {CoverColors}
   */
  extractColors(pixels) {
    const colorMap = new Map();
    
    // 采样像素（每隔4个像素采样一次）
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      // 量化颜色（减少颜色数量）
      const qr = Math.round(r / 32) * 32;
      const qg = Math.round(g / 32) * 32;
      const qb = Math.round(b / 32) * 32;
      
      const key = `${qr},${qg},${qb}`;
      colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }
    
    // 排序获取主要颜色
    const sorted = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    const primary = this.rgbToHex(...sorted[0][0].split(',').map(Number));
    const secondary = sorted[1] ? this.rgbToHex(...sorted[1][0].split(',').map(Number)) : primary;
    const accent = sorted[2] ? this.rgbToHex(...sorted[2][0].split(',').map(Number)) : secondary;
    
    // 计算亮度和饱和度
    const brightness = this.calculateBrightness(primary);
    const saturation = this.calculateSaturation(primary);
    
    return {
      primary,
      secondary,
      accent,
      brightness,
      saturation,
    };
  }

  /**
   * RGB转Hex
   */
  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  /**
   * 计算亮度
   */
  calculateBrightness(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  }

  /**
   * 计算饱和度
   */
  calculateSaturation(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    
    if (max === min) return 0;
    return (max - min) / max;
  }

  /**
   * 获取默认颜色
   */
  getDefaultColors() {
    return {
      primary: "#d49a6a",
      secondary: "#c48454",
      accent: "#e0b088",
      brightness: 0.6,
      saturation: 0.7,
    };
  }
}

/**
 * 歌词情绪分析器
 */
class LyricsMoodAnalyzer {
  /**
   * 分析歌词情绪
   * @param {string[]} lyrics - 歌词行数组
   * @returns {LyricsMood}
   */
  analyze(lyrics) {
    if (!lyrics || lyrics.length === 0) {
      return this.getDefaultMood();
    }
    
    const text = lyrics.join(' ');
    
    // 情感词典
    const positiveWords = ['爱', '希望', '快乐', '美好', '温暖', '阳光', '幸福', '微笑'];
    const negativeWords = ['悲伤', '痛苦', '孤独', '眼泪', '黑暗', '绝望', '心碎'];
    const energyWords = ['燃烧', '爆发', '疯狂', '激情', '力量', '飞翔'];
    const calmWords = ['安静', '平静', '温柔', '宁静', '放松', '缓慢'];
    
    // 计算情感得分
    let positiveScore = 0;
    let negativeScore = 0;
    let energyScore = 0;
    let calmScore = 0;
    
    const words = text.split(/\s+/);
    for (const word of words) {
      if (positiveWords.some(p => word.includes(p))) positiveScore++;
      if (negativeWords.some(n => word.includes(n))) negativeScore++;
      if (energyWords.some(e => word.includes(e))) energyScore++;
      if (calmWords.some(c => word.includes(c))) calmScore++;
    }
    
    // 确定情感
    let sentiment = 'neutral';
    if (positiveScore > negativeScore * 1.5) sentiment = 'positive';
    else if (negativeScore > positiveScore * 1.5) sentiment = 'negative';
    
    // 确定能量
    const totalWords = words.length;
    const energy = Math.min(1, (energyScore - calmScore + totalWords * 0.1) / totalWords);
    
    // 确定节奏
    let tempo = 'medium';
    if (energy > 0.7) tempo = 'fast';
    else if (energy < 0.3) tempo = 'slow';
    
    // 提取关键词
    const keywords = [];
    if (positiveScore > 0) keywords.push('温暖');
    if (negativeScore > 0) keywords.push('忧伤');
    if (energyScore > 0) keywords.push('激情');
    if (calmScore > 0) keywords.push('宁静');
    
    return {
      sentiment,
      energy: Math.max(0, Math.min(1, energy)),
      tempo,
      keywords,
    };
  }

  /**
   * 获取默认情绪
   */
  getDefaultMood() {
    return {
      sentiment: 'neutral',
      energy: 0.5,
      tempo: 'medium',
      keywords: [],
    };
  }
}

/**
 * 主题参数生成器
 */
class ThemeParameterGenerator {
  /**
   * 生成主题参数
   * @param {ThemeInputs} inputs
   * @returns {ThemeOutput}
   */
  generate(inputs) {
    const { coverColors, lyricsMood, userPreferences, audioType, trackInfo } = inputs;
    
    // 1. 生成颜色参数
    const colors = this.generateColors(coverColors, userPreferences);
    
    // 2. 生成布局参数
    const layout = this.generateLayout(userPreferences);
    
    // 3. 生成动效参数
    const animation = this.generateAnimation(lyricsMood, userPreferences);
    
    // 4. 生成特效参数
    const effects = this.generateEffects(coverColors, userPreferences);
    
    return {
      colors,
      layout,
      animation,
      effects,
      meta: {
        generatedAt: Date.now(),
        source: 'ai',
        confidence: this.calculateConfidence(inputs),
        inputs,
      },
    };
  }

  /**
   * 生成颜色参数
   */
  generateColors(coverColors, userPreferences) {
    const { primary, secondary, accent, brightness, saturation } = coverColors;
    const { themeStyle, colorIntensity } = userPreferences;
    
    // 根据风格调整颜色
    let adjustedPrimary = primary;
    let adjustedSecondary = secondary;
    let adjustedAccent = accent;
    
    switch (themeStyle) {
      case 'warm':
        // 暖色调：增加红色/黄色
        adjustedPrimary = this.adjustHue(primary, 10);
        adjustedSecondary = this.adjustHue(secondary, 15);
        break;
      case 'cool':
        // 冷色调：增加蓝色/绿色
        adjustedPrimary = this.adjustHue(primary, -10);
        adjustedSecondary = this.adjustHue(secondary, -15);
        break;
      case 'vibrant':
        // 鲜艳：增加饱和度
        adjustedPrimary = this.adjustSaturation(primary, 0.2);
        adjustedSecondary = this.adjustSaturation(secondary, 0.2);
        break;
    }
    
    // 根据亮度调整背景色
    const background = brightness > 0.5 ? '#1a1a1a' : '#0a0a0a';
    const text = brightness > 0.5 ? '#e0e0e0' : '#f0f0f0';
    
    return {
      primary: adjustedPrimary,
      secondary: adjustedSecondary,
      accent: adjustedAccent,
      background,
      text,
      highlight: adjustedPrimary,
      gradient: [adjustedPrimary, adjustedSecondary],
    };
  }

  /**
   * 生成布局参数
   */
  generateLayout(userPreferences) {
    const { animationLevel } = userPreferences;
    
    // 根据动效级别调整布局
    const fontSize = animationLevel === 'high' ? 18 : animationLevel === 'medium' ? 16 : 14;
    const lineHeight = animationLevel === 'high' ? 2.0 : animationLevel === 'medium' ? 1.8 : 1.6;
    const padding = animationLevel === 'high' ? 20 : animationLevel === 'medium' ? 16 : 12;
    
    return {
      fontSize,
      lineHeight,
      padding,
      borderRadius: 8,
      spacing: 8,
    };
  }

  /**
   * 生成动效参数
   */
  generateAnimation(lyricsMood, userPreferences) {
    const { energy, tempo } = lyricsMood;
    const { animationLevel } = userPreferences;
    
    // 根据能量和节奏调整动效
    let level = animationLevel;
    let speed = 1.0;
    let intensity = energy;
    
    switch (tempo) {
      case 'fast':
        speed = 1.2;
        intensity = Math.min(1, energy * 1.2);
        break;
      case 'slow':
        speed = 0.8;
        intensity = Math.max(0.3, energy * 0.8);
        break;
    }
    
    // 根据用户偏好调整
    if (animationLevel === 'low') {
      level = 'low';
      intensity *= 0.5;
    } else if (animationLevel === 'high') {
      level = 'high';
      intensity = Math.min(1, intensity * 1.2);
    }
    
    return {
      level,
      speed,
      easing: 'ease-out',
      intensity,
      particles: level === 'high' && energy > 0.7,
      waveform: level !== 'low',
    };
  }

  /**
   * 生成特效参数
   */
  generateEffects(coverColors, userPreferences) {
    const { brightness, saturation } = coverColors;
    const { contrastLevel } = userPreferences;
    
    // 根据亮度调整模糊
    const blur = brightness > 0.7 ? 0 : brightness > 0.4 ? 2 : 4;
    
    // 根据饱和度调整发光
    const glow = saturation > 0.7 ? 0.4 : saturation > 0.4 ? 0.2 : 0.1;
    
    // 根据对比度调整阴影
    const shadow = contrastLevel > 0.7 ? 0.3 : contrastLevel > 0.4 ? 0.2 : 0.1;
    
    return {
      blur,
      glow,
      shadow,
      opacity: 1.0,
    };
  }

  /**
   * 计算置信度
   */
  calculateConfidence(inputs) {
    let confidence = 0.5;  // 基础置信度
    
    // 封面颜色提取成功
    if (inputs.coverColors && inputs.coverColors.primary) {
      confidence += 0.2;
    }
    
    // 歌词情绪分析成功
    if (inputs.lyricsMood && inputs.lyricsMood.sentiment !== 'neutral') {
      confidence += 0.2;
    }
    
    // 用户偏好明确
    if (inputs.userPreferences && inputs.userPreferences.themeStyle) {
      confidence += 0.1;
    }
    
    return Math.min(1, confidence);
  }

  /**
   * 调整色相
   */
  adjustHue(hex, degrees) {
    // 简化实现，实际需要HSL转换
    return hex;
  }

  /**
   * 调整饱和度
   */
  adjustSaturation(hex, amount) {
    // 简化实现，实际需要HSL转换
    return hex;
  }
}

/**
 * 缓存管理器
 */
class ThemeCacheManager {
  constructor() {
    this.cache = new Map();
    this.maxSize = 100;
  }

  /**
   * 生成缓存键
   * @param {string} trackId
   * @param {string} coverUrl
   * @returns {string}
   */
  static generateKey(trackId, coverUrl) {
    const coverHash = coverUrl ? this.hashCode(coverUrl) : 'no-cover';
    return `theme_${trackId}_${coverHash}`;
  }

  /**
   * 获取缓存
   * @param {string} key
   * @returns {ThemeOutput | null}
   */
  get(key) {
    return this.cache.get(key) || null;
  }

  /**
   * 设置缓存
   * @param {string} key
   * @param {ThemeOutput} theme
   */
  set(key, theme) {
    // LRU缓存淘汰
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, theme);
  }

  /**
   * 清除缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 哈希函数
   */
  static hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * 持久化管理
 */
class ThemePersistence {
  static STORAGE_KEY = 'hanako_ai_themes';
  static MAX_STORED = 50;

  /**
   * 保存主题到localStorage
   * @param {string} key
   * @param {ThemeOutput} theme
   */
  static save(key, theme) {
    try {
      const stored = this.loadAll();
      stored[key] = theme;
      
      // 限制存储数量
      const keys = Object.keys(stored);
      if (keys.length > this.MAX_STORED) {
        const oldestKey = keys[0];
        delete stored[oldestKey];
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {
      console.warn('Failed to save theme to localStorage:', e);
    }
  }

  /**
   * 从localStorage加载主题
   * @param {string} key
   * @returns {ThemeOutput | null}
   */
  static load(key) {
    try {
      const stored = this.loadAll();
      return stored[key] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 加载所有存储的主题
   * @returns {Object}
   */
  static loadAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * 清除所有存储的主题
   */
  static clear() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

/**
 * 用户覆盖管理器
 */
class UserOverrideManager {
  static STORAGE_KEY = 'hanako_theme_overrides';

  /**
   * 获取用户覆盖
   * @param {string} trackId
   * @returns {Partial<ThemeOutput> | null}
   */
  static getOverride(trackId) {
    try {
      const overrides = this.loadAll();
      return overrides[trackId] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 保存用户覆盖
   * @param {string} trackId
   * @param {Partial<ThemeOutput>} override
   */
  static saveOverride(trackId, override) {
    try {
      const overrides = this.loadAll();
      overrides[trackId] = {
        ...override,
        meta: {
          source: 'manual',
          savedAt: Date.now(),
        },
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(overrides));
    } catch (e) {
      console.warn('Failed to save user override:', e);
    }
  }

  /**
   * 删除用户覆盖
   * @param {string} trackId
   */
  static deleteOverride(trackId) {
    try {
      const overrides = this.loadAll();
      delete overrides[trackId];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(overrides));
    } catch (e) {
      console.warn('Failed to delete user override:', e);
    }
  }

  /**
   * 加载所有覆盖
   * @returns {Object}
   */
  static loadAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * 合并AI生成和用户覆盖
   * @param {ThemeOutput} aiTheme
   * @param {Partial<ThemeOutput>} userOverride
   * @returns {ThemeOutput}
   */
  static merge(aiTheme, userOverride) {
    if (!userOverride) return aiTheme;
    
    return {
      colors: { ...aiTheme.colors, ...userOverride.colors },
      layout: { ...aiTheme.layout, ...userOverride.layout },
      animation: { ...aiTheme.animation, ...userOverride.animation },
      effects: { ...aiTheme.effects, ...userOverride.effects },
      meta: {
        ...aiTheme.meta,
        source: 'hybrid',
        userOverrideAt: userOverride.meta?.savedAt,
      },
    };
  }
}

// 全局单例
if (!window.aiThemeGenerator) {
  window.aiThemeGenerator = new AIThemeGenerator();
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AIThemeGenerator,
    CoverColorExtractor,
    LyricsMoodAnalyzer,
    ThemeParameterGenerator,
    ThemeCacheManager,
    ThemePersistence,
    UserOverrideManager,
  };
}
// === stage-contract.js ===
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
// === lyrics-match-chain.js ===
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

// === lyrics-settings-panel.js ===
/**
 * lyrics-settings-panel.js — AUDIO-08 歌词手动修正 UI
 * 
 * 提供模态对话框用于手动修正歌词来源、封面来源和元数据。
 * 三种修正模式：本地文件选择、文本粘贴、URL 指定。
 */

(function () {
  "use strict";

  // ── DOM 引用缓存 ──
  let dialogEl = null;
  let backdropEl = null;
  let currentTrackIdx = -1;
  let currentMode = "local-file"; // local-file | paste-text | specify-url

  // ── 打开歌词设置对话框 ──
  function openLyricsSettings(trackIdx) {
    if (typeof trks === "undefined" || !trks[trackIdx]) return;
    currentTrackIdx = trackIdx;
    const t = trks[trackIdx];

    // 创建对话框
    if (!dialogEl) {
      dialogEl = createDialogDOM();
      document.body.appendChild(dialogEl);
      bindDialogEvents();
    }

    // 填充当前值
    populateForm(t);
    showLyricsPreview(t);
    dialogEl.style.display = "flex";
    try { parent.postMessage({ type: "resize-request", payload: { height: document.body.scrollHeight } }, "*"); } catch (e) {}
  }

  function closeLyricsSettings() {
    if (dialogEl) dialogEl.style.display = "none";
    currentTrackIdx = -1;
  }

  // ── 创建对话框 DOM ──
  function createDialogDOM() {
    const bd = document.createElement("div");
    bd.id = "lyricsSettingsDialog";
    bd.style.cssText = `
      position: fixed; inset: 0; z-index: 9999; display: none;
      align-items: center; justify-content: center;
    `;

    // 遮罩
    const back = document.createElement("div");
    back.className = "ls-backdrop";
    back.style.cssText = `
      position: absolute; inset: 0; background: rgba(0,0,0,0.45);
    `;
    bd.appendChild(back);

    // 内容
    const content = document.createElement("div");
    content.className = "ls-dialog";
    content.style.cssText = `
      position: relative; background: var(--card-bg, #1e1e22);
      border: 1px solid var(--border-strong, rgba(255,255,255,0.14));
      border-radius: 12px; padding: 20px; min-width: 380px; max-width: 500px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.5); color: var(--text, #e4e4e7);
      font-family: inherit; font-size: 13px;
    `;

    content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-weight:600;font-size:14px">🎵 歌词设置</span>
        <button class="ls-close" title="关闭" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:16px;padding:4px 8px">&times;</button>
      </div>

      <!-- 歌词来源 -->
      <div class="ls-section" style="margin-bottom:16px">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">歌词来源</div>
        <div class="ls-source-tabs" style="display:flex;gap:4px;margin-bottom:10px">
          <button class="ls-tab active" data-mode="local-file" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:11px;font-family:inherit">本地文件</button>
          <button class="ls-tab" data-mode="paste-text" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:11px;font-family:inherit">粘贴文本</button>
          <button class="ls-tab" data-mode="specify-url" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:11px;font-family:inherit">指定 URL</button>
        </div>

        <!-- 本地文件模式 -->
        <div class="ls-mode-panel ls-mode-local" style="display:block">
          <input type="file" id="lsFileInput" accept=".lrc,.txt,.vtt,.ttml,.json" style="display:none">
          <div style="display:flex;gap:6px">
            <button class="ls-browse-btn" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--accent);background:var(--accent-soft);color:var(--accent);cursor:pointer;font-size:11px;font-family:inherit">浏览文件</button>
            <span id="lsFileName" style="flex:1;font-size:11px;color:var(--text-faint);padding:6px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">未选择文件</span>
          </div>
        </div>

        <!-- 粘贴文本模式 -->
        <div class="ls-mode-panel ls-mode-text" style="display:none">
          <textarea id="lsPasteArea" rows="6" placeholder="粘贴 LRC 歌词内容...&#10;例如：&#10;[00:12.00]Deep Focus&#10;[00:24.00]Ambient beats" style="width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-family:inherit;resize:vertical;outline:none"></textarea>
        </div>

        <!-- 指定 URL 模式 -->
        <div class="ls-mode-panel ls-mode-url" style="display:none">
          <div style="display:flex;gap:6px">
            <input id="lsUrlInput" type="text" placeholder="https://example.com/song.lrc" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-family:inherit;outline:none">
            <button class="ls-test-btn" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:11px;font-family:inherit">测试</button>
          </div>
          <div id="lsUrlStatus" style="font-size:10px;margin-top:4px;color:var(--text-faint)"></div>
        </div>
      </div>

      <!-- 预览 -->
      <div class="ls-section" style="margin-bottom:16px">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">预览</div>
        <div id="lsPreview" class="ls-preview-area" style="max-height:120px;overflow-y:auto;padding:8px;background:var(--surface);border-radius:6px;font-size:11px;color:var(--text-dim);line-height:1.8">暂无预览</div>
      </div>

      <!-- 封面独立修正 -->
      <div class="ls-section" style="margin-bottom:16px">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">封面来源（可选）</div>
        <select id="lsCoverSource" style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-family:inherit;outline:none;margin-bottom:6px">
          <option value="auto">自动（跟随歌词匹配源）</option>
          <option value="online">在线搜索</option>
          <option value="local">本地图片</option>
          <option value="none">不设置</option>
        </select>
        <div id="lsCoverExtra" style="display:none">
          <input id="lsCoverUrlInput" type="text" placeholder="封面图片 URL" style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-family:inherit;outline:none">
        </div>
      </div>

      <!-- 底部按钮 -->
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="ls-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:12px;font-family:inherit">取消</button>
        <button class="ls-save" style="padding:6px 16px;border-radius:6px;border:none;background:linear-gradient(135deg,var(--accent),#c48454);color:#fff;cursor:pointer;font-size:12px;font-weight:500;font-family:inherit">保存修正</button>
      </div>
    `;

    bd.appendChild(content);
    return bd;
  }

  // ── 绑定事件 ──
  function bindDialogEvents() {
    const bd = dialogEl;
    const content = bd.children[0];

    // 关闭
    content.querySelector(".ls-close").addEventListener("click", closeLyricsSettings);
    content.querySelector(".ls-cancel").addEventListener("click", closeLyricsSettings);
    bd.querySelector(".ls-backdrop").addEventListener("click", closeLyricsSettings);

    // Tab 切换
    content.querySelectorAll(".ls-tab").forEach((tab) => {
      tab.addEventListener("click", function () {
        content.querySelectorAll(".ls-tab").forEach((t) => t.classList.remove("active"));
        this.classList.add("active");
        currentMode = this.dataset.mode;
        content.querySelectorAll(".ls-mode-panel").forEach((p) => p.style.display = "none");
        content.querySelector(`.ls-mode-${currentMode}`).style.display = "block";
      });
    });

    // 浏览文件
    content.querySelector(".ls-browse-btn").addEventListener("click", function () {
      const fileInput = document.getElementById("lsFileInput");
      if (fileInput) fileInput.click();
    });
    content.querySelector("#lsFileInput").addEventListener("change", function () {
      const nameEl = document.getElementById("lsFileName");
      if (this.files && this.files.length > 0) {
        nameEl.textContent = this.files[0].name;
        // 读取文件内容并预览
        const reader = new FileReader();
        reader.onload = function (e) {
          const content = e.target.result;
          previewLrcContent(content);
        };
        reader.readAsText(this.files[0]);
      } else {
        nameEl.textContent = "未选择文件";
      }
    });

    // 粘贴文本预览
    const pasteArea = content.querySelector("#lsPasteArea");
    if (pasteArea) {
      pasteArea.addEventListener("input", function () {
        previewLrcContent(this.value);
      });
    }

    // URL 测试
    const testBtn = content.querySelector(".ls-test-btn");
    if (testBtn) {
      testBtn.addEventListener("click", function () {
        const urlInput = document.getElementById("lsUrlInput");
        const statusEl = document.getElementById("lsUrlStatus");
        if (!urlInput || !statusEl) return;
        const url = urlInput.value.trim();
        if (!url) { statusEl.textContent = "请输入 URL"; statusEl.style.color = "#facc15"; return; }
        statusEl.textContent = "测试中…";
        statusEl.style.color = "var(--text-faint)";
        fetch(url, { method: "HEAD" })
          .then((r) => {
            if (r.ok) {
              statusEl.textContent = "✓ 可用";
              statusEl.style.color = "#4ade80";
            } else {
              statusEl.textContent = "✕ 不可访问";
              statusEl.style.color = "#ef4444";
            }
          })
          .catch(() => {
            statusEl.textContent = "✕ 网络错误";
            statusEl.style.color = "#ef4444";
          });
      });
    }

    // 封面来源切换
    const coverSelect = content.querySelector("#lsCoverSource");
    const coverExtra = document.getElementById("lsCoverExtra");
    if (coverSelect && coverExtra) {
      coverSelect.addEventListener("change", function () {
        coverExtra.style.display = this.value !== "auto" && this.value !== "none" ? "block" : "none";
      });
    }

    // 保存
    content.querySelector(".ls-save").addEventListener("click", function () {
      saveLyricsFix(currentTrackIdx, bd);
    });
  }

  // ── 填充表单 ──
  function populateForm(track) {
    if (!track) return;
    // 重置
    currentMode = "local-file";
    document.querySelectorAll(".ls-tab").forEach((t) => t.classList.remove("active"));
    document.querySelector('.ls-tab[data-mode="local-file"]').classList.add("active");
    document.querySelectorAll(".ls-mode-panel").forEach((p) => p.style.display = "none");
    document.querySelector(".ls-mode-local").style.display = "block";
    document.getElementById("lsFileName").textContent = track.lrcSource === "manual" && track.lrcContent ? "已加载（手动）" : "未选择文件";
    const pasteArea = document.getElementById("lsPasteArea");
    if (pasteArea) pasteArea.value = track.lrcContent || "";
    const urlInput = document.getElementById("lsUrlInput");
    if (urlInput) urlInput.value = track.lrcUrl || "";
    const coverSelect = document.getElementById("lsCoverSource");
    if (coverSelect) coverSelect.value = "auto";
    const coverExtra = document.getElementById("lsCoverExtra");
    if (coverExtra) coverExtra.style.display = "none";
    const coverUrlInput = document.getElementById("lsCoverUrlInput");
    if (coverUrlInput) coverUrlInput.value = track.pic || "";
  }

  // ── 预览歌词 ──
  function previewLrcContent(raw) {
    const previewEl = document.getElementById("lsPreview");
    if (!previewEl || !raw) {
      previewEl.textContent = "暂无预览";
      return;
    }
    // 解析前 5 行显示
    const lines = raw.split("\n").filter((l) => l.trim()).slice(0, 5);
    const parsed = parseLrcPreview(lines.join("\n"));
    previewEl.innerHTML = parsed.map((l) => `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(l.text)}</div>`).join("");
  }

  function parseLrcPreview(raw) {
    const lines = raw.split("\n");
    const result = [];
    for (const line of lines) {
      const m = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/);
      if (m) {
        const ms = parseInt(m[1]) * 60000 + parseInt(m[2]) * 1000 + (m[3] ? parseInt(m[3].padEnd(3, "0")) : 0);
        const txt = m[4].trim();
        if (txt) result.push({ time: ms, text: txt });
      }
    }
    return result;
  }

  function showLyricsPreview(track) {
    const previewEl = document.getElementById("lsPreview");
    if (!previewEl) return;
    if (track.lrcContent) {
      previewLrcContent(track.lrcContent);
    } else if (track.lrcUrl) {
      previewEl.textContent = `当前使用在线歌词: ${track.lrcUrl}`;
    } else {
      previewEl.textContent = "暂无歌词";
    }
  }

  // ── 保存修正 ──
  function saveLyricsFix(trackIdx, dialog) {
    if (trackIdx < 0 || !trks[trackIdx]) { showToast("无效曲目", 1500); return; }
    const t = trks[trackIdx];
    const content = dialog.querySelector(".ls-dialog");

    // 歌词内容
    let lrcContent = null;
    let lrcUrl = null;
    let lrcSource = "manual";

    if (currentMode === "local-file") {
      const fileInput = document.getElementById("lsFileInput");
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        // 从 file reader 读取的内容已在 preview 中处理，这里需要重新读
        const reader = new FileReader();
        // 同步方式：直接从 textarea 获取（如果用户也粘贴了的话）
        const pasteVal = content.querySelector("#lsPasteArea")?.value;
        if (pasteVal && pasteVal.trim()) {
          lrcContent = pasteVal.trim();
        }
      }
      // 如果没选文件但有粘贴内容
      const pasteVal = content.querySelector("#lsPasteArea")?.value;
      if (pasteVal && pasteVal.trim()) {
        lrcContent = pasteVal.trim();
      }
    } else if (currentMode === "paste-text") {
      const pasteVal = content.querySelector("#lsPasteArea")?.value;
      if (pasteVal && pasteVal.trim()) {
        lrcContent = pasteVal.trim();
      }
    } else if (currentMode === "specify-url") {
      const urlVal = content.querySelector("#lsUrlInput")?.value?.trim();
      if (urlVal) {
        lrcUrl = urlVal;
      }
    }

    if (!lrcContent && !lrcUrl) {
      showToast("请提供歌词内容或 URL", 2000);
      return;
    }

    // 更新 track
    if (lrcContent) {
      t.lrcContent = lrcContent;
      t.lrcSource = "manual";
    }
    if (lrcUrl) {
      t.lrcUrl = lrcUrl;
      t.lrcSource = "manual";
    }

    // 封面修正
    const coverSource = content.querySelector("#lsCoverSource")?.value;
    if (coverSource && coverSource !== "auto") {
      t.coverSource = coverSource;
      const coverUrlInput = content.querySelector("#lsCoverUrlInput");
      if (coverUrlInput && coverUrlInput.value.trim()) {
        t.pic = coverUrlInput.value.trim();
      }
    }

    // 持久化
    const trackKey = t.url || t.name || "";
    window.saveManualMatch?.(trackKey, {
      lrcContent: t.lrcContent,
      lrcUrl: t.lrcUrl,
      lrcSource: t.lrcSource,
      coverSource: t.coverSource,
      coverUrl: t.pic,
    });

    saveTrks();
    renderPL();
    closeLyricsSettings();
    showToast("歌词修正已保存", 1500);
  }

  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── 全局暴露 ──
  window.openLyricsSettings = openLyricsSettings;
  window.closeLyricsSettings = closeLyricsSettings;

})();

// === integration.js ===
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

// 为当前曲目生成主题并应用
async function generateThemeForCurrentTrack() {
  if (!window.aiThemeGenerator || !window.audioStage) return;
  
  const currentTrack = window.audioStage.getCurrentTrack();
  if (!currentTrack) return;
  
  try {
    const theme = await window.aiThemeGenerator.generateForTrack(currentTrack);
    console.log('[AI Theme] Generated for track:', currentTrack.title);
    
    // 应用主题到CSS变量
    if (theme && theme.colors) {
      applyThemeToCSS(theme);
    }
    
    return theme;
  } catch (e) {
    console.warn('[AI Theme] Failed to generate:', e);
    return null;
  }
}

// 应用主题颜色到CSS变量
function applyThemeToCSS(theme) {
  if (!theme || !theme.colors) return;
  
  const root = document.documentElement;
  const { colors, layout, animation } = theme;
  
  // 应用颜色
  if (colors.primary) root.style.setProperty('--accent', colors.primary);
  if (colors.secondary) root.style.setProperty('--accent-hover', colors.secondary);
  if (colors.accent) root.style.setProperty('--accent-glow', colors.accent + '40');
  if (colors.background) root.style.setProperty('--bg', colors.background);
  if (colors.text) root.style.setProperty('--text', colors.text);
  if (colors.highlight) root.style.setProperty('--accent-soft', colors.highlight + '12');
  
  // 应用布局参数
  if (layout && layout.fontSize) {
    root.style.setProperty('--font-base', layout.fontSize + 'px');
  }
  
  console.log('[AI Theme] Applied to CSS:', colors.primary);
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

