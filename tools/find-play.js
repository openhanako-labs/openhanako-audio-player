/**
 * tools/find-play.js — AI 点歌工具：按关键词搜歌，取首条结果进队列播放。
 *
 * 定位：给"来点适合深夜听的""放首周杰伦"这种自然语言需求做**中间翻译层**。
 *   Agent 负责把「深夜听的」「周杰伦的」翻译成具体关键词，本工具只吃关键词。
 *
 * 参数：
 *   query     — 具体歌名 / 歌手 / 风格关键词。别传整句自然语言。
 *   server    — "netease"（默认）| "tencent" | "bilibili"
 *   playNow   — true 立即切到首条并起播；false 只入队，当前曲目不动（默认）
 *
 * 返回（JSON 串，给 agent 播报用）：
 *   { ok, query, server, played, track: { title, author, server, url, id }, total }
 *
 * 副作用：
 *   1) 把歌曲写入 playlist.json（UI 30 秒后 sync 会看到）
 *   2) playNow=true 时同时把"当前曲目"设为这条（横幅 / UI 立刻刷新）
 *   3) 首次调用会投递一张播放卡（复用 makePlayTool 的 delivered 去重逻辑）
 *
 * ponytail: 直接读 playlist.json（和 audio_play 工具、UI 同一份文件），
 *   不引入 state.queue 那套——那是给 /api/select 路由用的内存镜像。
 */

import fs from "node:fs";
import path from "node:path";

const NAME = "audio_find_play";

const DESCRIPTION =
  "按关键词搜歌并把首条结果加入播放器播放队列。" +
  "query 必须是具体歌名/歌手/风格关键词（如「晴天 周杰伦」「夜航星」「Lo-fi 学习音乐」），" +
  "不要传整句自然语言（如「来点适合深夜听的」）——这类描述由 agent 翻译成关键词后再传入。" +
  "默认音源网易云；B 站音源传 server:'bilibili'（B 站无歌词）。" +
  "playNow=false 时只入队不打断当前曲目（默认），playNow=true 时立即切到这首歌。";

const PARAMETERS = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "具体歌名/歌手/风格关键词。别传整句自然语言。",
    },
    server: {
      type: "string",
      enum: ["netease", "tencent", "bilibili"],
      description: "音源。默认 netease；B 站传 bilibili（无歌词）。",
      default: "netease",
    },
    playNow: {
      type: "boolean",
      description: "true 立即起播；false 只入队（默认）。",
      default: false,
    },
  },
  required: ["query"],
};

/**
 * 从 Meting URL 或 B 站 bvid 拼出 /go 跳板地址。
 * 与 lib/register-routes.js 的 GO_BASE / toGoUrl 保持同一套约定。
 */
function buildGoUrl(appId, server, rawId) {
  const goBase = `/api/apps/${appId}/routes/widget/api/music/go`;
  return `${goBase}/${encodeURIComponent(rawId)}?server=${encodeURIComponent(server)}`;
}

