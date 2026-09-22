/**
 * lib/register-tools.js — 把工具源码注册进宿主工具表。
 *
 * v2 没有 contributes.tools[]；工具必须在这里编程式注册。
 * ctx.tools.register 同步返回 disposer。
 */

import { makePlayTool } from "../tools/play.js";
import { makeListMusicTool } from "../tools/list-music.js";

export function registerTools(ctx, state) {
  const disposers = [makePlayTool(ctx, state), makeListMusicTool(ctx, state)].map((tool) => {
    // 包装 execute：每次工具调用都更新横幅会话，让歌词横幅跟随最近活跃的会话
    const originalExecute = tool.execute;
    tool.execute = async (args) => {
      const sessionPath = typeof args?.context?.sessionPath === "string" ? args.context.sessionPath.trim() : "";
      if (sessionPath) state.setBannerSession(sessionPath);
      return originalExecute(args);
    };
    return ctx.tools.register(tool);
  });

  return () => {
    for (const off of disposers) {
      try { off?.(); } catch { /* fiber teardown */ }
    }
  };
}
