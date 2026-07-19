const fs = require('fs');
const path = require('path');

const jsDir = 'C:/Users/Administrator/.hanako/plugins/hanako-audio-player/assets/js';
const pjPath = 'C:/Users/Administrator/.hanako/plugins/hanako-audio-player/routes/player.js';

const files = ['audio-event-bus.js','theme-registry.js','settings-panel.js','ai-theme-generator.js','stage-contract.js','lyrics-settings-panel.js','integration.js'];

let combined = '';
for (const f of files) {
  let content = fs.readFileSync(path.join(jsDir, f), 'utf-8');
  combined += '// === ' + f + ' ===\n' + content + '\n';
}

// Escape for embedding inside a JS template literal (backtick string)
// Order matters: backslashes first, then backticks, then dollar-brace
let escaped = combined;
escaped = escaped.replace(/\\/g, '\\\\');     // \ -> \\
escaped = escaped.replace(/`/g, '\\`');        // ` -> \`
escaped = escaped.replace(/\$\{/g, '\\${');    // ${ -> \${

// Verify: check for UNESCAPED backticks (not preceded by \)
const hasRawBacktick = /(^|[^\\])`/.test(escaped);
const hasRawDollarBrace = /(^|[^\\])\$\{/.test(escaped);
console.log('Has unescaped backtick:', hasRawBacktick);
console.log('Has unescaped ${}:', hasRawDollarBrace);
if (hasRawBacktick || hasRawDollarBrace) {
  console.log('ERROR: Escaping failed!');
  process.exit(1);
}

// Now read player.js and replace the script tags
let pj = fs.readFileSync(pjPath, 'utf-8');

// Find the marker after </audio> and before <script>
const audioClose = '</audio>';
const audioIdx = pj.lastIndexOf(audioClose);
if (audioIdx < 0) {
  console.log('ERROR: </audio> not found');
  process.exit(1);
}

// Find the <script> that starts the main JS block (first <script> after </audio>)
const scriptStart = pj.indexOf('<script>', audioIdx);
if (scriptStart < 0) {
  console.log('ERROR: <script> after </audio> not found');
  process.exit(1);
}

// Insert our inline module script BEFORE the existing <script>
const insert = '\n<!-- \u65b0\u589e\u529f\u80fd\u6a21\u5757 (\u5185\u8054) -->\n<script>\n' + escaped + '\n</script>\n\n';

pj = pj.substring(0, scriptStart) + insert + pj.substring(scriptStart);

fs.writeFileSync(pjPath, pj, 'utf-8');
console.log('Done! File length:', pj.length);
