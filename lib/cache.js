/**
 * lib/cache.js — 音频本地缓存管理。
 *
 * 把一首歌的完整音频落到本地磁盘（<server>-<id>.<ext>），后续播放走本地文件，
 * 不再每次访问 CDN。命中缓存的请求依然支持 Range 206（浏览器拖动进度条依赖它）。
 *
 * 目录结构：
 *   <dataDir>/cache/audio/<cacheId>.<ext>   音频文件（cacheId 形如 "bilibili:BVxxx"）
 *   <dataDir>/cache/index.json                { "<cacheId>": { file, title, sizeBytes, at } }
 *
 * 容量：CACHE_MAX_BYTES = 500 MB，超限按 at 升序淘汰（LRU 近似）。
 * 下载中断：先写 .part，全下完才 rename。任何一步失败都清掉 .part，不留半截文件。
 *
 * ponytail: at 既是"最近访问"也是"最近写入"。命中时不更新 at，让 LRU 语义偏写入时间；
 *   真要严格的访问时间 LRU 得再引入 lastAccessAt 并写盘更新——目前收益不高。
 */

import fs from "node:fs";
import path from "node:path";

/** 上限 500 MB（约 25 首 20 MB 的歌）。要改就在这一处。 */
export const CACHE_MAX_BYTES = 500 * 1024 * 1024;

/** 单次下载最大字节：30 MB（防把磁盘吃爆）。超限直接放弃。 */
export const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

const ID_RE = /^[a-zA-Z0-9:_-]+$/;

function extFromCt(ct, url) {
  const c = String(ct || "").toLowerCase();
  if (c.includes("mpeg")) return "mp3";
  if (c.includes("mp4") || c.includes("mp4a") || c.includes("m4s")) return "m4a";
  if (c.includes("ogg")) return "ogg";
  if (c.includes("flac")) return "flac";
  if (c.includes("wav") || c.includes("wave") || c.includes("pcm")) return "wav";
  // 拿不到 mime 时从 URL 里猜（bilibili 的 .m4s 常不带 mime）
  const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(String(url || "").split("?")[0]);
  return m ? m[1].toLowerCase() : "mp3";
}

function loadIndexSafe(indexPath, logger) {
  try {
    if (fs.existsSync(indexPath)) {
      const obj = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
    }
  } catch (err) {
    logger?.warn?.(`[cache] index load failed: ${err?.message || err}`);
  }
  return {};
}

function saveIndexSafe(indexPath, idx, logger) {
  try {
    fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2), "utf-8");
  } catch (err) {
    logger?.warn?.(`[cache] index save failed: ${err?.message || err}`);
  }
}

/**
 * 建缓存管理器。
 *
 * @param {string} dataDir App 数据目录
 * @param {object} opts
 * @param {(url: string, opts?: object) => Promise<Response>} opts.fetch
 *   必须传一个 fetch 实现（通常传 ctx.network.fetch 绑定到 ctx）。
 * @param {object} [opts.logger]
 */
