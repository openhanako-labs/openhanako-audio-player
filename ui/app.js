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
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    let background, text;
    if (currentTheme === 'light') {
      // 亮色主题：背景应是高亮度、低饱和的封面色调
      background = this.lighten(adjustedPrimary, 0.92);
      text = '#3d3320';
    } else {
      // 暗色主题：背景应是低亮度、高饱和的封面色调
      background = brightness > 0.5 ? '#1a1a1a' : '#0a0a0a';
      text = '#e0e0e0';
    }
    
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

  /**
   * 将颜色提亮到指定亮度 (0~1)
   */
  lighten(hex, targetLightness) {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return hex;
    const factor = targetLightness / Math.max(rgb.l, 0.01);
    const r = Math.min(255, Math.round(rgb.r * factor + (1 - factor) * 255));
    const g = Math.min(255, Math.round(rgb.g * factor + (1 - factor) * 255));
    const b = Math.min(255, Math.round(rgb.b * factor + (1 - factor) * 255));
    return this.rgbToHex(r, g, b);
  }

  hexToRgb(hex) {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return null;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return { r, g, b, l };
  }

  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
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
  if (!window.aiThemeGenerator) return;
  
  // 优先使用全局变量（包含封面URL），其次回退到Stage
  const currentTrack = window._currentTrack || (window.audioStage && window.audioStage.getCurrentTrack());
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
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

  // 计算主色亮度
  const primaryHex = colors.primary || '#d49a6a';
  const primaryL = (() => {
    const m = primaryHex.match(/^#?([a-fd]{2})([a-fd]{2})([a-fd]{2})$/i);
    if (!m) return 0.5;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  })();

  // 颜色混合助手
  const mixColors = (h1, h2, ratio) => {
    const m1 = h1.match(/^#?([a-fd]{2})([a-fd]{2})([a-fd]{2})$/i);
    const m2 = h2.match(/^#?([a-fd]{2})([a-fd]{2})([a-fd]{2})$/i);
    if (!m1 || !m2) return h1;
    const r = Math.round(parseInt(m1[1],16)*(1-ratio) + parseInt(m2[1],16)*ratio);
    const g = Math.round(parseInt(m1[2],16)*(1-ratio) + parseInt(m2[2],16)*ratio);
    const b = Math.round(parseInt(m1[3],16)*(1-ratio) + parseInt(m2[3],16)*ratio);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  };

  // 1. Accent 主题色族
  if (colors.primary) {
    root.style.setProperty('--accent', colors.primary);
    root.style.setProperty('--accent-hover', colors.secondary || colors.primary);
    root.style.setProperty('--accent-glow', colors.primary + '60');
    root.style.setProperty('--accent-soft', colors.primary + '20');
  }

  // 2. 背景与表层色（保留 data-theme 明暗方向，混入少量封面色调）
  if (currentTheme === 'dark') {
    root.style.setProperty('--bg', mixColors('#161618', colors.primary || '#161618', 0.06 + primaryL * 0.04));
    root.style.setProperty('--card-bg', mixColors('#1e1e22', colors.primary || '#1e1e22', 0.08 + primaryL * 0.05));
    const dim = 0.9 - primaryL * 0.3;
    root.style.setProperty('--surface', 'rgba(255,255,255,' + (0.03 + dim*0.04).toFixed(3) + ')');
    root.style.setProperty('--surface-hover', 'rgba(255,255,255,' + (0.06 + dim*0.06).toFixed(3) + ')');
    root.style.setProperty('--surface-active', 'rgba(255,255,255,' + (0.08 + dim*0.08).toFixed(3) + ')');
    root.style.setProperty('--border', 'rgba(255,255,255,' + (0.08 + dim*0.06).toFixed(3) + ')');
    root.style.setProperty('--border-strong', 'rgba(255,255,255,' + (0.14 + dim*0.10).toFixed(3) + ')');
    root.style.setProperty('--text', '#e4e4e7');
    root.style.setProperty('--text-dim', 'rgba(255,255,255,' + (0.40 + dim*0.15).toFixed(2) + ')');
    root.style.setProperty('--text-faint', 'rgba(255,255,255,' + (0.25 + dim*0.10).toFixed(2) + ')');
  } else {
    root.style.setProperty('--bg', mixColors('#faf5eb', colors.primary || '#faf5eb', 0.04 + primaryL * 0.06));
    root.style.setProperty('--card-bg', '#ffffff');
    const dim = 0.7 + primaryL * 0.3;
    root.style.setProperty('--surface', 'rgba(0,0,0,' + (0.03 + dim*0.04).toFixed(3) + ')');
    root.style.setProperty('--surface-hover', 'rgba(0,0,0,' + (0.05 + dim*0.06).toFixed(3) + ')');
    root.style.setProperty('--surface-active', 'rgba(0,0,0,' + (0.08 + dim*0.08).toFixed(3) + ')');
    root.style.setProperty('--border', 'rgba(0,0,0,' + (0.08 + dim*0.06).toFixed(3) + ')');
    root.style.setProperty('--border-strong', 'rgba(0,0,0,' + (0.14 + dim*0.10).toFixed(3) + ')');
    root.style.setProperty('--text', '#3d3320');
    root.style.setProperty('--text-dim', 'rgba(0,0,0,' + (0.40 + dim*0.15).toFixed(2) + ')');
    root.style.setProperty('--text-faint', 'rgba(0,0,0,' + (0.25 + dim*0.10).toFixed(2) + ')');
  }

  // 3. 歌词颜色
  if (colors.primary) {
    root.style.setProperty('--lyric-color', colors.primary + '80');
    root.style.setProperty('--lyric-active-color', colors.primary);
    if (colors.accent) root.style.setProperty('--lyric-chorus-color', colors.accent);
  }

  // 4. 布局参数
  if (layout && layout.fontSize) root.style.setProperty('--font-base', layout.fontSize + 'px');

  // 5. 动效参数
  if (animation) {
    if (animation.speed) root.style.setProperty('--anim-speed', animation.speed);
    if (animation.glowIntensity !== undefined) root.style.setProperty('--anim-glow-intensity', animation.glowIntensity);
    if (animation.pulse !== undefined) root.style.setProperty('--anim-pulse', animation.pulse);
    const cover = document.getElementById('npCover');
    if (cover && animation.energy > 0.6) {
      cover.style.animation = 'breath ' + (2 / (animation.tempo || 1)) + 's ease-in-out infinite';
    }
  }

  console.log('[AI Theme] Full palette applied, primary=' + primaryHex + ' L=' + primaryL.toFixed(2));
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

(function(){
"use strict";

// ── MutationObserver: 持续对抗 parent iframe 注入的 writing-mode: vertical-lr ──
(function fixWritingMode(){
  function revert(){ document.documentElement.style.writingMode='horizontal-tb'; document.body.style.writingMode='horizontal-tb'; }
  revert();
  var ob = new MutationObserver(function(muts){
    for(var i=0;i<muts.length;i++){
      if(muts[i].target.style && muts[i].target.style.writingMode && muts[i].target.style.writingMode !== 'horizontal-tb'){
        revert(); break;
      }
    }
  });
  ob.observe(document.documentElement, { attributes:true, attributeFilter:['style'] });
  ob.observe(document.body, { attributes:true, attributeFilter:['style'] });
  // 也观察 parent 注入的 style 标签
  var styleOb = new MutationObserver(function(){
    revert();
  });
  styleOb.observe(document.head, { childList:true });
})();

const API = "/api/apps/hanako-audio-player/routes";


const TOKEN = "";
const HAS_NETEASE_COOKIE = false;
const HAS_TENCENT_COOKIE = false;
if (TOKEN) {
  const _f = window.fetch.bind(window);
  window.fetch = function(u, o) {
    o=o||{};
    // 只给本地 API 请求加 Authorization header（外部 URL 不加，避免 CORS preflight）
    if (typeof u === 'string' && (u.startsWith('/api/') || u.startsWith('/widget/') || u.indexOf('127.0.0.1:14500') !== -1)) {
      o.headers=o.headers||{};
      o.headers["Authorization"]="Bearer "+TOKEN;
    }
    return _f(u,o);
  };
}

const audio = document.getElementById('audio');
const npCover = document.getElementById('npCover');
// 封面加载失败回退
function _coverFallback(img) { img.parentElement.textContent='♫'; }
// 弹窗遮罩层
function _dialogBackdrop() {
  var bd=document.createElement('div');
  bd.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9998';
  document.body.appendChild(bd);
  return bd;
}
var trks = [], idx = 0, playing = false, playMode = 0, prevVol = 0.8, _batchLoading = false, _firstRender = true;
// playMode: 0=顺序, 1=单曲循环, 2=随机, 3=列表循环

// ── Server-side playlist sync ──
var _syncChannel = null;
var _initialSyncDone = false; // 服务器同步完成前不写回服务器

function saveTrks() {
  try { localStorage.setItem('hanako_audio_playlist', JSON.stringify(trks)); } catch(e) {}
  // 只在初始同步完成后才写服务器，避免用旧数据覆盖
  if (_initialSyncDone) {
    fetch(API+'/widget/api/playlist', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ tracks: trks })
    }).catch(function(){});
  }
}
function loadTrks() { try { var s = JSON.parse(localStorage.getItem('hanako_audio_playlist')); if(s && s.length) { trks = s; idx = 0; trks.forEach(function(t){ if(t.url) t.url = t.url.split('?token=')[0].split('&token=')[0]; }); } } catch(e) {} }
loadTrks();
// 自动去重：按裸 url（去掉 token）+ name 去重，保留首次出现的
if(trks.length) {
  var _origLen=trks.length;
  var seen={};
  trks=trks.filter(function(t){
    var bareUrl=(t.url||'').split('?')[0];
    var key=bareUrl+'|'+(t.name||'');
    if(seen[key]) return false;
    seen[key]=true; return true;
  });
  if(trks.length!==_origLen) { saveTrks(); renderPL(); showToast('已清理 '+_origLen+' → '+trks.length+' 条重复',2000); }
}

// ── 拖拽排序（pointer 事件 + 纯几何函数）──────────────────────────
// 几何与 DOM 分离：insertIndex 只吃 rects + pointerY，便于测试。
function queueDragInsertIndex(pointerY, items) {
  if (!items || !items.length) return 0;
  var insertIndex = items[0].i;
  var inside = false;
  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    if (pointerY >= it.rect.top && pointerY < it.rect.bottom) {
      insertIndex = (pointerY - it.rect.top) < ((it.rect.bottom - it.rect.top) / 2) ? it.i : it.i + 1;
      inside = true;
      break;
    }
  }
  if (!inside && pointerY >= items[items.length - 1].rect.bottom) {
    insertIndex = items[items.length - 1].i + 1;
  }
  return insertIndex;
}
function isDragAllowed() {
  try {
    var favOnly = !!document.getElementById('favFilterBtn').classList.contains('active');
    return !favOnly && (typeof currentGroup === 'undefined' || currentGroup === 'all');
  } catch (e) { return false; }
}
function handleDragStart(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!isDragAllowed()) return;
  var handle = e.currentTarget;
  var el = handle.closest('.pl-item');
  if (!el) return;
  var dragIdx = parseInt(el.dataset.i);
  if (isNaN(dragIdx)) return;
  try { if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId); } catch (_) {}
  var plBody = document.getElementById('plBody');
  var items = [];
  plBody.querySelectorAll('.pl-item').forEach(function(item) {
    items.push({ i: parseInt(item.dataset.i), rect: item.getBoundingClientRect(), el: item });
  });
  var startX = e.clientX, startY = e.clientY;
  var dragState = { moved: false, y: e.clientY };
  var indicator = document.createElement('div');
  indicator.className = 'pl-drag-indicator';
  function positionIndicator(y) {
    var insertIndex = queueDragInsertIndex(y, items);
    var nextItem = null;
    for (var k = 0; k < items.length; k++) {
      if (items[k].i === insertIndex) { nextItem = items[k].el; break; }
    }
    if (nextItem) {
      var r = nextItem.getBoundingClientRect();
      indicator.style.top = r.top + 'px';
      indicator.style.left = r.left + 'px';
      indicator.style.width = r.width + 'px';
    } else {
      var last = items[items.length - 1];
      var lr = last.rect;
      indicator.style.top = (lr.bottom - 1) + 'px';
      indicator.style.left = lr.left + 'px';
      indicator.style.width = lr.width + 'px';
    }
    indicator.style.display = 'block';
  }
  var onMove = function(ev) {
    dragState.y = ev.clientY;
    if (!dragState.moved) {
      if (Math.abs(ev.clientY - startY) < 5 && Math.abs(ev.clientX - startX) < 5) return;
      dragState.moved = true;
      window.__plJustDragged = Date.now();
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      el.classList.add('pl-dragging');
      plBody.classList.add('pl-dragging');
      document.body.appendChild(indicator);
    }
    positionIndicator(ev.clientY);
  };
  var onUp = function() {
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
    el.classList.remove('pl-dragging');
    plBody.classList.remove('pl-dragging');
    indicator.remove();
    if (!dragState.moved) return;
    var insertIndex = queueDragInsertIndex(dragState.y, items);
    var lo = Math.max(0, dragIdx);
    var hi = Math.min(insertIndex, trks.length);
    if (lo === hi) return;
    var moved = trks.splice(lo, 1)[0];
    var adjusted = hi > lo ? hi - 1 : hi;
    trks.splice(adjusted, 0, moved);
    if (idx === lo) idx = adjusted;
    else if (lo < idx && adjusted >= idx) idx--;
    else if (lo > idx && adjusted <= idx) idx++;
    renderPL();
    saveTrks();
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
}
// 为旧数据补 group 字段
if(trks.length) {
  var needsGroup=false;
  trks.forEach(function(t){ if(!t.group) { needsGroup=true; } });
  if(needsGroup) {
    trks.forEach(function(t){
      if(!t.group) {
        if(t.mode==='TTS'||t.mode==='编排') t.group='TTS/语音';
        else if(t.mode==='本地') t.group='本地音乐';
        else if(t.url && t.url.includes('ilovemusic')) t.group='电台流';
        else t.group='在线音乐';
      }
    });
    saveTrks();
  }
}
renderPL();
// 如果播放列表为空，添加测试数据
if(!trks.length) {
  trks = [
    {name:'iloveradio19 - Deep Focus', url:'https://streams.ilovemusic.de/iloveradio19.mp3', mode:'在线', dur:0, group:'电台流'},
    {name:'iloveradio16 - Ambient', url:'https://streams.ilovemusic.de/iloveradio16.mp3', mode:'在线', dur:0, group:'电台流'},
    {name:'iloveradio13 - Lo-fi Beats', url:'https://streams.ilovemusic.de/iloveradio13.mp3', mode:'在线', dur:0, group:'电台流'},
    {name:'iloveradio17 - Chillout', url:'https://streams.ilovemusic.de/iloveradio17.mp3', mode:'在线', dur:0, group:'电台流'},
    {name:'长路归航', url:'', mode:'在线', dur:0, group:'鸣潮', searchKey:'长路归航 战双帕弥什', searchServer:'netease'},
    {name:'愿 (One More Light)', url:'', mode:'在线', dur:0, group:'鸣潮', searchKey:'愿 One More Light 鸣潮', searchServer:'netease'}
  ];
  saveTrks();
}

// ── Cookie 健康检测（初始化后延迟执行）──
(function initCookieCheck(){
  // 只检测网易云，用一首常见歌做探针
  var probeId = '418608185'; // 周杰伦-晴天（网易云常见可用ID）
  setTimeout(function(){
    fetch(API+'/widget/api/music/full-url?id='+probeId+'&server=netease&fallback=')
      .then(function(r){ return r.json(); })
      .then(function(res){
        if(res.cookieExpired) {
          showToast('⚠️ 网易云登录态已失效，点击播放时会使用试听版。如需完整音频请重新导出 cookie 到 cookies.env', 6000);
        }
      }).catch(function(){});
  }, 3000);
})();

function fmt(s) {
  if (!s||!isFinite(s)) return '0:00';
  return Math.floor(s/60)+':'+Math.floor(s%60).toString().padStart(2,'0');
}

// ── 自动认领：同一首只做一次 ──
//
// 这两个变量是同一个教训的产物：
//   1. 卡片会因为构建号变化（或宿主刷新）自刷，而认领写在初始化里，
//      于是“刷一次就自动播放一次”——用户什么都没动，歌自己响了；
//   2. 播放权也得在这里取，否则投卡看上去没什么反应。
// 所以：认领动作只对“没自动播过的那一首”做一次，之后重载就只挂谱不出声。
var AUTOPLAY_KEY = "hana_audio_autoplayed";
function autoplayOnce(i) {
  var t = trks[i];
  var url = t && t.url ? t.url : "";
  var already = false;
  try { already = url && localStorage.getItem(AUTOPLAY_KEY) === url; } catch (e) {}
  if (already) {
    // 自刷 / 重开：只把曲目挂上（歌名、时长、歌词都还在），不自作主张出声。
    try {
      if (url) {
        audio.src = tok(url);
        audio.load();
      }
    } catch (e) {}
    return;
  }
  try { if (url) localStorage.setItem(AUTOPLAY_KEY, url); } catch (e) {}
  claimPlayLock();
  load(i);
}

// ── 单一播放者 ──
//
// 同一个应用会同时有多个实例活着：对话流卡、卡片中心、拆窗窗口……
// 它们各有自己的 <audio>，于是一首歌能被放好几遍（实测：几张卡 + 几个窗口，
// 声音叠在一起）。这里用同源共享的 localStorage 当“播放权”：
// 谁最后按了播放谁持有，其他实例发现自己不是持有者就暂停。
var _instId = Math.random().toString(36).slice(2) + Date.now().toString(36);
var PLAY_LOCK = "hana_audio_play_lock";
function claimPlayLock() {
  try { localStorage.setItem(PLAY_LOCK, _instId + "|" + Date.now()); } catch (e) {}
}
// “全局暂停”：用户按停时写进去，别的实例也会读到并停下来。
//
// 不加这个会出现很难解释的现象：我明明按了暂停，声音还在 ——
// 因为响的是另一个实例，而暂停只发生在本地。
var PAUSE_SENTINEL = "__paused__";
function broadcastPause() {
  try { localStorage.setItem(PLAY_LOCK, PAUSE_SENTINEL + "|" + Date.now()); } catch (e) {}
}
function _lockOwner() {
  try { return (localStorage.getItem(PLAY_LOCK) || "").split("|")[0] || ""; } catch (e) { return ""; }
}
function _globallyPaused() {
  return _lockOwner() === PAUSE_SENTINEL;
}
function _lockedByOther() {
  try {
    var parts = (localStorage.getItem(PLAY_LOCK) || "").split("|");
    return parts.length > 1 && parts[0] && parts[0] !== _instId;
  } catch (e) { return false; }
}
var yielding = false;   // 正在被动让位（不是用户按的暂停）
function _letOthersWin() {
  try {
    if (!audio || audio.paused) return;
    // 别人抢了锁，或者有人广播了“全局暂停” —— 两种都要让位
    if (_globallyPaused() || _lockedByOther()) {
      yielding = true;
      audio.pause();
      setTimeout(function () { yielding = false; }, 250);
    }
  } catch (e) {}
}
if (audio && audio.addEventListener) {
  audio.addEventListener("play", claimPlayLock);      // 播放即抢锁
  // 按停时广播出去：暂停是全局意图，不是本实例的私事。
  audio.addEventListener("pause", function () {
    if (yielding) return;      // 自己是因为让位才停的，别再广播一遍（否则互相叫停）
    if (audio.ended) return;   // 自然放完也不算“用户叫停”
    broadcastPause();
  });
  window.addEventListener("storage", function (e) {   // 别人动锁就重新判断
    if (e.key === PLAY_LOCK) _letOthersWin();
  });
  setInterval(_letOthersWin, 1200);                   // storage 事件不一定来，兵底轮询
}

// ── 实例徽章 ──
//
// 一摧长得一样的播放器窗口摆着时，谁在响看不出来（用户为此两次问到
// “不知道关哪个”）。这个徽章给出两个事实：我是谁（短码），以及此刻
// 是不是我在出声（亮点 + 主题色）。一眼就能认出该留哪个。
(function instanceBadge() {
  var host = document.querySelector(".header-actions");
  if (!host || !_instId) return;
  var el = document.createElement("div");
  el.className = "inst-badge";
  el.id = "instBadge";
  el.innerHTML = '<span class="inst-dot"></span><span class="inst-code"></span>';
  host.insertBefore(el, host.firstChild);
  var codeEl = el.querySelector(".inst-code");
  codeEl.textContent = String(_instId).slice(0, 4).toUpperCase();
  function render() {
    try {
      var live = audio && !audio.paused && !_lockedByOther() && !_globallyPaused();
      el.classList.toggle("live", !!live);
      el.title = (live ? "这个实例正在出声" : "这个实例没有出声") +
        "（" + String(_instId).slice(0, 6) + "）";
    } catch (e) {}
  }
  setInterval(render, 900);
  render();
})();

