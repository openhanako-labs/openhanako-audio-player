const fs = require('fs');
const path = 'W:/Games/Hanako/Work/plugins-rectify/hanako-audio-player/routes/player.js';

const modules = [
  'audio-event-bus.js',
  'theme-registry.js',
  'settings-panel.js',
  'ai-theme-generator.js',
  'stage-contract.js',
  'lyrics-settings-panel.js',
  'integration.js',
];

let content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

// Find the start and end of the inline modules block
const startMarker = '// === audio-event-bus.js ===';
const endMarker = '</script>'; // The closing </script> after integration.js

let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(startMarker)) {
    startIdx = i;
  }
  if (startIdx !== -1 && endIdx === -1 && i > startIdx && lines[i].includes(endMarker)) {
    endIdx = i;
    break;
  }
}

console.log(`Inline modules block: lines ${startIdx + 1} to ${endIdx + 1}`);

if (startIdx === -1 || endIdx === -1) {
  console.log('Could not find inline modules block');
  process.exit(1);
}

// Find all module boundaries
const boundaries = [];
for (const mod of modules) {
  const marker = `// === ${mod} ===`;
  for (let i = startIdx; i < endIdx; i++) {
    if (lines[i].includes(marker)) {
      boundaries.push({ name: mod, start: i });
      break;
    }
  }
}

// Sort by line number
boundaries.sort((a, b) => a.start - b.start);

// For each module, find its end (next module's start or end of block)
for (let i = 0; i < boundaries.length; i++) {
  const mod = boundaries[i];
  const nextStart = i < boundaries.length - 1 ? boundaries[i + 1].start : endIdx;
  
  // Extract the module content (skip the comment marker line)
  const contentStart = mod.start + 1;
  const contentEnd = nextStart;
  const moduleContent = lines.slice(contentStart, contentEnd).join('\n').trim();
  
  // Save to assets file
  const assetPath = `W:/Games/Hanako/Work/plugins-rectify/hanako-audio-player/assets/${mod.name}`;
  fs.writeFileSync(assetPath, moduleContent, 'utf-8');
  console.log(`Extracted ${mod.name}: ${moduleContent.length} bytes`);
}

// Replace the inline block with script tags
const newLines = [];
newLines.push(...lines.slice(0, startIdx));

// Add the script tags with proper indentation
// Find the indentation from the first line of the inline block
const indent = lines[startIdx].match(/^\s*/)[0];

for (const mod of modules) {
  newLines.push(`${indent}<script src="assets/${mod}"></script>`);
}

// Add the closing </script> and the rest of the file
newLines.push(...lines.slice(endIdx));

fs.writeFileSync(path, newLines.join('\n'), 'utf-8');
console.log(`Done. Replaced ${boundaries.length} modules.`);
