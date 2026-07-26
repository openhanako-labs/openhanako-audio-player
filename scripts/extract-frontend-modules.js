const fs = require('fs');
const path = require('path');

const playerPath = 'W:/Games/Hanako/Work/plugins-rectify/hanako-audio-player/routes/player.js';
const assetsDir = 'W:/Games/Hanako/Work/plugins-rectify/hanako-audio-player/assets';

// Module definitions
const modules = [
  'audio-event-bus.js',
  'theme-registry.js',
  'settings-panel.js',
  'ai-theme-generator.js',
  'stage-contract.js',
  'lyrics-settings-panel.js',
  'integration.js',
];

let content = fs.readFileSync(playerPath, 'utf-8');

// Process each module - find by comment marker
for (const mod of modules) {
  const startMarker = `// === ${mod} ===`;
  const startIdx = content.indexOf(startMarker);
  
  if (startIdx === -1) {
    console.log(`Could not find start marker for ${mod}`);
    continue;
  }
  
  // Find the end of this block: look for next // === marker or end of file
  let searchFrom = startIdx + startMarker.length;
  let endIdx = -1;
  
  // Look for the next module marker
  for (const nextMod of modules) {
    if (nextMod === mod) continue;
    const nextMarker = `// === ${nextMod} ===`;
    const nextIdx = content.indexOf(nextMarker, searchFrom);
    if (nextIdx !== -1 && (endIdx === -1 || nextIdx < endIdx)) {
      endIdx = nextIdx;
    }
  }
  
  // Also look for end of inline modules block (e.g., closing script tag or end of template)
  const scriptEnd = content.indexOf('</script>', startIdx);
  if (scriptEnd !== -1 && (endIdx === -1 || scriptEnd < endIdx)) {
    endIdx = scriptEnd;
  }
  
  if (endIdx === -1) {
    console.log(`Could not find end marker for ${mod}`);
    continue;
  }
  
  // Find the start of the actual code (after the comment marker)
  let codeStart = content.indexOf('\n', startIdx) + 1;
  
  // Extract the module content
  const moduleContent = content.substring(codeStart, endIdx).trim();
  
  // Save to assets file
  const assetPath = path.join(assetsDir, mod);
  fs.writeFileSync(assetPath, moduleContent, 'utf-8');
  console.log(`Extracted ${mod} (${moduleContent.length} bytes)`);
  
  // Replace inline code with <script> tag
  const indent = content.substring(startIdx, startIdx + 2).replace(/[^\s]/g, ' ').trim();
  const scriptTag = `${indent}// === ${mod} ===\n${indent}<script src="assets/${mod}"></script>`;
  
  content = content.substring(0, startIdx) + scriptTag + content.substring(endIdx);
}

fs.writeFileSync(playerPath, content, 'utf-8');
console.log('Done');