// ── 紧凑壳启动兜底：认领“刚投进来的那一首”──
//
// 工具投卡只往列表里追加，从来没有告诉过卡片“该播哪一首”
// （v1 时代靠 route 上的 url 参数带过去，v2 把这步丢了）。
// 结果：卡片出现在对话里，却停在“准备就绪”、歌名还是占位符，像坏了。
//
// 这里兜底：等列表就绪后取最后一条（就是刚追加的那首）走一次 load()。
// audio.play() 仍会被 autoplay 策略拦住 —— 那是平台的事，但至少
// 歌名/时长/进度都对，用户知道接下来该点什么。
(function claimLatestForCompact() {
  if (!(window.__hanaGetView && window.__hanaGetView() === "compact")) return;
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    try {
      if (playing) { clearInterval(t); return; }
      // 等一次服务器同步再认领 —— 否则认到的可能是本地列表里
      // 随便哪一首的最后一条，而不是刚投进来的那首。
      // 但也不无限等：6 秒后就用手头这份。
      if ((_initialSyncDone || tries > 12) && trks.length) {
        clearInterval(t);
        // 卡片刚出现在对话里 = 用户要听这首。所以这里主动取一次播放权，
        // 而不是把机会让给别的实例 —— 否则投卡看上去像没反应。
        // （保证同一时刻仍然只有一个实例出声，由锁来管。）
        claimPlayLock();
        autoplayOnce(trks.length - 1);
        return;
      }
    } catch (e) {}
    if (tries > 20) clearInterval(t); // 约 10 秒还没列表就不管了
  }, 500);
})();

function load(i) {
  if (i<0||i>=trks.length) {
    document.getElementById('trackName').textContent='播放器';
    document.getElementById('trackMode').textContent='准备就绪';
    npCover.innerHTML='♫';
    npCover.classList.remove('spinning');
    updateFavBtn();
    if (window.audioEventBus) window.audioEventBus.emit('audio:ended', 'music', { reason: 'stop' });
    return;
  }
  idx=i; const t=trks[i];
  document.getElementById('trackName').textContent=t.name;
  document.getElementById('trackMode').textContent=t.mode||'';
  window._currentTrack = { title: t.name, artist: t.mode, cover: t.pic, lrcUrl: t.lrcUrl, source: 'music' };
  // 更新当前封面 URL，供封面皮肤模式使用
  // 用代理后的同源地址，避免跨源污染画布
  window.__currentCoverUrl = t.pic ? '/widget/api/music/pic?url=' + encodeURIComponent(t.pic) : null;
  // 如果是封面皮肤模式，重新应用背景
  try {
    var currentPreset = localStorage.getItem('hana_audio_theme_preset');
    if (currentPreset === 'cover' && typeof window.applyThemePreset === 'function') {
      window.applyThemePreset('cover');
    }
  } catch(e) {}
  if (window.audioEventBus) {
    window.audioEventBus.setTrack(t.name, t.name);
    window.audioEventBus.emit('audio:loaded', 'music', { duration: t.dur || 0, src: t.url });
    window.audioEventBus.emit('audio:play', 'music', { currentTime: 0, duration: t.dur || 0 });
  }
  // 封面更新
  if (t.pic) {
    npCover.innerHTML = '<img src="'+esc(t.pic)+'" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;" onerror="_coverFallback(this)">';
  } else {
    npCover.innerHTML = '♫';
  }
  updateFavBtn();
  if(t.url) {
    audio.src = tok(t.url);
    audio.load();
    // 别处正在放就只挂曲目、不出声。这条区分很重要：
    //   抢播放权  —— 会让两张卡叠着重放，不该抢
    //   显示曲目  —— 歌名 / 时长 / 歌词都靠它，不显示的话卡就像坏了
    // 上一版把两件事写在一起，结果新卡停在“准备就绪”、横幅也一并没了。
    if (_lockedByOther()) {
      showToast("已在别处播放，这里只显示", 2000);
    } else {
      audio.play().catch(function (e) {
        if (e && e.name === "NotAllowedError") {
          // 宿主没给卡片 autoplay 授权（实测已知），这不是故障，是既定事实。
          showToast("点一下播放键开始", 2200);
        } else if (e && e.name !== "AbortError") {
          console.warn(e);
        }
      });
    }
  }
  // 歌词自动搜索：有 URL 但没有 LRC URL 时自动搜索歌词
  if(t.url && !t.lrcUrl && t.name) {
    var sv = t.searchServer || 'netease';
    fetch(API+'/widget/api/music/search?keyword='+encodeURIComponent(t.name)+'&server='+sv, {signal:AbortSignal.timeout(8000)})
      .then(function(r){return r.json();})
      .then(function(res){
        if(res.ok && res.results && res.results.length) {
          for(var j=0;j<res.results.length;j++){
            if(res.results[j].lrc) {
              t.lrcUrl=res.results[j].lrc;
              saveTrks();
              // 歌词落盘：拉到原文后写入离线歌词库
              (function(name, url){
                fetch(API+'/widget/api/music/lrc-proxy?url='+encodeURIComponent(url)).then(function(r){return r.text();}).then(function(raw){
                  if(raw && raw.length>=10){
                    fetch(API+'/widget/api/lrc/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,lrc:raw})}).catch(function(){});
                  }
                }).catch(function(){});
              })(t.name, t.lrcUrl);
              break;
            }
          }
        }
      }).catch(function(){});
  }
  else if(t.searchKey) {
    // 无 URL 但有搜索关键词 → 自动搜索完整音频
    showToast('搜索 '+t.name+'…', 1500);
    var sv = t.searchServer || 'netease';
    var _fallbackServers = ['netease','tencent','kugou','kuwo','baidu'].filter(function(s){return s!==sv;});
    function _trySearch(server) {
      return fetch(API+'/widget/api/music/search?keyword='+encodeURIComponent(t.searchKey)+'&server='+server, {signal:AbortSignal.timeout(8000)})
        .then(function(r){return r.json();})
        .then(function(res){
          if(res.ok && res.results && res.results.length) {
            // 找第一个有 url 的结果
            for(var j=0;j<res.results.length;j++){
              if(res.results[j].url) return res.results[j];
            }
          }
          return null;
        });
    }
    _trySearch(sv).then(function(hit){
      if(hit) return hit;
      // 主源没找到，逐个尝试备用源
      var chain = Promise.resolve(null);
      _fallbackServers.forEach(function(fs){
        chain = chain.then(function(r){ if(r) return r; return _trySearch(fs).catch(function(){return null;}); });
      });
      return chain;
    }).then(function(hit){
      if(!hit || !hit.url) { showToast('所有源均未找到: '+t.name, 2500); return; }
      t.name = hit.title || t.name;
      t.lrcUrl = hit.lrc || '';
      t.url = hit.url;
      if(hit.pic) {
        t.pic = hit.pic;
        npCover.innerHTML = '<img src="'+esc(t.pic)+'" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;" onerror="_coverFallback(this)">';
      }
      document.getElementById('trackName').textContent=t.name;
      saveTrks();
      audio.src = t.url;
      audio.load();
      audio.play().catch(function(e){ if(e.name!=='AbortError') console.warn(e); });
    }).catch(function(e){ showToast(e.name==='TimeoutError'?'搜索超时: '+t.name:'搜索失败: '+t.name, 2500); });
  }
  npCover.classList.add('spinning');
  tryReadMetadata(audio, t);
  renderPL();
}

function toggle() {
  if (!trks.length) return;
  if (audio.paused) { audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)}); playing=true; npCover.classList.add('spinning'); if (window.audioEventBus) window.audioEventBus.emit('audio:play', 'music', { currentTime: audio.currentTime, duration: audio.duration }); }
  else { audio.pause(); playing=false; npCover.classList.remove('spinning'); if (window.audioEventBus) window.audioEventBus.emit('audio:pause', 'music', { currentTime: audio.currentTime }); }
  document.getElementById('playIcon').style.display=playing?'none':'block';
  document.getElementById('pauseIcon').style.display=playing?'block':'none';
}

function next() {
  if (!trks.length) return;
  var n;
  if (playMode===1) n=idx; // 单曲循环
  else if (playMode===2) n=Math.floor(Math.random()*trks.length); // 随机
  else n=(idx+1)%trks.length; // 顺序 & 列表循环 → 自动续播
  load(n);
  // 只有 URL 存在时才同步播放；searchKey 类型由 load() 内部异步搜索后自动播放
  if (trks[n] && trks[n].url) {
    audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});
  }
}
function prev() {
  if (!trks.length) return;
  if (audio.currentTime>3) { audio.currentTime=0; return; }
  const n = (playMode===2) ? Math.floor(Math.random()*trks.length) : (idx-1+trks.length)%trks.length;
  load(n);
  if (trks[n] && trks[n].url) {
    audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});
  }
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem('hanako_audio_favs'))||[]; } catch(e) { return []; }
}
function isFav(url) {
  return getFavorites().indexOf(url) !== -1;
}
function toggleFav(url) {
  var favs = getFavorites();
  var pos = favs.indexOf(url);
  if (pos === -1) favs.push(url); else favs.splice(pos,1);
  try { localStorage.setItem('hanako_audio_favs', JSON.stringify(favs)); } catch(e) {}
}

function renderPL() {
  document.getElementById('plCount').textContent=trks.length;
  if (!trks.length) { document.getElementById('plBody').innerHTML='<div class="pl-empty">暂无曲目，添加 URL 或点击电台开始</div>'; return; }
  var favOnly = document.getElementById('favFilterBtn').classList.contains('active');
  var filtered = trks.map(function(t,i){return {t:t,i:i};}).filter(function(item){
    return !favOnly || isFav(item.t.url);
  });
  if (!filtered.length && favOnly) {
    document.getElementById('plBody').innerHTML='<div class="pl-empty">没有收藏的曲目</div>';
    return;
  }

  // 按分组聚集
  var groups=[];
  var groupMap={};
  filtered.forEach(function(item){
    var g=item.t.group||'默认';
    if(!groupMap[g]){ groupMap[g]={label:g,items:[]}; groups.push(g); }
    groupMap[g].items.push(item);
  });
  // 收藏的排前面
  Object.keys(groupMap).forEach(function(g){
    groupMap[g].items.sort(function(a,b){
      var fa=isFav(a.t.url)?1:0, fb=isFav(b.t.url)?1:0;
      if(fa!==fb) return fb-fa;
      return a.i-b.i;
    });
  });

  var html='';
  groups.forEach(function(glabel){
    var g=groupMap[glabel];
      html+='<div class="pl-group-header" data-group="'+esc(glabel)+'">'
        +'<svg class="pl-chevron" viewBox="0 0 24 24" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>'
        +'<span class="pl-group-name">'+esc(glabel)+'</span>'
        +'<span class="pl-group-count">'+g.items.length+'</span>'
        +'</div>';
    html+='<div class="pl-group-body" data-group="'+esc(glabel)+'">';
    g.items.forEach(function(item,n){
      var t=item.t, i=item.i;
      var a=i===idx;
      var star=isFav(t.url);
      html+='<div class="pl-item'+(a?' active':'')+'" data-i="'+i+'" data-drag-enabled="'+isDragAllowed()+'">'
        +'<span class="pl-handle" title="拖动排序">⋮⋮</span>'
        +'<span class="pl-status">'+(a?'♫':(n+1))+'</span>'
        +'<span class="pl-name">'+esc(t.name)+(t.url?'':' <span style="color:var(--text-faint);font-size:9px">(未找到)</span>')+'</span>'
        +(t.searchKey&&!t.url?'<button class="pl-retry" data-retry="'+i+'" title="重新搜索">⟳</button>':'')
        +'<button class="pl-star'+(star?' starred':'')+'" data-star="'+i+'" title="收藏">'+(star?'★':'☆')+'</button>'
        +'<span class="pl-dur">'+fmt(t.dur||0)+'</span>'
        +'<button class="pl-rm" data-rm="'+i+'" title="移除">✕</button></div>';
    });
    html+='</div>';
  });

  // 保存折叠态和滚动位置
  var plBody=document.getElementById('plBody');
  var collapsedGroups={};
  plBody.querySelectorAll('.pl-group-header.collapsed').forEach(function(el){
    collapsedGroups[el.dataset.group]=true;
  });
  // 首次渲染：默认折叠所有分组
  if(_firstRender){
    groups.forEach(function(g){ collapsedGroups[g]=true; });
    _firstRender=false;
  }
  var savedScrollTop=plBody.scrollTop;

  plBody.innerHTML=html;

  // 恢复折叠态
  plBody.querySelectorAll('.pl-group-header').forEach(function(el){
    if(collapsedGroups[el.dataset.group]){
      el.classList.add('collapsed');
      var body=el.nextElementSibling;
      if(body) body.classList.add('collapsed');
    }
  });
  // 恢复滚动位置
  plBody.scrollTop=savedScrollTop;
  // 当前播放曲目滚动到可见位置（仅在不可见时滚动）
  var activeItem=plBody.querySelector('.pl-item.active');
  if(activeItem){
    var itemRect=activeItem.getBoundingClientRect();
    var bodyRect=plBody.getBoundingClientRect();
    if(itemRect.top<bodyRect.top||itemRect.bottom>bodyRect.bottom){
      activeItem.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  }

  // 分组折叠逻辑
  plBody.querySelectorAll('.pl-group-header').forEach(function(el){
    el.addEventListener('click',function(){
      var body=el.nextElementSibling;
      if(!body) return;
      body.classList.toggle('collapsed');
      el.classList.toggle('collapsed',body.classList.contains('collapsed'));
    });
    // 双击组名可重命名（内联输入框，不用 prompt）
    el.addEventListener('dblclick',function(e){
      e.preventDefault(); e.stopPropagation();
      var oldName=el.dataset.group;
      // 创建内联输入框
      var inputWrap=document.createElement('div');
      var _rnBd=_dialogBackdrop();
      inputWrap.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--card-bg);border:1px solid var(--accent);border-radius:10px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:300px';
      inputWrap.innerHTML='<div style="color:var(--text);font-size:13px;margin-bottom:10px">重命名分组：</div>'
        +'<input type="text" value="'+esc(oldName)+'" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;outline:none" />'
        +'<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
        +'<button class="rn-cancel" style="padding:6px 16px;border-radius:6px;border:none;background:var(--surface-hover);color:var(--text);cursor:pointer;font-size:13px">取消</button>'
        +'<button class="rn-ok" style="padding:6px 16px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;font-weight:600">确定</button>'
        +'</div>';
      document.body.appendChild(inputWrap);
      var inp=inputWrap.querySelector('input');
      inp.focus(); inp.select();
      function close(){ _rnBd.remove(); inputWrap.remove(); }
      function commit(){
        var newName=inp.value.trim();
        if(!newName||newName===oldName){ close(); return; }
        var items=el.nextElementSibling;
        if(items){ items.querySelectorAll('.pl-item').forEach(function(itemEl){
          var i=parseInt(itemEl.dataset.i);
          if(trks[i]) trks[i].group=newName;
        });}
        saveTrks(); renderPL();
        close();
      }
      inputWrap.querySelector('.rn-ok').addEventListener('click',commit);
      inputWrap.querySelector('.rn-cancel').addEventListener('click',close);
      inp.addEventListener('keydown',function(ev){ if(ev.key==='Enter') commit(); if(ev.key==='Escape') close(); });
    });
  });
  // 条目右键菜单：移动到其他分组
  document.getElementById('plBody').querySelectorAll('.pl-item').forEach(function(el){
    el.addEventListener('contextmenu',function(e){
      e.preventDefault();
      var i=parseInt(el.dataset.i);
      if(isNaN(i)||!trks[i]) return;
      var curGroup=trks[i].group||'默认';
      var allGroups=trks.map(function(t){return t.group||'默认';}).filter(function(v,k,a){return a.indexOf(v)===k;});
      // 加一个“新建分组”选项
      var opts=allGroups.filter(function(g){return g!==curGroup;}).map(function(g){return g;});
      var menu=document.createElement('div');
      menu.className='pl-ctx-menu';
      menu.innerHTML='<div class="pl-ctx-title">移动到…</div>'
        +opts.map(function(g){return '<div class="pl-ctx-opt" data-g="'+esc(g)+'">'+esc(g)+'</div>';}).join('')
        +'<div class="pl-ctx-opt" data-g="__new__">新建分组…</div>';
      el.style.position='relative';
      el.appendChild(menu);
      menu.addEventListener('click',function(ev){
        var opt=ev.target.closest('[data-g]'); if(!opt) return;
        var g=opt.dataset.g;
        if(g==='__new__'){
          menu.remove();
          // 内联输入框替代 prompt
          var inputWrap=document.createElement('div');
          var _ngBd=_dialogBackdrop();
          inputWrap.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--card-bg);border:1px solid var(--accent);border-radius:10px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:300px';
          inputWrap.innerHTML='<div style="color:var(--text);font-size:13px;margin-bottom:10px">新分组名：</div>'
            +'<input type="text" placeholder="输入分组名称" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;outline:none" />'
            +'<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
            +'<button class="ng-cancel" style="padding:6px 16px;border-radius:6px;border:none;background:var(--surface-hover);color:var(--text);cursor:pointer;font-size:13px">取消</button>'
            +'<button class="ng-ok" style="padding:6px 16px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;font-weight:600">确定</button>'
            +'</div>';
          document.body.appendChild(inputWrap);
          var inp=inputWrap.querySelector('input');
          inp.focus();
          function close2(){ _ngBd.remove(); inputWrap.remove(); }
          function commit2(){
            var newG=inp.value.trim();
            if(!newG){ close2(); return; }
            trks[i].group=newG;
            saveTrks(); renderPL();
            close2();
          }
          inputWrap.querySelector('.ng-ok').addEventListener('click',commit2);
          inputWrap.querySelector('.ng-cancel').addEventListener('click',close2);
          inp.addEventListener('keydown',function(ev){ if(ev.key==='Enter') commit2(); if(ev.key==='Escape') close2(); });
          return;
        }
        trks[i].group=g;
        saveTrks(); renderPL();
        menu.remove();
      });
      setTimeout(function(){document.addEventListener('click',function cls(){menu.remove();document.removeEventListener('click',cls);});},0);
    });
  });
  document.getElementById('plBody').querySelectorAll('.pl-item').forEach(function(el){
    el.addEventListener('click',function(e){
      if(e.target.closest('.pl-rm')||e.target.closest('.pl-star')||e.target.closest('.pl-handle')||e.target.closest('.pl-retry'))return;
      if(window.__plJustDragged && (Date.now() - window.__plJustDragged) < 300) { window.__plJustDragged = 0; return; }
      const i=parseInt(this.dataset.i);
      if(i===idx){toggle();return;}
      load(i);
      if(trks[i] && trks[i].url){audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});}
    });
  });
  document.getElementById('plBody').querySelectorAll('.pl-rm').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      const i=parseInt(this.dataset.rm);
      trks.splice(i,1);
      if(i<=idx)idx=Math.max(0,idx-1);
      if(idx>=trks.length)idx=trks.length-1;
      if(trks.length)load(idx);else load(-1);
      renderPL();
      saveTrks();
    });
  });
  document.getElementById('plBody').querySelectorAll('.pl-star').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      const i=parseInt(this.dataset.star);
      toggleFav(trks[i].url);
      renderPL();
    });
  });
  // ── 重试搜索 ──
  document.getElementById('plBody').querySelectorAll('.pl-retry').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      const i=parseInt(this.dataset.retry);
      if(trks[i]) load(i);
    });
  });
  // ── 拖拽排序（pointer 事件，见 handleDragStart 定义在文件前部）──
  document.getElementById('plBody').querySelectorAll('.pl-handle').forEach(function(h){
    h.addEventListener('pointerdown', handleDragStart);
  });
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function showToast(msg,dur) {
  dur = dur || 2500;
  var c = document.getElementById('toastContainer');
  if (!c) return;
  var t = document.createElement('div');
  t.className = 'toast-item';
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(function() { t.classList.add('show'); });
  setTimeout(function() {
    t.classList.remove('show');
    setTimeout(function() { t.remove(); }, 300);
  }, dur);
}

