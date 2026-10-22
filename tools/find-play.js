/**
 * tools/find-play.js — AI 点歌工具：按关键词搜歌，取首条结果加入列表。
 *
 * 定位：给“来点适合深夜听的”“放首周杰伦”这种自然语言需求做**中间翻译层**。
 *   Agent 负责把「深夜听的」「周杰伦的」翻译成具体关键词，本工具只吃关键词。
 *
 * 重要：本工具**不承诺出声**。
 *   浏览器 autoplay 策略拦得住没有用户手势的 play()，这不是 App 能绕的。
 *   所以本工具只做“备好歌 + 请求切过去”，是否出声由用户在界面上点。
 *   旧版返回 played:true 是语义谎言（那个值只是入参回显），已改成 queued/playRequested。
 *
 * 参数：
 *   query     — 具体歌名 / 歌手 / 风格关键词。别传整句自然语言。
 *   server    — "netease"（默认）| "tencent" | "bilibili"
 *   playNow   — true 请求把当前曲目切到这首（不等于出声）
 *
 * 返回（JSON 串，给 agent 播报用）：
 *   { ok, query, server, queued, playRequested, track: {...}, total, note }
 *
 * 副作用：
 *   1) 把歌曲写入 playlist.json（置顶）
 *   2) 发一次 library revision 信号 → 前端 onChanged 立刻重拉（不等 30s 轮询）
 *   3) playNow=true 时把“当前曲目”设为这条（横幅 / UI 立刻切）
 *   4) 首次调用会投递一张播放卡
 */

import fs from "node:fs";
import path from "node:path";
import { publishLibraryChange } from "../lib/library-revision.js";

const NAME = "audio_find_play";

const DESCRIPTION =
  "按关键词搜歌并把首条结果加入播放器列表。" +
  "query 必须是具体歌名/歌手/风格关键词（如「晴天 周杰伦」「夜航星」「Lo-fi 学习音乐」），" +
  "不要传整句自然语言（如「来点适合深夜听的」）——这类描述由 agent 翻译成关键词后再传入。" +
  "默认音源网易云；B 站音源传 server:'bilibili'（B 站无歌词）。" +
  "注意：本工具只把歌加入列表，不会让它开始出声（浏览器 autoplay 策略不是 App 能绕的）。" +
  "用户需要自己点播放键；卡片上会出现「继续播放」入口。描述时请说“已加入列表”，不要说“正在播放”。";

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
      description:
        "请求界面把你切到这首（默认 false）。注意：这只是“请求”，浏览器 autoplay 策略会拦住没有用户手势的自动出声。" +
        "实际效果是：界面把这首设为当前曲目，若被拦则出现「继续播放」入口，用户点一下就响。",
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
   * 新曲置顶（与 sample 一致）：用户一进界面就看到刚点的那首。
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
    else list.unshift(entry);

    try {
      fs.writeFileSync(playlistPath, JSON.stringify(list, null, 2), "utf-8");
      return true;
    } catch (err) {
      ctx.logger?.warn?.(`audio_find_play: 写入播放列表失败 ${err?.message || err}`);
      return false;
    }
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

      const savedFlag = appendToPlaylist(entry);

      // 通知前端「列表变了」——这是替代 30s 轮询的关键一步。
      // 不再谎报 played：浏览器 autoplay 策略拦得住无手势出声，
      // 这里只声明到得了的事实（已入列 + 是否已请求切歌），
      // 真正是否响由用户在卡片上点播放。
      if (savedFlag) await publishLibraryChange(ctx, `find_play:${title}`);

      // playNow: 让"当前曲目"指向这首（横幅 / 界面立即切过去）。
      // 注意它不会让声音自己出来 —— 只改变“指向哪首”。
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
        // 字段名就是语义：入列了 = queued，不假装“在放”
        queued: true,
        // 请求了切到这首（仅当 playNow）。它不是“已出声”，
        // 实际能否响取决于用户是否点播放（浏览器 autoplay 限制）。
        playRequested: now,
        // 保留 played 字段给旧调用方读，但恒为 false 已不合适——
        // 改成不再输出，让读了 played 的代码尽早暴露成 undefined 而不是假 true。
        track: {
          id: stableId,
          title,
          author,
          server: srv,
          url: goUrl,
        },
        total: searchResult.total,
        returned: results.length,
        // 告诉模型该怎么描述，避免它自己编“正在播放”
        note: now
          ? "已加入列表并请求切到这首。界面会把它设为当前曲目；若被浏览器拦则出现「继续播放」按钮，用户点一下才真出声。"
          : "已加入列表（列表顶部），未切换当前曲目。用户需要在界面上点一下。",
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
