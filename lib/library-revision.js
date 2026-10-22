/**
 * lib/library-revision.js — 播放列表变更信号（事件驱动替代轮询）
 *
 * 为什么需要这层：
 *   旧实现靠前端 `setInterval(fetch playlist, 30000)` 轮询。Agent 用
 *   audio_find_play 入队后，用户最长要等 30 秒才在界面看到那首歌，
 *   看上去就是「工具说加了，界面没反应」。
 *
 *   sample（hanako-simple-player）的做法是写一个 revision 键，前端订阅
 *   hana.storage.global.onChanged 后立刻重拉。这里移植同一套：
 *   写一个 UUID 就够——前端不关心值，只关心「变了」。
 *
 * 为什么要独立文件：
 *   register-tools.js 和 register-routes.js 都要触发，且前端 POST playlist
 *   时不该自己触发（它就是被通知方），三方共用一个函数才不各写一遍。
 *
 * 失败不阻塞：写信号失败最多退回旧行为（等轮询），不能因此让入队失败。
 */

import { randomUUID } from "node:crypto";

/** 与前端订阅的键名保持一致；改名要两边一起改。 */
export const LIBRARY_REVISION_KEY = "player-library-revision";

/**
 * 通知前端「列表变了」。
 *
 * @param {object} ctx  App 上下文（用 ctx.storage.global）
 * @param {string} why  触发来源，只进日志，便于排查是谁写的
 * @returns {Promise<boolean>} 是否成功发出；失败已吞掉，返回 false
 */
export async function publishLibraryChange(ctx, why = "") {
  const store = ctx?.storage?.global;
  if (!store || typeof store.set !== "function") {
    ctx?.logger?.warn?.("[library-revision] storage.global 不可用，退回轮询");
    return false;
  }
  try {
    await store.set(LIBRARY_REVISION_KEY, randomUUID());
    if (why) ctx.logger?.info?.(`[library-revision] published (${why})`);
    return true;
  } catch (err) {
    // 信号丢了不该让调用方失败——最多是晚 30 秒看到
    ctx.logger?.warn?.(`[library-revision] publish failed (${why}): ${err?.message || err}`);
    return false;
  }
}