function showGroupPicker(cb) {
  // 收集现有分组
  var existingGroups=[]; var seen={};
  trks.forEach(function(t){ var g=t.group||'默认'; if(!seen[g]){seen[g]=true; existingGroups.push(g);} });
  var wrap=document.createElement('div');
  var _gpBd=_dialogBackdrop();
  wrap.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--card-bg);border:1px solid var(--accent);border-radius:10px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:320px';
  var selectHtml = existingGroups.length
    ? '<select id="gpSelect" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;outline:none;margin-bottom:10px"><option value="">— 选取已有分组 —</option>' + existingGroups.map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join('') + '</select>'
    : '';
  wrap.innerHTML='<div style="color:var(--text);font-size:13px;margin-bottom:10px">选择分组：</div>'
    + selectHtml
    + '<input type="text" id="gpInput" placeholder="输入新分组名（或从上方选取）" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;outline:none" />'
    + '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
    + '<button class="gp-cancel" style="padding:6px 16px;border-radius:6px;border:none;background:var(--surface-hover);color:var(--text);cursor:pointer;font-size:13px">取消</button>'
    + '<button class="gp-ok" style="padding:6px 16px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;font-weight:600">确定</button>'
    + '</div>';
  document.body.appendChild(wrap);
  var inp=wrap.querySelector('#gpInput');
  var sel=wrap.querySelector('#gpSelect');
  inp.focus();
  function close(){ _gpBd.remove(); wrap.remove(); }
  function commit(){
    var groupName = inp.value.trim();
    if(!groupName && sel && sel.value) groupName = sel.value;
    close(); cb(groupName || null);
  }
  if(sel) sel.addEventListener('change', function(){ inp.value = sel.value; });
  wrap.querySelector('.gp-ok').addEventListener('click', commit);
  wrap.querySelector('.gp-cancel').addEventListener('click', function(){ close(); cb(null); });
  inp.addEventListener('keydown', function(ev){ if(ev.key==='Enter') commit(); if(ev.key==='Escape'){ close(); cb(null); } });
}

// ── Events ──
document.getElementById('playBtn').addEventListener('click',toggle);
document.getElementById('nextBtn').addEventListener('click',next);
document.getElementById('prevBtn').addEventListener('click',prev);
document.getElementById('volumeSlider').addEventListener('input',function(e){audio.volume=e.target.value/100;});
document.getElementById('volumeBtn').addEventListener('click',function(){
  if(audio.volume>0){prevVol=audio.volume;audio.volume=0;document.getElementById('volIcon').style.opacity=0.3;}
  else{audio.volume=prevVol;document.getElementById('volumeSlider').value=prevVol*100;document.getElementById('volIcon').style.opacity=1;}
});

// ── Play Mode ──
var MODE_ICONS=[
  // 0 顺序: 右箭头 + 竖线
  '<line x1="5" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2"/><polygon points="8 12 18 5 18 19" fill="currentColor"/>',
  // 1 单曲循环: 1 + 循环
  '<text x="8" y="16" font-size="10" fill="currentColor" font-weight="bold">1</text><path d="M17 4l3 3-3 3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M7 20l-3-3 3-3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M20 7v4a4 4 0 0 1-4 4H7" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M4 17v-4a4 4 0 0 1 4-4h9" stroke="currentColor" fill="none" stroke-width="1.5"/>',
  // 2 随机: 交叉箭头
  '<path d="M16 3h5v5" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M4 20L21 3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M21 16v5h-5" stroke="currentColor" fill="none" stroke-width="1.5"/>',
  // 3 列表循环: 循环箭头
  '<path d="M17 4l3 3-3 3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M7 20l-3-3 3-3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M20 7v4a4 4 0 0 1-4 4H7" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M4 17v-4a4 4 0 0 1 4-4h9" stroke="currentColor" fill="none" stroke-width="1.5"/>'
];
var MODE_TITLES=['顺序播放','单曲循环','随机播放','列表循环'];
function updateModeIcon(){
  document.getElementById('modeIcon').innerHTML=MODE_ICONS[playMode];
  document.getElementById('modeBtn').title=MODE_TITLES[playMode];
  document.getElementById('modeBtn').style.color=playMode===0?'var(--text-dim)':'var(--accent)';
}
try{var _savedMode=JSON.parse(localStorage.getItem('hanako_audio_mode'));if(typeof _savedMode==='number'&&_savedMode>=0&&_savedMode<=3)playMode=_savedMode;}catch(e){}
updateModeIcon();
document.getElementById('modeBtn').addEventListener('click',function(){
  playMode=(playMode+1)%4;
  localStorage.setItem('hanako_audio_mode',JSON.stringify(playMode));
  updateModeIcon();
  showToast(MODE_TITLES[playMode], 1200);
});
document.getElementById('progressBar').addEventListener('click',function(e){
  const r=this.getBoundingClientRect();
  const p=(e.clientX-r.left)/r.width;
  if(audio.duration)audio.currentTime=p*audio.duration;
});
document.addEventListener('keydown',function(e){
  if(e.code==='Space'&&e.target.tagName!=='INPUT'){e.preventDefault();toggle();}
});
document.getElementById('plToggle').addEventListener('click',function(){
  this.classList.toggle('open');
  document.getElementById('plBody').classList.toggle('open');
});
// ── 封面下方三个按钮 ──
function updateFavBtn() {
  var btn = document.getElementById('favBtn');
  if (!btn) return;
  if (!trks.length || !trks[idx] || !trks[idx].url) { btn.style.color=''; btn.querySelector('svg').setAttribute('fill','none'); return; }
  var fav = isFav(trks[idx].url);
  btn.style.color = fav ? 'var(--accent)' : '';
  btn.querySelector('svg').setAttribute('fill', fav ? 'currentColor' : 'none');
}
document.getElementById('favBtn').addEventListener('click', function() {
  if (!trks.length || !trks[idx]) { showToast('没有在播放的曲目', 1500); return; }
  var url = trks[idx].url;
  if (!url) { showToast('当前曲目无 URL', 1500); return; }
  toggleFav(url);
  updateFavBtn();
  showToast(isFav(url) ? '已收藏' : '已取消收藏', 1200);
  renderPL();
});
document.getElementById('addBtn2').addEventListener('click', function() {
  var searchTab = document.querySelector('.nav-tab[data-tab="search"]');
  if (searchTab) searchTab.click();
  setTimeout(function() { var input = document.getElementById('musicInput'); if (input) input.focus(); }, 100);
});
document.getElementById('moreBtn').addEventListener('click', function() {
  if (!trks.length || !trks[idx]) { showToast('没有在播放的曲目', 1500); return; }
  var t = trks[idx];
  if (t.url && navigator.clipboard) {
    navigator.clipboard.writeText(t.url).then(function() { showToast('已复制链接: ' + t.name, 1500); }).catch(function() { showToast(t.name, 2000); });
  } else { showToast(t.name, 2000); }
});
document.getElementById('addBtn').addEventListener('click',function(){
  const v=document.getElementById('urlInput').value.trim();
  if(!v)return;
  // 检测是否是本地文件夹路径（盘符开头，如 W:...）
  if(v.length>=3 && v[1]===':' && (v.charCodeAt(2)===92 || v.charCodeAt(2)===47)){
    // 判断是文件还是文件夹
    const lastPart = v.split(/[\/]/).pop();
    const hasExt = lastPart && /.[a-zA-Z0-9]{1,5}$/.test(lastPart);
    if(hasExt){
      // 单个文件路径
      showToast('导入文件…',1500);
      fetch(API+'/widget/api/import-file?path='+encodeURIComponent(v)).then(function(r){return r.json();}).then(function(d){
        if(!d.ok){ showToast(d.error||'导入失败',2000); return; }
        showGroupPicker(function(groupName){
          if(!groupName) return;
          addTrack(d.name,d.url,d.mode,groupName);
          renderPL(); saveTrks();
          showToast('已添加到分组「'+groupName+'」',2500);
        });
      }).catch(function(){ showToast('导入失败',2000); });
    } else {
      // 文件夹路径
      showToast('扫描文件夹…',1500);
      fetch(API+'/widget/api/scan-folder?path='+encodeURIComponent(v)).then(function(r){return r.json();}).then(function(d){
        if(!d.ok||!d.files||!d.files.length){ showToast('未找到音频文件',2000); return; }
        showGroupPicker(function(groupName){
          if(!groupName) return;
          _batchLoading=true;
          d.files.forEach(function(f){ addTrack(f.name,f.url,f.mode,groupName); });
          _batchLoading=false;
          renderPL(); saveTrks();
          showToast('已添加 '+d.count+' 首到分组「'+groupName+'」',2500);
        });
      }).catch(function(){ showToast('扫描失败',2000); });
    }
    document.getElementById('urlInput').value='';
    return;
  }
  addTrack(null,v);
  document.getElementById('urlInput').value='';
});
document.getElementById('urlInput').addEventListener('keydown',function(e){
  if(e.key==='Enter')document.getElementById('addBtn').click();
});

document.getElementById('popBtn').addEventListener('click',function(){
  // 使用当前页面同源 URL，避免硬编码端口
  var baseUrl = window.location.protocol + '//' + window.location.host;
  var url = baseUrl + API + '/widget?standalone=1&token=' + encodeURIComponent(TOKEN);
  window.open(url, 'hanako-player', 'width=800,height=600');
});

audio.addEventListener('timeupdate',function(){
  document.getElementById('currentTime').textContent=fmt(audio.currentTime);
  if(audio.duration){
    document.getElementById('totalTime').textContent=fmt(audio.duration);
    document.getElementById('progressFill').style.width=(audio.currentTime/audio.duration*100)+'%';
    if(trks[idx])trks[idx].dur=audio.duration;
  }
});
audio.addEventListener('loadedmetadata',function(){
  document.getElementById('totalTime').textContent=fmt(audio.duration);
  if(trks[idx])trks[idx].dur=audio.duration;
  renderPL();
});
audio.addEventListener('ended',function(){ if (window.audioEventBus) window.audioEventBus.emit('audio:ended', 'music', { reason: 'completed' }); next(); });
audio.addEventListener('error',function(){
  if(trks[idx] && trks[idx].url){
    var t=trks[idx];
    // Meting URL 失败 → 尝试用 searchKey 重新搜索
    if(t.searchKey){
      showToast('播放失败，重新搜索…',1500);
      t.url=''; // 清空旧 URL，触发 searchKey 路径
      load(idx);
    } else {
      showToast('播放失败: '+t.name,2000);
    }
  }
});
audio.addEventListener('play',function(){playing=true;npCover.classList.add('spinning');document.getElementById('playIcon').style.display='none';document.getElementById('pauseIcon').style.display='block';});
audio.addEventListener('pause',function(){playing=false;npCover.classList.remove('spinning');document.getElementById('playIcon').style.display='block';document.getElementById('pauseIcon').style.display='none';});

function addTrack(name,url,mode,group,lrcUrl,pic) {
  // 去重：url 非空时按裸 url（去掉 query）匹配，url 为空时按 name 匹配
  var bareUrl = url ? url.split('?')[0] : '';
  for(let i=0;i<trks.length;i++){
    if(url){
      var existBare=trks[i].url?trks[i].url.split('?')[0]:'';
      if(existBare===bareUrl){
        // 命中已有条目 → 用新 URL 替换旧的（auth 参数可能已过期）
        trks[i].url = url;
        if(name) trks[i].name = name;
        if(lrcUrl) trks[i].lrcUrl = lrcUrl;
        if(pic) trks[i].pic = pic;
        load(i);
        if(audio.paused){audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});}
        saveTrks();
        renderPL();
        return;
      }
    }
    if(!url && trks[i].name===name && !trks[i].url){return;}
  }
  // 自动分组：未指定时按 mode 推断
  if(!group) {
    if(mode==='TTS'||mode==='编排') group='TTS/语音';
    else if(mode==='本地') group='本地音乐';
    else if(url && url.includes('ilovemusic')) group='电台流';
    else group='在线音乐';
  }
  // 存 lrc 映射
  if(lrcUrl && url) lrcMap[url]=lrcUrl;
  trks.push({name:name||url.split('/').pop().split('\\').pop().split('?')[0]||'音频',url:url,mode:mode||(url.startsWith('http')?'在线':'本地'),dur:0,group:group,lrcUrl:lrcUrl||'',pic:pic||''});
  if(!_batchLoading){ load(trks.length-1); if(trks[trks.length-1] && trks[trks.length-1].url){audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});} renderPL(); saveTrks(); }
}

function tok(url) {
  if (!TOKEN) return url;
  if (url.startsWith('/api/') || url.startsWith('/widget/')) {
    // Strip existing token params to prevent accumulation
    url = url.replace(/([?&])token=[^&]*/g, '');
    url = url.replace(/[?&]$/, '');
    return url + (url.indexOf('?') > -1 ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
  }
  return url;
}
function stripTok(url) {
  return (url || '').replace(/([?&])token=[^&]*/g, '').replace(/[?&]$/, '');
}

// ── 本地音乐导入 ──
document.getElementById('localImportBtn').addEventListener('click', function() {
  const path = document.getElementById('localPathInput').value.trim();
  if (!path) return;
  
  // 判断是文件还是文件夹
  const lastPart = path.split(/[\/]/).pop();
  const hasExt = lastPart && /.[a-zA-Z0-9]{1,5}$/.test(lastPart);
  
  if (hasExt) {
    // 单个文件路径
    showToast('导入文件…', 1500);
    fetch(API+'/widget/api/import-file?path='+encodeURIComponent(path))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.ok) { showToast(d.error || '导入失败', 2000); return; }
        addTrack(d.name, d.url, d.mode);
        showToast('已添加: '+d.name, 2000);
      })
      .catch(function() { showToast('导入失败', 2000); });
  } else {
    // 文件夹路径
    showToast('扫描文件夹…', 1500);
    fetch(API+'/widget/api/scan-folder?path='+encodeURIComponent(path))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.ok || !d.files || !d.files.length) { showToast('未找到音频文件', 2000); return; }
        _batchLoading = true;
        d.files.forEach(function(f) { addTrack(f.name, f.url, f.mode); });
        _batchLoading = false;
        renderPL(); saveTrks();
        showToast('已添加 '+d.count+' 首', 2500);
      })
      .catch(function() { showToast('扫描失败', 2000); });
  }
  document.getElementById('localPathInput').value = '';
});

// ── 文件选择器（浏览按钮）──
var _filePicker = document.getElementById('localFilePicker');
function _browseLocal() { if (_filePicker) _filePicker.click(); }
var _browseBtn1 = document.getElementById('localBrowseBtn');
if (_browseBtn1) _browseBtn1.addEventListener('click', _browseLocal);
document.querySelectorAll('.local-browse-btn').forEach(function(btn) {
  btn.addEventListener('click', _browseLocal);
});
if (_filePicker) {
  _filePicker.addEventListener('change', function(e) {
    var files = e.target.files;
    if (!files || !files.length) return;
    // 尝试获取完整路径 (Electron 环境)
    var firstPath = files[0].path || '';
    if (!firstPath) {
      // file.path 不可用 -> 用 blob URL 直接添加
      _batchLoading = true;
      for (var bi = 0; bi < files.length; bi++) {
        var blobUrl = URL.createObjectURL(files[bi]);
        var fname = files[bi].name.replace(/.[^.]+$/, '');
        addTrack(fname, blobUrl, '本地');
      }
      _batchLoading = false;
      renderPL(); saveTrks();
      showToast('已添加 ' + files.length + ' 首', 1500);
      e.target.value = '';
      return;
    }
    if (files.length === 1) {
      var activePane = document.querySelector('.tab-pane.active');
      var pathInput = activePane ? activePane.querySelector('.local-input') : document.getElementById('localPathInput');
      if (pathInput) {
        pathInput.value = firstPath;
        var importBtn = activePane ? activePane.querySelector('.local-btn:not(.local-browse-btn)') : document.getElementById('localImportBtn');
        if (importBtn) importBtn.click();
      }
    } else {
      showToast('导入 ' + files.length + ' 个文件…', 2000);
      _batchLoading = true;
      var promises = [];
      for (var fi = 0; fi < files.length; fi++) {
        promises.push(
          fetch(API + '/widget/api/import-file?path=' + encodeURIComponent(files[fi].path))
            .then(function(r) { return r.json(); })
            .then(function(d) { if (d.ok) addTrack(d.name, d.url, d.mode); })
            .catch(function() {})
        );
      }
      Promise.all(promises).then(function() {
        _batchLoading = false;
        renderPL(); saveTrks();
        showToast('导入完成', 1500);
      });
    }
    e.target.value = '';
  });
}

// ── 分组选择器 ──
var currentGroup = 'all';
document.querySelectorAll('.group-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    this.parentElement.querySelectorAll('.group-tab').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    currentGroup = this.dataset.group;
    renderPL();
  });
});

// ── 自建分组 tab（主 IIFE 内，直接访问 trks/currentGroup/renderPL/showGroupPicker） ──
(function(){
    var CKEY='hanako_audio_custom_groups';
    var FIXED=['本地音乐','在线音乐','TTS/语音','电台流','默认','我的喜欢'];
    function loadG(){try{return JSON.parse(localStorage.getItem(CKEY))||[]}catch(e){return[]}}
    function saveG(l){try{localStorage.setItem(CKEY,JSON.stringify(l))}catch(e){}}
    function knownGroups(){
      var l=loadG().slice(),seen={};l.forEach(function(g){seen[g]=1});
      trks.forEach(function(t){var g=t&&t.group;if(g&&FIXED.indexOf(g)<0&&!seen[g]){seen[g]=1;l.push(g)}});
      return l;
    }
    function injectPills(){
      var plBody=document.getElementById('plBody');
      if(!plBody)return;
      plBody.querySelectorAll('.pl-group-body').forEach(function(body){
        var g=body.getAttribute('data-group')||'';
        if(!g)return;
        body.querySelectorAll('.pl-item').forEach(function(item){
          if(item.querySelector('.jz-gpill'))return;
          var name=item.querySelector('.pl-name');
          if(!name)return;
          var pill=document.createElement('span');
          pill.className='jz-gpill';pill.textContent=g;
          name.after(pill);
        });
      });
    }
    function renderTabs(){
      var box=document.getElementById('customGroupTabs');if(!box)return;
      var condBox=document.getElementById('condGroupTabs');
      box.innerHTML='';
      if(condBox)condBox.innerHTML='';
      /* 条件动态 tab：电台流（有曲目时）、我的喜欢（有收藏时）——渲染在来源排末尾 */
      function addCondTab(label, dataGroup, show){
        if(!show||!condBox) return;
        var b=document.createElement('button');
        b.className='group-tab'+(currentGroup===dataGroup?' active':'');
        b.textContent=label;
        b.onclick=function(){
          document.querySelectorAll('.group-tab').forEach(function(x){x.classList.remove('active')});
          b.classList.add('active');
          currentGroup=dataGroup;
          renderPL();
        };
        condBox.appendChild(b);
      }
      addCondTab('电台流','radio', trks.some(function(t){return t.group==='电台流'}));
      try{ addCondTab('我的喜欢','favorites', (JSON.parse(localStorage.getItem('hanako_audio_favs')||'[]')).length>0); }catch(e){}
      knownGroups().forEach(function(g){
        var b=document.createElement('button');
        b.className='group-tab'+(currentGroup===g?' active':'');
        b.textContent=g;b.title='点击过滤 · 右键删除';
        b.onclick=function(){
          document.querySelectorAll('.group-tab').forEach(function(x){x.classList.remove('active')});
          b.classList.add('active');
          currentGroup=g;
          renderPL();
        };
        b.oncontextmenu=function(e){
          e.preventDefault();
          if(!confirm('删除分组「'+g+'」？组内曲目归入「默认」。'))return;
          trks.forEach(function(t){if(t.group===g)t.group='默认'});
          saveG(loadG().filter(function(x){return x!==g}));
          if(currentGroup==='' || currentGroup===g){currentGroup='all'}
          saveTrks();renderPL();
        };
        box.appendChild(b);
      });
    }
    var addBtn=document.getElementById('groupAddBtn');
    if(addBtn)addBtn.onclick=function(){
      showGroupPicker(function(g){
        if(g){var l=loadG();if(l.indexOf(g)<0){l.push(g);saveG(l)}}
        renderTabs();
      });
    };
    var _rpl=renderPL;
    renderPL=function(){
      _rpl.apply(this,arguments);
      renderTabs();
      injectPills();
    };
    renderTabs();
  })();

