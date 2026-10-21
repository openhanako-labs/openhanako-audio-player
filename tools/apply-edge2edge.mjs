// apply-edge2edge.mjs —— manifest 改 edge-to-edge 藏顶栏
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mfp = join(ROOT, 'manifest.json');
const m = JSON.parse(readFileSync(mfp, 'utf8'));

const card = m.contributes.cards.find(c => c.id === 'player');
if (!card) { console.error('找不到 player card'); process.exit(1); }
card.cardForm = 'edge-to-edge';
delete card.titlebar;
card.titleMode = 'hide';
m.minAppVersion = '0.1017.0';

writeFileSync(mfp, JSON.stringify(m, null, 2) + '\n', 'utf8');
console.log('manifest 已改：');
console.log('  cardForm:', card.cardForm, '| titleMode:', card.titleMode, '| minAppVersion:', m.minAppVersion);
console.log('  titlebar 已删：', card.titlebar === undefined);