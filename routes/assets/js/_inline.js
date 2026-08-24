const fs = require('fs');
const path = require('path');

const pjPath = 'C:/Users/Administrator/.hanako/plugins/hanako-audio-player/routes/player.js';
const combinedPath = 'C:/Users/Administrator/.hanako/plugins/hanako-audio-player/assets/js/_combined.js';

let pj = fs.readFileSync(pjPath, 'utf-8');
const combined = fs.readFileSync(combinedPath, 'utf-8');

// Find the script tags block
const startMarker = '<!-- \u65b0\u589e\u529f\u80fd\u6a21\u5757 -->';
const startIdx = pj.indexOf(startMarker);

if (startIdx < 0) {
  console.log('ERROR: Start marker not found');
  process.exit(1);
}

// Find the closing </script> of the last external script tag
const searchFrom = startIdx;
const lastScriptClose = pj.indexOf('</script>', searchFrom);
const afterLastScript = lastScriptClose + '</script>'.length;

const oldBlock = pj.substring(startIdx, afterLastScript);
console.log('Old block length:', oldBlock.length);
console.log('Old block start:', oldBlock.substring(0, 100));
console.log('Old block end:', oldBlock.substring(oldBlock.length - 50));

const newBlock = '<!-- \u65b0\u589e\u529f\u80fd\u6a21\u5757 (\u5185\u8054) -->\n<script>\n' + combined + '\n</script>';

pj = pj.substring(0, startIdx) + newBlock + pj.substring(afterLastScript);

fs.writeFileSync(pjPath, pj, 'utf-8');
console.log('Done! New file length:', pj.length);
