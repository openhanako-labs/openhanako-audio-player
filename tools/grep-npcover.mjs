// grep-npcover.mjs
import { readFileSync } from 'node:fs';
const a = readFileSync('ui/app.js', 'utf8');
const lines = a.split('\n');
const hits = [];
lines.forEach((l, i) => {
  if (/npCover/.test(l)) hits.push((i + 1) + ': ' + l.trim().slice(0, 130));
});
console.log(hits.slice(0, 25).join('\n') || '(无)');