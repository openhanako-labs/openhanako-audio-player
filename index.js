/**
 * index.js — hanako-audio-player v2 App 入口。
 *
 * 宿主 import 后调用 apply(ctx)，并把它注册的一切挂到本 App 的 fiber 上。
 * 返回的 disposer 不是必须的 —— 装载失败或摘树时宿主会一并收回 —— 但显式清理
 * 能让 reload 更干净。
 */

import { createPlayerState } from "./lib/state.js";
import { registerTools } from "./lib/register-tools.js";
import { registerRoutes } from "./lib/register-routes.js";

export const name = "hanako-audio-player";

export async function apply(ctx) {
  const state = createPlayerState({
    storage: ctx.storage?.global,
    logger: ctx.logger,
  });

  const unregisterTools = registerTools(ctx, state);
  const unregisterRoutes = await ctx.routes.register((app) => {
    registerRoutes(app, { ctx, state });
  });

  // ── 会话自动绑定（会话粘性，不靠用户先调工具）──
  //
  // 卡片拿不到 sessionPath（宿主只给 appId/slot/cardInstanceId），所以之前只能
  // 靠工具调用时存下来——用户必须先在对话里让我播一首，横幅才能工作。
  //
  // 但 ctx.bus.subscribe 的回调签名是 (event, sessionPath) => void——
  // **sessionPath 永远作为第二个参数给出**。所以只要订阅任意会话事件，
  // 就能自动学到当前活跃的会话，不需要用户先触发工具。
  //
  // 订阅范围：
  //   - session_created：切回/新建一个对话（最准的“当前会话”信号）
  //   - message_start / turn_start：会话有活动（保底）
  // 用 session_created 优先，因为它带 sessionPath 且语义明确。
  let unregisterBus = null;
  try {
    unregisterBus = ctx.bus.subscribe(
      (event, sessionPath) => {
        try {
          if (!sessionPath) return;
          if (event?.type === "session_created") {
            // 新会话进入运行时——直接当成当前会话
            state.setBannerSession(sessionPath);
            return;
          }
          // 其他事件：只在还没绑过时补位，不抢已经绑定好的会话
          state.adoptSessionIfUnbound(sessionPath);
        } catch {
          /* 观察者不能影响主流程 */
        }
      },
      { types: ["session_created", "message_start", "turn_start", "agent_start"] },
    );
  } catch (err) {
    ctx.logger?.warn?.(`bus subscribe failed: ${err?.message || err}`);
  }

  await ctx.logger.info("audio-player v2 loaded");

  return () => {
    try {
      unregisterTools?.();
    } catch {
      /* fiber teardown */
    }
    try {
      unregisterRoutes?.();
    } catch {
      /* fiber teardown */
    }
    try {
      unregisterBus?.();
    } catch {
      /* fiber teardown */
    }
  };
}

export default { name, apply };
