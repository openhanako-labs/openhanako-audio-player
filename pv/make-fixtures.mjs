// 生成拍点检测用的测试音（ffmpeg 合成，不入库；node pv/make-fixtures.mjs 随时重建）
// 用途：pv/test.html 里播它们，验证 ③ 检出来的 BPM 与真实节拍是否对得上。
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
mkdirSync(DIR, { recursive: true });

const KICK = (hz, dec) => `0.95*sin(2*PI*${hz}*t)*exp(-${dec}*mod(t\\,PERIOD))`;
const NOISE = '+0.04*random(0)';

/* 只放正拍：反拍瞬态会被 onset 检到，中位 IOI 就变成八分音符——那是算法正确、
 * 标签错误，测不准。真歌也有反拍，但那部分用 confidence 控，不用测试音控。 */
const CASES = [
  { bpm: 96, hz: 50, dec: 9 },
  { bpm: 120, hz: 55, dec: 10 },
  { bpm: 140, hz: 60, dec: 12 }
];

for (const c of CASES) {
  const period = (60 / c.bpm).toFixed(5);
  const expr = `${KICK(c.hz, c.dec).replace('PERIOD', period)}${NOISE}`;
  const out = join(DIR, `bpm-${c.bpm}.wav`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', `aevalsrc=${expr}:d=16:s=44100`, '-ac', '1', out], { stdio: 'inherit' });
  console.log(`pv/fixtures/bpm-${c.bpm}.wav  (${c.bpm} BPM, period ${period}s)`);
}
