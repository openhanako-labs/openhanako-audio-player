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
import { createMoodCommand } from "./lib/mood-command.js";
import { createAutoPlay } from "./lib/auto-play.js";

export const name = "hanako-audio-player";

export async function apply(ctx) {
  const state = createPlayerState({
    storage: ctx.storage?.global,
    logger: ctx.logger,
  });

  // 手动入口 /mood 与自动触发 auto-play 共用同一套「投指令给 agent」机制。
  const mood = createMoodCommand(ctx);
  const auto = createAutoPlay(ctx, state, { mood });

  const unregisterTools = registerTools(ctx, state, auto);
  const unregisterRoutes = await ctx.routes.register((app) => {
    registerRoutes(app, { ctx, state, mood });
  });

  // 首个注册直接验证回执（普通真机装载不需要等一次会话事件）。
  await mood.ensure();
  await auto.ensure();



  return () => {
    mood.dispose();
    auto.dispose();
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
