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