// 修改 renderPL 函数以支持分组过滤
var originalRenderPL = renderPL;
renderPL = function() {
  // 先调用原函数
  originalRenderPL();
  
  // 然后根据当前选择的分组过滤显示
  if (currentGroup !== 'all') {
    var plBody = document.getElementById('plBody');
    var groupHeaders = plBody.querySelectorAll('.pl-group-header');
    var groupBodies = plBody.querySelectorAll('.pl-group-body');
    
    // 映射分组名称
    var groupMap = {
      'local': '本地音乐',
      'online': '在线音乐',
      'radio': '电台流',
      'favorites': '我的喜欢'
    };
    
    var targetGroup = groupMap[currentGroup] || currentGroup;
    if (targetGroup) {
      groupHeaders.forEach(function(header) {
        var groupName = header.querySelector('.pl-group-name').textContent;
        if (groupName !== targetGroup) {
          header.style.display = 'none';
          var body = header.nextElementSibling;
          if (body) body.style.display = 'none';
        } else {
          header.style.display = '';
          var body = header.nextElementSibling;
          if (body) body.style.display = '';
        }
      });
    }
  }
};

// ── 标签页切换 ──
document.querySelectorAll('.nav-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    // 切换标签按钮状态
    this.parentElement.querySelectorAll('.nav-tab').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    // 切换标签页内容
    var tabId = 'tab-' + this.dataset.tab;
    document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById(tabId).classList.add('active');
  });
});
// ── 返回列表按钮 ──
document.querySelectorAll('.tab-back-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var listTab = document.querySelector('.nav-tab[data-tab="playlist"]');
    if (listTab) listTab.click();
  });
});

// ── 平台选择 ──
document.querySelectorAll('.platform-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    this.parentElement.querySelectorAll('.platform-btn').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    // 更新隐藏的 select 值
    var server = this.dataset.server;
    document.getElementById('musicServer').value = server;
  });
});

// ── 主题切换 ──
function applyTheme(theme) {
  // data-theme 只允许 light/dark，auto 态的实际明暗由宿主主题决定
  document.documentElement.setAttribute('data-theme', theme);
}

function getThemeMode() {
  try { return localStorage.getItem('hanako_audio_theme_mode') || 'auto'; } catch(e) { return 'auto'; }
}

// auto 态订阅句柄：切手动时退订，防止宿主主题变化穿透手动模式
var __hostThemeUnsub = null;

function setThemeMode(mode) {
  try { localStorage.setItem('hanako_audio_theme_mode', mode); } catch(e) {}
  // 更新图标
  var icon = document.getElementById('themeIcon');
  if (mode === 'light') {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else if (mode === 'dark') {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    // auto：调色盘图标
    icon.innerHTML = '<circle cx="12" cy="12" r="10"/><circle cx="8" cy="12" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/>';
  }
  // 进入任何模式前先退掉旧订阅：auto↔手动切换、或 auto 重复进入，都不留悬挂回调
  if (__hostThemeUnsub) { try { __hostThemeUnsub(); } catch(e) {} __hostThemeUnsub = null; }
  // auto 态：订阅宿主主题
  if (mode === 'auto') {
    window.__whenHana(function(hana) {
      // __whenHana 排队期间用户可能已切到手动：回调到达时再核对一次
      if (getThemeMode() !== 'auto' || !hana || !hana.theme) return;
      // 立即应用当前宿主主题
      if (hana.theme.getSnapshot) {
        var snap = hana.theme.getSnapshot();
        if (snap && snap.theme) {
          applyTheme(snap.theme === 'light' ? 'light' : 'dark');
        }
      }
      // 订阅宿主变化
      if (hana.theme.subscribe) {
        __hostThemeUnsub = hana.theme.subscribe(function(snap) {
          // 双保险：手动模式下宿主变化不穿透
          if (getThemeMode() !== 'auto') return;
          if (snap && snap.theme) {
            applyTheme(snap.theme === 'light' ? 'light' : 'dark');
          }
        });
      }
    });
  } else {
    // 手动态：直接应用
    applyTheme(mode);
  }
}

document.getElementById('themeBtn').addEventListener('click', function() {
  var cur = getThemeMode();
  // 三态循环：auto → light → dark → auto
  var next;
  if (cur === 'auto') {
    next = 'light';
  } else if (cur === 'light') {
    next = 'dark';
  } else {
    next = 'auto';
  }
  setThemeMode(next);
});

(function initTheme(){
  var mode = getThemeMode();
  setThemeMode(mode);
})();

// ── 字号切换 ──

// ── 歌词译文显隐：TTML 译文已随行渲染，开关只切 body.tran-off，不重建 DOM ──
(function(){
  var btn=document.getElementById('tranBtn');
  if(!btn) return;
  var KEY='hanako_audio_lyrics_tran';
  var off=false;
  try{ off = localStorage.getItem(KEY)==='0'; }catch(e){}
  function apply(){
    document.body.classList.toggle('tran-off', off);
    btn.title = off ? '显示歌词翻译' : '隐藏歌词翻译';
  }
  apply();
  btn.addEventListener('click',function(){
    off=!off;
    try{ localStorage.setItem(KEY, off?'0':'1'); }catch(e){}
    apply();
  });
})();
(function initFontSize() {
  var scaleMap = { 'small': 0.9, 'standard': 1.0, 'large': 1.15 };
  var scaleLabels = { 'small': '小', 'standard': '标准', 'large': '大' };
  var currentScale = 'standard';
  try { currentScale = localStorage.getItem('hanako_audio_font_scale') || 'standard'; } catch(e) {}
  function applyFontScale(scale) {
    var value = scaleMap[scale] || 1.0;
    document.documentElement.style.setProperty('--font-scale', value);
    document.body.style.zoom = value;
    try { localStorage.setItem('hanako_audio_font_scale', scale); } catch(e) {}
    currentScale = scale;
  }
  applyFontScale(currentScale);
  document.getElementById('fontSizeBtn').addEventListener('click', function() {
    var scales = ['small', 'standard', 'large'];
    var idx = scales.indexOf(currentScale);
    var next = scales[(idx + 1) % scales.length];
    applyFontScale(next);
    showToast('字号: ' + scaleLabels[next], 1500);
  });
})();

// ── AI主题开关 ──
(function initAITheme() {
  var enabled = true;
  try { enabled = localStorage.getItem('hanako_ai_theme_enabled') !== 'false'; } catch(e) {}
  var btn = document.getElementById('aiThemeBtn');
  if (btn) {
    btn.style.opacity = enabled ? '1' : '0.5';
    btn.title = enabled ? 'AI主题: 开启' : 'AI主题: 关闭';
    btn.addEventListener('click', function() {
      enabled = !enabled;
      try { localStorage.setItem('hanako_ai_theme_enabled', enabled); } catch(e) {}
      btn.style.opacity = enabled ? '1' : '0.5';
      btn.title = enabled ? 'AI主题: 开启' : 'AI主题: 关闭';
      showToast('AI主题: ' + (enabled ? '开启' : '关闭'), 1500);
      if (window.aiThemeGenerator) window.aiThemeGenerator.setEnabled(enabled);
    });
  }
})();

// ── 卡片形态适配（data-layout）──
// 用 ResizeObserver 观察 documentElement（html 元素），向 player-container 写 data-layout / data-ctl 属性。
// CSS 用 [data-layout="..."] 属性选择器驱动布局，JS 只写属性、不直接改 style。
(function initLayout() {
  var player = document.querySelector('.player-container');
  if (!player) return;

  function applyLayout() {
    // 观察 documentElement（html 元素），它的高度等于 iframe 的高度
    var r = document.documentElement.getBoundingClientRect();
    var w = r.width, h = r.height;
    // 三档断点：wide（w≥720）/ compact（w<720 且 h<560）/ long（其余）
    var next = w >= 720 ? 'wide' : (h < 560 ? 'compact' : 'long');
    // 窄容器控制面密度
    var density = w < 400 ? 'narrow' : 'normal';
    if (player.getAttribute('data-layout') !== next) {
      player.setAttribute('data-layout', next);
    }
    if (player.getAttribute('data-ctl') !== density) {
      player.setAttribute('data-ctl', density);
    }
  }

  applyLayout();
  if (window.ResizeObserver) {
    new ResizeObserver(applyLayout).observe(document.documentElement);
  } else {
    window.addEventListener('resize', applyLayout);
  }
})();

// ── 音频元数据读取 ──
function tryReadMetadata(audioEl, track) {
  // 浏览器原生不提供 ID3 API，但可以用 MediaSession 或解析文件头
  // 这里用文件名做智能提取 + URL 参数补全
  if (track._metaTried) return;
  track._metaTried = true;
  // 如果 name 看起来是文件名（有扩展名或 URL 末段），尝试美化
  var rawName = track.name;
  if (/.(mp3|wav|ogg|flac|m4a)$/i.test(rawName)) {
    var baseName = rawName.replace(/.[^.]+$/, '');
    // 常见模式：歌手 - 歌名 或 歌名 - 歌手
    if (baseName.indexOf(' - ') !== -1) {
      var parts = baseName.split(' - ');
      track.name = parts[0] + ' — ' + parts[1];
    } else {
      track.name = baseName;
    }
    // 更新 UI
    if (trks[idx] === track) {
      document.getElementById('trackName').textContent = track.name;
    }
    renderPL();
  }
  // 尝试通过 fetch 读取 ID3v2 头（仅同源或 CORS 允许时）
  if (track.url && !track.url.startsWith('data:')) {
    fetch(track.url, { method:'GET', headers:{'Range':'bytes=0-255'} })
      .then(function(r){ return r.arrayBuffer(); })
      .then(function(buf){
        var dv = new DataView(buf);
        // ID3v2 签名: 'ID3'
        if (dv.getUint8(0)===0x49 && dv.getUint8(1)===0x44 && dv.getUint8(2)===0x33) {
          var ver = dv.getUint8(3);
          // ID3v2.3/2.4 文本帧
          if (ver >= 3) {
            var text = new TextDecoder('utf-8').decode(new Uint8Array(buf).slice(10, 256));
            // 找 TIT2 (标题) 帧
            var tit2Pos = text.indexOf('TIT2');
            if (tit2Pos !== -1) {
              var titleStart = tit2Pos + 4 + 4 + 2; // frame ID + size + flags + encoding
              var titleBytes = new Uint8Array(buf).slice(10 + tit2Pos + 4 + 4 + 2 + 1, 256);
              var titleStr = '';
              for (var j=0; j<titleBytes.length && titleBytes[j]!==0; j++) { titleStr += String.fromCharCode(titleBytes[j]); }
              if (titleStr.trim()) {
                track.name = titleStr.trim();
                if (trks[idx] === track) {
                  document.getElementById('trackName').textContent = track.name;
                }
                renderPL();
              }
            }
          }
        }
      })
      .catch(function(){ /* 静默失败，CORS 或非音频文件 */ });
  }
}

// ── 收藏筛选 ──
document.getElementById('favFilterBtn').addEventListener('click',function(e){
  e.stopPropagation();
  this.classList.toggle('active');
  var icon=document.getElementById('favFilterIcon');
  icon.textContent=this.classList.contains('active')?'★':'☆';
  renderPL();
});

// ── Bus 面板 ──
// ── Music Search ──
var musicOpen = false;
document.getElementById('musicToggle').addEventListener('click', function(){
  musicOpen=!musicOpen;
  document.getElementById('musicBody').classList.toggle('open', musicOpen);
  this.classList.toggle('open', musicOpen);
});
document.getElementById('musicGo').addEventListener('click', doMusicSearch);
document.getElementById('musicInput').addEventListener('keydown', function(e){ if(e.key==='Enter') doMusicSearch(); });

function doMusicSearch(){
  var kw=document.getElementById('musicInput').value.trim();
  if(!kw) return;
  var sv=document.getElementById('musicServer').value;
  var el=document.getElementById('musicResults');
  el.innerHTML='<div class="music-loading">搜索中…</div>';
  fetch(API+'/widget/api/music/search?keyword='+encodeURIComponent(kw)+'&server='+sv, {signal:AbortSignal.timeout(10000)}).then(function(r){return r.json();}).then(function(res){
    if(!res.ok||!res.results||!res.results.length){ el.innerHTML='<div class="music-empty">没有结果</div>'; return; }
    el.innerHTML=res.results.map(function(t){
      return '<div class="music-item" data-title="'+esc(t.title)+'" data-url="'+esc(t.url)+'" data-lrc="'+esc(t.lrc||'')+'" data-pic="'+esc(t.pic||'')+'" data-id="'+esc(t.id||'')+'" data-server="'+esc(t.server||document.getElementById('musicServer').value)+'">'
        +(t.pic ? '<img class="music-thumb" src="'+esc(t.pic)+'" loading="lazy">' : '<div class="music-thumb-placeholder">♫</div>')
        +'<div class="music-info"><div class="music-title">'+esc(t.title)+'</div><div class="music-author">'+esc(t.author)+'</div></div>'
        +'<button class="music-play" title="播放">▶</button>'
        +'<button class="music-add" title="加入队列">+</button>'
        +'<button class="music-scene" title="加入场景">☾</button>'
        +'<button class="music-cache" title="缓存到本地" data-id="'+esc(t.id||'')+'" data-server="'+esc(t.server||document.getElementById('musicServer').value)+'">💾</button>'
        +'</div>';
    }).join('');
  }).catch(function(e){ el.innerHTML='<div class="music-empty">'+(e.name==='TimeoutError'?'搜索超时，换源试试':'搜索失败，所有 Meting 节点均不可用')+'</div>'; });
}

document.getElementById('musicResults').addEventListener('click', function(e){
  var item = e.target.closest('.music-item');
  if(!item) return;
  var title = item.dataset.title;
  var searchKey = item.dataset.search; // 歌单条目：搜索关键词
  var url = item.dataset.url; // 搜索结果：直链
  var server = item.dataset.server; // 歌单条目的源
  // 歌单条目没有 data-url → 需要先搜索拿 URL
  // 尝试获取完整音频 URL（如果配了 cookie）
  function withUrl(cb) {
    if (url) { cb(url, title); return; }
    if (!searchKey) { showToast('无法获取音频', 2000); return; }
    showToast('搜索完整音频…', 2000);
    var sv = server || document.getElementById('musicServer').value;
    var _fallbackServers = ['netease','tencent','kugou','kuwo','baidu'].filter(function(s){return s!==sv;});
    function _try(server) {
      return fetch(API+'/widget/api/music/search?keyword='+encodeURIComponent(searchKey)+'&server='+server, {signal:AbortSignal.timeout(8000)})
        .then(function(r){return r.json();})
        .then(function(res){
          if(res.ok && res.results && res.results.length) {
            for(var j=0;j<res.results.length;j++){ if(res.results[j].url) return res.results[j]; }
          }
          return null;
        });
    }
    _try(sv).then(function(hit){
      if(hit) return hit;
      var chain = Promise.resolve(null);
      _fallbackServers.forEach(function(fs){
        chain = chain.then(function(r){ if(r) return r; return _try(fs).catch(function(){return null;}); });
      });
      return chain;
    }).then(function(hit){
      if(!hit || !hit.url) { showToast('所有源均未找到', 2500); return; }
      cb(hit.url, hit.title);
    }).catch(function(e){ showToast(e.name==='TimeoutError'?'搜索超时':'搜索失败', 2500); });
  }
  if(e.target.closest('.music-play')){
    withUrl(function(u, t){ addTrack(t, u, '在线', null, item.dataset.lrc, item.dataset.pic); });
  } else if(e.target.closest('.music-add')){
    withUrl(function(u, t){ busControl('play', {url:u, name:t, mode:'在线'}); });
  } else if(e.target.closest('.music-scene')){
    withUrl(function(u, t){
      var existing = document.getElementById('musicSceneMenu');
      if(existing) existing.remove();
      var menu = document.createElement('div');
      menu.id = 'musicSceneMenu';
      menu.className = 'music-scene-menu';
      menu.innerHTML = Object.keys(SCENES).map(function(k){ return '<div data-scene="'+k+'">'+SCENES[k].label+'</div>'; }).join('');
      item.style.position = 'relative';
      item.appendChild(menu);
      menu.addEventListener('click', function(ev){
        var opt = ev.target.closest('[data-scene]');
        if(!opt) return;
        var key = opt.dataset.scene;
        SCENES[key].playlist.push({ type:'play', url:u, name:t, mode:'在线' });
        saveScenes();
        showToast('已加入 '+SCENES[key].label+' 场景', 2000);
        menu.remove();
      });
      // 点外部关闭
      setTimeout(function(){ document.addEventListener('click', function cls(){ menu.remove(); document.removeEventListener('click', cls); }); }, 0);
    });
  } else if(e.target.closest('.music-cache')){
    // 缓存按钮：调用后端缓存 API
    var cacheBtn = e.target.closest('.music-cache');
    var cacheId = cacheBtn.dataset.id;
    var cacheServer = cacheBtn.dataset.server;
    if(!cacheId) { showToast('无法缓存：缺少曲目 ID', 2000); return; }
    cacheBtn.disabled = true;
    cacheBtn.textContent = '⏳';
    fetch(API+'/widget/api/music/cache/'+encodeURIComponent(cacheId)+'?server='+encodeURIComponent(cacheServer), {
      method: 'POST',
      signal: AbortSignal.timeout(30000)
    })
    .then(function(r){ return r.json(); })
    .then(function(res){
      if(res.ok) {
        cacheBtn.textContent = '✓';
        cacheBtn.classList.add('cached');
        showToast('已缓存', 2000);
      } else {
        cacheBtn.textContent = '💾';
        cacheBtn.disabled = false;
        showToast('缓存失败: '+(res.error||''), 2500);
      }
    })
    .catch(function(err){
      cacheBtn.textContent = '💾';
      cacheBtn.disabled = false;
      showToast('缓存超时', 2500);
    });
  }
});

// ── Playlist Import ──
document.getElementById('playlistGo').addEventListener('click', doPlaylistImport);
document.getElementById('playlistInput').addEventListener('keydown', function(e){ if(e.key==='Enter') doPlaylistImport(); });

document.getElementById('songGo').addEventListener('click', doSongImport);
document.getElementById('songInput').addEventListener('keydown', function(e){ if(e.key==='Enter') doSongImport(); });

function doSongImport(){
  var raw=document.getElementById('songInput').value.trim();
  if(!raw) return;
  var sv=document.getElementById('musicServer').value;
  var el=document.getElementById('musicResults');
  el.innerHTML='<div class="music-loading">获取单曲中…</div>';
  fetch(API+'/widget/api/music/song?id='+encodeURIComponent(raw)+'&server='+sv).then(function(r){return r.json();}).then(function(res){
    if(!res.ok||!res.track||!res.track.url){ el.innerHTML='<div class="music-empty">无法获取该单曲</div>'; return; }
    var t=res.track;
    // 去重：已在队列则只提示
    var exists=trks.some(function(x){return x.url===t.url;});
    if(exists){ el.innerHTML='<div class="music-empty">已在队列中</div>'; return; }
    showGroupPicker(function(groupName){
      if(!groupName){ el.innerHTML='<div class="music-empty">已取消（未选分组）</div>'; return; }
      trks.push({ name:(t.title||'未命名')+(t.author?(' - '+t.author):''), url:t.url, pic:t.pic||'', lrcUrl:t.lrc||'', mode:'在线', dur:0, group:groupName });
      saveTrks(); renderPL();
      el.innerHTML='<div class="music-empty">已加入「'+groupName+'】：'+(t.title||'')+'</div>';
      document.getElementById('songInput').value='';
    });
    el.innerHTML='<div class="music-empty">已加入队列：'+(t.title||'')+'</div>';
    document.getElementById('songInput').value='';
  }).catch(function(){ el.innerHTML='<div class="music-empty">获取失败</div>'; });
}

function doPlaylistImport(){
  var raw=document.getElementById('playlistInput').value.trim();
  if(!raw) return;
  var id=raw;
  var idMatch=raw.match(/[?&]id=(\d+)/);
  if(idMatch) id=idMatch[1];
  var sv=document.getElementById('musicServer').value;
  var el=document.getElementById('musicResults');
  el.innerHTML='<div class="music-loading">加载歌单中…</div>';
  fetch(API+'/widget/api/music/playlist?id='+encodeURIComponent(id)+'&server='+sv).then(function(r){return r.json();}).then(function(res){
    if(!res.ok||!res.tracks||!res.tracks.length){ el.innerHTML='<div class="music-empty">歌单为空或无法获取</div>'; return; }
    el.innerHTML='<div class="music-empty" style="padding-bottom:6px">歌单 '+res.tracks.length+' 首 <span style="color:var(--text-faint);font-size:10px">（点击播放时自动搜索完整音频）</span></div>'
      +'<div style="display:flex;gap:4px;padding:0 0 8px">'
      +'<button class="music-play" style="font-size:10px;padding:3px 8px">全部播放</button>'
      +'<button class="music-add" style="font-size:10px;padding:3px 8px;opacity:1">加入队列</button>'
      +'<button class="music-scene" style="font-size:10px;padding:3px 8px;opacity:1">加入场景</button>'
      +'</div>'
      + res.tracks.map(function(t){
        var searchKey = (t.title+' '+t.author).trim();
        return '<div class="music-item" data-title="'+esc(t.title)+'" data-search="'+esc(searchKey)+'" data-server="'+sv+'" data-pic="'+esc(t.pic||'')+'">'
          +(t.pic ? '<img class="music-thumb" src="'+esc(t.pic)+'" loading="lazy">' : '<div class="music-thumb-placeholder">♫</div>')
          +'<div class="music-info"><div class="music-title">'+esc(t.title)+'</div><div class="music-author">'+esc(t.author)+'</div></div>'
          +'<button class="music-play" title="播放">▶</button>'
          +'<button class="music-add" title="加入队列">+</button>'
          +'<button class="music-scene" title="加入场景">☾</button>'
          +'</div>';
      }).join('');
    el._playlistTracks = res.tracks;
    el._playlistServer = sv;
  }).catch(function(){ el.innerHTML='<div class="music-empty">歌单加载失败</div>'; });
}

// 歌单批量操作：全部播放 / 加入队列 / 加入场景
(function(){
  var el=document.getElementById('musicResults');
  var origClick = el.onclick;
  el.addEventListener('click', function(e){
    var tracks = el._playlistTracks;
    if(!tracks || !tracks.length) return;
    var sv = el._playlistServer || 'netease';
    // “全部播放” 按钮（歌单操作栏第一个 music-play）
    if(e.target.closest('.music-play') && !e.target.closest('.music-item .music-play')){
      showGroupPicker(function(groupName){
        if(!groupName) return;
        // 搜索第一首的完整 URL 播放，其余以名字加入（播放时自动搜索）
        var first = tracks[0];
        var firstKey = (first.title+' '+first.author).trim();
        showToast('搜索 '+first.title+' …', 1500);
        _batchLoading = true;
        fetch(API+'/widget/api/music/search?keyword='+encodeURIComponent(firstKey)+'&server='+sv).then(function(r){return r.json();}).then(function(res){
          if(res.ok && res.results && res.results.length) {
            addTrack(res.results[0].title, res.results[0].url, '在线', groupName, res.results[0].lrc, res.results[0].pic);
          }
        });
        // 其余用搜索关键词加入（type=search 标记自动搜索）
        for(var i=1; i<tracks.length; i++){
          var t = tracks[i];
          var tk=(t.title+' '+t.author).trim();
          // 去重：已有同名且空 url 的条目 → 更新 group 而非跳过
          var existingIdx=-1;
          for(var j=0;j<trks.length;j++){ if(trks[j].name===t.title && !trks[j].url){existingIdx=j;break;} }
          if(existingIdx>=0){ trks[existingIdx].group=groupName; continue; }
          trks.push({name:t.title, url:'', mode:'在线', dur:0, searchKey:tk, searchServer:sv, group:groupName});
        }
        _batchLoading = false;
        renderPL(); saveTrks();
        showToast('已添加 '+tracks.length+' 首到分组「'+groupName+'」', 2500);
      });
    }
    // “加入队列” 按钮（歌单操作栏第一个 music-add）
    if(e.target.closest('.music-add') && !e.target.closest('.music-item .music-add')){
      showGroupPicker(function(groupName){
        if(!groupName) return;
        _batchLoading = true;
        tracks.forEach(function(t){
          var key = (t.title+' '+t.author).trim();
          // 去重：已有同名且空 url 的条目 → 更新 group 而非跳过
          var existingIdx=-1;
          for(var j=0;j<trks.length;j++){ if(trks[j].name===t.title && !trks[j].url){existingIdx=j;break;} }
          if(existingIdx>=0){ trks[existingIdx].group=groupName; return; }
          trks.push({name:t.title, url:'', mode:'在线', dur:0, searchKey:key, searchServer:sv, group:groupName});
        });
        _batchLoading = false;
        renderPL(); saveTrks();
        showToast('已添加 '+tracks.length+' 首到分组「'+groupName+'」', 2000);
      });
    }
    // “加入场景” 按钮（歌单操作栏第一个 music-scene）
    if(e.target.closest('.music-scene') && !e.target.closest('.music-item .music-scene')){
      var existing = document.getElementById('musicSceneMenu');
      if(existing) existing.remove();
      var menu = document.createElement('div');
      menu.id = 'musicSceneMenu';
      menu.className = 'music-scene-menu';
      menu.innerHTML = Object.keys(SCENES).map(function(k){ return '<div data-scene="'+k+'">'+SCENES[k].label+'</div>'; }).join('');
      el.parentElement.appendChild(menu);
      menu.style.position='relative';
      menu.addEventListener('click', function(ev){
        var opt=ev.target.closest('[data-scene]'); if(!opt) return;
        var key=opt.dataset.scene;
        tracks.forEach(function(t){
          var key2 = (t.title+' '+t.author).trim();
          SCENES[key].playlist.push({type:'play',url:'',name:t.title,mode:'在线',searchKey:key2,searchServer:sv});
        });
        saveScenes();
        showToast('已加入 '+tracks.length+' 首到 '+SCENES[key].label, 2000);
        menu.remove();
      });
      setTimeout(function(){ document.addEventListener('click',function cls(){menu.remove();document.removeEventListener('click',cls);}); },0);
    }
  });
})();


// ── Visualizer ──
(function(){
  var canvas = document.getElementById('visualizer');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var visRAF = null;
  var BAR_COUNT = 48;
  var BAR_GAP = 1.5;
  var AMBER = '#d4a76a';
  var AMBER_DIM = 'rgba(212,167,106,0.15)';

  // 尊 prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var simPhase = 0;

  // 伪随机波形 (基于正弦混合，随时间变化)
  function pseudoBar(i, phase) {
    return 0.3 + 0.35 * Math.sin(i*0.7+phase*1.3) + 0.2 * Math.sin(i*1.9+phase*0.7) + 0.15 * Math.cos(i*2.3+phase*2.1);
  }

  function draw() {
    visRAF = requestAnimationFrame(draw);
    var w = canvas.width = canvas.clientWidth * (window.devicePixelRatio||1);
    var h = canvas.height = canvas.clientHeight * (window.devicePixelRatio||1);
    ctx.clearRect(0,0,w,h);
    if (audio.paused) { drawSilent(w,h); return; }

    var vol = audio.volume || 1;
    var barW = (w - BAR_GAP * (BAR_COUNT-1)) / BAR_COUNT;

    // 真频谱：音频反应开着时 analyser 每帧都在填同一份数据，
    // 借过来柱子才真的跟着歌跳（原来那排全是模拟波形，跟音乐无关）。
    var bins = (window.__reactiveReady && window.__reactiveBins) ? window.__reactiveBins : null;
    if (bins && bins.length) {
      var nb = bins.length;
      for (var k=0; k<BAR_COUNT; k++) {
        // 对数取样：低频多给几格，否则整排只有左边在动
        var idx = Math.min(nb - 1, Math.floor(Math.pow(k / BAR_COUNT, 1.7) * nb));
        var v = (bins[idx] || 0) / 255;
        drawBar(w,h,barW,k, Math.pow(v, 0.8) * 1.1 * vol);
      }
      return;
    }

    // 没真数据（音频反应没开 / 图没建成）就退回原来的模拟波形
    simPhase += 0.04;
    for (var i=0; i<BAR_COUNT; i++) {
      var val = pseudoBar(i, simPhase) * vol;
      drawBar(w,h,barW,i, val);
    }
  }

  function drawBar(w,h,barW,i, norm) {
    norm = Math.max(0.02, Math.min(1, norm));
    var barH = Math.max(2, norm * h * 0.92);
    var x = i * (barW + BAR_GAP);
    var y = h - barH;
    var grd = ctx.createLinearGradient(x, h, x, y);
    grd.addColorStop(0, AMBER_DIM);
    grd.addColorStop(1, AMBER);
    ctx.fillStyle = grd;
    ctx.beginPath();
    var r = Math.min(barW/2, 2);
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+barW-r, y);
    ctx.quadraticCurveTo(x+barW, y, x+barW, y+r);
    ctx.lineTo(x+barW, h);
    ctx.lineTo(x, h);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.fill();
  }

  function drawSilent(w,h) {
    var barW = (w - BAR_GAP * (BAR_COUNT-1)) / BAR_COUNT;
    for (var i=0; i<BAR_COUNT; i++) {
      var x = i * (barW + BAR_GAP);
      ctx.fillStyle = AMBER_DIM;
      ctx.fillRect(x, h-2, barW, 2);
    }
  }

  function startVis() {
    if (!visRAF) draw();
  }

  audio.addEventListener('play', startVis);
  draw();
})();

