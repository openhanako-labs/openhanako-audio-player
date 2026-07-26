const fs = require('fs');
const path = 'W:/Games/Hanako/Work/plugins-rectify/hanako-audio-player/routes/player.js';
let content = fs.readFileSync(path, 'utf-8');

// Find and replace the METING block
const startMarker = '  // ── Meting 音乐搜索代理（HTTP 代理到公共/本地 Meting 实例） ──';
const endMarker = '  app.get("/widget/api/music/search", async (c) => {';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  const before = content.substring(0, startIdx);
  const after = content.substring(endIdx);
  const replacement = '  const { METING_NODES, fetchMetingWithFallback, metingAuth } = require("./lib/meting-proxy.js");\n  const metingCache = new Map();\n  const metingCacheTTL = 5 * 60 * 1000;\n\n';
  content = before + replacement + after;
  fs.writeFileSync(path, content, 'utf-8');
  console.log('Replacement done');
  console.log('Old length:', content.length + (endIdx - startIdx) - replacement.length);
} else {
  console.log('Markers not found');
}
