// grep-textvars.mjs
import { readFileSync } from 'node:fs';
const css = readFileSync('ui/style.css', 'utf8');
const lines = css.split('\n');
lines.forEach((l, i) => {
  if (/^:root/.test(l.trim()) || /data-theme="light"/.test(l) || /data-theme="dark"/.test(l) ||
      /--text-light\s*:/.test(l) || /--text-muted\s*:/.test(l) || /--text\s*:/.test(l) || /--border\s*:/.test(l)) {
    console.log((i + 1) + ': ' + l.trim().slice(0, 110));
  }
});