// ── Lyric Panel ──
(function(){
  var lyricOpen=true;
  var lrcData=[]; // [{time:ms, text:string}]
  var currentLrcId=null;
  var lyricBody=document.getElementById('lyricBody');
  var lyricToggle=document.getElementById('lyricToggle');
  if(lyricToggle){
  lyricToggle.addEventListener('click',function(){
    lyricOpen=!lyricOpen;
    lyricBody.classList.toggle('open',lyricOpen);
    lyricToggle.classList.toggle('open',lyricOpen);
  });
  }

  // ── 歌词模式 ──
  // 开关状态持久化在 localStorage。
  // 进模式时强制 lyricOpen=true：卡拉 OK 逐帧和 timeupdate 高亮
  // 都守在 lyricOpen 上，面板关着进模式会得到一面不动的歌词墙。
  (function(){
    var btn=document.getElementById('lyricModeBtn');
    if(!btn) return;
    var KEY='hanako_audio_lyrics_mode';
    function openPanel(){
      lyricOpen=true;
      lyricBody.classList.add('open');
      if(lyricToggle) lyricToggle.classList.add('open');
    }
    function apply(on){
      document.body.classList.toggle('lyrics-mode',on);
      btn.style.color=on?'var(--accent)':'';
      btn.title=on?'退出歌词模式':'歌词模式';
      try{ localStorage.setItem(KEY,on?'1':'0'); }catch(e){}
      // 进模式时舞台从 display:none 出来，中心偏移要在布局落地后重算
      if(on) requestAnimationFrame(function(){ requestAnimationFrame(function(){ pvCenter(_pvIdx>=0?_pvIdx:0); }); });
    }
    btn.addEventListener('click',function(){
      // 三档循环：标准 → PV(lyrics-mode) → 歌词(jizura-mode) → 标准
      var hasLyr=document.body.classList.contains('lyrics-mode');
      var hasJiz=document.body.classList.contains('jizura-mode');
      if(!hasLyr){
        // 标准 → PV
        openPanel();
        apply(true);
      }else if(hasLyr && !hasJiz && (window.PV&&PV.available)){
        // PV → 歌词
        document.body.classList.add('jizura-mode');
        btn.style.color='var(--accent)';
        btn.title='退出歌词模式';
        renderPv();
      }else{
        // 歌词 → 标准
        document.body.classList.remove('jizura-mode');
        renderPv();
        apply(false);
      }
      updateBtnIcon();
    });
    function updateBtnIcon(){
      var hasLyr=document.body.classList.contains('lyrics-mode');
      var hasJiz=(window.PV&&PV.available&&document.body.classList.contains('jizura-mode'));
      if(hasJiz){
        btn.style.color='var(--accent)';
        btn.title='PV 模式（文字PV）— 点击退出';
      }else if(hasLyr){
        btn.style.color='var(--accent)';
        btn.title='歌词模式 — 点击进 PV';
      }else{
        btn.style.color='';
        btn.title='歌词模式';
      }
    }
    try{
      var saved=localStorage.getItem(KEY);
      // '0'标准 / '1'PV；jizura-mode 不持久化（曾用过 '2'=沉浸，已废弃，当标准处理）
      if(saved==='1'){ openPanel(); apply(true); }
      // 清掉可能残留的 jizura-mode
      document.body.classList.remove('jizura-mode');
      document.body.classList.remove('immersive-mode');
      updateBtnIcon();
    }catch(e){}
  })();

  // ── 歌词结构化数据缓存 ──
  var LRC_CACHE_KEY='hanako_audio_lrc_parsed_cache';
  var LRC_CACHE_MAX=30;
  var LRC_CACHE_TTL=30*24*60*60*1000; // 30天
  function _getLrcCacheObj(){
    try{
      var raw=localStorage.getItem(LRC_CACHE_KEY);
      if(!raw) return {};
      var obj=JSON.parse(raw);
      return obj && typeof obj==='object' ? obj : {};
    }catch(e){ return {}; }
  }
  function _cachedLrcByUrl(lrcUrl){
    if(!lrcUrl) return null;
    var obj=_getLrcCacheObj();
    var entry=obj[lrcUrl];
    if(!entry) return null;
    if(!entry.ts || (Date.now()-entry.ts)>LRC_CACHE_TTL) return null;
    return entry.lrcData||null;
  }
  function _saveLrcCache(lrcUrl, parsed){
    if(!lrcUrl || !parsed) return;
    var obj=_getLrcCacheObj();
    // 超出上限：移除最早写入的条目
    var keys=Object.keys(obj);
    if(keys.length>=LRC_CACHE_MAX){
      var oldestKey=null, oldestTs=Infinity;
      keys.forEach(function(k){
        var ts=obj[k] && obj[k].ts ? obj[k].ts : 0;
        if(ts<oldestTs){ oldestTs=ts; oldestKey=k; }
      });
      if(oldestKey) delete obj[oldestKey];
    }
    obj[lrcUrl]={ts:Date.now(), lrcData:parsed};
    try{ localStorage.setItem(LRC_CACHE_KEY, JSON.stringify(obj)); }catch(e){}
  }
  // 初始渲染占位
  lyricBody.innerHTML='<div class="lyric-line" style="color:var(--text-faint);padding:8px 0">暂无歌词</div>';

  // LRC 的头部元数据行是带时间戳混进来的，不收的话就会当成歌词往横幅上推。
  //
  // 已经补过两次词表了（"出品 Produced by :"、"演唱 Vocal :"），教训是：
  // 黑名单追不上真实字幕的写法。所以判据不是“名单里有它”，而是
  // **这行的形状像不像一条署名**：
  //   · 以常见的署名词开头（中英对照都算）
  //   · 且冒号出现在很靠前的位置（真正的歌词不会在第二三个字就冒号）
  //   · 或整行就是 【xx】/ [xx] 包起来的署名
  var CREDIT_HEAD = /^(作词|作曲|编曲|制作人|出品|发行|监制|混音|母带|录音|吉他|贝斯|鼓|键盘|和声|和音|合声|配唱|演唱|演奏|朗诵|旁白|企划|统筹|语势|后期|美术|设计|策划|封面|翻译|校对|特别感谢|助理|工程|工程师|Assistant|Producer|Composer|Lyricist|Arranger|Mixing|Mastering|Engineer|Studio|Vocal|Guitar|Bass|Drums|Piano|Strings|OP|SP|词|曲|Recording|Scoring|谱务|乐器|独奏|Violin|Cello|Saxophone|Trumpet|Trombone|Harmonica|Keyboard|Synthesizer|Program|Programming|Editing|Chorus|Backing|Percussion|Viola|Flute|Oboe|Clarinet|Harp|Organ|Accordion|Lute|二胡|琵琶|古筝|笛|箫|唢呐|扬琴|柳琴|阮|埙|编钟)/i;

  function looksLikeCredit(txt) {
    if (/^[【\[]/.test(txt)) return true;              // 【】/[] 包起来的通常也是署名
    if (!CREDIT_HEAD.test(txt)) return false;
    // 冒号必须出现在前 34 个字内；真歌词很少在开头就冒号
    // （TTML 的英文署名行如 "Assistant Mastering Engineer : …"，冒号在 28 字处，24 的窗口不够）
    return /[:：]/.test(txt.slice(0, 34));
  }

  function parseLrc(raw){
    var lines=raw.split('\n');
    var result=[];
    lines.forEach(function(line){
      var m=line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/);
      if(m){
        var ms=parseInt(m[1])*60000+parseInt(m[2])*1000+(m[3]?parseInt(m[3].padEnd(3,'0')):0);
        var txt=m[4].trim();
        if(!txt) return;
        if(looksLikeCredit(txt)) return;          // 署名行不是歌词
        result.push({time:ms,text:txt});
      }
    });
    result.sort(function(a,b){return a.time-b.time;});
    return result;
  }

  // ── TTML（逐字）解析 ──
  // AMLL DB 的 TTML：每行 <p begin end>，行内每个字一个 <span begin end>，
  // 译文在 role=x-translation 的 span 里，背景声部 role=x-bg（嵌套 span，要跳过）。
  function _ttmlTime(s){
    if(!s) return 0;
    s=String(s).trim();
    var m=s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
    if(m) return Math.round(((+m[1]||0)*3600+(+m[2])*60+(+m[3]))*1000);
    m=s.match(/^([\d.]+)ms$/); if(m) return Math.round(parseFloat(m[1]));
    m=s.match(/^([\d.]+)s$/); if(m) return Math.round(parseFloat(m[1])*1000);
    return 0;
  }
  function _roleOf(el){
    if(!el||!el.getAttribute) return '';
    return el.getAttribute('ttml:role')||el.getAttribute('role')||'';
  }
  function parseTtml(raw){
    if(typeof DOMParser==='undefined') return null;
    var doc=new DOMParser().parseFromString(raw,'text/xml');
    if(doc.getElementsByTagName('parsererror').length) return null;
    var ps=doc.getElementsByTagName('p');
    var lines=[];
    for(var i=0;i<ps.length;i++){
      var p=ps[i];
      var begin=_ttmlTime(p.getAttribute('begin'));
      var spans=p.getElementsByTagName('span');
      var words=[], tran='', main='';
      for(var j=0;j<spans.length;j++){
        var sp=spans[j];
        var role=_roleOf(sp), parentRole=_roleOf(sp.parentNode);
        if(role==='x-translation'){ tran=(sp.textContent||'').trim(); continue; }
        if(role==='x-bg'||parentRole==='x-bg') continue;   // 背景声部不进主文本
        if(role==='x-roman') continue;
        var wt=sp.textContent||'';
        if(!wt) continue;
        main+=wt;
        if(sp.getAttribute('begin')){
          var wb=_ttmlTime(sp.getAttribute('begin')), we=_ttmlTime(sp.getAttribute('end'));
          words.push({time:wb, dur:Math.max(80,we-wb), text:wt});
        }
      }
      main=main.trim();
      if(!main) continue;
      if(looksLikeCredit(main)) continue;
      lines.push({time:begin, end:_ttmlTime(p.getAttribute('end'))||0, text:main, tran:tran, words:words.length?words:null});
    }
    lines.sort(function(a,b){return a.time-b.time;});
    return lines.length?lines:null;
  }

  // 副歌检测
  function detectChorus(data) {
    var countMap = {}, chorusSet = new Set();
    data.forEach(function(l) { var k = l.text.trim().toLowerCase(); if (!k) return; countMap[k] = (countMap[k]||0)+1; });
    Object.keys(countMap).forEach(function(k) { if (countMap[k] >= 2) chorusSet.add(k); });
    return chorusSet;
  }
  // ── PV 舞台（folia 式滚动窗）──
  // 列表退居幕后当数据源；台前是一整条歌词轨道，换行 = 轨道平滑滑动，
  // 当前行滑到视觉中心，距离越远越暗越糊（焦外虚化）。
  var pvStage=document.getElementById('pvStage');
  var pvTrack=document.getElementById('pvTrack');
  var chorusSetGlobal=new Set();
  var _pvIdx=-1;
  var _pvLineEls=[];
  window.__pvCore={render:function(){renderPv()},sync:function(i){pvSync(i)},idx:function(){return _pvIdx},lrc:function(){return lrcData}};
  function renderPv(){
    if(window.PV&&PV.available&&document.body.classList.contains('jizura-mode')){
      window._jizuraLrcData=lrcData;
      if(window.renderJizuraInit)window.renderJizuraInit();
      return;
    }
    if(!pvTrack) return;
    if(!lrcData.length){
      pvTrack.innerHTML='<div class="pv-line" data-d="0" style="opacity:.4">暂无歌词</div>';
      _pvLineEls=pvTrack.querySelectorAll('.pv-line');
      _pvIdx=-1;
      pvCenter(0);
      return;
    }
    var html='';
    for(var i=0;i<lrcData.length;i++){
      var l=lrcData[i];
      var isCh=chorusSetGlobal.has(l.text.trim().toLowerCase());
      var cls='pv-line'+(isCh?' chorus':'')+(l.words?' has-words':'');
      var inner='';
      if(l.words){
        for(var k=0;k<l.words.length;k++) inner+='<span class="pv-w">'+esc(l.words[k].text)+'</span>';
      } else {
        inner=esc(l.text);
      }
      if(l.tran) inner+='<div class="pv-tran">'+esc(l.tran)+'</div>';
      html+='<div class="'+cls+'" data-d="3">'+inner+'</div>';
    }
    pvTrack.innerHTML=html;
    _pvLineEls=pvTrack.querySelectorAll('.pv-line');
    _pvIdx=-1;
  }
  function pvCenter(idx){
    if(!pvStage||!pvTrack||!_pvLineEls.length) return;
    var el=_pvLineEls[idx];
    if(!el) return;
    // 当前行中心对齐舞台中心。scale 是 transform 不影响 offsetTop，量出来就是稳的
    var y=pvStage.clientHeight/2-(el.offsetTop+el.offsetHeight/2);
    pvTrack.style.transform='translateY('+y.toFixed(1)+'px)';
  }
  // 逐行色调：移植 folia resolveMonetTone——过去行比未来行更暗，
  // 非当前行随距离收缩（scale）+ 加糊（blur），当前行 scale 1.3 清晰。
  function _pvTone(waiting, dist){
    if(dist===0) return {alpha:1, scale:1.3, blur:0};
    var d=Math.max(dist,1);
    return {
      alpha: waiting ? Math.max(.36,.72-(d-1)*.18) : Math.max(.28,.52-(d-1)*.12),
      scale: Math.max(.68*1.3, 1.3*.72*Math.pow(.9,d-1)),
      blur:  waiting ? (d===1?.7:1.8+(d-2)*.8) : 1.1+(d-1)*.7
    };
  }
  // 光晕包络：移植 folia resolveMonetGlow——smoothstep 升起 → 峰值驻留 → 行尾后消退
  function _pvGlow(t,start,end,lineEnd){
    if(t<=start) return 0;
    var rise=Math.max(1,end-start)*1.18, peak=start+rise;
    var tail=Math.max(lineEnd,end+1050);
    if(t<=peak){ var p=Math.min(1,Math.max(0,(t-start)/rise)); return p*p*(3-2*p); }
    var r=1-Math.min(1,Math.max(0,(t-peak)/Math.max(180,tail-peak)));
    return Math.max(0, r*r*(3-2*r));
  }
  function pvSync(idx){
    if(window.PV&&PV.available&&document.body.classList.contains('jizura-mode')){
      window._jizuraLrcData=lrcData;
      if(window.renderJizuraLine)window.renderJizuraLine(idx);
      return;
    }
    if(!pvStage || !_pvLineEls.length || idx===_pvIdx) return;
    _pvIdx=idx;
    for(var i=0;i<_pvLineEls.length;i++){
      var d=Math.abs(i-idx);
      _pvLineEls[i].setAttribute('data-d', d>3?'3':String(d));
      var tone=_pvTone(i>idx, d);
      var st=_pvLineEls[i].style;
      st.opacity=tone.alpha.toFixed(3);
      st.transform='scale('+tone.scale.toFixed(3)+')';
      st.filter=tone.blur>0?('blur('+tone.blur.toFixed(1)+'px)'):'none';
    }
    pvCenter(idx);
  }
  window.addEventListener('resize',function(){ if(_pvIdx>=0) pvCenter(_pvIdx); });
  renderPv();   // 初始占位（暂无歌词）

  function renderLrc(){
    if(!lrcData.length){ lyricBody.innerHTML='<div class="lyric-line" style="color:var(--text-faint);padding:8px 0">暂无歌词</div>'; chorusSetGlobal=new Set(); renderPv(); return; }
    var chorusSet = detectChorus(lrcData);
    chorusSetGlobal = chorusSet;
    renderPv();
    _pvIdx = -1;   // 新词表生效，下一拍 highlightLrc 会让 PV 重唱首行
    // 换词重建：浏览态作废，直接回到跟随
    _lyricBrowsing = false;
    if (_lyricBrowseTimer) { clearTimeout(_lyricBrowseTimer); _lyricBrowseTimer = null; }
    lyricBody.classList.remove('is-browsing');
    lyricBody.innerHTML=lrcData.map(function(l,i){
      var isChorus = chorusSet.has(l.text.trim().toLowerCase());
      var cls = isChorus ? 'lyric-line chorus' : 'lyric-line';
      // 双语：TTML 路径的行带 tran（x-translation），LRC 路径无 —— 有则渲染，显隐交给 body.tran-off
      var tran = l.tran ? '<span class="lyric-tran">'+esc(l.tran)+'</span>' : '';
      return '<div class="'+cls+'" data-lrc-idx="'+i+'"><span class="l-main">'+esc(l.text)+'</span>'+tran+'</div>';
    }).join('');
  }

  // ── 歌词浏览态：用户滚动查看时暂停自动跟随，3s 无交互自动平滑回归 ──
  // 之前是每句无条件 scrollIntoView 居中 —— 用户往上翻歌词，下一句一到就被拽回去。
  // 手势判定用 wheel/touchstart/pointerdown：scroll 事件区分不了程序平滑滚动和用户滚动。
  var _lyricBrowsing = false, _lyricBrowseTimer = null;
  (function initLyricBrowse(){
    if (!lyricBody) return;
    function enterBrowse(){
      if (_lyricBrowseTimer) { clearTimeout(_lyricBrowseTimer); _lyricBrowseTimer = null; }
      if (!_lyricBrowsing) { _lyricBrowsing = true; lyricBody.classList.add('is-browsing'); }
      _lyricBrowseTimer = setTimeout(exitBrowse, 3000);
    }
    function exitBrowse(){
      if (_lyricBrowseTimer) { clearTimeout(_lyricBrowseTimer); _lyricBrowseTimer = null; }
      _lyricBrowsing = false;
      lyricBody.classList.remove('is-browsing');
      var cur = lyricBody.querySelector('.lyric-line.current');
      if (cur) cur.scrollIntoView({block:'center',behavior:'smooth'});
    }
    ['wheel','touchstart','pointerdown'].forEach(function(evt){
      lyricBody.addEventListener(evt, enterBrowse, {passive:true});
    });
  })();

  function highlightLrc(timeMs){
    if(!lrcData.length) return;
    var idx=0;
    for(var i=0;i<lrcData.length;i++){ if(lrcData[i].time<=timeMs) idx=i; }
    var lines=lyricBody.querySelectorAll('.lyric-line');
    lines.forEach(function(el,i){
      el.classList.toggle('current',i===idx);
      // 给当前行 ±1 行打 is-near 类（2c 遗留接线）
      el.classList.toggle('is-near', (i===idx-1 || i===idx+1));
      if (i === idx && el.classList.contains('chorus')) {
        el.style.animation = 'pulse-glow 1.5s ease-in-out infinite';
      } else {
        el.style.animation = '';
      }
    });
    pvSync(idx);
    // 浏览态（用户正在翻歌词）不拽屏；3s 无交互后由 exitBrowse 平滑滚回
    if(!_lyricBrowsing && lines[idx]) lines[idx].scrollIntoView({block:'center',behavior:'smooth'});
  }

  // ── 行内进度：单独走逐帧，不再吊在 timeupdate 上 ──
  //
  // 原来进度跟着 timeupdate 走，而它一秒只来四次 —— 那条光扫过去是顿的。
  // 这里只做一件最轻的事：给当前行写一个 0–1 的进度，不碰 DOM 结构、不滚屏。
  // 换行仍然由 highlightLrc 负责，两边不重叠。
  var _kLines = null, _kIdx = -1, _kLen = -1;
  function updateKaraoke(timeMs) {
    try {
      if (!lrcData.length || !lyricOpen || !lyricBody || lyricBody.clientHeight <= 0) return;
      var idx = 0;
      for (var i = 0; i < lrcData.length; i++) { if (lrcData[i].time <= timeMs) idx = i; else break; }
      if (!_kLines || _kIdx !== idx || _kLen !== lrcData.length) {
        _kLines = lyricBody.querySelectorAll('.lyric-line');
        _kIdx = idx; _kLen = lrcData.length;
      }
      var line = _kLines && _kLines[idx];
      if (!line) return;
      var cur = lrcData[idx], nxt = lrcData[idx + 1];
      var prog = 1;
      if (cur && nxt && nxt.time > cur.time) {
        prog = (timeMs - cur.time) / (nxt.time - cur.time);
        prog = prog < 0 ? 0 : (prog > 1 ? 1 : prog);
      }
      line.style.setProperty('--lyric-progress', prog.toFixed(3));
      var pel=_pvLineEls[idx];
      if(pel){
        var wl=lrcData[idx] && lrcData[idx].words;
        if(wl && wl.length){
          // 逐字：每个字按自己的 begin/dur 扫亮
          var ws=pel.querySelectorAll('.pv-w');
          for(var wi=0; wi<wl.length && wi<ws.length; wi++){
            var wp2=(timeMs-wl[wi].time)/wl[wi].dur;
            wp2=wp2<0?0:(wp2>1?1:wp2);
            ws[wi].style.setProperty('--wp', wp2.toFixed(3));
          }
        } else {
          pel.style.setProperty('--lyric-progress', prog.toFixed(3));
        }
        // 光晕包络（folia resolveMonetGlow）：唱到峰值最亮，行尾驻留后消退。
        // drop-shadow 认渲染结果，字透明了也能发光（text-shadow 对透明字无用）。
        var gStart=cur.time, gEnd=cur.end||(nxt?nxt.time:cur.time+3000);
        var gLineEnd=nxt?nxt.time:gEnd+3000;
        var gi=_pvGlow(timeMs,gStart,gEnd,gLineEnd);
        if(gi>0.01){
          var fp=15*1.3;   // 基准字号×当前行缩放，近似足够
          var isCh=pel.classList.contains('chorus');
          var rr1=Math.round(fp*(isCh?0.45:0.28)), rr2=Math.round(fp*(isCh?0.9:0.65));
          var ga=Math.round(Math.min(1,gi*(isCh?1:0.88))*100);
          pel.style.filter='drop-shadow(0 0 '+rr1+'px color-mix(in srgb, var(--accent-glow) '+ga+'%, transparent)) drop-shadow(0 0 '+rr2+'px color-mix(in srgb, var(--accent-glow) '+ga+'%, transparent))';
        } else {
          pel.style.filter='none';
        }
      }
    } catch (e) {}
  }

  (function karaokeLoop() {
    try {
      if (!audio.paused) {
        var _t = audio.currentTime * 1000;
        updateKaraoke(_t);
        // 行切换也走帧循环（原来挂 timeupdate，只有 ~4Hz，行入场最多慢 250ms）
        // highlightLrc 幂等：行没变时 pvSync 里 idx===_pvIdx 直接返回，重复调零成本
        if (lrcData.length && lyricOpen) highlightLrc(_t);
      }
    } catch (e) {}
    requestAnimationFrame(karaokeLoop);
  })();

  // 逐字歌词源：从 meting 播放地址里抠 server+id，映射到 AMLL DB 的平台
  function _wordSourceOf(t){
    var u=String((t&&t.url)||'');
    var mi=/[?&]id=([^&]+)/.exec(u);
    if(!mi) return null;
    var ms=/[?&]server=([^&]+)/.exec(u);
    var sv=ms?ms[1]:(t.searchServer||'');
    var pf= sv==='netease'?'ncm': sv==='tencent'?'qq': null;
    if(!pf) return null;
    return {platform:pf, id:decodeURIComponent(mi[1])};
  }

  var _lastLrcKey='';
  function _loadLineLrc(lrcUrl, trackName){
    if(!lrcUrl && !trackName) return;
    var cached=_cachedLrcByUrl(lrcUrl);
    if(cached){ lrcData=cached; renderLrc(); return; }
    // 先读盘（离线歌词库）
    if(trackName){
      fetch(API+'/widget/api/lrc/load?name='+encodeURIComponent(trackName)).then(function(r){
        if(r.ok) return r.json();
        throw new Error('not on disk');
      }).then(function(res){
        if(res.ok && res.lrc){
          var parsed=parseLrc(res.lrc);
          _saveLrcCache(lrcUrl, parsed);
          lrcData=parsed;
          renderLrc();
        }else{
          throw new Error('no lrc');
        }
      }).catch(function(){
        // 读盘失败 → 走网络
        var proxyUrl=API+'/widget/api/music/lrc-proxy?url='+encodeURIComponent(lrcUrl);
        fetch(proxyUrl).then(function(r){return r.text();}).then(function(raw){
          if(!raw||raw.length<10) return;
          var parsed=parseLrc(raw);
          _saveLrcCache(lrcUrl, parsed);
          lrcData=parsed;
          renderLrc();
          // 网络拉到后落盘
          fetch(API+'/widget/api/lrc/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:trackName,lrc:raw})}).catch(function(){});
        }).catch(function(){});
      });
      return;
    }
    // 无 trackName（兼容旧调用）→ 直接走网络
    var proxyUrl=API+'/widget/api/music/lrc-proxy?url='+encodeURIComponent(lrcUrl);
    fetch(proxyUrl).then(function(r){return r.text();}).then(function(raw){
      if(!raw||raw.length<10) return;
      var parsed=parseLrc(raw);
      _saveLrcCache(lrcUrl, parsed);
      lrcData=parsed;
      renderLrc();
    }).catch(function(){});
  }
  setInterval(function(){
    var t=trks[idx];
    if(!t||!t.url) return;
    var lrcUrl=t.lrcUrl||lrcMap[t.url]||'';
    var lrcKey=t.url+'|'+lrcUrl;
    if(lrcKey===_lastLrcKey) return;
    _lastLrcKey=lrcKey;
    // PV 封面背景（folia Monet 层）：有封面就铺，没有就撤
    try{
      var bg=document.getElementById('pvBg');
      if(bg) bg.style.backgroundImage=t.pic?('url("'+String(t.pic).replace(/"/g,'')+'")'):'';
      window._jzCover=t.pic||'';
    }catch(e){}
    // 先试逐字（TTML）：拿到手行级/字级都有了，拿不到再退 LRC
    var wp=_wordSourceOf(t);
    if(wp){
      var wkey='ttml:'+wp.platform+':'+wp.id;
      var wc=_cachedLrcByUrl(wkey);
      if(wc){ lrcData=wc; renderLrc(); return; }
      fetch(API+'/widget/api/music/ttml?platform='+wp.platform+'&id='+encodeURIComponent(wp.id))
        .then(function(r){ return r.ok?r.text():null; })
        .then(function(raw){
          var parsed=raw?parseTtml(raw):null;
          if(parsed){
            _saveLrcCache(wkey, parsed);
            lrcData=parsed;
            renderLrc();
          } else {
            _loadLineLrc(lrcUrl, t.name);
          }
        }).catch(function(){ _loadLineLrc(lrcUrl, t.name); });
      return;
    }
    _loadLineLrc(lrcUrl, t.name);
  },800);

  // ── 队列歌词预取 ──
  //
  // 现状：切歌之后才开始拉歌词，用户在“暂无歌词”那一行上等一次网络往返。
  // 这里在当前曲目稳定播放几秒后，悄悄把**下一首**的歌词拉好放进本地缓存，
  // 切到它时直接命中缓存（缓存本来就是 _saveLrcCache / _cachedLrcByUrl 那套）。
  //
  // 三个约束：
  //   1. 只在播着的时候做（暂停时不该打扰网络）
  //   2. 同一首只预取一次（_prefetched 去重）
  //   3. 失败就静默 —— 预取是锦上添花，不影响任何主流程
  var _prefetchedKey = "";
  setInterval(function () {
    try {
      if (audio.paused) return;
      var next = trks[idx + 1];
      if (!next || !next.url) return;
      var nextLrc = next.lrcUrl || lrcMap[next.url] || "";
      if (!nextLrc) return;
      var key = next.url + "|" + nextLrc;
      if (key === _prefetchedKey) return;
      _prefetchedKey = key;
      if (_cachedLrcByUrl(nextLrc)) return;
      var proxyUrl = API + '/widget/api/music/lrc-proxy?url=' + encodeURIComponent(nextLrc);
      fetch(proxyUrl)
        .then(function (r) { return r.text(); })
        .then(function (raw) {
          if (!raw || raw.length < 10) return;
          _saveLrcCache(nextLrc, parseLrc(raw));
        })
        .catch(function () {});
    } catch (e) {}
  }, 7000);
})();

var lrcMap = {};
var busOpen=false;
document.getElementById('busToggle').addEventListener('click',function(){
  busOpen=!busOpen;
  document.getElementById('busBody').classList.toggle('open',busOpen);
  this.classList.toggle('open',busOpen);
  if(busOpen) refreshBus();
});
function refreshBus(){
  fetch(API+'/widget/api/bus/state').then(function(r){return r.json();}).then(function(s){
    var badge=document.getElementById('busStatusBadge');
    var st=s.status||'idle';
    badge.textContent=st==='idle'?'空闲':st==='playing'?'播放中':st==='paused'?'暂停':'错误';
    badge.className='bus-status'+(st==='playing'?' playing':st==='error'?' error':'');
    var qEl=document.getElementById('busQueue');
    if(!s.queue||!s.queue.length){
      qEl.innerHTML='<div class="bus-empty">编排队列为空</div>';
      return;
    }
    qEl.innerHTML=s.queue.map(function(item,i){
      var tp=item.type||'play';
      var label='';
      if(tp==='say') label=(item.text||'').slice(0,30);
      else if(tp==='play') label=item.name||item.url||'';
      else if(tp==='segue') label='过渡 '+(item.duration||3000)+'ms';
      else if(tp==='reason') label=(item.text||'').slice(0,30);
      var isCur = s.current && s.current.id===item.id;
      return '<div class="bus-queue-item" data-bus-idx="'+i+'" data-bus-id="'+esc(item.id||'')+'">'
        +'<span class="bus-q-type '+tp+'">'+tp+'</span>'
        +'<span class="bus-q-name'+(isCur?' bus-q-current':'')+'">'+esc(label)+'</span>'
        +'<button class="bus-q-rm" data-bus-rm="'+i+'" title="移除">✕</button>'
        +'</div>';
    }).join('');
    // Bus 队列条目删除事件委托
    qEl.onclick=function(e){
      var btn=e.target.closest('[data-bus-rm]');
      if(!btn) return;
      e.stopPropagation();
      var idx=parseInt(btn.dataset.busRm);
      busControl('remove',{index:idx});
    };
  }).catch(function(){});
}
function busControl(action,extra){
  // 乐观更新：立即反映 UI 变化，再异步确认
  if(action==='next') busOptimisticNext();
  else if(action==='remove' && extra && extra.index!=null) busOptimisticRemove(extra.index);
  else if(action==='clear') busOptimisticClear();

  var body=Object.assign({action:action},extra||{});
  return fetch(API+'/widget/api/bus/control',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  }).then(function(r){return r.json();}).then(function(res){
    refreshBus(); // 后端确认后刷新真实状态
    // say 合成失败：显示提示 + 自动跳到下一个
    if(res.event==='say_skipped') {
      showToast('语音生成失败（TTS 未启动），已跳过', 3000);
      setTimeout(function(){busControl('next');}, 500);
    }
    // 如果 bus 返回了播放条目，推入播放器
    if(res.event==='track_start' && res.item){
      // segue 类型：定时自动前进到下一首
      if(res.item.type==='segue' || (!res.item.url && res.item.duration)){
        var dur = res.item.duration || 3000;
        setTimeout(function(){busControl('next');}, dur);
      }
      // play 类型：推入播放器播放
      if(res.item.url){
        var url=res.item.url;
        if(TOKEN) url=tok(url);
        // Bus 播放：添加到主列表并播放，但不切换视图
        var bareUrl = url.split('?')[0];
        var exists = trks.some(function(t){ return (t.url||'').split('?')[0] === bareUrl; });
        if(!exists){
          trks.push({name:res.item.name||'Bus', url:url, mode:res.item.mode||'编排', dur:0, group:'编排'});
          load(trks.length-1);
          if(audio.paused){ audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)}); }
          saveTrks();
        }else{
          for(var i=0;i<trks.length;i++){ if((trks[i].url||'').split('?')[0]===bareUrl){ load(i); if(audio.paused) audio.play().catch(function(){}); break; } }
        }
        showToast('编排播放: '+res.item.name, 1500);
      }
    }
    return res;
  });
}

