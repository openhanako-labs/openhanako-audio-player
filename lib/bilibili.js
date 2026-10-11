/**
 * lib/bilibili.js — B 站音源（搜视频抽音轨）。
 *
 * B 站不在 Meting 支持范围，官方「音频区」接口已降级过滤
 * （search_type=audio → code:-1200），唯一可行的是「搜视频 → 取 cid → 取 DASH 音频流」：
 *
 *   search:  x/web-interface/wbi/search/type?search_type=video&keyword=…  → bvid
 *   view:    x/web-interface/view?bvid=…                                  → cid
 *   playurl: x/player/playurl?bvid=…&cid=…&fnval=16                       → dash.audio[].baseUrl
 *
 * 实测（2026-10-11，关键词「夜航星」）：
 *   · 搜索无需签名，20 条结果，标题带 <em class="keyword"> 高亮标签
 *   · 音频是标准 fMP4（.m4s），3 档带宽，最高约 220 kbps（普通账号，非会员）
 *   · CDN 支持 Range 206：bytes 0-1023/8507361，带 / 不带 Referer 都通过
 *   · baseUrl 有效期约 120 分钟（过期需重新 view + playurl）
 *
 * 取流仍走同源分片代理（与 Meting 同），不把 CDN 地址直接交给 <audio>。
 */

const SEARCH_API = "https://api.bilibili.com/x/web-interface/wbi/search/type";
const VIEW_API = "https://api.bilibili.com/x/web-interface/view";
const PLAYURL_API = "https://api.bilibili.com/x/player/playurl";

const BILI_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Referer: "https://www.bilibili.com/",
};

/** 搜索结果的 title 带 <em class="keyword"> 高亮标签，去掉标签与常见实体。 */
function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** 封面可能是协议相对地址（//i2.hdslb.com/…），补上 https:。 */
function fixPic(u) {
  const s = String(u || "").trim();
  return s.startsWith("//") ? "https:" + s : s;
}

/** "4:30" / "1:02:03" → 秒；解析不了返 0。 */
function parseDuration(v) {
  const parts = String(v || "").split(":").map((x) => parseInt(x, 10));
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** 搜视频。返回与 Meting 同一套字段（id/title/author/pic/dur）。 */
export async function searchBili(ctx, { keyword, limit = 30 }) {
  if (!keyword || !String(keyword).trim()) {
    throw Object.assign(new Error("keyword required"), { code: 400 });
  }
  const url = `${SEARCH_API}?search_type=video&keyword=${encodeURIComponent(keyword)}&page=1`;
  const res = await ctx.network.fetch(url, {
    method: "GET",
    headers: BILI_HEADERS,
    timeoutMs: 10000,
  });
  if (!res.ok) throw new Error(`bilibili search HTTP ${res.status}`);
  const data = await res.json().catch(() => null);
  const list = data && data.data && Array.isArray(data.data.result) ? data.data.result : [];
  const results = list
    .slice(0, limit)
    .map((it) => ({
      id: String(it?.bvid || "").trim(),
      title: stripHtml(it?.title) || "未命名",
      author: String(it?.author || "").trim(),
      pic: fixPic(it?.pic),
      dur: parseDuration(it?.duration),
    }))
    .filter((x) => x.id);
  return { results, host: "api.bilibili.com", total: list.length };
}

/**
 * 取一首 B 站视频的音频直链：view 拿 cid，再 playurl 拿 dash.audio。
 * 多音轨时取带宽最高的（普通账号一般到 192K，会员才有 Hi-Res）。
 * 任何一步拿不到就抛，由调用方（go 路由）决定降级 / 重试。
 */
export async function resolveBiliAudio(ctx, bvid) {
  const vres = await ctx.network.fetch(`${VIEW_API}?bvid=${encodeURIComponent(bvid)}`, {
    method: "GET",
    headers: BILI_HEADERS,
    timeoutMs: 10000,
  });
  if (!vres.ok) throw new Error(`bilibili view HTTP ${vres.status}`);
  const vdata = await vres.json().catch(() => null);
  const cid = vdata?.data?.cid;
  if (!cid) throw new Error("bilibili cid not found");

  const purl = `${PLAYURL_API}?bvid=${encodeURIComponent(bvid)}&cid=${cid}&fnval=16&fourk=1`;
  const pres = await ctx.network.fetch(purl, {
    method: "GET",
    headers: BILI_HEADERS,
    timeoutMs: 10000,
  });
  if (!pres.ok) throw new Error(`bilibili playurl HTTP ${pres.status}`);
  const pdata = await pres.json().catch(() => null);
  const audios = pdata?.data?.dash?.audio;
  if (!Array.isArray(audios) || !audios.length) throw new Error("bilibili audio not found");
  audios.sort((a, b) => (b?.bandwidth || 0) - (a?.bandwidth || 0));
  const best = audios[0];
  return String(best?.baseUrl || best?.backupUrl?.[0] || "");
}
