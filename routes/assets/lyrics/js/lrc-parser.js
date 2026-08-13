/**
 * lrc-parser.js
 * LRC 歌词解析器 — AUDIO-09 独立歌词舞台
 * 
 * 将原始 LRC 文本解析为结构化数据
 * 支持多行合并（歌词 + 翻译）和边界情况处理
 * 支持逐字时间戳解析（用于 P4 逐字高亮动画）
 */

/**
 * 解析 LRC 原始文本为结构化数组
 * @param {string} raw - LRC 格式原始文本
 * @returns {Array<{time: number, text: string, translate?: string, words?: Array<{time: number, text: string, duration: number}>}>}
 */
function parseLrc(raw) {
  if (!raw || typeof raw !== 'string') return [];
  
  const lines = raw.split('\n');
  const result = [];
  
  for (const line of lines) {
    const m = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/);
    if (!m) continue;
    
    const ms = parseInt(m[1]) * 60000 + parseInt(m[2]) * 1000 
             + (m[3] ? parseInt(m[3].padEnd(3, '0')) : 0);
    const text = m[4].trim();
    
    if (text) {
      result.push({ time: ms, text });
    }
  }
  
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * 解析逐字时间戳格式的歌词
 * 支持格式：
 * 1. LRCLIB syncedLyrics: [00:00.123]每个(00:00.123,00:00.200)字(00:00.200,00:00.300)有
 * 2. 网易云 YRC 风格: [0:0.123]每个[0:0.200]字[0:0.300]有
 * 3. 简单逐字: [00:00.123]每[00:00.200]字[00:00.300]有
 * 
 * @param {string} raw - 原始歌词文本
 * @returns {Array<{time: number, text: string, translate?: string, words?: Array<{time: number, text: string, duration: number}�}>}
 */
function parseWordLevelLrc(raw) {
  if (!raw || typeof raw !== 'string') return [];
  
  const lines = raw.split('\n');
  const result = [];
  
  for (const line of lines) {
    // 尝试匹配带时间戳的行
    const m = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/);
    if (!m) continue;
    
    const ms = parseInt(m[1]) * 60000 + parseInt(m[2]) * 1000 
             + (m[3] ? parseInt(m[3].padEnd(3, '0')) : 0);
    const text = m[4].trim();
    
    if (!text) continue;
    
    // 尝试解析逐字时间戳
    const words = parseWordTimestamps(text);
    
    const lineData = { time: ms, text };
    if (words && words.length > 0) {
      lineData.words = words;
    }
    
    result.push(lineData);
  }
  
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * 解析文本中的逐字时间戳
 * 支持格式：
 * - (00:00.123,00:00.200)字 → 字从 123ms 到 200ms
 * - [00:00.123]字 → 字从 123ms 开始
 * - 字(00:00.123) → 字在 123ms
 * 
 * @param {string} text - 包含时间戳的文本
 * @returns {Array<{time: number, text: string, duration: number}> | null}
 */
