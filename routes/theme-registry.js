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