export function createCacheManager(dataDir, { fetch, logger } = {}) {
  if (typeof fetch !== "function") {
    throw new Error("createCacheManager: opts.fetch is required");
  }
  const audioDir = path.join(dataDir, "cache", "audio");
  const indexPath = path.join(dataDir, "cache", "index.json");

  try {
    fs.mkdirSync(audioDir, { recursive: true });
  } catch (err) {
    logger?.warn?.(`[cache] mkdir failed: ${err?.message || err}`);
  }

  function getEntry(cacheId) {
    const idx = loadIndexSafe(indexPath, logger);
    const entry = idx[cacheId];
    if (!entry || !entry.file) return null;
    try {
      const stat = fs.statSync(path.join(audioDir, entry.file));
      if (stat.isFile() && stat.size === entry.sizeBytes) return { ...entry };
      delete idx[cacheId];
      saveIndexSafe(indexPath, idx, logger);
    } catch {
      delete idx[cacheId];
      saveIndexSafe(indexPath, idx, logger);
    }
    return null;
  }

  function listEntries() {
    const idx = loadIndexSafe(indexPath, logger);
    const out = [];
    let totalBytes = 0;
    let pruned = 0;
    for (const [k, e] of Object.entries(idx)) {
      if (!e || !e.file) { pruned++; continue; }
      try {
        const p = path.join(audioDir, e.file);
        if (!fs.existsSync(p)) { delete idx[k]; pruned++; continue; }
        const st = fs.statSync(p);
        out.push({ id: k, file: e.file, title: e.title || "", sizeBytes: st.size, at: e.at || 0 });
        totalBytes += st.size;
      } catch {
        delete idx[k];
        pruned++;
      }
    }
    if (pruned > 0) saveIndexSafe(indexPath, idx, logger);
    return { entries: out, totalBytes, limitBytes: CACHE_MAX_BYTES, usedPct: totalBytes / CACHE_MAX_BYTES };
  }

  function deleteEntry(cacheId) {
    const idx = loadIndexSafe(indexPath, logger);
    const entry = idx[cacheId];
    if (!entry) return false;
    try {
      fs.unlinkSync(path.join(audioDir, entry.file));
    } catch {
      /* 文件已经不在，无所谓 */
    }
    delete idx[cacheId];
    saveIndexSafe(indexPath, idx, logger);
    return true;
  }

  /**
   * 淘汰超出上限的部分。at 升序（最早的先走）；跳过 keepId（本次刚下的，避免自己淘汰自己）。
   */
  function evict(keepId) {
    const idx = loadIndexSafe(indexPath, logger);
    let total = 0;
    const entries = [];
    for (const [k, e] of Object.entries(idx)) {
      if (!e?.file) continue;
      try {
        const p = path.join(audioDir, e.file);
        if (fs.existsSync(p)) {
          const st = fs.statSync(p);
          total += st.size;
          entries.push({ k, e, size: st.size, at: e.at || 0 });
        } else {
          delete idx[k];
        }
      } catch {
        delete idx[k];
      }
    }
    if (total < CACHE_MAX_BYTES) return 0;
    entries.sort((a, b) => (a.at || 0) - (b.at || 0));
    let removed = 0;
    for (const { k, e, size } of entries) {
      if (total < CACHE_MAX_BYTES) break;
      if (k === keepId) continue;
      try { fs.unlinkSync(path.join(audioDir, e.file)); } catch { /* ignore */ }
      delete idx[k];
      total -= size;
      removed++;
    }
    if (removed > 0) saveIndexSafe(indexPath, idx, logger);
    return removed;
  }

  /**
   * 全量下载一首歌进缓存。
   *
   * 关键：先把 body 全部收进 Uint8Array 再写盘（res.arrayBuffer()），
   *   避免流式 pipe 半途断连留下 .part 半截文件。MAX_AUDIO_BYTES 挡掉极端大文件。
   *
   * @param {{cacheId:string,url:string,title?:string,server?:string}} args
   */
  async function downloadIntoCache({ cacheId, url, title, server }) {
    if (!ID_RE.test(cacheId)) throw Object.assign(new Error("invalid cache id"), { code: 400 });

    const existing = getEntry(cacheId);
    if (existing) return existing;

    let res;
    try {
      const reqHeaders = { "User-Agent": "Mozilla/5.0" };
      if (server === "bilibili") reqHeaders.Referer = "https://www.bilibili.com/";
      res = await fetch(url, { method: "GET", headers: reqHeaders });
    } catch (err) {
      throw new Error(`audio fetch failed: ${err?.message || err}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`audio fetch HTTP ${res.status}${text ? ": " + text.slice(0, 200) : ""}`);
    }

    const ctype = res.headers.get("content-type") || "";
    const clen = Number(res.headers.get("content-length") || 0);
    if (clen > MAX_AUDIO_BYTES) throw new Error(`audio too large: ${clen} > ${MAX_AUDIO_BYTES}`);

    const ext = extFromCt(ctype, url);
    // 文件名安全化：Windows 不允许 ':' 出现在文件名中，替成 '-'。
    const filename = `${cacheId.replace(/[\/:*?"<>|]/g, "-")}.${ext}`;
    const destPath = path.join(audioDir, filename);
    const partPath = destPath + ".part";

    try {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_AUDIO_BYTES) {
        throw new Error(`audio too large: ${buf.byteLength}`);
      }
      fs.writeFileSync(partPath, buf);
      // 原子 rename：Windows 上 fs.renameSync 目标已存在会覆盖（posix 语义）
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      fs.renameSync(partPath, destPath);

      const idx = loadIndexSafe(indexPath, logger);
      const entry = { file: filename, title: title || "", sizeBytes: buf.byteLength, at: Date.now() };
      idx[cacheId] = entry;
      saveIndexSafe(indexPath, idx, logger);

      evict(cacheId);

      return entry;
    } catch (err) {
      try { if (fs.existsSync(partPath)) fs.unlinkSync(partPath); } catch { /* ignore */ }
      throw err;
    }
  }

  return {
    audioDir,
    indexPath,
    getEntry,
    listEntries,
    deleteEntry,
    evict,
    downloadIntoCache,
    CACHE_MAX_BYTES,
    MAX_AUDIO_BYTES,
  };
}
