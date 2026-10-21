/**
 * tests/auto-play.test.js — auto-play 触发判定 / 文案 / 冷却 纯函数单测。
 *
 * 只覆盖与 ctx / 宿主运行时 / 外网解耦的纯逻辑（judgeTrigger / hourVibe /
 * buildSelectPrompt / cooldownTick / cooldownKeyFor）。session:send 投递与
 * 真实 agent 选歌属集成层，见报告里「未实测」部分（依赖宿主运行时）。
 *
 * 运行：node --test tests/auto-play.test.js
 * ponytail: 确定性，不依赖外网；与本仓库 tests/phase3-backend.test.js 的外网
 *   测试相互独立，不会互相污染。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  judgeTrigger,
  hourVibe,
  buildSelectPrompt,
  cooldownKeyFor,
  cooldownTick,
  COOLDOWN_MS,
} from "../lib/auto-play.js";

// ── hourVibe ──────────────────────────────────────────

test("hourVibe: 各时段映射到预期 vibe", () => {
  assert.equal(hourVibe(0).vibe, "深夜");
  assert.equal(hourVibe(3).vibe, "深夜");
  assert.equal(hourVibe(6).vibe, "清晨");
  assert.equal(hourVibe(10).vibe, "专注");
  assert.equal(hourVibe(13).vibe, "休闲");
  assert.equal(hourVibe(15).vibe, "活力");
  assert.equal(hourVibe(20).vibe, "放松");
  assert.equal(hourVibe(23).vibe, "深夜");
});

test("hourVibe: 越界/负数小时按 24 取模", () => {
  assert.equal(hourVibe(24).vibe, "深夜"); // 24 % 24 = 0
  assert.equal(hourVibe(-1).vibe, "深夜"); // (-1+24)%24 = 23
  assert.equal(hourVibe(-6).vibe, "放松"); // (-6+24)%24 = 18 → 18-22 放松
});

// ── judgeTrigger: 显式要歌 ─────────────────────────────

test("judgeTrigger: 显式要歌强触发（多句式）", () => {
  const cases = ["放首周杰伦", "来点音乐", "帮我点歌", "整首歌听一下", "来个歌单", "推荐点歌听听"];
  for (const c of cases) {
    const r = judgeTrigger({ text: c, hour: 10 });
    assert.equal(r.trigger, true, `应触发: ${c}`);
    assert.equal(r.kind, "explicit", `应为 explicit: ${c}`);
    assert.equal(r.vibe, null);
  }
});

test("judgeTrigger: 正则类显式（适合…听 / 背景音乐）", () => {
  assert.equal(judgeTrigger({ text: "适合深夜听的音乐", hour: 1 }).kind, "explicit");
  assert.equal(judgeTrigger({ text: "来点背景音乐", hour: 14 }).kind, "explicit");
  assert.equal(judgeTrigger({ text: "bgm 来一首", hour: 14 }).kind, "explicit");
});

test("judgeTrigger: 空文本不触发", () => {
  const r = judgeTrigger({ text: "   ", hour: 10 });
  assert.equal(r.trigger, false);
  assert.equal(r.kind, null);
});

// ── judgeTrigger: 心情 ────────────────────────────────

test("judgeTrigger: 心情弱触发（累/放松/开心/专注/难过/运动）", () => {
  const cases = [
    ["今天好累", "放松"],
    ["想躺会儿放松一下", "放松"],
    ["好开心啊哈哈", "活力"],
    ["我要专注写代码", "专注"],
    ["有点难过", "治愈"],
    ["去健身运动了", "活力"],
  ];
  for (const [c, expectVibe] of cases) {
    const r = judgeTrigger({ text: c, hour: 10 });
    assert.equal(r.trigger, true, `应触发: ${c}`);
    assert.equal(r.kind, "mood", `应为 mood: ${c}`);
    assert.equal(r.vibe, expectVibe, `vibe 应为 ${expectVibe}: ${c}`);
    assert.ok(r.keywords && r.keywords.length > 0, `应有 keywords: ${c}`);
  }
});

// ── judgeTrigger: 时段兜底 ─────────────────────────────

test("judgeTrigger: 无显式/心情时落到时段触发", () => {
  // 「在干嘛」不含任何心情词，应走时段（hour=10 → 专注）
  const r = judgeTrigger({ text: "你在干嘛", hour: 10 });
  assert.equal(r.trigger, true);
  assert.equal(r.kind, "hour");
  assert.equal(r.vibe, "专注");
});

// ── buildSelectPrompt ─────────────────────────────────

test("buildSelectPrompt: explicit 不带 vibe，给原意检索指引", () => {
  const p = buildSelectPrompt({ kind: "explicit" });
  assert.ok(p.includes("audio_list_music"));
  assert.ok(p.includes("audio_find_play"));
  assert.ok(!p.includes("氛围为"));
});

test("buildSelectPrompt: mood/hour 带 vibe + 关键词，明确不打断话题", () => {
  const p = buildSelectPrompt({ kind: "mood", vibe: "放松", keywords: "舒缓 治愈", desc: "听起来有点累" });
  assert.ok(p.includes("氛围为「放松」"));
  assert.ok(p.includes("舒缓 治愈"));
  assert.ok(p.includes("不打断"));
  const p2 = buildSelectPrompt({ kind: "hour", vibe: "专注", keywords: "专注 钢琴" });
  assert.ok(p2.includes("氛围为「专注」"));
});

test("buildSelectPrompt: 带会话标题", () => {
  const p = buildSelectPrompt({ kind: "hour", vibe: "深夜", keywords: "Lo-fi", sessionTitle: "我的日记" });
  assert.ok(p.includes("会话「我的日记」"));
});

// ── cooldown ──────────────────────────────────────────

test("cooldownKeyFor: hour 按 4h 分段", () => {
  assert.equal(cooldownKeyFor("hour", 3), "hour:0");   // 0-3
  assert.equal(cooldownKeyFor("hour", 10), "hour:2");  // 8-11
  assert.equal(cooldownKeyFor("hour", 23), "hour:5");  // 20-23
  assert.equal(cooldownKeyFor("mood", 10), "mood");
});

test("cooldownTick: explicit 永不冷却", () => {
  const { allowed } = cooldownTick({}, { kind: "explicit", hour: 10 }, 1000);
  assert.equal(allowed, true);
  // 同毫秒再判仍允许
  const { allowed: a2 } = cooldownTick({ "cooldown:noop": 0 }, { kind: "explicit", hour: 10 }, 1000);
  assert.equal(a2, true);
});

test("cooldownTick: mood 10min 窗口内拒绝、窗口后允许", () => {
  const t0 = 1_000_000;
  const r1 = cooldownTick({}, { kind: "mood", hour: 10 }, t0);
  assert.equal(r1.allowed, true, "首次应允许");
  // 9 分钟后（<10min）再判 → 拒绝
  const r2 = cooldownTick(r1.store, { kind: "mood", hour: 10 }, t0 + 9 * 60 * 1000);
  assert.equal(r2.allowed, false, "窗口内应拒绝");
  // 11 分钟后 → 允许且更新时间戳
  const r3 = cooldownTick(r1.store, { kind: "mood", hour: 10 }, t0 + 11 * 60 * 1000);
  assert.equal(r3.allowed, true, "窗口后允许");
  assert.equal(r3.store["mood"], t0 + 11 * 60 * 1000);
});

test("cooldownTick: hour 4h 分段时间窗隔离（不同段互不冷却）", () => {
  const t0 = 1_000_000;
  const r1 = cooldownTick({}, { kind: "hour", hour: 10 }, t0); // hour:2
  assert.equal(r1.allowed, true);
  assert.equal(r1.store["hour:2"], t0);
  // 同段（hour=9 仍属 hour:2）3h 后再判 → 拒绝
  const r2 = cooldownTick(r1.store, { kind: "hour", hour: 9 }, t0 + 3 * 60 * 60 * 1000);
  assert.equal(r2.allowed, false, "同段窗口内拒绝");
  // 全新 key（之前未触发过的段）首判必须允许——不能用 epoch 0 误判冷却
  const fresh = cooldownTick({}, { kind: "hour", hour: 16 }, t0 + 3 * 60 * 60 * 1000);
  assert.equal(fresh.allowed, true, "全新段首判允许");
  // 跨段（hour=16 → hour:4）应允许，且只更新 hour:4，hour:2 不动
  const r3 = cooldownTick(r1.store, { kind: "hour", hour: 16 }, t0 + 3 * 60 * 60 * 1000);
  assert.equal(r3.allowed, true, "跨段允许");
  assert.equal(r3.store["hour:4"] > 0, true);
  assert.equal(r3.store["hour:2"], t0, "hour:2 时间戳不变");
});

test("COOLDOWN_MS 常量符合平衡档约定", () => {
  assert.equal(COOLDOWN_MS.explicit, 0);
  assert.equal(COOLDOWN_MS.mood, 10 * 60 * 1000);
  assert.equal(COOLDOWN_MS.hour, 4 * 60 * 60 * 1000);
});
