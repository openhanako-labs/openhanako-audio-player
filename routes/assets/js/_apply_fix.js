const fs = require('fs');

const pjPath = 'C:/Users/Administrator/.hanako/plugins/hanako-audio-player/routes/player.js';
let pj = fs.readFileSync(pjPath, 'utf-8');

// Fix 1: disable cache
pj = pj.replace(
  'const theme = await window.aiThemeGenerator.generateForTrack(currentTrack);\n    console.log(\'[AI Theme] Generated for track:\'',
  `if (window.aiThemeGenerator.cache) window.aiThemeGenerator.cache.clear();
    if (window.aiThemeGenerator.themePersistence) window.aiThemeGenerator.themePersistence.clear();
    const theme = await window.aiThemeGenerator.generateForTrack(currentTrack);
    console.log('[AI Theme] Generated for track:'`
);

// Fix 2: rewrite applyThemeToCSS - find by signature and replace from function start to its specific end
const funcStart = pj.indexOf('function applyThemeToCSS(theme) {');
if (funcStart < 0) {
  console.log('ERROR: applyThemeToCSS not found');
  process.exit(1);
}

// Find end of function - look for the closing } followed by class/function/comment
// The function ends with `console.log('[AI Theme] Applied to CSS:', colors.primary);\n}` then a blank line and next function
const searchFrom = funcStart;
const endMarker = "console.log('[AI Theme] Applied to CSS:', colors.primary);";
const endIdx = pj.indexOf(endMarker, searchFrom);
if (endIdx < 0) {
  console.log('ERROR: end marker not found');
  process.exit(1);
}
const afterLog = endIdx + endMarker.length;
// Skip to closing } and newline
const closeIdx = pj.indexOf('}', afterLog);
if (closeIdx < 0) {
  console.log('ERROR: closing brace not found');
  process.exit(1);
}
const funcEnd = closeIdx + 1;

const oldBody = pj.substring(funcStart, funcEnd);
console.log('Old body length:', oldBody.length);

const newBody = `function applyThemeToCSS(theme) {
  if (!theme || !theme.colors) return;

  const root = document.documentElement;
  const { colors, layout, animation } = theme;
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

  // 计算主色亮度
  const primaryHex = colors.primary || '#d49a6a';
  const primaryL = (() => {
    const m = primaryHex.match(/^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i);
    if (!m) return 0.5;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  })();

  // 颜色混合助手
  const mixColors = (h1, h2, ratio) => {
    const m1 = h1.match(/^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i);
    const m2 = h2.match(/^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i);
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
}`;

pj = pj.substring(0, funcStart) + newBody + pj.substring(funcEnd);
fs.writeFileSync(pjPath, pj, 'utf-8');
console.log('Done, new length:', pj.length);