function parseWordTimestamps(text) {
  if (!text) return null;
  
  const words = [];
  let lastIndex = 0;
  let remaining = text;
  
  // 匹配 (时间,时间)文字 格式
  const pattern1 = /\(([\d.]+),([\d.]+)\)([^()]+)/g;
  let match;
  
  while ((match = pattern1.exec(remaining)) !== null) {
    const startMs = parseFloat(match[1]) * 1000;
    const endMs = parseFloat(match[2]) * 1000;
    const wordText = match[3];
    
    // 添加时间戳前的文本（如果有）
    if (match.index > lastIndex) {
      const prevText = remaining.slice(lastIndex, match.index);
      words.push({
        time: startMs,
        text: prevText,
        duration: endMs - startMs
      });
    }
    
    words.push({
      time: startMs,
      text: wordText,
      duration: endMs - startMs
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // 如果没匹配到，尝试 [时间]文字 格式
  if (words.length === 0) {
    const pattern2 = /\[([\d.]+)\]([^[\]]+)/g;
    remaining = text;
    lastIndex = 0;
    
    while ((match = pattern2.exec(remaining)) !== null) {
      const startMs = parseFloat(match[1]) * 1000;
      const wordText = match[2];
      
      // 添加时间戳前的文本
      if (match.index > lastIndex) {
        words.push({
          time: startMs,
          text: remaining.slice(lastIndex, match.index),
          duration: 0
        });
      }
      
      words.push({
        time: startMs,
        text: wordText,
        duration: 0
      });
      
      lastIndex = match.index + match[0].length;
    }
  }
  
  // 如果没有找到任何时间戳，返回 null（降级为行级）
  if (words.length === 0) {
    return null;
  }
  
  // 添加剩余文本
  if (lastIndex < remaining.length) {
    words.push({
      time: words.length > 0 ? words[words.length - 1].time : 0,
      text: remaining.slice(lastIndex),
      duration: 0
    });
  }
  
  return words;
}

/**
 * 判断文本是否包含中文字符
 */
function _hasChinese(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}

/**
 * 判断文本是否可能为翻译（非中文歌词）
 * 独立判断：行内无中文字符 → 翻译候选
 */
function _isLikelyTranslation(text) {
  if (!text) return false;
  // 包含中文字符 → 不是翻译，是原文歌词
  if (_hasChinese(text)) return false;
  // 无中文字符 → 可能是英文/日文翻译或罗马音
  const latinRatio = (text.match(/[a-zA-Z]/g) || []).length / Math.max(text.length, 1);
  const kanaRatio = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length / Math.max(text.length, 1);
  const hasMeaningfulChars = latinRatio > 0.3 || kanaRatio > 0.1 || text.length > 2;
  return hasMeaningfulChars;
}

/**
 * 从原始 LRC 文本中智能提取翻译行
 * 策略：时间相近的相邻行视为歌词+翻译对
 * 
 * 判定逻辑（v2）：
 *   1. 当前行有中文 + 下一行无中文 → 翻译对（最可靠）
 *   2. 两行都无中文 → 用 latin/kana 比例启发式判断
 *   3. 两行都有中文 → 不合并（都是原文歌词）
 * 
 * @param {Array<{time: number, text: string}>} parsed - parseLrc 的输出
 * @param {number} [maxGap=800] - 判定为翻译的最大时间间隔(ms)
 * @returns {Array<{time: number, text: string, translate?: string}>}
 */
function mergeLyricsAndTranslate(parsed, maxGap) {
  maxGap = maxGap || 800;
  if (!parsed || !parsed.length) return parsed || [];
  
  const result = [];
  let i = 0;
  
  while (i < parsed.length) {
    const current = parsed[i];
    
    // 检查下一行是否是翻译
    if (i + 1 < parsed.length) {
      const next = parsed[i + 1];
      const gap = next.time - current.time;
      
      // 时间差阈值内才考虑合并
      if (gap <= maxGap && gap >= 0) {
        const currentHasChinese = _hasChinese(current.text);
        const nextHasChinese = _hasChinese(next.text);
        
        let isTranslation = false;
        
        // 场景1: 当前行有中文 + 下一行无中文 → 最可靠的翻译对
        if (currentHasChinese && !nextHasChinese) {
          isTranslation = true;
        }
        // 场景2: 两行都无中文（纯英文/日文歌）→ 用旧启发式判断
        else if (!currentHasChinese && !nextHasChinese) {
          isTranslation = _isLikelyTranslation(next.text);
        }
        // 场景3: 两行都有中文 → 不合并，都是原文歌词
        
        if (isTranslation) {
          result.push({
            time: current.time,
            text: current.text,
            translate: next.text
          });
          i += 2;
          continue;
        }
      }
    }
    
    result.push(current);
    i++;
  }
  
  return result;
}

/**
 * 解析并合并歌词与翻译
 * @param {string} raw - LRC 原始文本
 * @returns {Array<{time: number, text: string, translate?: string, words?: Array<{time: number, text: string, duration: number}�}>}
 */
function parseLrcWithTranslate(raw) {
  const parsed = parseLrc(raw);
  return mergeLyricsAndTranslate(parsed);
}

/**
 * 智能解析：优先尝试逐字解析，失败则降级为行级解析
 * @param {string} raw - LRC 原始文本
 * @returns {Array<{time: number, text: string, translate?: string, words?: Array<{time: number, text: string, duration: number}�}>}
 */
function parseLyricsSmart(raw) {
  // 先尝试逐字解析
  const wordLevel = parseWordLevelLrc(raw);
  
  // 如果解析到了逐字数据，返回
  if (wordLevel.length > 0 && wordLevel.some(l => l.words && l.words.length > 0)) {
    return mergeLyricsAndTranslate(wordLevel);
  }
  
  // 否则降级为行级解析
  return mergeLyricsAndTranslate(parseLrc(raw));
}

// 导出（供浏览器全局使用）
if (typeof window !== 'undefined') {
  window.parseLrc = parseLrc;
  window.parseWordLevelLrc = parseWordLevelLrc;
  window.parseLyricsSmart = parseLyricsSmart;
  window.mergeLyricsAndTranslate = mergeLyricsAndTranslate;
  window.parseLrcWithTranslate = parseLrcWithTranslate;
}

// 导出（供模块系统使用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    parseLrc, 
    parseWordLevelLrc,
    parseLyricsSmart,
    mergeLyricsAndTranslate, 
    parseLrcWithTranslate 
  };
}
