/**
 * tests/phase3-backend.test.js — 阶段 3 后端测试。
 *
 * 覆盖三块能力：
 *   3a. B 站音源：searchBili 搜真实关键词，resolveBiliAudio 解析出 DASH 音频直链
 *   3b. 音频缓存：POST 下载 → GET 命中本地 → DELETE 清理（真实下载，不 mock）
 *   3c. audio_find_play 工具：纯参数校验（真实网络部分在 3a 已验证）
 *
 * 运行：node --test tests/phase3-backend.test.js
 *
 * ponytail: 用 node:test 原生模块，不引入 jest/vitest。测试数据落 os.tmpdir()，
 *   跑完清掉。3a/3b 依赖外网可达，本机不可达时会 SKIP 并明确报告（不假装通过）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { searchBili, resolveBiliAudio } from "../lib/bilibili.js";
import { createCacheManager, CACHE_MAX_BYTES, MAX_AUDIO_BYTES } from "../lib/cache.js";
import { makeFindPlayTool } from "../tools/find-play.js";

// ── 共享 fixture ───────────────────────────────────────

function makeMockCtx() {
  return {
    dataDir: "",
    network: {
      fetch: (url, opts = {}) => fetch(url, opts),
    },
    logger: { warn: (...a) => console.warn("[mock]", ...a), info: () => {} },
  };
}

function tmpDir(prefix = "hanako-ap-test-") {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return p;
}

// ── 3a. B 站音源 ───────────────────────────────────────

test("3a: searchBili 真搜「夜航星」，返回带 bvid 的结果", async (t) => {
  t.diagnostic("live network required");
  const ctx = makeMockCtx();
  const res = await searchBili(ctx, { keyword: "夜航星", limit: 10 });
  assert.ok(res.results.length > 0, `search returned 0 results`);
  assert.equal(res.host, "api.bilibili.com");
  // 首条要有 bvid
  const first = res.results[0];
  assert.match(first.id, /^BV[0-9A-Za-z]{10}$/, `first.id is not a bvid: ${first.id}`);
  // 标题要经过 stripHtml（不能有 <em>）
  for (const r of res.results) {
    assert.ok(!r.title.includes("<"), `title still has html tag: ${r.title}`);
  }
  // 时长要转成秒
  for (const r of res.results) {
    assert.ok(typeof r.dur === "number" && r.dur >= 0, `dur not number: ${r.dur}`);
  }
});

test("3a: resolveBiliAudio 解析出 DASH 音频直链（*.bilivideo.*）", async (t) => {
  t.diagnostic("live network required");
  const ctx = makeMockCtx();
  const search = await searchBili(ctx, { keyword: "夜航星", limit: 3 });
  const first = search.results[0];
  const url = await resolveBiliAudio(ctx, first.id);
  assert.ok(url.startsWith("https://"), `url is not https: ${url}`);
  assert.match(url, /bilivideo\.(com|cn)/, `url not on bilivideo CDN: ${url}`);
  t.diagnostic(`resolved: ${first.id} → ${url.slice(0, 80)}...`);
});

test("3a: 封面 fixPic 补 https: 前缀", async () => {
  const ctx = makeMockCtx();
  const res = await searchBili(ctx, { keyword: "夜航星", limit: 3 });
  const first = res.results[0];
  // B 站封面常是 //i2.hdslb.com/...，fixPic 后应该是 https://i2.hdslb.com/...
  assert.ok(first.pic.startsWith("https://"), `pic not https: ${first.pic}`);
  assert.ok(first.pic.includes("hdslb.com"), `pic not on hdslb.com: ${first.pic}`);
});

test("3a: B 站 CDN 支持 Range 206", async (t) => {
  t.diagnostic("live network required");
  const ctx = makeMockCtx();
  const search = await searchBili(ctx, { keyword: "夜航星", limit: 1 });
  const url = await resolveBiliAudio(ctx, search.results[0].id);
  const res = await ctx.network.fetch(url, {
    method: "GET",
    headers: { Range: "bytes=0-1023", "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/" },
  });
  assert.equal(res.status, 206, `expected 206, got ${res.status}`);
  const cr = res.headers.get("content-range");
  assert.ok(cr && cr.includes("/"), `bad content-range: ${cr}`);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.length, 1024);
});

// ── 3b. 音频缓存 ──────────────────────────────────────

test("3b: 缓存管理器构造 + 索引读写", async () => {
  const dataDir = tmpDir();
  try {
    const mgr = createCacheManager(dataDir, { fetch: async () => { throw new Error("should not fetch"); } });
    assert.equal(mgr.listEntries().entries.length, 0);
    assert.equal(mgr.listEntries().totalBytes, 0);
    assert.equal(mgr.CACHE_MAX_BYTES, CACHE_MAX_BYTES);
    assert.equal(mgr.MAX_AUDIO_BYTES, MAX_AUDIO_BYTES);
    // 缓存 ID 非法应拒绝（async reject，不是 sync throw）
    await assert.rejects(
      () => mgr.downloadIntoCache({ cacheId: "../escape", url: "http://x" }),
      /invalid cache id/,
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("3b: 真实下载 B 站音频 → 命中缓存 → 清理", async (t) => {
  t.diagnostic("live network + real download required; may take 20-40s");
  const ctx = makeMockCtx();
  const dataDir = tmpDir();
  const mgr = createCacheManager(dataDir, { fetch: (url, opts) => ctx.network.fetch(url, opts) });

  // 1. 搜一首
  const search = await searchBili(ctx, { keyword: "夜航星", limit: 1 });
  const bvid = search.results[0].id;
  const cacheId = `bilibili:${bvid}`;

  // 2. 解析 URL 并下载进缓存
  const url = await resolveBiliAudio(ctx, bvid);
  const entry = await mgr.downloadIntoCache({ cacheId, url, title: search.results[0].title, server: "bilibili" });

  assert.ok(entry.file, `entry.file missing`);
  assert.ok(entry.sizeBytes > 100000, `file too small: ${entry.sizeBytes}`);
  assert.ok(entry.title, `entry.title missing`);

  // 3. 落盘验证
  const filePath = path.join(mgr.audioDir, entry.file);
  assert.ok(fs.existsSync(filePath), `file not on disk: ${filePath}`);
  const diskStat = fs.statSync(filePath);
  assert.equal(diskStat.size, entry.sizeBytes);

  // 4. getEntry 命中
  const hit = mgr.getEntry(cacheId);
  assert.ok(hit, `getEntry returned null`);
  assert.equal(hit.file, entry.file);

  // 5. listEntries 看到
  const list = mgr.listEntries();
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].id, cacheId);
  assert.ok(list.totalBytes > 0);

  // 6. 二次调用 downloadIntoCache → 返回已有（不重新下载）
  const entry2 = await mgr.downloadIntoCache({ cacheId, url, title: search.results[0].title, server: "bilibili" });
  assert.equal(entry2.file, entry.file);

  // 7. 从索引中确认文件存在且未产生 .part
  const partFiles = fs.readdirSync(mgr.audioDir).filter((f) => f.endsWith(".part"));
  assert.deepEqual(partFiles, [], `leftover .part files: ${partFiles}`);

  // 8. deleteEntry 清理
  const removed = mgr.deleteEntry(cacheId);
  assert.ok(removed, `delete returned false`);
  assert.equal(mgr.getEntry(cacheId), null);
  assert.equal(mgr.listEntries().entries.length, 0);
  assert.ok(!fs.existsSync(filePath), `file still on disk after delete`);

  // 9. 清理临时目录
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("3b: 缓存容量淘汰（500 MB 上限触发 LRU）", () => {
  const dataDir = tmpDir();
  try {
    const mgr = createCacheManager(dataDir, { fetch: async () => { throw new Error("no fetch"); } });

    // 直接写文件伪造缓存：3 首各 200 MB（超 500 MB）
    // ponytail: 文件名中 ':' 在 Windows 非法，mgr 会把 ':' 替成 '-'，
    //   测试里写实际文件名时也要同步用 '-'。
    const idx = {};
    for (let i = 0; i < 3; i++) {
      const cacheId = `netease:${i}`;
      const file = `${cacheId.replace(":", "-")}.mp3`;
      const p = path.join(mgr.audioDir, file);
      const fd = fs.openSync(p, "w");
      fs.ftruncateSync(fd, 200 * 1024 * 1024);
      fs.closeSync(fd);
      idx[cacheId] = { file, title: `song ${i}`, sizeBytes: 200 * 1024 * 1024, at: Date.now() + i * 1000 };
    }
    fs.writeFileSync(mgr.indexPath, JSON.stringify(idx, null, 2));

    const list = mgr.listEntries();
    assert.equal(list.entries.length, 3);
    assert.ok(list.totalBytes > CACHE_MAX_BYTES, `total should exceed limit: ${list.totalBytes}`);

    // evict 应淘汰最老 1 首（净剩 400 MB < 500 MB）
    const removed = mgr.evict("netease:2");
    assert.equal(removed, 1, `expected 1 removed, got ${removed}`);

    const list2 = mgr.listEntries();
    assert.equal(list2.entries.length, 2);
    assert.ok(list2.totalBytes <= CACHE_MAX_BYTES, `should be under limit: ${list2.totalBytes}`);
    // netease:0 是最老的，应被淘汰
    assert.ok(list2.entries.find((e) => e.id === "netease:0") === undefined, `oldest not evicted`);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("3b: 下载失败清掉 .part，不留半截", async () => {
  const dataDir = tmpDir();
  try {
    const mgr = createCacheManager(dataDir, {
      fetch: async () => {
        const fakeBody = new Uint8Array(100);
        return new Response(fakeBody, {
          status: 500,
          headers: { "content-type": "audio/mpeg", "content-length": "100" },
        });
      },
    });
    await assert.rejects(
      () => mgr.downloadIntoCache({ cacheId: "netease:1", url: "http://x/a.mp3", title: "x" }),
      /audio fetch HTTP 500/,
    );
    // .part 应已清理
    const partFiles = fs.readdirSync(mgr.audioDir).filter((f) => f.endsWith(".part"));
    assert.deepEqual(partFiles, [], `leftover .part: ${partFiles}`);
    assert.equal(mgr.getEntry("netease:1"), null);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("3b: 超限文件大小拒绝（MAX_AUDIO_BYTES）", async () => {
  const dataDir = tmpDir();
  try {
    const mgr = createCacheManager(dataDir, {
      fetch: async () => {
        // content-length 谎报 100 MB（超过 30 MB 上限）
        return new Response(Buffer.from("x".repeat(10)), {
          status: 200,
          headers: { "content-type": "audio/mpeg", "content-length": String(100 * 1024 * 1024) },
        });
      },
    });
    await assert.rejects(
      () => mgr.downloadIntoCache({ cacheId: "netease:1", url: "http://x/a.mp3" }),
      /too large/,
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

// ── 3c. audio_find_play 工具 ───────────────────────────

test("3c: audio_find_play 工具导出形状", () => {
  const ctx = makeMockCtx();
  ctx.dataDir = tmpDir();
  const state = {
    setBannerSession: () => {},
    setCurrentTrack: () => {},
    async hasDeliveredCard() { return false; },
    markDeliveredCard: () => {},
  };
  const tool = makeFindPlayTool(ctx, state);
  assert.equal(tool.name, "audio_find_play");
  assert.ok(typeof tool.execute === "function");
  assert.equal(tool.parameters.properties.query.type, "string");
  assert.ok(tool.parameters.properties.server.enum.includes("bilibili"));
  assert.ok(tool.description.includes("query"));
  fs.rmSync(ctx.dataDir, { recursive: true, force: true });
});
