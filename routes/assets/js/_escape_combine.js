const fs = require('fs');
const path = require('path');

const jsDir = 'C:/Users/Administrator/.hanako/plugins/hanako-audio-player/assets/js';
const files = ['audio-event-bus.js','theme-registry.js','settings-panel.js','ai-theme-generator.js','stage-contract.js','lyrics-match-chain.js','lyrics-settings-panel.js','integration.js'];

let combined = '';
for (const f of files) {
  let content = fs.readFileSync(path.join(jsDir, f), 'utf-8');
  // Escape for template literal: backtick, dollar-brace, backslash
  content = content.replace(/\\/g, '\\\\');  // \ -> \\
  content = content.replace(/`/g, '\\`');    // ` -> \`
  content = content.replace(/\$\{/g, '\\${'); // ${ -> \${
  combined += '// === ' + f + ' ===\n' + content + '\n';
}

fs.writeFileSync(path.join(jsDir, '_escaped.js'), combined, 'utf-8');

// Verify
if (combined.includes('`')) {
  console.log('ERROR: Still has backticks!');
  process.exit(1);
}
if (combined.includes('${') && !combined.includes('\\${')) {
  console.log('ERROR: Still has unescaped ${}!');
  process.exit(1);
}
console.log('OK, length=' + combined.length);
