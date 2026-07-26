const fs = require('fs');
const path = 'W:/Games/Hanako/Work/plugins-rectify/hanako-audio-player/routes/player.js';

let content = fs.readFileSync(path, 'utf-8');
const lines = content.split('\n');

// Find the section with the script tags
const startMarker = '<!-- 新增功能模块 (内联) -->';
const endMarker = '</html>`;';

const startIdx = lines.findIndex(l => l.includes(startMarker));
const endIdx = lines.findIndex(l => l.includes(endMarker));

console.log(`Found start at line ${startIdx + 1}, end at line ${endIdx + 1}`);

if (startIdx !== -1 && endIdx !== -1) {
  const newLines = [];
  
  // Add everything before the broken section
  newLines.push(...lines.slice(0, startIdx));
  
  // Add the script tags properly
  newLines.push('<!-- 新增功能模块 (内联) -->');
  newLines.push('<script src="assets/audio-event-bus.js"></script>');
  newLines.push('<script src="assets/theme-registry.js"></script>');
  newLines.push('<script src="assets/settings-panel.js"></script>');
  newLines.push('<script src="assets/ai-theme-generator.js"></script>');
  newLines.push('<script src="assets/stage-contract.js"></script>');
  newLines.push('<script src="assets/lyrics-settings-panel.js"></script>');
  newLines.push('<script src="assets/integration.js"></script>');
  newLines.push('');
  newLines.push('<script>');
  
  // Keep the inline code that comes after the broken section
  // Find where the actual inline code starts (after the broken script tags)
  const inlineStart = lines.findIndex((l, i) => i > startIdx && l.includes('(function(){'));
  if (inlineStart !== -1) {
    newLines.push(...lines.slice(inlineStart, endIdx));
  }
  
  // Add closing tags and the rest of the file
  newLines.push('</script>');
  newLines.push('</body>');
  newLines.push('</html>`;');
  newLines.push('    return c.html(html);');
  newLines.push('  });');
  newLines.push('');
  
  // Find what comes after the `});` that closes the route handler
  // and add the rest of the file
  const afterRoute = lines.findIndex((l, i) => i > endIdx && l.includes('};\n\n') || (l.includes('}') && i > endIdx + 5));
  if (afterRoute !== -1) {
    newLines.push(...lines.slice(afterRoute));
  }
  
  fs.writeFileSync(path, newLines.join('\n'), 'utf-8');
  console.log(`Fixed. New line count: ${newLines.length}, old: ${lines.length}`);
} else {
  console.log('Could not find markers');
  console.log('startIdx:', startIdx, 'endIdx:', endIdx);
}
