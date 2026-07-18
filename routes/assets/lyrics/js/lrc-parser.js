/**
 * lrc-parser.js
 * LRC 歌词解析器 — AUDIO-09 独立歌词舞台
 * 
 * 将原始 LRC 文本解析为结构化数据
 * 支持多行合并（歌词 + 翻译）和边界情况处理
 */

/**
 * 解析 LRC 原始文本为结构化数组
 * @param {string} raw - LRC 格式原始文本
 * @returns {Array<{time: number, text: string, translate?: string}>}
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
 * 从原始 LRC 文本中智能提取翻译行
 * 策略：时间相近的相邻行视为歌词+翻译对
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
      
      // 如果时间差很小（≤maxGap），且下一行是英文/日文等非中文
      if (gap <= maxGap && gap >= 0 && _isNonChinese(next.text)) {
        result.push({
          time: current.time,
          text: current.text,
          translate: next.text
        });
        i += 2;
        continue;
      }
    }
    
    result.push(current);
    i++;
  }
  
  return result;
}

/**
 * 判断文本是否可能为翻译（非中文）
 */
function _isNonChinese(text) {
  if (!text) return false;
  // 包含较多英文字符或日文假名 → 可能是翻译
  const latinRatio = (text.match(/[a-zA-Z]/g) || []).length / Math.max(text.length, 1);
  const kanaRatio = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length / Math.max(text.length, 1);
  return latinRatio > 0.3 || kanaRatio > 0.1;
}

/**
 * 解析并合并歌词与翻译
 * @param {string} raw - LRC 原始文本
 * @returns {Array<{time: number, text: string, translate?: string}>}
 */
function parseLrcWithTranslate(raw) {
  const parsed = parseLrc(raw);
  return mergeLyricsAndTranslate(parsed);
}

// 导出（供浏览器全局使用）
if (typeof window !== 'undefined') {
  window.parseLrc = parseLrc;
  window.mergeLyricsAndTranslate = mergeLyricsAndTranslate;
  window.parseLrcWithTranslate = parseLrcWithTranslate;
}

// 导出（供模块系统使用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseLrc, mergeLyricsAndTranslate, parseLrcWithTranslate };
}