export function makeFindPlayTool(ctx, state) {
  const appId = path.basename(ctx.dataDir) || "app";
  const playlistPath = path.join(ctx.dataDir, "playlist.json");

  /**
   * 追加进 playlist.json（和 audio_play 工具、UI 读同一份文件）。
   * 按 url 去重：同一首歌被反复搜到不会重复入队。
   */
  function appendToPlaylist(entry) {
    let list = [];
    try {
      if (fs.existsSync(playlistPath)) {
        list = JSON.parse(fs.readFileSync(playlistPath, "utf-8"));
      }
    } catch (err) {
      ctx.logger?.warn?.(`audio_find_play: 读取播放列表失败 ${err?.message || err}`);
    }
    if (!Array.isArray(list)) list = [];

    const at = list.findIndex((t) => t && typeof t.url === "string" && t.url === entry.url);
    if (at >= 0) list[at] = { ...list[at], ...entry };
    else list.push(entry);

    try {
      fs.writeFileSync(playlistPath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      ctx.logger?.warn?.(`audio_find_play: 写入播放列表失败 ${err?.message || err}`);
    }
    return { isNew: at < 0 };
  }

  async function search(query, server) {
    // 延迟 import 避免工具加载期就依赖 routes 侧代码
    if (server === "bilibili") {
      const { searchBili } = await import("../lib/bilibili.js");
      const { results, total } = await searchBili(ctx, { keyword: query, limit: 20 });
      return { results, total, idMode: "bvid" };
    }
    const { searchMusic } = await import("../lib/meting.js");
    const { results, total } = await searchMusic(ctx, { keyword: query, server, limit: 20 });
    const { extractTrackId } = await import("../lib/meting.js");
    const mapped = results.map((r) => ({
      ...r,
      id: r.id || extractTrackId(r.url),
    }));
    return { results: mapped, total, idMode: "meting" };
  }

  return {
    name: NAME,
    description: DESCRIPTION,
    parameters: PARAMETERS,

    async execute({ query, server = "netease", playNow = false, context } = {}) {
      const q = typeof query === "string" ? query.trim() : "";
      if (!q) {
        return { content: [{ type: "text", text: "query 必填，且要是具体歌名/歌手/风格关键词。" }] };
      }
      const srv = ["netease", "tencent", "bilibili"].includes(server) ? server : "netease";
      const now = !!playNow;

      // 会话粘性：与 audio_play 一致，把工具调用所在的会话记下来（横幅依赖）
      const sessionPath = typeof context?.sessionPath === "string" ? context.sessionPath : "";
      if (sessionPath) state.setBannerSession(sessionPath);

      let searchResult;
      try {
        searchResult = await search(q, srv);
      } catch (err) {
        ctx.logger?.warn?.(`audio_find_play: search failed ${srv} "${q}": ${err?.message || err}`);
        return {
          content: [
            { type: "text", text: JSON.stringify({ ok: false, query: q, server: srv, error: err.message }) },
          ],
        };
      }

      const results = searchResult.results || [];
      // 取首条有效结果：有 id + 有 title
      const hit = results.find((r) => r && r.id && (r.title || r.name));
      if (!hit) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                query: q,
                server: srv,
                total: results.length,
                error: `「${q}」在 ${srv} 上没搜到结果，换个关键词或换音源试试。`,
              }),
            },
          ],
        };
      }

      const rawId = String(hit.id);
      const goUrl = buildGoUrl(appId, srv, rawId);
      const title = String(hit.title || hit.name || "").trim() || "未命名";
      const author = String(hit.author || "").trim();
      const pic = String(hit.pic || "").trim();
      const dur = Number(hit.dur || 0);

      // B 站结果 id 走 fork 约定 "bilibili:BVxxx"（跨列表稳定键），其它音源走 "server:metingId"
      const stableId = srv === "bilibili" ? `bilibili:${rawId}` : `${srv}:${rawId}`;
      const entry = {
        name: title,
        id: stableId,
        url: goUrl,
        author,
        pic,
        dur,
        mode: "在线",
        group: srv === "bilibili" ? "B 站" : "在线音乐",
      };

      appendToPlaylist(entry);

      // playNow: 让"当前曲目"立刻指向这首（横幅 / UI 立刻刷新）。
      // UI 端 30 秒 sync 也会把 playlist 里的 url 拉进来——但那个循环慢，playNow 时先手动切。
      if (now) {
        state.setCurrentTrack({ title, source: srv });
      }

      // 首次投递播放卡（复用 audio_play 的 delivered 去重逻辑）
      const alreadyDelivered = sessionPath ? await state.hasDeliveredCard(sessionPath) : false;
      if (sessionPath && !alreadyDelivered) state.markDeliveredCard(sessionPath);

      const reply = {
        ok: true,
        query: q,
        server: srv,
        played: now,
        queued: !now,
        track: {
          id: stableId,
          title,
          author,
          server: srv,
          url: goUrl,
        },
        total: searchResult.total,
        returned: results.length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(reply, null, 2) }],
        ...(alreadyDelivered ? {} : {
          details: {
            card: {
              type: "iframe",
              pluginId: appId,
              channel: "app",
              route: "/index.html?view=compact",
              title,
            },
          },
        }),
      };
    },
  };
}