// ── 乐观更新函数 ──
function busOptimisticNext(){
  var items=document.getElementById('busQueue').querySelectorAll('.bus-queue-item');
  if(!items.length) return;
  // 找到当前高亮的，移到下一个
  var curIdx=-1;
  items.forEach(function(el,i){ if(el.querySelector('.bus-q-current')) curIdx=i; });
  var nextIdx = curIdx<items.length-1 ? curIdx+1 : 0;
  items.forEach(function(el,i){
    var name=el.querySelector('.bus-q-name');
    if(name) name.classList.toggle('bus-q-current', i===nextIdx);
  });
  // 更新状态徽章
  var badge=document.getElementById('busStatusBadge');
  if(badge){ badge.textContent='播放中'; badge.className='bus-status playing'; }
}
function busOptimisticRemove(idx){
  var items=document.getElementById('busQueue').querySelectorAll('.bus-queue-item');
  if(items[idx]) items[idx].style.opacity='0.3'; // 淡出，等服务端确认后 refreshBus 会移除
}
function busOptimisticClear(){
  document.getElementById('busQueue').innerHTML='<div class="bus-empty">编排队列为空</div>';
  var badge=document.getElementById('busStatusBadge');
  if(badge){ badge.textContent='空闲'; badge.className='bus-status'; }
}
document.getElementById('busPlayBtn').addEventListener('click',function(){
  fetch(API+'/widget/api/bus/state').then(function(r){return r.json();}).then(function(s){
    if(s.status==='paused'){busControl('resume');}
    else if(s.status==='playing'){}
    else if(s.queue && s.queue.length){busControl('next');}
  }).catch(function(){});
});
document.getElementById('busNextBtn').addEventListener('click',function(){busControl('next');});
document.getElementById('busClearBtn').addEventListener('click',function(){busControl('clear');});
// 添加播放条目到 Bus 队列
document.getElementById('busPlayAddBtn').addEventListener('click',function(){
  var url=document.getElementById('busPlayInput').value.trim();
  if(!url)return;
  document.getElementById('busPlayInput').value='';
  busControl('play',{url:url,name:url.split('/').pop().split('?')[0]||'音频'});
});
document.getElementById('busPlayInput').addEventListener('keydown',function(e){
  if(e.key==='Enter')document.getElementById('busPlayAddBtn').click();
});
// 定时刷新 bus 状态（面板打开时）
setInterval(function(){ if(busOpen) refreshBus(); }, 3000);

// ── Scene presets（场景调度）──
var SCENES = {
  work: {
    label: "💻 工作",
    playlist: [
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio16.mp3", name: "Deep Focus", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio19.mp3", name: "Ambient", mode: "在线" },
      { type: "segue", duration: 2000, effect: "silence" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio17.mp3", name: "Lo-fi Beats", mode: "在线" }
    ]
  },
  chill: {
    label: "☕ 休息",
    playlist: [
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio13.mp3", name: "Chillout", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio14.mp3", name: "Lounge", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio15.mp3", name: "Piano", mode: "在线" }
    ]
  },
  late_night: {
    label: "🌙 深夜",
    playlist: [
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio19.mp3", name: "Ambient", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio15.mp3", name: "Piano", mode: "在线" },
      { type: "segue", duration: 3000, effect: "silence" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio13.mp3", name: "Chillout", mode: "在线" }
    ]
  },
  exercise: {
    label: "🏃 运动",
    playlist: [
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio11.mp3", name: "Dance Hits", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio12.mp3", name: "Charts", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio16.mp3", name: "Deep Focus", mode: "在线" }
    ]
  },
  study: {
    label: "📚 学习",
    playlist: [
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio17.mp3", name: "Lo-fi Beats", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio16.mp3", name: "Deep Focus", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio15.mp3", name: "Piano", mode: "在线" }
    ]
  },
  game: {
    label: "🎮 游戏",
    playlist: [
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio11.mp3", name: "Dance Hits", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio19.mp3", name: "Ambient", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio17.mp3", name: "Lo-fi Beats", mode: "在线" }
    ]
  }
};

// 根据当前时间自动推茬场景
function autoScene(){
  var h=new Date().getHours();
  if(h>=9 && h<12) return "work";
  if(h>=12 && h<14) return "chill";
  if(h>=14 && h<18) return "work";
  if(h>=18 && h<22) return "chill";
  return "late_night";
}

function applyScene(key){
  var scene=SCENES[key];
  if(!scene) return;
  // UI 高亮
  document.querySelectorAll('.scene-card').forEach(function(b){ b.classList.toggle('active', b.dataset.scene===key); });
  // 场景切换 = 替换 Bus 队列（先 clear 再 load）
  fetch(API+'/widget/api/bus/control',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'clear'})
  }).then(function(){
    return fetch(API+'/widget/api/bus/control',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'load', playlist:scene.playlist})
    });
  }).then(function(r){return r.json();}).then(function(res){
    refreshBus();
    if(res.ok) setTimeout(function(){busControl('next');}, 300);
  });
}

// 场景按钮点击
var _sceneEditMode=false;
document.getElementById('sceneList').addEventListener('click', function(e){
  var btn=e.target.closest('.scene-card');
  if(!btn) return;
  if(_sceneEditMode) {
    // 编辑模式：显示场景编辑器
    e.stopPropagation();
    _renderSceneEditor(btn.dataset.scene);
    return;
  }
  applyScene(btn.dataset.scene);
});

// 初始化：显示推荐场景
(function initScene(){
  var rec=autoScene();
  var badge=document.getElementById('sceneBadge');
  badge.textContent='推荐: '+SCENES[rec].label;
  // 高亮但不自动加载
  document.querySelectorAll('.scene-card').forEach(function(b){ b.classList.toggle('active', b.dataset.scene===rec); });
})();

// 每分钟检查时间，更新推荐
setInterval(function(){
  var rec=autoScene();
  var badge=document.getElementById('sceneBadge');
  badge.textContent='推荐: '+SCENES[rec].label;
}, 60000);

// 场景持久化：修改后保存到 localStorage
function saveScenes(){
  try { localStorage.setItem('hanako_audio_scenes', JSON.stringify(SCENES)); } catch(e) {}
}
function loadScenes(){
  try {
    var saved = JSON.parse(localStorage.getItem('hanako_audio_scenes'));
    if(saved){ Object.keys(saved).forEach(function(k){ if(SCENES[k]) SCENES[k].playlist = saved[k].playlist; }); }
  } catch(e) {}
}
loadScenes();

// ── 场景编辑器 ──
var _SE_DEFAULT=['work','chill','late_night','exercise','study','game'];
function _seIsCustom(k){ return _SE_DEFAULT.indexOf(k)===-1; }

document.getElementById('sceneEditBtn').addEventListener('click',function(){
  _sceneEditMode=!_sceneEditMode;
  this.classList.toggle('editing',_sceneEditMode);
  this.textContent=_sceneEditMode?'完成':'编辑';
  if(!_sceneEditMode){
    document.getElementById('sceneEditor').style.display='none';
  }
});

function _renderSceneEditor(key){
  var scene=SCENES[key]; if(!scene) return;
  var editor=document.getElementById('sceneEditor');
  editor.style.display='block';
  var hdr=document.getElementById('sceneEditorHeader');
  var playItems=scene.playlist.filter(function(p){return p.type==='play';});
  var custom=_seIsCustom(key);
  hdr.innerHTML='<button class="scene-editor-back" id="_seBack">← 返回</button>'
    +'<span class="scene-editor-title">'+esc(scene.label)+' ('+playItems.length+'首)</span>'
    +(custom?'<button class="scene-editor-del" id="_seDel">删除场景</button>':'');
  var trkEl=document.getElementById('sceneEditorTracks');
  if(!playItems.length){
    trkEl.innerHTML='<div style="text-align:center;color:var(--text-faint);font-size:11px;padding:8px">暂无曲目，从播放列表添加</div>';
  } else {
    trkEl.innerHTML=playItems.map(function(item,i){
      return '<div class="scene-editor-track"><span class="set-name">'+esc(item.name||'音频')+'</span><button class="set-del" data-si="'+i+'">✕</button></div>';
    }).join('');
  }
  // 返回
  var backBtn=document.getElementById('_seBack');
  if(backBtn) backBtn.addEventListener('click',function(){
    document.getElementById('sceneEditor').style.display='none';
  });
  // 删除场景
  var delBtn=document.getElementById('_seDel');
  if(delBtn) delBtn.addEventListener('click',function(){
    if(!confirm('删除场景 "'+scene.label+'"？')) return;
    delete SCENES[key]; saveScenes();
    var card=document.querySelector('.scene-card[data-scene="'+key+'"]');
    if(card) card.remove();
    document.getElementById('sceneEditor').style.display='none';
    showToast('已删除场景',1500);
  });
  // 删除曲目
  trkEl.querySelectorAll('.set-del').forEach(function(btn){
    btn.addEventListener('click',function(){
      var si=parseInt(this.dataset.si);
      var pi=0;
      for(var i=0;i<scene.playlist.length;i++){
        if(scene.playlist[i].type==='play'){
          if(pi===si){ scene.playlist.splice(i,1); break; }
          pi++;
        }
      }
      saveScenes(); _renderSceneEditor(key);
    });
  });
}

// 从播放列表添加当前曲目到场景
document.getElementById('sceneEditorAdd').addEventListener('click',function(){
  var key=document.querySelector('.scene-card.active');
  if(!key) { showToast('请先选择场景',1500); return; }
  var sk=key.dataset.scene;
  if(!SCENES[sk]) { showToast('场景不存在',1500); return; }
  if(!trks.length||!trks[idx]) { showToast('没有在播放的曲目',1500); return; }
  var t=trks[idx];
  SCENES[sk].playlist.push({type:'play',url:t.url,name:t.name,mode:t.mode||'在线'});
  saveScenes(); _renderSceneEditor(sk);
  showToast('已添加: '+t.name,1500);
});

// 初始化

// 初始化：从服务器拉取完整播放列表（同步完成前 saveTrks 不写服务器）
fetch(API+'/widget/api/playlist').then(function(r){return r.json();}).then(function(data){
  if(data.ok && data.tracks && data.tracks.length) {
    var serverLen = data.tracks.length;
    if (serverLen > trks.length) {
      trks = data.tracks;
      idx = Math.max(0, trks.length - 1);
      trks.forEach(function(t){ if(t.url) t.url = t.url.split('?token=')[0].split('&token=')[0]; });
      renderPL();
    }
    var merged = false;
    data.tracks.forEach(function(t){
      var bareUrl=stripTok(t.url||'');
      var found=false;
      for(var i=0;i<trks.length;i++){if(stripTok(trks[i].url)===bareUrl){found=true;break;}}
      if(!found && bareUrl) {
        trks.push({name:t.name||t.url.split('/').pop(), url:tok(bareUrl), mode:t.mode||'本地', dur:0, group:t.group||'本地音乐'});
        merged = true;
      }
    });
    if(merged) { renderPL(); }
  }
  _initialSyncDone = true;
  if (trks.length > 0) {
    fetch(API+'/widget/api/playlist', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ tracks: trks })
    }).catch(function(){});
  }
}).catch(function(){
  _initialSyncDone = true;
});

// 定时轮询服务器同步（替代原来的 /widget/api/queue 轮询）
setInterval(function(){
  fetch(API+'/widget/api/playlist').then(function(r){return r.json();}).then(function(data){
    if(!data.ok || !data.tracks) return;
    var needSave = false;
    // 服务器有而本地没有 → 添加
    data.tracks.forEach(function(t){
      var bareUrl=stripTok(t.url||'');
      var found=false;
      for(var i=0;i<trks.length;i++){if(stripTok(trks[i].url)===stripTok(bareUrl)){found=true;break;}}
      if(!found) {
        trks.push({name:t.name||t.url.split('/').pop(), url:tok(bareUrl), mode:t.mode||'本地', dur:0, group:'本地音乐'});
        needSave = true;
      }
    });
    // 本地有而服务器没有 → 推送到服务器
    if(trks.length > data.tracks.length) {
      saveTrks();
    }
    if(needSave) { renderPL(); saveTrks(); }
  }).catch(function(){});
  // 验证本地文件是否仍存在（仅检查 /widget/media/ 开头的 URL）
  var toRemove=[];
  trks.forEach(function(t,i){
    if(t.url && t.url.indexOf('/widget/media/')!==-1 && t._checked){
      // 已经检测过 404 的，标记移除
      if(t._missing) toRemove.push(i);
    }
  });
  // 异步 HEAD 检查（每次最多检查 3 首，避免请求风暴）
  var checked=0;
  trks.forEach(function(t,i){
    if(t.url && t.url.indexOf('/widget/media/')!==-1 && !t._checked && checked<3){
      t._checked=true; checked++;
      fetch(t.url,{method:'HEAD'}).then(function(r){
        if(!r.ok) t._missing=true;
      }).catch(function(){ t._missing=true; });
    }
  });
  // 移除缺失的曲目
  if(toRemove.length){
    var currentRemoved = toRemove.indexOf(idx) !== -1;
    var beforeCount = toRemove.filter(function(i){ return i < idx; }).length;
    toRemove.sort(function(a,b){ return b-a; }).forEach(function(i){ trks.splice(i,1); });
    idx = Math.max(0, idx - beforeCount);
    if(idx>=trks.length) idx=Math.max(0,trks.length-1);
    if(currentRemoved) {
      if(trks.length) load(idx); else load(-1);
    }
    renderPL();
    saveTrks();
  }
}, 30000);

function notifySize() {
  try { parent.postMessage({type:'resize-request',payload:{height:document.body.scrollHeight}},'*'); } catch(e) {}
}

// Theme CSS
try {
  const pDoc = window.parent.document;
  const src = pDoc.getElementById('theme-style') || pDoc.querySelector('style[id*="theme"]');
  if (src) {
    const s = document.createElement('style');
    s.id = 'widget-theme';
    s.textContent = src.textContent || '';
    document.head.appendChild(s);
  }
} catch(e) {}

if (window.integration && typeof window.integration.initAll === 'function') {
  try { window.integration.initAll(); console.log('[Player] All modules initialized'); } catch(e) { console.warn('[Player] Module init failed:', e); }
}

parent.postMessage({type:'ready'},'*');
if (window.ResizeObserver) { new ResizeObserver(notifySize).observe(document.body); }
setTimeout(notifySize, 300);
})();

// ══ 配色主题（预设 + 自定义入口）══════════════════════════════
//
// 这一层只管「配色 + 背景」。明暗方向归 data-theme，频谱形态归
// spectrum / waveform 那套可视化主题 —— 三层各管一事，不互相顶。
//
// 配色复用 applyThemeToCSS()：它本来就是给 AI 主题写的 CSS 变量写入器，
// 没理由再写第二个。
//
// 自定义留的是**数据口子**而不是 UI：往 localStorage 的
// hana_audio_theme_custom 塞一个数组，元素形状与下面的预设一致，
// 面板里就会出现。
(function () {
  var PRESET_KEY = "hana_audio_theme_preset";
  var CUSTOM_KEY = "hana_audio_theme_custom";

  var PRESETS = [
    { id: "goldnight", name: "金夜", mode: "dark",
      colors: { primary: "#D4AF37", secondary: "#B39A62", accent: "#F3E7C4" },
      background: { kind: "gradient", from: "#0A0907", to: "#17130C", angle: 160,
        light: { kind: "gradient", from: "#F6EEDC", to: "#EDE0C2", angle: 160 } },
      animation: { speed: 1, glowIntensity: 0.25, pulse: 0.1 } },
    { id: "pitchblack", name: "暗夜", mode: "dark",
      colors: { primary: "#E8E8EC", secondary: "#8E8E96", accent: "#FFFFFF" },
      background: { kind: "solid", color: "#050505",
        light: { kind: "solid", color: "#F4F4F6" } },
      animation: { speed: 1, glowIntensity: 0.15, pulse: 0 } },
    { id: "amber", name: "暖褐", mode: null,
      colors: { primary: "#d49a6a", secondary: "#c48454" },
      background: { kind: "none" },
      animation: { speed: 1, glowIntensity: 0, pulse: 0 } },

    { id: "midnight", name: "深夜", mode: "dark",
      colors: { primary: "#6b8cff", secondary: "#4b6ef0", accent: "#9ab4ff" },
      background: { kind: "gradient", from: "#0c1020", to: "#1b2138", angle: 160,
        light: { kind: "gradient", from: "#f2f5ff", to: "#e4eaff", angle: 160 } },
      animation: { speed: 1.1, glowIntensity: 0.35, pulse: 0.2 } },

    { id: "neon", name: "霓虹", mode: "dark",
      colors: { primary: "#b06bff", secondary: "#ff5fa2", accent: "#ff8fd0" },
      background: { kind: "gradient", from: "#160c24", to: "#2b1036", angle: 140,
        light: { kind: "gradient", from: "#faf2ff", to: "#f3e6ff", angle: 140 } },
      animation: { speed: 1.25, glowIntensity: 0.6, pulse: 0.35 } },

    { id: "paper", name: "纸感", mode: "light",
      colors: { primary: "#8a7a5c", secondary: "#6f6148" },
      background: { kind: "solid", color: "#f7f1e4",
        light: { kind: "solid", color: "#f7f1e4" } },
      animation: { speed: 0.9, glowIntensity: 0.1, pulse: 0 } },

    { id: "core", name: "原色", mode: "dark",
      colors: { primary: "#d49a6a", secondary: "#c48454" },
      background: { kind: "gradient", from: "#101014", to: "#1d1d24", angle: 180,
        light: { kind: "gradient", from: "#f7f7f9", to: "#ececf0", angle: 180 } },
      animation: { speed: 1, glowIntensity: 0.15, pulse: 0 } },

    // 封面皮肤：伪预设，从当前曲目封面提取主色，用封面图做背景
    { id: "cover", name: "封面皮肤", mode: "dynamic",
      colors: { primary: "#d49a6a", secondary: "#c48454", accent: "#fff" },
      background: { kind: "cover", blur: 20, overlay: 0.5 },
      animation: { speed: 1, glowIntensity: 0.3, pulse: 0.15 } }
  ];

  function readCustom() {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      var arr = raw ? JSON.parse(raw) : null;
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (t) {
        return t && typeof t === "object" && t.id && t.colors;
      });
    } catch (e) {
      return [];
    }
  }

  function allThemes() { return PRESETS.concat(readCustom()); }

  function currentId() {
    try { return localStorage.getItem(PRESET_KEY) || ""; } catch (e) { return ""; }
  }

  function ensureBg() {
    var el = document.getElementById("themeBg");
    if (!el && document.body) {
      el = document.createElement("div");
      el.id = "themeBg";
      el.className = "theme-bg";
      document.body.insertBefore(el, document.body.firstChild);
    }
    // 音频反应不该只在背景里憋着 —— 单独一层盖在整页上，随能量呼吸。
    if (!document.getElementById("reactEdge") && document.body) {
      var re = document.createElement("div");
      re.id = "reactEdge";
      re.className = "react-edge";
      document.body.appendChild(re);
    }
    return el;
  }

  // 同一套主题要管两种明暗：深色背景碰到浅色界面会变成“左浅右深”两块打架，
  // 所以背景声明里可以带一个 light 变体，按当前 data-theme 选。
  function currentMode() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function resolveBg(bg) {
    if (!bg) return null;
    if (bg.light && currentMode() === "light") return bg.light;
    return bg;
  }

  function applyBackground(rawBg) {
    var el = ensureBg();
    if (!el) return;
    var bg = resolveBg(rawBg);
    if (!bg || !bg.kind || bg.kind === "none") {
      el.style.backgroundImage = "none";
      el.style.backgroundColor = "transparent";
      el.style.opacity = "0";
      return;
    }
    // 用 backgroundImage 而不是 background 简写：简写会把 background-size
    // 一起重置，而流动渐变需要 200% 的尺寸才能动起来。
    if (bg.kind === "solid") {
      el.style.backgroundImage = "none";
      el.style.backgroundColor = bg.color || "transparent";
      el.style.backgroundSize = "";
    } else if (bg.kind === "gradient") {
      el.style.backgroundColor = "transparent";
      el.style.backgroundImage =
        "linear-gradient(" + (bg.angle == null ? 160 : bg.angle) + "deg," +
        (bg.from || "#000") + "," + (bg.to || "#111") + ")";
      el.style.backgroundSize = "200% 200%";
    } else if (bg.kind === "image" && bg.url) {
      el.style.backgroundColor = "transparent";
      el.style.backgroundImage = 'url("' + bg.url + '")';
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
    } else if (bg.kind === "cover") {
      // 封面皮肤：用当前曲目封面做背景，模糊+压暗/压亮
      var coverUrl = window.__currentCoverUrl || null;
      if (!coverUrl) {
        // 没有封面时，退回到纯色
        el.style.backgroundImage = "none";
        el.style.backgroundColor = "#1a1a2e";
        el.style.opacity = "0";
        return;
      }
      el.style.backgroundColor = "transparent";
      el.style.backgroundImage = 'url("' + coverUrl + '")';
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.style.filter = "blur(" + (bg.blur || 20) + "px)";
      // 按明暗加蒙层
      var overlay = bg.overlay != null ? bg.overlay : 0.5;
      var mode = currentMode();
      var overlayColor = mode === "light" ? "rgba(255,255,255," + (1 - overlay) + ")" : "rgba(0,0,0," + overlay + ")";
      el.style.boxShadow = "inset 0 0 0 9999px " + overlayColor;
      el.style.opacity = "1";
    }
    el.style.opacity = bg.opacity == null ? "1" : String(bg.opacity);
  }

  // ══ 音频反应（低频能量驱动背景）══════════════════════════
  //
  // 前提已实测：音源走同源跳板（/music/go/:id）→ 302 到 CDN，
  // 带 crossOrigin="anonymous" 能加载成功（loadedmetadata），说明 CDN 的响应
  // 带 CORS 头 —— 没这一步，接上分析节点会被浏览器直接静音。
  //
  // 三条必须守住的边界：
  //   1. crossOrigin 只在“下一首”生效，不打断当前播放（改了要重新加载）
  //   2. 没加载成功就绝不建链（建了等于把声音送进不响的管子）
  //   3. AudioContext 不是 running 就关掉放弃（无手势时它必然是 suspended）
  var REACTIVE_KEY = "hana_audio_reactive";
  var REACTIVE_GAIN_KEY = "hana_audio_reactive_gain";
  var PV_BG_OPACITY_KEY = "hana_audio_pvbg_opacity";
  var reactive = { actx: null, analyser: null, data: null, raf: 0, gain: 2.4 };

  function pvBgOpacity() {
    try {
      var v = parseFloat(localStorage.getItem(PV_BG_OPACITY_KEY));
      return isFinite(v) && v >= 0.2 && v <= 1 ? v : 0.85;
    } catch (e) { return 0.85; }
  }

  function reactiveGain() {
    try {
      var v = parseFloat(localStorage.getItem(REACTIVE_GAIN_KEY));
      return isFinite(v) && v > 0 ? v : 2.4;
    } catch (e) { return 2.4; }
  }

  function reactiveWanted() {
    try { return localStorage.getItem(REACTIVE_KEY) === "1"; } catch (e) { return false; }
  }

  function setReactiveWanted(v) {
    try { localStorage.setItem(REACTIVE_KEY, v ? "1" : "0"); } catch (e) {}
    applyCorsMode();
  }

  function applyCorsMode() {
    var a = document.getElementById("audio");
    if (!a) return;
    try { a.crossOrigin = reactiveWanted() ? "anonymous" : null; } catch (e) {}
  }

  // 诊断上报：音频反应看不见效果，就把每个分叉的原因写出来。
  // 主机侧看不到这个 iframe 的 console，写出去才有人看得见。
  function postReactive(payload) {
    try {
      var m = /^\/api\/apps\/([^/]+)\//.exec(location.pathname);
      var base = "/api/apps/" + (m ? m[1] : "hanako-audio-player") + "/routes";
      fetch(base + "/api/_probe/size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ where: "reactive", probeKey: "reactive" }, payload)),
      }).catch(function () {});
    } catch (e) {}
  }

  function buildAudioGraph() {
    if (reactive.actx) return true;
    if (!reactiveWanted()) { postReactive({ stage: "off" }); return false; }
    var a = document.getElementById("audio");
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!a) { postReactive({ stage: "no-audio-el" }); return false; }
    if (!AC) { postReactive({ stage: "no-audiocontext" }); return false; }

    function attach(actx) {
      if (actx.state !== "running") return false;
      var srcNode = actx.createMediaElementSource(a);
      var an = actx.createAnalyser();
      an.fftSize = 128;
      an.smoothingTimeConstant = 0.82;
      srcNode.connect(an);
      an.connect(actx.destination);
      reactive.actx = actx;
      reactive.analyser = an;
      reactive.data = new Uint8Array(an.frequencyBinCount);
      startReactiveLoop();
      postReactive({ stage: "attached", state: actx.state });
      return true;
    }

    try {
      var actx = new AC();
      postReactive({ stage: "created", state: actx.state, crossOrigin: String(a.crossOrigin) });
      if (actx.state === "running") return attach(actx);
      // new AudioContext() 即使有手势，初始也常常是 suspended，必须显式 resume。
      actx.resume().then(function () {
        postReactive({ stage: "resume-ok", state: actx.state });
        if (!attach(actx)) { try { actx.close(); } catch (e) {} }
      }).catch(function (err) {
        postReactive({ stage: "resume-fail", err: String((err && err.message) || err) });
        try { actx.close(); } catch (e) {}
      });
    } catch (e) {
      postReactive({ stage: "throw", err: String((e && e.message) || e) });
    }
    return false;
  }

  function startReactiveLoop() {
    if (reactive.raf) return;
    var root = document.documentElement;
    var smooth = 0;
    (function tick() {
      reactive.raf = requestAnimationFrame(tick);
      var an = reactive.analyser, data = reactive.data;
      if (!an || !data) return;
      try {
        an.getByteFrequencyData(data);
        // 只取低频那段（前 1/4）：鼓点与贝斯，肉眼最容易“看到节拍”
        var n = Math.max(1, Math.floor(data.length / 4));
        var sum = 0;
        for (var i = 0; i < n; i++) sum += data[i];
        smooth = smooth * 0.86 + (sum / n / 255) * 0.14; // 平滑，免得一格一格跳
        // 台面上的低频能量本来就不大（归一化后常在 0.1–0.3），
        // 直接拿去做透明度就是“有也看不出来”。增益可调，存在 reactive.gain。
        var gain = smooth * (reactive.gain || 2.4);
        if (gain > 1) gain = 1;
        root.style.setProperty("--react-level", gain.toFixed(3));
        // 顺手把频谱摊给可视化用 —— 那边原来画的是模拟波形。
        // 零拷贝：就是同一个 buffer，analyser 每帧都在填它。
        window.__reactiveBins = data;
        window.__reactiveReady = true;
        /* 把 AudioContext 的实时状态摊出来：声音“又没了”的时候，
         * 要能一眼区分是上下文挂起（suspended）、还是整条链没建（ready=false）、
         * 还是其实都在跑（running）——这三种的修法完全不同。*/
        window.__reactiveState = reactive.actx ? reactive.actx.state : "closed";
        window.__reactiveWanted = true;
      } catch (e) {}
    })();
  }

  function wireReactive() {
    var a = document.getElementById("audio");
    if (!a) return;
    reactive.gain = reactiveGain();
    applyCorsMode();
    // 播放事件里试建链 —— 那时有用户手势，AudioContext 才可能 running
    a.addEventListener("play", function () { setTimeout(buildAudioGraph, 0); });
    // 加载失败：多半是这个音源没有 CORS 头 —— 撤回 CORS 模式，别让它播不了
    a.addEventListener("error", function () {
      if (reactiveWanted() && a.crossOrigin) {
        console.warn("[audio-reactive] 音源不支持 CORS，已撤回开关");
        try { a.crossOrigin = null; } catch (e) {}
        setReactiveWanted(false);
      }
    });
  }

  function applyPreset(t) {
    if (!t) return false;
    try { localStorage.setItem(PRESET_KEY, t.id); } catch (e) {}
    // 顺序要紧：applyTheme 被 patchApplyTheme 包过，会清掉行内的主题变量，
    // 所以必须**先**定明暗方向，**再**写配色与背景，否则刚写上的会被清掉。
    if (t.mode && typeof window.applyTheme === "function") {
      window.applyTheme(t.mode);
    }
    // cover 预设：异步取色，更新 CSS 变量
    if (t.id === 'cover' && window.__currentCoverUrl) {
      // __currentCoverUrl 存的就是同源代理地址（见曲目切换处），直接取色；
      // 不能再包一层 /music/pic 代理——双重编码后后端拿到的是编码过的相对路径，必失败
      var proxiedUrl = window.__currentCoverUrl;
      if (window.aiThemeGenerator && window.aiThemeGenerator.coverColorExtractor) {
        window.aiThemeGenerator.coverColorExtractor.extract(proxiedUrl).then(function(colors) {
          if (colors && typeof window.applyThemeToCSS === 'function') {
            window.applyThemeToCSS({
              colors: {
                primary: colors.primary || t.colors.primary,
                secondary: colors.secondary || t.colors.secondary,
                accent: colors.accent || t.colors.accent
              },
              animation: t.animation
            });
          }
        });
      }
    }
    if (typeof window.applyThemeToCSS === "function") {
      window.applyThemeToCSS({ colors: t.colors || {}, animation: t.animation });
    } else {
      console.warn("[theme] applyThemeToCSS 不可用，只应用背景");
    }
    applyBackground(t.background);
    return true;
  }

  // 挂到全局，供曲目切换时调用
  window.applyThemePreset = applyPreset;

  function renderPanel() {
    var grid = document.getElementById("themeGrid");
    if (!grid) return;
    var rt = document.getElementById("reactiveToggle");
    if (rt) rt.textContent = reactiveWanted() ? "开" : "关";
    var rg = document.getElementById("reactiveGain");
    if (rg) rg.value = String(reactive.gain || 2.4);
    var cur = currentId();
    grid.innerHTML = "";
    allThemes().forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "theme-chip" + (t.id === cur ? " active" : "");
      var dot = document.createElement("span");
      dot.className = "theme-chip-dot";
      dot.style.background = (t.colors && t.colors.primary) || "#888";
      var nm = document.createElement("span");
      nm.textContent = t.name || t.id;
      b.appendChild(dot);
      b.appendChild(nm);
      b.addEventListener("click", function () {
        applyPreset(t);
        renderPanel();
      });
      grid.appendChild(b);
    });
  }

  function ensurePanel() {
    var p = document.getElementById("themePanel");
    if (p) return p;
    p = document.createElement("div");
    p.id = "themePanel";
    p.className = "theme-panel";
    p.innerHTML =
      '<div class="theme-panel-inner">' +
      '<div class="theme-panel-head"><span>配色主题</span>' +
      '<button type="button" class="theme-panel-close">关闭</button></div>' +
      '<div class="theme-grid" id="themeGrid"></div>' +
      '<div class="theme-panel-foot">配色与背景跟着主题走；明暗方向由右上角主题按钮管——auto 跟随 Hana 宿主皮肤，也可手动锁定明暗。' +
      '<br>自定义：往 <code>hana_audio_theme_custom</code> 写一个数组（元素形状同预设）即会出现在这里。</div>' +
      '<div class="theme-toggle-row"><span>音频反应（背景随低频能量亮起）</span>' +
      '<button type="button" class="theme-panel-close" id="reactiveToggle">关</button></div>' +
      '<div class="theme-toggle-row"><span>强度</span>' +
      '<input type="range" id="reactiveGain" min="0.5" max="6" step="0.1" value="2.4"></div>' +
      '<div class="theme-toggle-row"><span>封面背景浓度</span>' +
      '<input type="range" id="pvBgOpacity" min="0.2" max="1" step="0.05"></div>' +
      '</div>';
    document.body.appendChild(p);
    // 滑杆拖的是 input 事件，不是 click —— 得单独接一根
    p.addEventListener("input", function (e) {
      if (e.target && e.target.id === "reactiveGain") {
        var v = parseFloat(e.target.value);
        if (isFinite(v) && v > 0) {
          reactive.gain = v;
          try { localStorage.setItem(REACTIVE_GAIN_KEY, String(v)); } catch (err) {}
        }
      }
      if (e.target && e.target.id === "pvBgOpacity") {
        var o = parseFloat(e.target.value);
        if (isFinite(o) && o >= 0.2) {
          var bg = document.getElementById("pvBg");
          if (bg) bg.style.opacity = String(o);
          try { localStorage.setItem(PV_BG_OPACITY_KEY, String(o)); } catch (err) {}
        }
      }
    });
    p.addEventListener("click", function (e) {
      if (e.target && e.target.id === "reactiveToggle") {
        var next = !reactiveWanted();
        setReactiveWanted(next);
        e.target.textContent = next ? "开" : "关";
        e.target.title = next ? "下一首开始生效" : "";
        return;
      }
      if (e.target === p ||
          (e.target && e.target.classList && e.target.classList.contains("theme-panel-close"))) {
        p.classList.remove("open");
      }
    });
    // 回填封面浓度：滑杆值与 pvBg inline 同步到已存的用户偏好
    var savedOp = pvBgOpacity();
    var opInput = p.querySelector("#pvBgOpacity");
    if (opInput) opInput.value = String(savedOp);
    var bgEl0 = document.getElementById("pvBg");
    if (bgEl0) bgEl0.style.opacity = String(savedOp);
    return p;
  }

  function boot() {
    ensureBg();

    // 明暗一变，背景要跟着换 —— 否则深色背景配浅色界面，左右两块直接打架。
    // 包一层而不是改 applyTheme 本体：那份代码被另一个补丁包过（清行内变量），
    // 两层都往后调原函数，就不怕先后。
    (function wrapApplyTheme() {
      if (typeof window.applyTheme !== "function" || window.applyTheme.__bgWrapped) return;
      var orig = window.applyTheme;
      window.applyTheme = function () {
        var r = orig.apply(this, arguments);
        try {
          var cur = allThemes().filter(function (x) { return x.id === currentId(); })[0];
          if (cur) applyBackground(cur.background);
        } catch (e) {}
        return r;
      };
      window.applyTheme.__bgWrapped = true;
    })();

    var btn = document.getElementById("paletteBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        var p = ensurePanel();
        renderPanel();
        p.classList.add("open");
      });
    }
    var saved = currentId();
    var t = allThemes().filter(function (x) { return x.id === saved; })[0];
    if (t) applyPreset(t);

    // popBtn 的图标/提示跟着视图走（紧凑=展开，完整=横竖版）
    function syncPop() {
      var b = document.getElementById("popBtn");
      if (!b) return;
      var compact = window.__hanaGetView && window.__hanaGetView() === "compact";
      b.title = compact ? "展开完整播放器" : "切换横竖版";
      b.innerHTML = compact
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3"/><path d="M16 3h3a2 2 0 012 2v3"/><path d="M8 21H5a2 2 0 01-2-2v-3"/><path d="M16 21h3a2 2 0 002-2v-3"/></svg>';
    }
    window.addEventListener("hana:view-changed", syncPop);
    setTimeout(syncPop, 600);
    setTimeout(syncPop, 1800);

    // ── 横幅按钮 → 在这里执行 ──
    // 横幅上的按钮点了只通知应用（notify-plugin），后端把命令落下来，
    // 这里轮询取走代执行。跨两道 RPC，约 1.5 秒延迟。
    var apiBase = (function () {
      var m = /^\/api\/apps\/([^/]+)\//.exec(location.pathname);
      return "/api/apps/" + (m ? m[1] : "hanako-audio-player") + "/routes";
    })();
    // （横幅按钮已撤：宿主的应用总线实测收不到 banner 事件。
    //   详见 lib/register-routes.js 顶部的说明。）

    // ── CORS 体检：音频直链能不能接 Web Audio ──
    //
    // “跟着声音动”的前提是能读到音频数据（AnalyserNode），而跨源音频
    // 一旦接上分析节点就会被浏览器直接静音 —— 除非那个源自己带 CORS 头。
    //
    // 判定方式很直接：浏览器对跨源 fetch **强制**检查 CORS 头。
    //   fetch 成功 → 有头，可以接；失败 → 没头，接上就是静音。
    // 拿当前正在播的地址去验，结果写回探针，主机侧读。
    function postCors(payload) {
      try {
        fetch(apiBase + "/api/_probe/size", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({ where: "cors-check", probeKey: "cors" }, payload)),
        }).catch(function () {});
      } catch (e) {}
    }
    // 音频元素版体检：临时元素 + crossOrigin 加载。
    //
    // 只有这条路能反映真实情况 —— 之前那个 fetch 版测的是跳板地址
    // （同源 /music/go/:id，内部 302 到 CDN），它失败可能只是缺访问票，
    // 跟“音源有没有 CORS 头”是两回事。
    var _corsChecked = "";
    setInterval(function () {
      try {
        var a = document.getElementById("audio");
        var src = a && (a.currentSrc || a.src);
        if (!src || src === _corsChecked) return;
        _corsChecked = src;
        var sameOrigin = src.indexOf(location.origin) === 0 || src.indexOf("http") !== 0;
        var probe = new Audio();
        probe.crossOrigin = "anonymous";
        probe.preload = "metadata";
        var done = false;
        var finish = function (ok, note) {
          if (done) return;
          done = true;
          try { probe.removeAttribute("src"); probe.load(); } catch (e) {}
          postCors({ mode: "audio-element", src: src.slice(0, 180), sameOrigin: sameOrigin, corsOk: ok, note: note });
        };
        probe.onloadedmetadata = function () { finish(true, "loadedmetadata"); };
        probe.onerror = function () { finish(false, "error"); };
        setTimeout(function () { finish(false, "timeout"); }, 15000);
        probe.src = src;
      } catch (e) {}
    }, 12000);

    wireReactive();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* ===== 黑胶旋转联动 ===== */
(function(){
'use strict';
var cover=document.getElementById('npCover');
var audio=document.querySelector('audio');
if(!cover||!audio)return;
function sync(){ cover.classList.toggle('spinning',!audio.paused); }
audio.addEventListener('play',sync);
audio.addEventListener('pause',sync);
sync();
})();

/* ===== 主 UI 对齐 ===== */
(function(){
'use strict';
/* D1. 首次注入后默认金夜主题（只设一次，之后用户自选） */
try{
  if(!localStorage.getItem('hana_audio_mainui_v1')){
    localStorage.setItem('hana_audio_mainui_v1','1');
    localStorage.setItem('hana_audio_theme_preset','goldnight');
    location.reload();
    return;
  }
}catch(e){}
/* D2. 顶栏三模式胶囊（标准/PV/歌词） */
function curMode(){ return document.body.classList.contains('jizura-mode')?2:(document.body.classList.contains('lyrics-mode')?1:0); }
function setMode(m){
  var btn=document.getElementById('lyricModeBtn');
  if(!btn)return;
  var guard=0;
  while(curMode()!==m&&guard++<6){ btn.click(); }
}
var header=document.querySelector('.header');
var actions=document.querySelector('.header-actions');
if(header&&actions&&!document.getElementById('modeCaps')){
  var caps=document.createElement('div');
  caps.className='mode-caps';caps.id='modeCaps';
  [['标准',0],['PV',2],['歌词',1]].filter(function(it){ return it[1]!==2 || document.documentElement.dataset.pv==='1'; }).forEach(function(it){
    var b=document.createElement('button');
    b.className='mc';b.textContent=it[0];b.dataset.m=it[1];
    b.onclick=function(){setMode(it[1]);syncCaps();};
    caps.appendChild(b);
  });
  header.insertBefore(caps,actions);
  window.syncCaps=function(){
    var m=curMode();
    caps.querySelectorAll('.mc').forEach(function(x){x.classList.toggle('on',+x.dataset.m===m)});
  };
  var mo=new MutationObserver(syncCaps);
  mo.observe(document.body,{attributes:true,attributeFilter:['class']});
  syncCaps();
}
/* D3. 分组双排 label */
var gs=document.querySelector('.group-selector');
var addBtn=document.getElementById('groupAddBtn');
var customBox=document.getElementById('customGroupTabs');
if(gs&&customBox&&!gs.querySelector('.gs-label')){
  var l1=document.createElement('span');l1.className='gs-label';l1.textContent='来源';
  gs.insertBefore(l1,gs.firstChild);
  var br=document.createElement('div');br.className='gs-break';
  var l2=document.createElement('span');l2.className='gs-label';l2.textContent='自建';
  gs.insertBefore(br,customBox);
  gs.insertBefore(l2,customBox);
}
/* D4. 行内组胶囊：包装 renderPL 后处理 */
function injectPills(){
  var plBody=document.getElementById('plBody');
  if(!plBody)return;
  plBody.querySelectorAll('.pl-group-body').forEach(function(body){
    var g=body.dataset.group||'';
    if(!g)return;
    body.querySelectorAll('.pl-item').forEach(function(item){
      if(item.querySelector('.jz-gpill'))return;
      var name=item.querySelector('.pl-name');
      if(!name)return;
      var pill=document.createElement('span');
      pill.className='jz-gpill';pill.textContent=g;
      name.after(pill);
    });
  });
}
if(typeof window.renderPL==='function'&&!window.renderPL._pillWrapped){
  var _r=window.renderPL;
  window.renderPL=function(){ _r.apply(this,arguments); injectPills(); };
  window.renderPL._pillWrapped=1;
}
injectPills();
})();