/**
 * hanako-audio-player/routes/player.js
 *
 * 播放器路由：
 *   /widget                    — widget 页面（嵌入式）
 *   /widget/media/{filename} — 流式音频
 *   /play                      — 对话内嵌播放器
 */

import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { getBus } from "../tools/bus.js";

const MIME = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4" };

// ── Cookie 加载：优先从 cookies.env 文件读取，回退到环境变量 ──
function _loadCookies() {
  let netease = process.env.NETEASE_COOKIE || "";
  let tencent = process.env.TENCENT_COOKIE || "";
  try {
    let cookiePath = null;
    // 方案1：import.meta.url（ESM）
    try {
      const _url = new URL("cookies.env", import.meta.url);
      // Windows 路径标准化：file:///W:/... → W:...
      let fp = _url.pathname;
      if (fp.startsWith("/")) fp = fp.slice(1);
      fp = fp.replace(/\//g, "\\");
      if (fs.existsSync(fp)) cookiePath = fp;
    } catch(e) {}
    // 方案2：USERPROFILE 硬编码路径
    if (!cookiePath) {
      const home = process.env.USERPROFILE || process.env.HOME || "";
      if (home) {
        const fp2 = path.join(home, ".hanako", "plugins", "hanako-audio-player", "cookies.env");
        if (fs.existsSync(fp2)) cookiePath = fp2;
      }
    }
    // 方案3：__dirname（CJS 兼容）
    if (!cookiePath && typeof __dirname !== "undefined") {
      const fp3 = path.join(__dirname, "cookies.env");
      if (fs.existsSync(fp3)) cookiePath = fp3;
    }
    if (cookiePath) {
      const raw = fs.readFileSync(cookiePath, "utf-8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (!m) continue;
        if (m[1] === "NETEASE_COOKIE" && m[2].trim()) netease = m[2].trim();
        if (m[1] === "TENCENT_COOKIE" && m[2].trim()) tencent = m[2].trim();
      }
    }
  } catch(e) { console.warn("[player] cookies.env load failed:", e.message); }
  return { NETEASE_COOKIE: netease, TENCENT_COOKIE: tencent };
}
const { NETEASE_COOKIE, TENCENT_COOKIE } = _loadCookies();

export default function (app, ctx) {
  const pluginId = ctx.pluginId;
  const dataDir = ctx.dataDir;
  const mediaDir = path.join(dataDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const pluginDataMediaDir = home ? path.join(home, ".hanako", "plugin-data", "hanako-audio-player", "media") : null;

  // ── 扫描本地媒体文件 ──
  let _mediaCache = null, _cacheTime = 0;
  function collectMediaFiles() {
    if (_mediaCache && Date.now() - _cacheTime < 20000) return _mediaCache;
    const results = [];
    const seen = new Set();
    const exts = [".mp3", ".wav", ".ogg", ".flac", ".m4a"];
    function scanDir(dir, urlPrefix) {
      if (!dir || !fs.existsSync(dir)) return;
      try {
        for (const name of fs.readdirSync(dir)) {
          const lower = name.toLowerCase();
          if (!exts.some(e => lower.endsWith(e))) continue;
          if (name.startsWith("_")) continue;
          if (seen.has(name)) continue;
          seen.add(name);
          try {
            const stat = fs.statSync(path.join(dir, name));
            // 读取 _names.json 做美化
            let displayName = name.replace(/\.\w+$/, "");
            try {
              const namesPath = path.join(dir, "_names.json");
              if (fs.existsSync(namesPath)) {
                const namesMap = JSON.parse(fs.readFileSync(namesPath, "utf-8"));
                if (namesMap[name]) displayName = namesMap[name];
              }
            } catch (e) {}
            results.push({
              name: displayName,
              url: `${urlPrefix}/${encodeURIComponent(name)}`,
              size: stat.size,
              mtime: stat.mtime.toISOString(),
            });
          } catch (e) {}
        }
      } catch (e) {}
    }
    scanDir(mediaDir, `/api/plugins/${pluginId}/widget/media`);
    scanDir(pluginDataMediaDir, `/api/plugins/${pluginId}/widget/media`);
    _mediaCache = results; _cacheTime = Date.now();
    return results;
  }

  // ── Widget 页面 ──
  app.get("/widget", (c) => {
    const hanaCss = c.req.query("hana-css") || "";
    const token = c.req.query("token") || "";
    const html = getWidgetHTML(pluginId, hanaCss, token);
    return c.html(html);
  });

  // ── 对话内嵌播放器 ──
  app.get("/play", (c) => {
    const filename = c.req.query("file");
    const translate = c.req.query("translate") || "";
    if (!filename) return c.text("Missing file", 400);
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return c.text("Invalid filename", 400);
    }
    let filePath = path.join(mediaDir, filename);
    if (!fs.existsSync(filePath) && pluginDataMediaDir) {
      filePath = path.join(pluginDataMediaDir, filename);
    }
    if (!fs.existsSync(filePath)) return c.text("File not found", 404);

    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = MIME[ext] || "audio/mpeg";

    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) {
      const redirectUrl = `/api/plugins/${pluginId}/widget/media/${encodeURIComponent(filename)}`;
      return c.redirect(redirectUrl);
    }

    const buf = fs.readFileSync(filePath);
    const base64 = buf.toString("base64");
    const audioSrc = `data:${mime};base64,${base64}`;

    let displayName = filename.replace(/\.\w+$/, "");
    try {
      const namesPath = path.join(dataDir, "media", "_names.json");
      let namesMap = null;
      if (fs.existsSync(namesPath)) {
        namesMap = JSON.parse(fs.readFileSync(namesPath, "utf-8"));
      } else if (pluginDataMediaDir) {
        const fallbackNames = path.join(pluginDataMediaDir, "_names.json");
        if (fs.existsSync(fallbackNames)) {
          namesMap = JSON.parse(fs.readFileSync(fallbackNames, "utf-8"));
        }
      }
      if (namesMap && namesMap[filename]) displayName = namesMap[filename];
    } catch (e) {
      console.warn("[play] _names.json read failed:", e.message);
    }

    const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  display:flex;align-items:center;justify-content:center;
  min-height:52px;padding:0;background:transparent;
  font-family:system-ui,-apple-system,sans-serif;
}
.player-wrap{
  width:100%;max-width:480px;
  background:#FFFBF5;border:1px solid rgba(0,0,0,0.06);
  border-radius:10px;overflow:hidden;
  margin:0 auto;
}
.top{height:2px;background:linear-gradient(90deg,#d49a6a,#c48454)}
.body{padding:8px 14px}
.row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.icon{
  width:26px;height:26px;border-radius:5px;
  background:linear-gradient(135deg,#d49a6a,#c48454);
  display:flex;align-items:center;justify-content:center;
  font-size:13px;flex-shrink:0;color:white;
}
.name{color:#2c2c2c;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
.trans{color:#666;font-size:12px;line-height:1.4;padding:6px 0 2px 0;border-top:1px solid rgba(0,0,0,0.04);margin-top:6px;word-break:break-all}
audio{width:100%;height:36px;border-radius:6px;outline:none;background:#FFFBF5}
audio::-webkit-media-controls-panel{background:#FFFBF5}
</style>
</head>
<body>
<div class="player-wrap">
  <div class="top"></div>
  <div class="body">
    <div class="row">
      <div class="icon">♫</div>
      <div class="name">${escAttr(displayName)}</div>
    </div>
    <audio src="${escAttr(audioSrc)}" controls preload="auto"></audio>
    ${translate ? `<div class="trans">${escAttr(translate)}</div>` : ""}
  </div>
</div>
<script>
(function(){
var a=document.querySelector("audio");
try{parent.postMessage({type:"ready"},"*")}catch(e){}
function n(){try{parent.postMessage({type:"resize-request",payload:{height:document.body.scrollHeight}},"*")}catch(e){}}
a.onloadedmetadata=n;
new ResizeObserver(n).observe(document.body);
setTimeout(n,100);
})();
</script>
</body>
</html>`;
    return c.html(html);
  });

  // ── 播放队列 ──
  // ── Media 库 API（替代旧的 queue.json） ──
  app.get("/widget/api/queue", (c) => {
    try {
      const files = collectMediaFiles().map(({ name, size, mtime, url }) => ({ name, size, mtime, url }));
      return c.json(files);
    } catch (e) { return c.json([]); }
  });

  // ── 文件夹扫描 API ──
  app.get("/widget/api/scan-folder", (c) => {
    const dir = c.req.query("path") || "";
    if (!dir) return c.json({ ok:false, error:"path required" }, 400);
    try {
      const absPath = path.resolve(dir);
      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
        return c.json({ ok:false, error:"not a directory" }, 400);
      }
      const exts = [".mp3", ".wav", ".ogg", ".flac", ".m4a"];
      const results = [];
      const seen = new Set();
      function _scan(d) {
        try {
          for (const name of fs.readdirSync(d)) {
            if (name.startsWith("_")) continue;
            const full = path.join(d, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) { _scan(full); continue; }
            const lower = name.toLowerCase();
            if (!exts.some(e => lower.endsWith(e))) continue;
            if (seen.has(name)) continue;
            seen.add(name);
            const relPath = path.relative(mediaDir, full);
            const url = `/api/plugins/${pluginId}/widget/media/${encodeURIComponent(relPath.replace(/\\/g, "/"))}`;
            let displayName = name.replace(/\.\w+$/, "");
            results.push({ name: displayName, url, mode: "本地", size: stat.size });
          }
        } catch(e) {}
      }
      _scan(absPath);
      return c.json({ ok:true, files:results, count:results.length });
    } catch(e) { return c.json({ ok:false, error:e.message }, 500); }
  });

  app.post("/widget/api/queue", async (c) => {
    return c.json({ ok: true });
  });

  // 增量 diff API
  let _lastFileSet = null, _lastNameMap = null;
  app.get("/widget/api/queue/diff", (c) => {
    try {
      const files = collectMediaFiles();
      const currentSet = new Set(files.map(f => f.url.split("/").pop()));
      const currentMap = new Map(files.map(f => [f.url.split("/").pop(), f]));
      if (!_lastFileSet) {
        _lastFileSet = currentSet; _lastNameMap = currentMap;
        return c.json({ added: files.map(f => ({ name: f.name, url: f.url, mode: "本地" })), removed: [] });
      }
      const added = [], removed = [];
      for (const [fn, f] of currentMap) { if (!_lastFileSet.has(fn)) added.push({ name: f.name, url: f.url, mode: "本地" }); }
      for (const fn of _lastFileSet) { if (!currentSet.has(fn)) { const old = _lastNameMap.get(fn); if (old) removed.push(old.url); } }
      _lastFileSet = currentSet; _lastNameMap = currentMap;
      return c.json({ added, removed });
    } catch (e) { return c.json({ added: [], removed: [] }); }
  });

  // ── Speakers API ──
  app.get("/widget/api/speakers", (c) => {
    try {
      const cosyBase = process.env.COSYVOICE_BASE || "";
      const home = process.env.USERPROFILE || process.env.HOME || "";
      const candidates = [
        cosyBase,
        path.join(home, "cosyvoice-tts"),
        path.join(home, "CosyVoice"),
        path.join(home, "CosyVoice2"),
      ].filter(Boolean);
      for (const base of candidates) {
        const refsPath = path.join(base, "speaker_refs.json");
        if (fs.existsSync(refsPath)) {
          try {
            const refs = JSON.parse(fs.readFileSync(refsPath, "utf-8"));
            const cnMap = { ophelia:"奥菲莉娅", aimis:"爱弥斯", alice:"艾莉丝", luoqixi:"洛琪希", glados:"GLaDOS", rebecca:"瑞贝卡", rebecca_normal:"瑞贝卡(混合)", my_voice:"我的声音" };
            const speakers = Object.keys(refs).map(function(id){ return { id:id, name:cnMap[id]||id }; });
            return c.json({ ok:true, speakers:speakers });
          } catch(e) { console.warn('[speakers] parse failed for', refsPath, e.message); }
        }
      }
      return c.json({ ok:true, speakers:[{id:"my_voice",name:"我的声音"}] });
    } catch(e) {
      console.warn('[speakers] endpoint error:', e.message);
      return c.json({ ok:false, speakers:[{id:"my_voice",name:"我的声音"}] });
    }
  });

  // ── Meting 音乐搜索代理（HTTP 代理到公共/本地 Meting 实例） ──
  const METING_BASE = process.env.METING_API_URL || "https://api.i-meto.com/meting/api";
  const METING_TOKEN = process.env.METING_TOKEN || "token";
  const metingAuth = (server, type, id) => createHmac("sha1", METING_TOKEN).update(`${server}${type}${id}`).digest("hex");
  const metingCache = new Map();
  const metingCacheTTL = 5 * 60 * 1000;

  app.get("/widget/api/music/search", async (c) => {
    const keyword = c.req.query("keyword") || "";
    const server = c.req.query("server") || "netease";
    if (!keyword) return c.json({ ok: false, error: "keyword required" }, 400);
    if (!["netease","tencent","kugou","baidu","kuwo"].includes(server)) return c.json({ ok:false, error:"invalid server" }, 400);
    try {
      const cacheKey = `${server}/search/${keyword}`;
      const cached = metingCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < metingCacheTTL) return c.json({ ok:true, results:cached.data });
      const metingUrl = `${METING_BASE}?server=${encodeURIComponent(server)}&type=search&id=${encodeURIComponent(keyword)}`;
      const resp = await fetch(metingUrl);
      const raw = await resp.json();
      const data = raw.map(x => ({
        title: x.title || "", author: x.author || "",
        url: x.url || "", pic: x.pic || "", lrc: x.lrc || "",
      }));
      metingCache.set(cacheKey, { ts: Date.now(), data });
      return c.json({ ok:true, results:data });
    } catch(e) { return c.json({ ok:false, error:e.message }, 500); }
  });

  app.get("/widget/api/music/url", async (c) => {
    // 公共实例返回的搜索结果里 url 字段已经是带 auth 的完整地址，直接 302
    const url = c.req.query("url") || "";
    if (!url) return c.json({ ok:false, error:"url required" }, 400);
    return c.redirect(url);
  });

  // ── 完整音频 URL（带 cookie，绕过试听限制）──
  // 环境变量 NETEASE_COOKIE 在文件顶部已声明
  app.get("/widget/api/music/full-url", async (c) => {
    const id = c.req.query("id") || "";
    const server = c.req.query("server") || "netease";
    const fallback = c.req.query("fallback") || ""; // Meting 原始 URL
    if (!id) return c.json({ ok:false, error:"id required" }, 400);

    // 没配任何 cookie → 直接回退到 Meting URL
    if (!NETEASE_COOKIE && !TENCENT_COOKIE && fallback) return c.redirect(fallback);
    if (!NETEASE_COOKIE && !TENCENT_COOKIE) return c.json({ ok:false, error:"no cookie configured" }, 503);

    try {
      if (server === "netease" && NETEASE_COOKIE) {
        const apiUrl = `https://music.163.com/api/song/enhance/player/url?ids=[${id}]&br=320000`;
        const resp = await fetch(apiUrl, {
          headers: {
            Cookie: NETEASE_COOKIE,
            Referer: "https://music.163.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        const data = await resp.json();
        const fullUrl = data?.data?.[0]?.url;
        if (fullUrl) {
          const httpsUrl = fullUrl.replace("http://", "https://");
          return c.json({ ok:true, url:httpsUrl });
        }
      }
      if (server === "tencent" && TENCENT_COOKIE) {
        // QQ 音乐：cookie 格式 uin=xxx; qqmusic_key=xxx
        const uinMatch = TENCENT_COOKIE.match(/uin=([^;]+)/);
        const keyMatch = TENCENT_COOKIE.match(/qqmusic_key=([^;]+)/);
        const uin = uinMatch ? uinMatch[1] : "";
        const qqmusic_key = keyMatch ? keyMatch[1] : "";
        const guid = (Math.random() * 10000000).toFixed(0);
        const reqBody = {
          req_0: {
            module: "vkey.GetVkeyServer",
            method: "CgiGetVkey",
            param: { guid: guid, songmid: id, songtype: [0], uin: uin, loginflag: 1, platform: "20" },
          },
          comm: { uin: uin, format: "json", ct: 19, cv: 0, authst: qqmusic_key },
        };
        const apiUrl = "https://u.y.qq.com/cgi-bin/musicu.fcg?-=getplaysongvkey&g_tk=5381&loginUin="+uin+"&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&data="+encodeURIComponent(JSON.stringify(reqBody));
        const resp = await fetch(apiUrl);
        const data = await resp.json();
        const purl = data?.req_0?.data?.midurlinfo?.[0]?.purl;
        if (purl) {
          const sip = data.req_0.data.sip.find(s => !s.startsWith("http://ws")) || data.req_0.data.sip[0];
          const fullUrl = (sip + purl).replace("http://", "https://");
          return c.json({ ok:true, url:fullUrl });
        }
      }
      // cookie 无效或拿不到 → 回退
      if (fallback) return c.json({ ok:true, url:fallback });
      return c.json({ ok:false, error:"failed to get full url" }, 503);
    } catch (e) {
      if (fallback) return c.json({ ok:true, url:fallback });
      return c.json({ ok:false, error:e.message }, 500);
    }
  });

  app.get("/widget/api/music/pic", async (c) => {
    const url = c.req.query("url") || "";
    if (!url) return c.json({ ok:false, error:"url required" }, 400);
    return c.redirect(url);
  });

  app.get("/widget/api/music/lrc", async (c) => {
    const id = c.req.query("id"); const server = c.req.query("server") || "netease";
    if (!id) return c.json({ok:false, error:"id required"}, 400);
    try {
      const metingUrl = `${METING_BASE}?server=${encodeURIComponent(server)}&type=lrc&id=${encodeURIComponent(id)}`;
      const resp = await fetch(metingUrl);
      const data = await resp.json();
      if (Array.isArray(data) && data.length && data[0].lrc) {
        return c.text(data[0].lrc, 200, { "Content-Type":"text/plain; charset=utf-8" });
      }
      // 有些实例直接返回文本
      const text = typeof data === "string" ? data : JSON.stringify(data);
      return c.text(text, 200, { "Content-Type":"text/plain; charset=utf-8" });
    } catch(e) { return c.json({ok:false, error:e.message}, 500); }
  });

  app.get("/widget/api/music/lrc-proxy", async (c) => {
    const url = c.req.query("url") || "";
    if (!url) return c.text("url required", 400);
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      return c.text(text, 200, { "Content-Type":"text/plain; charset=utf-8" });
    } catch(e) { return c.text("lyric fetch failed", 502); }
  });

  app.get("/widget/api/music/playlist", async (c) => {
    const id = c.req.query("id"); const server = c.req.query("server") || "netease";
    if (!id) return c.json({ ok:false, error:"id required" }, 400);
    try {
      const metingUrl = `${METING_BASE}?server=${encodeURIComponent(server)}&type=playlist&id=${encodeURIComponent(id)}`;
      const resp = await fetch(metingUrl);
      const raw = await resp.json();
      const data = raw.map(x => ({
        title: x.title || "", author: x.author || "",
        url: x.url || "", pic: x.pic || "", lrc: x.lrc || "",
      }));
      return c.json({ ok:true, tracks:data });
    } catch(e) { return c.json({ ok:false, error:e.message }, 500); }
  });

  // ── Bus API（节目编排引擎）──
  app.get("/widget/api/bus/state", (c) => {
    try {
      const q = busFile.readQueue();
      const st = busFile.readState();
      return c.json({ ok: true, status: st.status || "idle", current: st.current, currentIndex: st.currentIndex ?? -1, queue: q, history: (st.history || []).slice(-20) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });

  // ── Bus 文件直读直写辅助（彻底绕过 require 缓存问题）──
  const busFile = {
    queuePath: path.join(ctx.dataDir, "bus-queue.json"),
    statePath: path.join(ctx.dataDir, "bus-state.json"),
    readQueue() {
      try {
        if (fs.existsSync(this.queuePath))
          return JSON.parse(fs.readFileSync(this.queuePath, "utf-8"));
      } catch(e) {}
      return [];
    },
    writeQueue(q) {
      try {
        const tmp = this.queuePath + ".tmp." + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(q, null, 2), "utf-8");
        fs.renameSync(tmp, this.queuePath);
      } catch(e) {}
      // 同步旧单例内存（防止旧定时器 _saveQueue 覆写文件）
      try { const bus = getBus(ctx); if(bus) bus.queue = q.map(x => ({...x})); } catch(e) {}
    },
    readState() {
      try {
        if (fs.existsSync(this.statePath))
          return JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
      } catch(e) {}
      return { status: "idle", current: null, history: [], currentIndex: -1 };
    },
    writeState(s) {
      try {
        const tmp = this.statePath + ".tmp." + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(s, null, 2), "utf-8");
        fs.renameSync(tmp, this.statePath);
      } catch(e) {}
      // 同步旧单例内存（防止旧定时器 _saveState 覆写文件）
      try { const bus = getBus(ctx); if(bus) { bus.status = s.status; bus.current = s.current; bus.currentIndex = s.currentIndex; bus.history = s.history || []; } } catch(e) {}
    }
  };

  app.post("/widget/api/bus/control", async (c) => {
    try {
      const body = await c.req.json();
      const action = body.action || "state";
      switch (action) {
        case "load": {
          const playlist = body.playlist || [];
          busFile.writeQueue(playlist);
          const st = busFile.readState();
          st.status = "idle"; st.current = null; st.currentIndex = -1;
          busFile.writeState(st);
          return c.json({ ok: true, queue: playlist });
        }
        case "say": {
          if (!body.text) return c.json({ ok: false, code: "missing_text" });
          // 添加 say 条目到队列末尾
          const q = busFile.readQueue();
          const item = { type: "say", text: body.text, spk: body.spk || "my_voice", instruct: body.instruct || "", translate: body.translate || "", id: `say_${Date.now()}` };
          q.push(item);
          busFile.writeQueue(q);
          return c.json({ ok: true, queued: item, queueLength: q.length });
        }
        case "play": {
          if (!body.url) return c.json({ ok: false, code: "missing_url" });
          const q = busFile.readQueue();
          const item = { type: "play", url: body.url, name: body.name || path.basename(body.url), mode: body.mode || (body.url.startsWith("http") ? "在线" : "本地"), id: `play_${Date.now()}` };
          q.push(item);
          busFile.writeQueue(q);
          return c.json({ ok: true, queued: item, queueLength: q.length });
        }
        case "next": {
          const q = busFile.readQueue();
          const st = busFile.readState();
          if (!q.length) {
            st.status = "idle"; st.current = null;
            busFile.writeState(st);
            return c.json({ ok: true, event: "bus_idle" });
          }
          let ci = st.currentIndex ?? -1;
          if (ci < q.length - 1) ci++; else ci = 0;
          const item = q[ci];

          // say 类型：TTS 合成
          if (item.type === "say") {
            st.status = "playing"; st.current = item; st.currentIndex = ci;
            busFile.writeState(st);
            let ttsResult = null;
            try {
              const bus = getBus(ctx);
              ttsResult = await bus.ttsBus.synthesize(item.text, { spk: item.spk || "my_voice", instruct: item.instruct || "" });
              if (ttsResult.ok && ttsResult.url) {
                const playItem = { ...item, type: "play", url: ttsResult.url, name: item.text.length > 20 ? item.text.slice(0, 20) + "…" : item.text, mode: ttsResult.layer === "cosyvoice" ? "本地" : "在线", _origin: { ...item } };
                q[ci] = playItem;
                busFile.writeQueue(q);
                st.current = playItem;
                busFile.writeState(st);
                return c.json({ ok: true, event: "track_start", item: playItem });
              }
            } catch(e) {}
            // TTS 失败
            st.history = st.history || [];
            st.history.push({ ...item, playedAt: Date.now(), skipped: true });
            busFile.writeState(st);
            return c.json({ ok: true, event: "say_skipped", item, _reason: "TTS failed" });
          }

          // play / other 类型 — 如果无 URL 但有 searchKey，先搜索拿完整音频
          if (!item.url && item.searchKey) {
            const METING_BASE = process.env.METING_API_URL || "https://api.i-meto.com/meting/api";
            const METING_TOKEN = process.env.METING_TOKEN || "token";
            const sv = item.searchServer || "netease";
            try {
              const searchUrl = `${METING_BASE}?server=${sv}&type=search&id=${encodeURIComponent(item.searchKey)}`;
              const searchRes = await fetch(searchUrl, { headers: { "token": METING_TOKEN } });
              const searchJson = await searchRes.json();
              if (searchJson && searchJson.length > 0 && searchJson[0].url) {
                item.url = searchJson[0].url;
                item.name = item.name || searchJson[0].title;
                // 更新队列中的条目
                q[ci] = item;
                busFile.writeQueue(q);
              } else {
                // 搜索无结果：跳过此条
                st.history = st.history || [];
                st.history.push({ ...item, playedAt: Date.now(), skipped: true });
                busFile.writeState(st);
                // 自动前进到下一首
                const nextCi = ci < q.length - 1 ? ci + 1 : (q.length > 1 ? 0 : -1);
                if (nextCi >= 0 && nextCi !== ci) {
                  st.currentIndex = nextCi;
                  busFile.writeState(st);
                }
                return c.json({ ok: true, event: "say_skipped", item, _reason: "search_no_result" });
              }
            } catch(e) {
              // 搜索失败：跳过
              st.history = st.history || [];
              st.history.push({ ...item, playedAt: Date.now(), skipped: true });
              busFile.writeState(st);
              return c.json({ ok: true, event: "say_skipped", item, _reason: "search_failed" });
            }
          }

          st.status = "playing"; st.current = item; st.currentIndex = ci;
          st.history = st.history || [];
          st.history.push({ ...item, playedAt: Date.now() });
          busFile.writeState(st);
          return c.json({ ok: true, event: "track_start", item });
        }
        case "remove": {
          const q = busFile.readQueue();
          const st = busFile.readState();
          const rmIdx = body.index;
          if (rmIdx < 0 || rmIdx >= q.length) return c.json({ ok: false, code: "bad_index" });
          q.splice(rmIdx, 1);
          if (rmIdx <= (st.currentIndex ?? -1)) st.currentIndex = Math.max(-1, st.currentIndex - 1);
          busFile.writeQueue(q);
          busFile.writeState(st);
          return c.json({ ok: true, queueLength: q.length });
        }
        case "clear": {
          busFile.writeQueue([]);
          const st = busFile.readState();
          st.status = "idle"; st.current = null; st.currentIndex = -1;
          busFile.writeState(st);
          return c.json({ ok: true, event: "bus_idle" });
        }
        case "state":
        default: {
          const q = busFile.readQueue();
          const st = busFile.readState();
          return c.json({ ok: true, status: st.status || "idle", current: st.current, currentIndex: st.currentIndex ?? -1, queue: q, history: (st.history || []).slice(-20) });
        }
      }
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });

  // ── 媒体文件 ──
  app.get("/widget/media/:filename", async (c) => {
    const filename = c.req.param("filename");
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return c.json({ error: "invalid filename" }, 400);
    }

    let filePath = path.join(mediaDir, filename);
    if (!fs.existsSync(filePath) && pluginDataMediaDir) {
      filePath = path.join(pluginDataMediaDir, filename);
    }
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "not found" }, 404);
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filename).slice(1);
    const mime = MIME[ext] || "audio/mpeg";
    const total = stat.size;
    const range = c.req.header("range");

    if (range) {
      const match = range.match(/^bytes=(\d+)-(\d*)$/);
      if (!match) {
        return c.text("Invalid Range", 416);
      }
      const start = parseInt(match[1], 10);
      const end = match[2] !== "" ? parseInt(match[2], 10) : total - 1;
      if (start >= total || end >= total) {
        return c.text("Range Not Satisfiable", 416);
      }
      const stream = fs.createReadStream(filePath, { start, end });
      const { readable, writable } = new TransformStream();
      streamPipe(stream, writable);
      return new Response(readable, {
        status: 206,
        headers: {
          "Content-Type": mime,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(end - start + 1),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    const stream = fs.createReadStream(filePath);
    const { readable, writable } = new TransformStream();
    streamPipe(stream, writable);
    return new Response(readable, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      },
    });
  });
}

function streamPipe(nodeStream, writable) {
  const writer = writable.getWriter();
  nodeStream.on("data", (chunk) => writer.write(chunk));
  nodeStream.on("end", () => writer.close());
  nodeStream.on("error", () => writer.close());
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escAttr(s) {
  return esc(s);
}

function showToast(msg, dur) {
  dur = dur || 2500;
  var c = document.getElementById('toastContainer');
  if (!c) return;
  var t = document.createElement('div');
  t.className = 'toast-item';
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(function() { t.classList.add('show'); });
  setTimeout(function() {
    t.classList.remove('show');
    setTimeout(function() { t.remove(); }, 300);
  }, dur);
}

// ═══════════════════════════════════════════════════════════════
// Widget HTML — 深色玻璃质感 + 琥珀色点缀
// ═══════════════════════════════════════════════════════════════
function getWidgetHTML(pluginId, hanaCss, token) {
  const apiBase = `/api/plugins/${pluginId}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🎵 播放器</title>
${hanaCss ? `<link rel="stylesheet" href="${esc(hanaCss)}">` : ""}
<style>
:root, [data-theme="dark"] {
  --bg: #161618;
  --surface: rgba(255,255,255,0.03);
  --surface-hover: rgba(255,255,255,0.06);
  --surface-active: rgba(255,255,255,0.08);
  --border: rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.14);
  --text: #e4e4e7;
  --text-dim: rgba(255,255,255,0.4);
  --text-faint: rgba(255,255,255,0.25);
  --accent: #d49a6a;
  --accent-glow: rgba(212,154,106,0.4);
  --accent-soft: rgba(212,154,106,0.12);
  --radius: 10px;
}
[data-theme="light"] {
  --bg: #FFF8E7;
  --surface: rgba(0,0,0,0.03);
  --surface-hover: rgba(0,0,0,0.05);
  --surface-active: rgba(0,0,0,0.08);
  --border: rgba(0,0,0,0.08);
  --border-strong: rgba(0,0,0,0.14);
  --text: #3d3320;
  --text-dim: rgba(0,0,0,0.4);
  --text-faint: rgba(0,0,0,0.25);
  --accent: #c48454;
  --accent-glow: rgba(196,132,84,0.3);
  --accent-soft: rgba(196,132,84,0.1);
}

* { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; overflow:hidden; }

body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  display: flex; flex-direction: column;
  user-select: none;
  -webkit-font-smoothing: antialiased;
}

/* ── Header ── */
.header {
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 14px 8px;
  flex-shrink:0;
}
.header-left { display:flex; align-items:center; gap:8px; }
.header-icon {
  width:22px; height:22px; border-radius:5px;
  background:linear-gradient(135deg, var(--accent), #c48454);
  display:flex; align-items:center; justify-content:center;
  font-size:11px; flex-shrink:0;
  box-shadow: 0 2px 8px var(--accent-glow);
}
.header-title {
  font-weight:600; font-size:13px; letter-spacing:0.3px;
  color: var(--text);
}
.header-actions { display:flex; gap:4px; }
.icon-btn {
  background:none; border:none; color:var(--text-dim); cursor:pointer;
  width:26px; height:26px; border-radius:6px;
  display:flex; align-items:center; justify-content:center;
  transition: all 0.15s;
}
.icon-btn:hover { background:var(--surface-hover); color:var(--text); }
.icon-btn svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

/* ── Now Playing ── */
.now-playing {
  display:flex; align-items:center; gap:10px;
  padding:6px 14px 8px;
}
.np-cover {
  width:36px; height:36px; border-radius:8px;
  background:linear-gradient(135deg, var(--accent), #c48454);
  display:flex; align-items:center; justify-content:center;
  font-size:16px; flex-shrink:0;
  box-shadow: 0 4px 14px var(--accent-glow);
  position:relative; overflow:hidden;
}
.np-cover::after {
  content:''; position:absolute; inset:0;
  background:linear-gradient(135deg, rgba(255,255,255,0.15), transparent 50%);
}
.np-cover.spinning { animation: spin 8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.np-info { min-width:0; flex:1; }
.np-name {
  font-weight:500; font-size:13px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  color:var(--text);
}
.np-mode {
  font-size:11px; color:var(--text-dim);
  margin-top:1px;
}

/* ── Progress ── */
.progress-section { padding:4px 14px 6px; }
.time-row {
  display:flex; justify-content:space-between;
  font-size:10px; color:var(--text-faint);
  margin-bottom:4px; font-variant-numeric:tabular-nums;
  letter-spacing:0.5px;
}
.progress-bar {
  height:5px; background:var(--surface); border-radius:3px;
  cursor:pointer; position:relative;
  transition: height 0.15s;
}
.progress-bar:hover { height:7px; }
.progress-fill {
  height:100%; width:0%; border-radius:3px;
  background:linear-gradient(90deg, var(--accent), #e0b088);
  position:relative; transition:width 0.1s linear;
  box-shadow: 0 0 8px var(--accent-glow);
}
.progress-fill::after {
  content:''; position:absolute; right:-4px; top:50%;
  transform:translateY(-50%);
  width:10px; height:10px; border-radius:50%;
  background:var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
  opacity:0; transition:opacity 0.2s;
}
.progress-bar:hover .progress-fill::after { opacity:1; }

/* ── Visualizer ── */
.visualizer {
  display:block; width:100%; height:32px;
  margin:0 auto -2px; padding:0 14px;
  border-radius:0 0 8px 8px;
}

/* ── Controls ── */
.controls {
  display:flex; align-items:center; justify-content:flex-end;
  padding:4px 16px 10px; gap:12px; box-sizing:border-box; overflow:visible;
  margin-left:20px;
}
.ctrl-btn {
  background:none; border:none; color:var(--text-dim); cursor:pointer;
  width:26px; height:26px; border-radius:6px;
  display:flex; align-items:center; justify-content:center;
  transition: all 0.15s; flex-shrink:0;
}
.ctrl-btn:hover { background:var(--surface-hover); color:var(--text); }
.ctrl-btn svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.ctrl-btn.active { color:var(--accent); }

.ctrl-play {
  width:34px; height:34px; border-radius:50%;
  background:linear-gradient(135deg, var(--accent), #c48454);
  color:#fff; cursor:pointer; border:none;
  display:flex; align-items:center; justify-content:center;
  box-shadow: 0 4px 16px var(--accent-glow);
  transition: all 0.2s; flex-shrink:0;
}
.ctrl-play:hover { transform:scale(1.06); box-shadow:0 6px 22px var(--accent-glow); }
.ctrl-play:active { transform:scale(0.96); }
.ctrl-play svg { width:18px; height:18px; }

/* Volume — compact inline */
.volume-group {
  display:flex; align-items:center; gap:3px;
  margin-left:auto;
}
.vol-slider {
  width:40px; height:4px; -webkit-appearance:none; appearance:none;
  background:var(--surface); border-radius:2px; cursor:pointer;
  transition: height 0.15s;
}
.vol-slider:hover { height:6px; }
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance:none; width:10px; height:10px;
  border-radius:50%; background:var(--accent); cursor:pointer;
  box-shadow: 0 0 4px var(--accent-glow);
}

/* ── Playlist ── */
.playlist-section {
  border-top:1px solid var(--border);
  flex:1; min-height:0; display:flex; flex-direction:column;
}
.pl-toggle {
  display:flex; align-items:center; justify-content:space-between;
  padding:8px 14px; cursor:pointer;
  transition: background 0.15s;
}
.pl-toggle:hover { background:var(--surface); }
.pl-toggle-left { display:flex; align-items:center; gap:6px; }
.pl-toggle-left svg { width:13px; height:13px; stroke:var(--text-dim); fill:none; stroke-width:2; }
.pl-toggle-text { font-size:12px; color:var(--text-dim); }
.pl-count {
  font-size:10px; color:var(--text-faint);
  background:var(--surface); border-radius:8px;
  padding:1px 7px; font-variant-numeric:tabular-nums;
}
.pl-toggle-right { display:flex; align-items:center; gap:6px; }
.pl-filter-btn {
  background:var(--surface); border:1px solid var(--border); border-radius:6px;
  color:var(--text-faint); font-size:11px; padding:2px 8px;
  cursor:pointer; transition:all 0.15s; font-family:inherit;
  display:flex; align-items:center; gap:3px;
}
.pl-filter-btn:hover { border-color:var(--accent); color:var(--accent); }
.pl-filter-btn.active {
  background:var(--accent-soft); border-color:var(--accent); color:var(--accent);
}
.pl-chevron { width:14px; height:14px; stroke:var(--text-faint); fill:none; stroke-width:2; transition:transform 0.25s; }
.pl-toggle.open .pl-chevron { transform:rotate(180deg); }

.pl-body {
  max-height:0; overflow:hidden;
  transition:max-height 0.3s cubic-bezier(0.4,0,0.2,1);
}
.pl-body.open { max-height:180px; overflow-y:auto; }
.pl-body::-webkit-scrollbar { width:6px; }
.pl-body::-webkit-scrollbar-track { background:transparent; }
.pl-body::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:2px; }

.pl-body::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:2px; }

/* ── Lyric Panel ── */
.lyric-section { margin:0; }
.lyric-header {
  display:flex; justify-content:space-between; align-items:center;
  padding:5px 10px; cursor:pointer; user-select:none;
  color:var(--text-dim); border-top:1px solid var(--border);
}
.lyric-header:hover { color:var(--text); }
.lyric-header .pl-chevron { transition:transform 0.25s; }
.lyric-header.open .pl-chevron { transform:rotate(180deg); }
.lyric-body {
  max-height:0; overflow:hidden;
  transition:max-height 0.25s ease;
  padding:0 10px;
}
.lyric-body.open { max-height:220px; overflow-y:auto; }
.lyric-line {
  font-size:11.5px; color:var(--text-dim); line-height:1.8; text-align:center;
  transition:color 0.2s, font-size 0.2s;
}
.lyric-line.current { color:var(--accent); font-size:13px; font-weight:600; }
.lyric-line:hover { color:var(--text); }
.lyric-body::-webkit-scrollbar { width:6px; }
.lyric-body::-webkit-scrollbar-track { background:transparent; }
.lyric-body::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:2px; }

/* ── Playlist Groups ── */
.pl-group-header {
  display:flex; align-items:center; gap:4px;
  padding:5px 10px; cursor:pointer; user-select:none;
  font-size:10.5px; color:var(--text-dim);
  border-top:1px solid var(--border);
  background:var(--surface);
}
.pl-group-header:hover { color:var(--accent); }
.pl-group-header .pl-chevron { transition:transform 0.2s; }
.pl-group-header.collapsed .pl-chevron { transform:rotate(-90deg); }
.pl-group-name { flex:1; }
.pl-group-count { font-size:9px; opacity:0.6; }
.pl-group-body { }
.pl-group-body.collapsed { display:none; }

/* ── Playlist Context Menu ── */
.pl-ctx-menu {
  position:absolute; right:2px; top:100%; z-index:20;
  background:var(--card); border:1px solid var(--border-strong);
  border-radius:6px; padding:4px 0; min-width:100px;
  box-shadow:0 4px 12px rgba(0,0,0,0.3); font-size:11px;
}
.pl-ctx-title { padding:4px 10px; color:var(--text-faint); font-size:10px; }
.pl-ctx-opt { padding:5px 10px; color:var(--text-dim); cursor:pointer; }
.pl-ctx-opt:hover { background:var(--surface-hover); color:var(--text); }

.pl-item {
  display:flex; align-items:center; gap:8px;
  padding:6px 14px; cursor:pointer;
  transition: background 0.12s;
}
.pl-item:hover { background:var(--surface); }
.pl-item.active { background:var(--accent-soft); }
.pl-item .pl-status {
  width:16px; text-align:center; font-size:11px;
  color:var(--text-faint); flex-shrink:0;
}
.pl-item.active .pl-status { color:var(--accent); }
.pl-item .pl-name {
  flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  font-size:12px; color:var(--text-dim);
}
.pl-item.active .pl-name { color:var(--accent); font-weight:500; }
.pl-item .pl-dur {
  font-size:10px; color:var(--text-faint);
  font-variant-numeric:tabular-nums;
}
.pl-item .pl-star {
  background:none; border:none; cursor:pointer;
  font-size:13px; padding:2px; flex-shrink:0;
  color:var(--text-faint); transition: color 0.15s, transform 0.15s;
  line-height:1;
}
.pl-item .pl-star:hover { transform:scale(1.2); }
.pl-item .pl-star.starred { color:#f0c060; }
.pl-item .pl-rm {
  background:none; border:none; color:var(--text-faint);
  cursor:pointer; font-size:11px; padding:2px; flex-shrink:0;
  opacity:0.35; transition:opacity 0.12s, color 0.12s;
}
.pl-item:hover .pl-rm { opacity:0.7; }
.pl-item .pl-rm:hover { opacity:1; color:var(--accent); }
.pl-item.dragging { opacity:0.4; }
.pl-item.drag-over { border-top:2px solid var(--accent); }
.pl-handle {
  cursor:grab; color:var(--text-faint); font-size:12px;
  flex-shrink:0; opacity:0; transition:opacity 0.12s;
}
.pl-item:hover .pl-handle { opacity:0.5; }

.pl-empty { padding:16px 14px; text-align:center; color:var(--text-faint); font-size:12px; }

/* ── Add + Preset (unified) ── */
.add-section { border-top:1px solid var(--border); padding:8px 14px 10px; }
.add-row {
  display:flex; align-items:center; gap:6px;
}
.add-input {
  flex:1; min-width:0;
  background:var(--surface); border:1px solid var(--border); border-radius:7px;
  color:var(--text); font-size:11px; padding:5px 10px;
  outline:none; font-family:inherit;
  transition: border-color 0.15s;
}
.add-input::placeholder { color:var(--text-faint); }
.add-input:focus { border-color:var(--accent); background:var(--surface-hover); }
.add-btn {
  background:linear-gradient(135deg, var(--accent), #c48454);
  border:none; border-radius:7px; color:#fff;
  font-size:11px; padding:5px 12px; cursor:pointer;
  font-family:inherit; font-weight:500; white-space:nowrap;
  transition: all 0.15s;
  box-shadow: 0 2px 8px var(--accent-glow);
}
.add-btn:hover { box-shadow:0 3px 12px var(--accent-glow); transform:translateY(-1px); }
.add-btn:active { transform:translateY(0); }

/* ── Bus Panel ── */
.bus-section {
  border-top:1px solid var(--border);
}
.bus-toggle {
  display:flex; align-items:center; justify-content:space-between;
  padding:8px 14px; cursor:pointer;
  transition: background 0.15s;
}
.bus-toggle:hover { background:var(--surface); }
.bus-toggle-left { display:flex; align-items:center; gap:6px; }
.bus-status {
  font-size:9px; padding:1px 6px; border-radius:8px;
  background:var(--surface); color:var(--text-faint);
  text-transform:uppercase; letter-spacing:0.5px;
}
.bus-status.playing { background:var(--accent-soft); color:var(--accent); }
.bus-status.error { background:rgba(239,68,68,0.12); color:#ef4444; }
.bus-body {
  max-height:0; overflow:hidden;
  transition:max-height 0.3s cubic-bezier(0.4,0,0.2,1);
}
.bus-body.open { max-height:500px; overflow-y:auto; }
.bus-body::-webkit-scrollbar { width:6px; }
.bus-body::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:2px; }
.bus-controls {
  display:flex; gap:6px; padding:8px 14px 4px;
}
.bus-btn {
  background:var(--surface); border:1px solid var(--border); border-radius:6px;
  color:var(--text-dim); font-size:13px;
  width:30px; height:28px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition: all 0.15s; font-family:inherit;
}
.bus-btn:hover { border-color:var(--accent); color:var(--accent); background:var(--accent-soft); }
.bus-btn:active { transform:scale(0.94); }
.bus-queue { padding:0 14px 8px; }
.bus-queue-item {
  display:flex; align-items:center; gap:6px;
  padding:4px 0; font-size:11px;
  border-bottom:1px solid var(--border);
}
.bus-queue-item:last-child { border-bottom:none; }
.bus-q-type {
  font-size:9px; padding:1px 5px; border-radius:4px;
  text-transform:uppercase; letter-spacing:0.5px; flex-shrink:0;
}
.bus-q-type.say { background:rgba(99,102,241,0.15); color:#818cf8; }
.bus-q-type.play { background:var(--accent-soft); color:var(--accent); }
.bus-q-type.segue { background:rgba(34,197,94,0.15); color:#4ade80; }
.bus-q-type.reason { background:rgba(234,179,8,0.15); color:#facc15; }
.bus-q-name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-dim); }
.bus-q-rm { background:none; border:none; color:var(--text-dim); opacity:0.35; cursor:pointer; font-size:11px; padding:0 4px; transition:opacity .15s; }
.bus-q-rm:hover { opacity:1; color:#e8a044; }
.bus-q-current { color:var(--accent); font-weight:500; }
.bus-q-pending { opacity:0.7; }
.bus-q-pending .bus-q-name::after { content:' ⏳合成中…'; font-size:10px; color:var(--text-faint); }
.bus-empty { padding:12px 0; text-align:center; color:var(--text-faint); font-size:11px; }

/* ── Scene presets（场景调度）── */
.scene-section { padding:10px 14px 6px; border-top:1px solid var(--border); }
.scene-label { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
.scene-auto-badge { font-size:10px; color:var(--accent); background:rgba(232,160,68,0.1); padding:1px 6px; border-radius:8px; margin-left:auto; }
.scene-list { display:flex; gap:6px; }
.scene-btn { background:var(--surface); border:1px solid var(--border); color:var(--text-dim); padding:5px 12px; border-radius:6px; font-size:11px; cursor:pointer; transition:all .15s; }
.scene-btn:hover { border-color:var(--accent); color:var(--accent); }
.scene-btn.active { background:rgba(232,160,68,0.15); border-color:var(--accent); color:var(--accent); font-weight:500; }

/* ── Bus Panel（节目编排）── */
.bus-section {
  border-top:1px solid var(--border);
}
.bus-toggle {
  display:flex; align-items:center; justify-content:space-between;
  padding:6px 10px; cursor:pointer;
  transition: background 0.15s;
}
.bus-toggle:hover { background:var(--surface); }
.bus-toggle-left { display:flex; align-items:center; gap:4px; }
.bus-toggle-left svg { width:11px; height:11px; stroke:var(--text-dim); fill:none; stroke-width:2; }
.bus-toggle-text { font-size:11px; color:var(--text-dim); }
.bus-badge {
  font-size:8px; color:var(--accent);
  background:var(--accent-soft); border-radius:3px;
  padding:1px 4px; font-variant-numeric:tabular-nums;
}
.bus-chevron { width:14px; height:14px; stroke:var(--text-faint); fill:none; stroke-width:2; transition:transform 0.25s; }
.bus-toggle.open .bus-chevron { transform:rotate(180deg); }

.bus-body {
  max-height:0; overflow:hidden;
  transition:max-height 0.3s cubic-bezier(0.4,0,0.2,1);
}
.bus-body.open { max-height:500px; overflow-y:auto; }
.bus-body::-webkit-scrollbar { width:6px; }
.bus-body::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:2px; }

.bus-controls {
  display:flex; gap:3px; padding:4px 10px 3px;
}
.bus-btn {
  background:var(--surface); border:1px solid var(--border); border-radius:5px;
  color:var(--text-dim); font-size:10px; padding:3px 8px;
  cursor:pointer; transition:all 0.15s; font-family:inherit;
  display:flex; align-items:center; gap:2px;
}
.bus-btn:hover { border-color:var(--accent); color:var(--accent); background:var(--accent-soft); }
.bus-btn.primary {
  background:linear-gradient(135deg, var(--accent), #c48454);
  border:none; color:#fff;
  box-shadow: 0 2px 8px var(--accent-glow);
}
.bus-btn.primary:hover { box-shadow:0 3px 12px var(--accent-glow); }

.bus-play-row { display:flex; gap:4px; padding:2px 10px 6px; }
.bus-play-input {
  flex:1; min-width:0;
  background:var(--surface); border:1px solid var(--border); border-radius:6px;
  color:var(--text); font-size:10px; padding:4px 8px;
  outline:none; font-family:inherit;
  transition: border-color 0.15s;
}
.bus-play-input::placeholder { color:var(--text-faint); }
.bus-play-input:focus { border-color:var(--accent); }
.bus-play-add-btn {
  background:var(--surface); border:1px solid var(--border); border-radius:6px;
  color:var(--text-dim); font-size:10px; padding:4px 10px;
  cursor:pointer; font-family:inherit; white-space:nowrap;
  transition: all 0.15s;
}
.bus-play-add-btn:hover { border-color:var(--accent); color:var(--accent); }

.bus-queue { padding:0 10px 6px; }
.bus-queue-item {
  display:flex; align-items:center; gap:4px;
  padding:3px 0; font-size:10px;
  border-bottom:1px solid var(--border);
}
.bus-queue-item:last-child { border-bottom:none; }
.bus-queue-type {
  font-size:8px; padding:1px 4px; border-radius:2px;
  flex-shrink:0; font-weight:500; letter-spacing:0.3px;
}
.bus-queue-type.say { background:rgba(100,180,255,0.12); color:#64b4ff; }
.bus-queue-type.play { background:var(--accent-soft); color:var(--accent); }
.bus-queue-type.segue { background:rgba(180,180,180,0.1); color:var(--text-faint); }
.bus-queue-type.reason { background:rgba(200,150,255,0.1); color:#c896ff; }
.bus-queue-text {
  flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  color:var(--text-dim);
}
.bus-queue-playing { color:var(--accent); font-weight:500; }
.bus-empty { padding:10px 14px; text-align:center; color:var(--text-faint); font-size:11px; }
.bus-status {
  padding:4px 14px 8px; font-size:10px; color:var(--text-faint);
  display:flex; align-items:center; gap:4px;
}
.bus-status-dot {
  width:6px; height:6px; border-radius:50%;
  background:var(--text-faint);
}
.bus-status-dot.playing { background:#4ade80; box-shadow:0 0 4px rgba(74,222,128,0.5); }
.bus-status-dot.paused { background:#fbbf24; }
.bus-status-dot.idle { background:var(--text-faint); }

/* ═══ Toast 通知 ═══ */
#toastContainer {
  position:fixed; top:12px; left:50%; transform:translateX(-50%);
  z-index:9999; display:flex; flex-direction:column; gap:6px; align-items:center;
  pointer-events:none;
}
.toast-item {
  background:var(--surface); border:1px solid var(--border); border-radius:8px;
  color:var(--text); font-size:11px; padding:8px 16px;
  box-shadow:0 4px 16px rgba(0,0,0,0.4); opacity:0;
  transform:translateY(-8px); transition:opacity .25s, transform .25s;
  pointer-events:auto;
}
.toast-item.show { opacity:1; transform:translateY(0); }

/* ═══ Music Search ═══ */
.music-section { border-top:1px solid var(--border); }
.music-toggle { display:flex; align-items:center; justify-content:space-between; padding:8px 14px; cursor:pointer; transition:background .15s; }
.music-toggle:hover { background:var(--surface); }
.music-toggle-left { display:flex; align-items:center; gap:6px; color:var(--text-dim); }
.music-toggle-left svg { width:13px; height:13px; stroke:var(--text-dim); fill:none; stroke-width:2; }
.music-toggle-text { font-size:12px; }
.music-chevron { width:14px; height:14px; stroke:var(--text-faint); fill:none; stroke-width:2; transition:transform .25s; }
.music-toggle.open .music-chevron { transform:rotate(180deg); }
.music-body { max-height:0; overflow:hidden; transition:max-height .3s cubic-bezier(.4,0,.2,1); }
.music-body.open { max-height:400px; overflow-y:auto; }
.music-body::-webkit-scrollbar { width:6px; }
.music-body::-webkit-scrollbar-thumb { background:var(--border-strong); border-radius:2px; }
.music-search-row { display:flex; gap:4px; padding:6px 14px; }
.music-input { flex:1; min-width:0; background:var(--surface); border:1px solid var(--border); border-radius:7px; color:var(--text); font-size:11px; padding:5px 10px; outline:none; font-family:inherit; transition:border-color .15s; }
.music-input::placeholder { color:var(--text-faint); }
.music-input:focus { border-color:var(--accent); }
.music-server { width:62px; flex-shrink:0; background:var(--surface); border:1px solid var(--border); border-radius:7px; color:var(--text); font-size:11px; padding:4px 6px; outline:none; font-family:inherit; cursor:pointer; }
.music-server:focus { border-color:var(--accent); }
.music-go { background:var(--accent-soft); border:1px solid var(--accent); border-radius:7px; color:var(--accent); font-size:11px; padding:5px 12px; cursor:pointer; font-family:inherit; white-space:nowrap; transition:all .15s; }
.music-go:hover { background:var(--accent); color:#fff; }
.music-results { padding:0 14px 8px; }
.music-item { display:flex; align-items:center; gap:6px; padding:5px 0; border-bottom:1px solid var(--border); font-size:11px; }
.music-item:last-child { border-bottom:none; }
.music-thumb { width:28px; height:28px; border-radius:4px; object-fit:cover; flex-shrink:0; background:var(--surface); }
.music-thumb-placeholder { width:28px; height:28px; border-radius:4px; flex-shrink:0; background:var(--surface); display:flex; align-items:center; justify-content:center; font-size:12px; color:var(--text-faint); }
.music-info { flex:1; min-width:0; overflow:hidden; }
.music-title { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-dim); }
.music-author { font-size:10px; color:var(--text-faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.music-play { background:none; border:1px solid var(--border); border-radius:5px; color:var(--text-dim); font-size:10px; padding:3px 8px; cursor:pointer; flex-shrink:0; transition:all .12s; }
.music-play:hover { border-color:var(--accent); color:var(--accent); }
.music-add { background:none; border:none; color:var(--text-faint); font-size:10px; cursor:pointer; padding:3px 6px; flex-shrink:0; opacity:.6; transition:all .12s; }
.music-add:hover { opacity:1; color:var(--accent); }
.music-scene { background:none; border:none; color:var(--text-faint); font-size:10px; cursor:pointer; padding:3px 6px; flex-shrink:0; opacity:.5; transition:all .12s; }
.music-scene:hover { opacity:1; color:var(--accent); }
.music-scene-menu { position:absolute; right:14px; background:var(--surface); border:1px solid var(--border); border-radius:6px; padding:4px 0; box-shadow:0 4px 12px rgba(0,0,0,.3); z-index:10; font-size:11px; min-width:90px; }
.music-scene-menu div { padding:4px 12px; cursor:pointer; color:var(--text-dim); white-space:nowrap; }
.music-scene-menu div:hover { background:var(--accent-soft); color:var(--accent); }
.music-empty { padding:12px 0; text-align:center; color:var(--text-faint); font-size:11px; }
.music-loading { padding:12px 0; text-align:center; color:var(--text-faint); font-size:11px; }
</style>
</head>
<body>
<div id="toastContainer"></div>

<!-- Header -->
<div class="header">
  <div class="header-left">
    <div class="header-icon">♫</div>
    <span class="header-title">播放器</span>
  </div>
  <div class="header-actions">
    <button class="icon-btn" id="themeBtn" title="切换主题">
      <svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    </button>
    <button class="icon-btn" id="popBtn" title="弹出窗口">
      <svg viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
    </button>
  </div>
</div>

<!-- Now Playing -->
<div class="now-playing">
  <div class="np-cover" id="npCover">♫</div>
  <div class="np-info">
    <div class="np-name" id="trackName">播放器</div>
    <div class="np-mode" id="trackMode">准备就绪</div>
  </div>
</div>

<!-- Progress -->
<div class="progress-section">
  <div class="time-row">
    <span id="currentTime">0:00</span>
    <span id="totalTime">0:00</span>
  </div>
  <div class="progress-bar" id="progressBar">
    <div class="progress-fill" id="progressFill"></div>
  </div>
  <canvas class="visualizer" id="visualizer" width="300" height="32"></canvas>
</div>

<!-- Controls -->
<div class="controls">
  <button class="ctrl-btn" id="prevBtn" title="上一首" style="opacity:1;width:34px;height:34px;">
    <svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none;width:20px;height:20px;"><polygon points="19 20 9 12 19 4 19 20"/><rect x="4" y="4" width="3" height="16" rx="1"/></svg>
  </button>
  <button class="ctrl-play" id="playBtn" title="播放/暂停">
    <svg id="playIcon" viewBox="0 0 24 24"><polygon points="8,5 19,12 8,19" fill="white" stroke="none"/></svg>
    <svg id="pauseIcon" viewBox="0 0 24 24" style="display:none"><rect x="7" y="5" width="3.5" height="14" rx="1" fill="white" stroke="none"/><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="white" stroke="none"/></svg>
  </button>
  <button class="ctrl-btn" id="nextBtn" title="下一首">
    <svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 21 5 4" fill="currentColor" stroke="none"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
  </button>
  <div class="volume-group">
    <button class="ctrl-btn" id="volumeBtn" title="静音" style="width:26px;height:26px;">
      <svg id="volIcon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    </button>
    <input type="range" class="vol-slider" id="volumeSlider" min="0" max="100" value="80">
  </div>
  <button class="ctrl-btn" id="modeBtn" title="播放模式" style="width:26px;height:26px;opacity:0.8">
    <svg id="modeIcon" viewBox="0 0 24 24" width="16" height="16"><line x1="5" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2"/><polygon points="8 12 18 5 18 19" fill="currentColor"/></svg>
  </button>
</div>

<!-- Playlist -->
<div class="playlist-section">
  <div class="pl-toggle" id="plToggle">
    <div class="pl-toggle-left">
      <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      <span class="pl-toggle-text">播放列表</span>
      <span class="pl-count" id="plCount">0</span>
    </div>
    <div class="pl-toggle-right">
      <button class="pl-filter-btn" id="favFilterBtn" title="只显示收藏">
        <span id="favFilterIcon">☆</span>
        <span style="font-size:10px;">收藏</span>
      </button>
      <svg class="pl-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
  </div>
  <div class="pl-body" id="plBody"></div>

  <!-- Lyric Panel -->
  <div class="lyric-section" id="lyricSection">
    <div class="lyric-header" id="lyricToggle">
      <span style="font-size:10px;opacity:0.85;">歌词</span>
      <svg class="pl-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="lyric-body" id="lyricBody"></div>
  </div>

  <!-- Add track -->
  <div class="add-section">
    <div class="add-row">
      <input class="add-input" id="urlInput" type="text" placeholder="粘贴 URL 或本地路径…" spellcheck="false">
      <button class="add-btn" id="addBtn">添加</button>
    </div>
  </div>

  <!-- Music Search -->
  <div class="music-section">
    <div class="music-toggle" id="musicToggle">
      <div class="music-toggle-left"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><span class="music-toggle-text">搜索音乐</span></div>
      <svg class="music-chevron" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="music-body" id="musicBody">
      <div class="music-search-row">
        <input class="music-input" id="musicInput" type="text" placeholder="搜索歌曲、歌手…" spellcheck="false">
        <select class="music-server" id="musicServer" title="平台">
          <option value="netease">网易云</option>
          <option value="tencent">QQ</option>
          <option value="kugou">酷狗</option>
          <option value="baidu">百度</option>
          <option value="kuwo">酷我</option>
        </select>
        <button class="music-go" id="musicGo">搜索</button>
      </div>
      <div class="music-search-row" style="padding-top:0">
        <input class="music-input" id="playlistInput" type="text" placeholder="粘贴歌单 ID 或链接…" spellcheck="false">
        <button class="music-go" id="playlistGo" style="background:var(--surface);border:1px solid var(--border);color:var(--text-dim)">导入歌单</button>
      </div>
      <div class="music-results" id="musicResults"></div>
    </div>
  </div>

  <!-- Bus Panel -->
  <!-- Scene presets -->
  <div class="scene-section" id="sceneSection">
    <div class="scene-label">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <span style="font-size:12px;color:var(--text-dim);">场景调度</span>
      <span class="scene-auto-badge" id="sceneBadge">—</span>
    </div>
    <div class="scene-list" id="sceneList">
      <button class="scene-btn" data-scene="work">💻 工作</button>
      <button class="scene-btn" data-scene="chill">☕ 休息</button>
      <button class="scene-btn" data-scene="late_night">🌙 深夜</button>
    </div>
  </div>

  <div class="bus-section">
    <div class="bus-toggle" id="busToggle">
      <div class="bus-toggle-left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m16.5-5.5L14 7m-4 6l-3.5 3.5M18.5 18.5L15 15M9 9L5.5 5.5"/></svg>
        <span style="font-size:12px;color:var(--text-dim);">节目编排</span>
        <span class="bus-status" id="busStatusBadge">空闲</span>
      </div>
      <svg class="pl-chevron" id="busChevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="bus-body" id="busBody">
      <div class="bus-controls">
        <button class="bus-btn" id="busPlayBtn" title="播放下一首">▶</button>
        <button class="bus-btn" id="busNextBtn" title="跳过">⏭</button>
        <button class="bus-btn" id="busClearBtn" title="清空">✕</button>
      </div>
      <div class="bus-play-row">
        <input class="bus-play-input" id="busPlayInput" type="text" placeholder="输入音频 URL，回车添加到编排队列…" spellcheck="false">
        <button class="bus-play-add-btn" id="busPlayAddBtn">Add</button>
      </div>
      <div class="bus-queue" id="busQueue"></div>
    </div>
  </div>
</div>

<audio id="audio" preload="auto"></audio>

<script>
(function(){
"use strict";

// ── MutationObserver: 持续对抗 parent iframe 注入的 writing-mode: vertical-lr ──
(function fixWritingMode(){
  function revert(){ document.documentElement.style.writingMode='horizontal-tb'; document.body.style.writingMode='horizontal-tb'; }
  revert();
  var ob = new MutationObserver(function(muts){
    for(var i=0;i<muts.length;i++){
      if(muts[i].target.style && muts[i].target.style.writingMode && muts[i].target.style.writingMode !== 'horizontal-tb'){
        revert(); break;
      }
    }
  });
  ob.observe(document.documentElement, { attributes:true, attributeFilter:['style'] });
  ob.observe(document.body, { attributes:true, attributeFilter:['style'] });
  // 也观察 parent 注入的 style 标签
  var styleOb = new MutationObserver(function(){
    revert();
  });
  styleOb.observe(document.head, { childList:true });
})();

const API = ${JSON.stringify(apiBase)};
const TOKEN = ${JSON.stringify(token)};
const HAS_NETEASE_COOKIE = ${JSON.stringify(NETEASE_COOKIE ? true : false)};
const HAS_TENCENT_COOKIE = ${JSON.stringify(TENCENT_COOKIE ? true : false)};
if (TOKEN) {
  const _f = window.fetch.bind(window);
  window.fetch = function(u, o) {
    o=o||{};
    // 只给本地 API 请求加 Authorization header（外部 URL 不加，避免 CORS preflight）
    if (typeof u === 'string' && (u.startsWith('/api/') || u.startsWith('/widget/') || u.indexOf('127.0.0.1:14500') !== -1)) {
      o.headers=o.headers||{};
      o.headers["Authorization"]="Bearer "+TOKEN;
    }
    return _f(u,o);
  };
}

const audio = document.getElementById('audio');
const npCover = document.getElementById('npCover');
let trks = [], idx = 0, playing = false, playMode = 0, prevVol = 0.8, _batchLoading = false, _firstRender = true;
// playMode: 0=顺序, 1=单曲循环, 2=随机, 3=列表循环

function saveTrks() { try { localStorage.setItem('hanako_audio_playlist', JSON.stringify(trks)); } catch(e) {} }
function loadTrks() { try { var s = JSON.parse(localStorage.getItem('hanako_audio_playlist')); if(s && s.length) { trks = s; idx = 0; trks.forEach(function(t){ if(t.url) t.url = t.url.split('?token=')[0].split('&token=')[0]; }); } } catch(e) {} }
loadTrks();
// 自动去重：按裸 url（去掉 token）+ name 去重，保留首次出现的
if(trks.length) {
  var _origLen=trks.length;
  var seen={};
  trks=trks.filter(function(t){
    var bareUrl=(t.url||'').split('?')[0];
    var key=bareUrl+'|'+(t.name||'');
    if(seen[key]) return false;
    seen[key]=true; return true;
  });
  if(trks.length!==_origLen) { saveTrks(); renderPL(); showToast('已清理 '+_origLen+' → '+trks.length+' 条重复',2000); }
}
// 为旧数据补 group 字段
if(trks.length) {
  var needsGroup=false;
  trks.forEach(function(t){ if(!t.group) { needsGroup=true; } });
  if(needsGroup) {
    trks.forEach(function(t){
      if(!t.group) {
        if(t.mode==='TTS'||t.mode==='编排') t.group='TTS/语音';
        else if(t.mode==='本地') t.group='本地音乐';
        else if(t.url && t.url.includes('ilovemusic')) t.group='电台流';
        else t.group='在线音乐';
      }
    });
    saveTrks();
  }
}
renderPL();
// 如果播放列表为空，添加测试数据
if(!trks.length) {
  trks = [
    {name:'iloveradio19 - Deep Focus', url:'https://streams.ilovemusic.de/iloveradio19.mp3', mode:'在线', dur:0, group:'电台流'},
    {name:'iloveradio16 - Ambient', url:'https://streams.ilovemusic.de/iloveradio16.mp3', mode:'在线', dur:0, group:'电台流'},
    {name:'iloveradio13 - Lo-fi Beats', url:'https://streams.ilovemusic.de/iloveradio13.mp3', mode:'在线', dur:0, group:'电台流'},
    {name:'iloveradio17 - Chillout', url:'https://streams.ilovemusic.de/iloveradio17.mp3', mode:'在线', dur:0, group:'电台流'},
    {name:'长路归航', url:'', mode:'在线', dur:0, group:'鸣潮', searchKey:'长路归航 战双帕弥什', searchServer:'netease'},
    {name:'愿 (One More Light)', url:'', mode:'在线', dur:0, group:'鸣潮', searchKey:'愿 One More Light 鸣潮', searchServer:'netease'}
  ];
  saveTrks();
}

function fmt(s) {
  if (!s||!isFinite(s)) return '0:00';
  return Math.floor(s/60)+':'+Math.floor(s%60).toString().padStart(2,'0');
}

function load(i) {
  if (i<0||i>=trks.length) {
    document.getElementById('trackName').textContent='播放器';
    document.getElementById('trackMode').textContent='准备就绪';
    npCover.classList.remove('spinning');
    return;
  }
  idx=i; const t=trks[i];
  document.getElementById('trackName').textContent=t.name;
  document.getElementById('trackMode').textContent=t.mode||'';
  if(t.url) { audio.src=tok(t.url); audio.load(); audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)}); }
  else if(t.searchKey) {
    // 无 URL 但有搜索关键词 → 自动搜索完整音频
    showToast('搜索 '+t.name+'…', 1500);
    var sv = t.searchServer || 'netease';
    fetch(API+'/widget/api/music/search?keyword='+encodeURIComponent(t.searchKey)+'&server='+sv).then(function(r){return r.json();}).then(function(res){
      if(res.ok && res.results && res.results.length) {
        var _metaUrl = res.results[0].url;
        t.name = res.results[0].title;
        t.lrcUrl = res.results[0].lrc || '';
        document.getElementById('trackName').textContent=t.name;
        saveTrks();
        // 尝试完整 URL，回退到 Meting URL
        var idMatch = _metaUrl.match(/[?&]id=([^&]+)/);
        var svMatch = _metaUrl.match(/[?&]server=([^&]+)/);
        var hasCookie = (sv === 'netease' && HAS_NETEASE_COOKIE) || (sv === 'tencent' && HAS_TENCENT_COOKIE);
        if (hasCookie && idMatch) {
          var songId=idMatch[1], sv2=svMatch?svMatch[1]:'netease';
          var fullApi=API+'/widget/api/music/full-url?id='+encodeURIComponent(songId)+'&server='+sv2+'&fallback='+encodeURIComponent(_metaUrl);
          fetch(fullApi).then(function(r){return r.json();}).then(function(d){
            if(d.ok&&d.url){t.url=d.url;audio.src=tok(t.url);audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});}
            else{t.url=_metaUrl;audio.src=tok(t.url);audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});}
          }).catch(function(){t.url=_metaUrl;audio.src=tok(t.url);audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});});
        } else {
          t.url=_metaUrl;audio.src=t.url;audio.load();audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)});
        }
        // 不调 toggle()——audio 'play' 事件监听器已处理 UI 状态
      } else { showToast('未找到完整音频: '+t.name, 2000); }
    }).catch(function(){ showToast('搜索失败: '+t.name, 2000); });
  }
  npCover.classList.add('spinning');
  tryReadMetadata(audio, t);
  renderPL();
}

function toggle() {
  if (!trks.length) return;
  if (audio.paused) { audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)}); playing=true; npCover.classList.add('spinning'); }
  else { audio.pause(); playing=false; npCover.classList.remove('spinning'); }
  document.getElementById('playIcon').style.display=playing?'none':'block';
  document.getElementById('pauseIcon').style.display=playing?'block':'none';
}

function next() {
  if (!trks.length) return;
  var n;
  if (playMode===1) n=idx; // 单曲循环
  else if (playMode===2) n=Math.floor(Math.random()*trks.length); // 随机
  else n=(idx+1)%trks.length; // 顺序 & 列表循环 → 自动续播
  load(n);
  // 只有 URL 存在时才同步播放；searchKey 类型由 load() 内部异步搜索后自动播放
  if (trks[n] && trks[n].url) {
    audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});
  }
}
function prev() {
  if (!trks.length) return;
  if (audio.currentTime>3) { audio.currentTime=0; return; }
  const n = (playMode===2) ? Math.floor(Math.random()*trks.length) : (idx-1+trks.length)%trks.length;
  load(n);
  if (trks[n] && trks[n].url) {
    audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});
  }
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem('hanako_audio_favs'))||[]; } catch(e) { return []; }
}
function isFav(url) {
  return getFavorites().indexOf(url) !== -1;
}
function toggleFav(url) {
  var favs = getFavorites();
  var pos = favs.indexOf(url);
  if (pos === -1) favs.push(url); else favs.splice(pos,1);
  try { localStorage.setItem('hanako_audio_favs', JSON.stringify(favs)); } catch(e) {}
}

function renderPL() {
  document.getElementById('plCount').textContent=trks.length;
  if (!trks.length) { document.getElementById('plBody').innerHTML='<div class="pl-empty">暂无曲目，添加 URL 或点击电台开始</div>'; return; }
  var favOnly = document.getElementById('favFilterBtn').classList.contains('active');
  var filtered = trks.map(function(t,i){return {t:t,i:i};}).filter(function(item){
    return !favOnly || isFav(item.t.url);
  });
  if (!filtered.length && favOnly) {
    document.getElementById('plBody').innerHTML='<div class="pl-empty">没有收藏的曲目</div>';
    return;
  }

  // 按分组聚集
  var groups=[];
  var groupMap={};
  filtered.forEach(function(item){
    var g=item.t.group||'默认';
    if(!groupMap[g]){ groupMap[g]={label:g,items:[]}; groups.push(g); }
    groupMap[g].items.push(item);
  });
  // 收藏的排前面
  Object.keys(groupMap).forEach(function(g){
    groupMap[g].items.sort(function(a,b){
      var fa=isFav(a.t.url)?1:0, fb=isFav(b.t.url)?1:0;
      if(fa!==fb) return fb-fa;
      return a.i-b.i;
    });
  });

  var html='';
  groups.forEach(function(glabel){
    var g=groupMap[glabel];
      html+='<div class="pl-group-header" data-group="'+esc(glabel)+'">'
        +'<svg class="pl-chevron" viewBox="0 0 24 24" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>'
        +'<span class="pl-group-name">'+esc(glabel)+'</span>'
        +'<span class="pl-group-count">'+g.items.length+'</span>'
        +'</div>';
    html+='<div class="pl-group-body" data-group="'+esc(glabel)+'">';
    g.items.forEach(function(item,n){
      var t=item.t, i=item.i;
      var a=i===idx;
      var star=isFav(t.url);
      html+='<div class="pl-item'+(a?' active':'')+'" data-i="'+i+'" draggable="true">'
        +'<span class="pl-handle" title="拖动排序">⋮⋮</span>'
        +'<span class="pl-status">'+(a?'♫':(n+1))+'</span>'
        +'<span class="pl-name">'+esc(t.name)+'</span>'
        +'<button class="pl-star'+(star?' starred':'')+'" data-star="'+i+'" title="收藏">'+(star?'★':'☆')+'</button>'
        +'<span class="pl-dur">'+fmt(t.dur||0)+'</span>'
        +'<button class="pl-rm" data-rm="'+i+'" title="移除">✕</button></div>';
    });
    html+='</div>';
  });

  // 保存折叠态和滚动位置
  var plBody=document.getElementById('plBody');
  var collapsedGroups={};
  plBody.querySelectorAll('.pl-group-header.collapsed').forEach(function(el){
    collapsedGroups[el.dataset.group]=true;
  });
  // 首次渲染：默认折叠所有分组
  if(_firstRender){
    groups.forEach(function(g){ collapsedGroups[g]=true; });
    _firstRender=false;
  }
  var savedScrollTop=plBody.scrollTop;

  plBody.innerHTML=html;

  // 恢复折叠态
  plBody.querySelectorAll('.pl-group-header').forEach(function(el){
    if(collapsedGroups[el.dataset.group]){
      el.classList.add('collapsed');
      var body=el.nextElementSibling;
      if(body) body.classList.add('collapsed');
    }
  });
  // 恢复滚动位置
  plBody.scrollTop=savedScrollTop;
  // 当前播放曲目滚动到可见位置（仅在不可见时滚动）
  var activeItem=plBody.querySelector('.pl-item.active');
  if(activeItem){
    var itemRect=activeItem.getBoundingClientRect();
    var bodyRect=plBody.getBoundingClientRect();
    if(itemRect.top<bodyRect.top||itemRect.bottom>bodyRect.bottom){
      activeItem.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  }

  // 分组折叠逻辑
  plBody.querySelectorAll('.pl-group-header').forEach(function(el){
    el.addEventListener('click',function(){
      var body=el.nextElementSibling;
      if(!body) return;
      body.classList.toggle('collapsed');
      el.classList.toggle('collapsed',body.classList.contains('collapsed'));
    });
    // 双击组名可重命名（内联输入框，不用 prompt）
    el.addEventListener('dblclick',function(e){
      e.preventDefault(); e.stopPropagation();
      var oldName=el.dataset.group;
      // 创建内联输入框
      var inputWrap=document.createElement('div');
      inputWrap.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--bg-solid,#1e1e22);border:1px solid var(--accent,#d4a574);border-radius:10px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:300px';
      inputWrap.innerHTML='<div style="color:var(--text,#eee);font-size:13px;margin-bottom:10px">重命名分组：</div>'
        +'<input type="text" value="'+esc(oldName)+'" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:var(--surface,rgba(255,255,255,0.05));color:var(--text,#eee);font-size:14px;outline:none" />'
        +'<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
        +'<button class="rn-cancel" style="padding:6px 16px;border-radius:6px;border:none;background:rgba(255,255,255,0.08);color:var(--text,#eee);cursor:pointer;font-size:13px">取消</button>'
        +'<button class="rn-ok" style="padding:6px 16px;border-radius:6px;border:none;background:var(--accent,#d4a574);color:#1a1a1e;cursor:pointer;font-size:13px;font-weight:600">确定</button>'
        +'</div>';
      document.body.appendChild(inputWrap);
      var inp=inputWrap.querySelector('input');
      inp.focus(); inp.select();
      function close(){ inputWrap.remove(); }
      function commit(){
        var newName=inp.value.trim();
        if(!newName||newName===oldName){ close(); return; }
        var items=el.nextElementSibling;
        if(items){ items.querySelectorAll('.pl-item').forEach(function(itemEl){
          var i=parseInt(itemEl.dataset.i);
          if(trks[i]) trks[i].group=newName;
        });}
        saveTrks(); renderPL();
        close();
      }
      inputWrap.querySelector('.rn-ok').addEventListener('click',commit);
      inputWrap.querySelector('.rn-cancel').addEventListener('click',close);
      inp.addEventListener('keydown',function(ev){ if(ev.key==='Enter') commit(); if(ev.key==='Escape') close(); });
    });
  });
  // 条目右键菜单：移动到其他分组
  document.getElementById('plBody').querySelectorAll('.pl-item').forEach(function(el){
    el.addEventListener('contextmenu',function(e){
      e.preventDefault();
      var i=parseInt(el.dataset.i);
      if(isNaN(i)||!trks[i]) return;
      var curGroup=trks[i].group||'默认';
      var allGroups=trks.map(function(t){return t.group||'默认';}).filter(function(v,k,a){return a.indexOf(v)===k;});
      // 加一个“新建分组”选项
      var opts=allGroups.filter(function(g){return g!==curGroup;}).map(function(g){return g;});
      var menu=document.createElement('div');
      menu.className='pl-ctx-menu';
      menu.innerHTML='<div class="pl-ctx-title">移动到…</div>'
        +opts.map(function(g){return '<div class="pl-ctx-opt" data-g="'+esc(g)+'">'+esc(g)+'</div>';}).join('')
        +'<div class="pl-ctx-opt" data-g="__new__">新建分组…</div>';
      el.style.position='relative';
      el.appendChild(menu);
      menu.addEventListener('click',function(ev){
        var opt=ev.target.closest('[data-g]'); if(!opt) return;
        var g=opt.dataset.g;
        if(g==='__new__'){
          menu.remove();
          // 内联输入框替代 prompt
          var inputWrap=document.createElement('div');
          inputWrap.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--bg-solid,#1e1e22);border:1px solid var(--accent,#d4a574);border-radius:10px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:300px';
          inputWrap.innerHTML='<div style="color:var(--text,#eee);font-size:13px;margin-bottom:10px">新分组名：</div>'
            +'<input type="text" placeholder="输入分组名称" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:var(--surface,rgba(255,255,255,0.05));color:var(--text,#eee);font-size:14px;outline:none" />'
            +'<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
            +'<button class="ng-cancel" style="padding:6px 16px;border-radius:6px;border:none;background:rgba(255,255,255,0.08);color:var(--text,#eee);cursor:pointer;font-size:13px">取消</button>'
            +'<button class="ng-ok" style="padding:6px 16px;border-radius:6px;border:none;background:var(--accent,#d4a574);color:#1a1a1e;cursor:pointer;font-size:13px;font-weight:600">确定</button>'
            +'</div>';
          document.body.appendChild(inputWrap);
          var inp=inputWrap.querySelector('input');
          inp.focus();
          function close2(){ inputWrap.remove(); }
          function commit2(){
            var newG=inp.value.trim();
            if(!newG){ close2(); return; }
            trks[i].group=newG;
            saveTrks(); renderPL();
            close2();
          }
          inputWrap.querySelector('.ng-ok').addEventListener('click',commit2);
          inputWrap.querySelector('.ng-cancel').addEventListener('click',close2);
          inp.addEventListener('keydown',function(ev){ if(ev.key==='Enter') commit2(); if(ev.key==='Escape') close2(); });
          return;
        }
        trks[i].group=g;
        saveTrks(); renderPL();
        menu.remove();
      });
      setTimeout(function(){document.addEventListener('click',function cls(){menu.remove();document.removeEventListener('click',cls);});},0);
    });
  });
  document.getElementById('plBody').querySelectorAll('.pl-item').forEach(function(el){
    el.addEventListener('click',function(e){
      if(e.target.closest('.pl-rm')||e.target.closest('.pl-star')||e.target.closest('.pl-handle'))return;
      const i=parseInt(this.dataset.i);
      if(i===idx){toggle();return;}
      load(i);
      if(trks[i] && trks[i].url){audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});}
    });
  });
  document.getElementById('plBody').querySelectorAll('.pl-rm').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      const i=parseInt(this.dataset.rm);
      trks.splice(i,1);
      if(i<=idx)idx=Math.max(0,idx-1);
      if(idx>=trks.length)idx=trks.length-1;
      if(trks.length)load(idx);else load(-1);
      renderPL();
      saveTrks();
    });
  });
  document.getElementById('plBody').querySelectorAll('.pl-star').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      const i=parseInt(this.dataset.star);
      toggleFav(trks[i].url);
      renderPL();
    });
  });
  // ── 拖拽排序 ──
  var dragIdx=null;
  document.getElementById('plBody').querySelectorAll('.pl-item').forEach(function(el){
    el.addEventListener('dragstart',function(){
      dragIdx=parseInt(this.dataset.i);
      this.classList.add('dragging');
    });
    el.addEventListener('dragend',function(){
      this.classList.remove('dragging');
      document.getElementById('plBody').querySelectorAll('.pl-item').forEach(function(e){e.classList.remove('drag-over');});
    });
    el.addEventListener('dragover',function(e){
      e.preventDefault();
      this.classList.add('drag-over');
    });
    el.addEventListener('dragleave',function(){
      this.classList.remove('drag-over');
    });
    el.addEventListener('drop',function(e){
      e.preventDefault();
      this.classList.remove('drag-over');
      var dropIdx=parseInt(this.dataset.i);
      if(dragIdx===null||dragIdx===dropIdx)return;
      var moved=trks.splice(dragIdx,1)[0];
      trks.splice(dropIdx,0,moved);
      // 修正 idx
      if(dragIdx===idx)idx=dropIdx;
      else if(dragIdx<idx&&dropIdx>=idx)idx--;
      else if(dragIdx>idx&&dropIdx<=idx)idx++;
      renderPL();
      saveTrks();
    });
  });
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function showToast(msg,dur) {
  dur = dur || 2500;
  var c = document.getElementById('toastContainer');
  if (!c) return;
  var t = document.createElement('div');
  t.className = 'toast-item';
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(function() { t.classList.add('show'); });
  setTimeout(function() {
    t.classList.remove('show');
    setTimeout(function() { t.remove(); }, 300);
  }, dur);
}

function showGroupPicker(cb) {
  // 收集现有分组
  var existingGroups=[]; var seen={};
  trks.forEach(function(t){ var g=t.group||'默认'; if(!seen[g]){seen[g]=true; existingGroups.push(g);} });
  var wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--bg-solid,#1e1e22);border:1px solid var(--accent,#d4a574);border-radius:10px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:320px';
  var selectHtml = existingGroups.length
    ? '<select id="gpSelect" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:var(--surface,rgba(255,255,255,0.05));color:var(--text,#eee);font-size:13px;outline:none;margin-bottom:10px"><option value="">— 选取已有分组 —</option>' + existingGroups.map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join('') + '</select>'
    : '';
  wrap.innerHTML='<div style="color:var(--text,#eee);font-size:13px;margin-bottom:10px">选择分组：</div>'
    + selectHtml
    + '<input type="text" id="gpInput" placeholder="输入新分组名（或从上方选取）" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:var(--surface,rgba(255,255,255,0.05));color:var(--text,#eee);font-size:13px;outline:none" />'
    + '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
    + '<button class="gp-cancel" style="padding:6px 16px;border-radius:6px;border:none;background:rgba(255,255,255,0.08);color:var(--text,#eee);cursor:pointer;font-size:13px">取消</button>'
    + '<button class="gp-ok" style="padding:6px 16px;border-radius:6px;border:none;background:var(--accent,#d4a574);color:#1a1a1e;cursor:pointer;font-size:13px;font-weight:600">确定</button>'
    + '</div>';
  document.body.appendChild(wrap);
  var inp=wrap.querySelector('#gpInput');
  var sel=wrap.querySelector('#gpSelect');
  inp.focus();
  function close(){ wrap.remove(); }
  function commit(){
    var groupName = inp.value.trim();
    if(!groupName && sel && sel.value) groupName = sel.value;
    close(); cb(groupName || null);
  }
  if(sel) sel.addEventListener('change', function(){ inp.value = sel.value; });
  wrap.querySelector('.gp-ok').addEventListener('click', commit);
  wrap.querySelector('.gp-cancel').addEventListener('click', function(){ close(); cb(null); });
  inp.addEventListener('keydown', function(ev){ if(ev.key==='Enter') commit(); if(ev.key==='Escape'){ close(); cb(null); } });
}

// ── Events ──
document.getElementById('playBtn').addEventListener('click',toggle);
document.getElementById('nextBtn').addEventListener('click',next);
document.getElementById('prevBtn').addEventListener('click',prev);
document.getElementById('volumeSlider').addEventListener('input',function(e){audio.volume=e.target.value/100;});
document.getElementById('volumeBtn').addEventListener('click',function(){
  if(audio.volume>0){prevVol=audio.volume;audio.volume=0;document.getElementById('volIcon').style.opacity=0.3;}
  else{audio.volume=prevVol;document.getElementById('volumeSlider').value=prevVol*100;document.getElementById('volIcon').style.opacity=1;}
});

// ── Play Mode ──
var MODE_ICONS=[
  // 0 顺序: 右箭头 + 竖线
  '<line x1="5" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2"/><polygon points="8 12 18 5 18 19" fill="currentColor"/>',
  // 1 单曲循环: 1 + 循环
  '<text x="8" y="16" font-size="10" fill="currentColor" font-weight="bold">1</text><path d="M17 4l3 3-3 3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M7 20l-3-3 3-3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M20 7v4a4 4 0 0 1-4 4H7" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M4 17v-4a4 4 0 0 1 4-4h9" stroke="currentColor" fill="none" stroke-width="1.5"/>',
  // 2 随机: 交叉箭头
  '<path d="M16 3h5v5" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M4 20L21 3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M21 16v5h-5" stroke="currentColor" fill="none" stroke-width="1.5"/>',
  // 3 列表循环: 循环箭头
  '<path d="M17 4l3 3-3 3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M7 20l-3-3 3-3" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M20 7v4a4 4 0 0 1-4 4H7" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M4 17v-4a4 4 0 0 1 4-4h9" stroke="currentColor" fill="none" stroke-width="1.5"/>'
];
var MODE_TITLES=['顺序播放','单曲循环','随机播放','列表循环'];
function updateModeIcon(){
  document.getElementById('modeIcon').innerHTML=MODE_ICONS[playMode];
  document.getElementById('modeBtn').title=MODE_TITLES[playMode];
  document.getElementById('modeBtn').style.color=playMode===0?'var(--text-dim)':'var(--accent)';
}
try{var _savedMode=JSON.parse(localStorage.getItem('hanako_audio_mode'));if(typeof _savedMode==='number'&&_savedMode>=0&&_savedMode<=3)playMode=_savedMode;}catch(e){}
updateModeIcon();
document.getElementById('modeBtn').addEventListener('click',function(){
  playMode=(playMode+1)%4;
  localStorage.setItem('hanako_audio_mode',JSON.stringify(playMode));
  updateModeIcon();
  showToast(MODE_TITLES[playMode], 1200);
});
document.getElementById('progressBar').addEventListener('click',function(e){
  const r=this.getBoundingClientRect();
  const p=(e.clientX-r.left)/r.width;
  if(audio.duration)audio.currentTime=p*audio.duration;
});
document.addEventListener('keydown',function(e){
  if(e.code==='Space'&&e.target.tagName!=='INPUT'){e.preventDefault();toggle();}
});
document.getElementById('plToggle').addEventListener('click',function(){
  this.classList.toggle('open');
  document.getElementById('plBody').classList.toggle('open');
});
document.getElementById('addBtn').addEventListener('click',function(){
  const v=document.getElementById('urlInput').value.trim();
  if(!v)return;
  // 检测是否是本地文件夹路径（盘符开头，如 W:\...）
  if(v.length>=3 && v[1]===':' && (v.charCodeAt(2)===92 || v.charCodeAt(2)===47)){
    showToast('扫描文件夹…',1500);
    fetch(API+'/widget/api/scan-folder?path='+encodeURIComponent(v)).then(function(r){return r.json();}).then(function(d){
      if(!d.ok||!d.files||!d.files.length){ showToast('未找到音频文件',2000); return; }
      showGroupPicker(function(groupName){
        if(!groupName) return;
        _batchLoading=true;
        d.files.forEach(function(f){ addTrack(f.name,f.url,f.mode,groupName); });
        _batchLoading=false;
        renderPL(); saveTrks();
        showToast('已添加 '+d.count+' 首到分组「'+groupName+'」',2500);
      });
    }).catch(function(){ showToast('扫描失败',2000); });
    document.getElementById('urlInput').value='';
    return;
  }
  addTrack(null,v);
  document.getElementById('urlInput').value='';
});
document.getElementById('urlInput').addEventListener('keydown',function(e){
  if(e.key==='Enter')document.getElementById('addBtn').click();
});

document.getElementById('popBtn').addEventListener('click',function(){
  var url = 'http://localhost:14500' + API + '/widget?standalone=1&token=' + encodeURIComponent(TOKEN);
  window.open(url, 'hanako-player', 'width=480,height=400');
});

audio.addEventListener('timeupdate',function(){
  document.getElementById('currentTime').textContent=fmt(audio.currentTime);
  if(audio.duration){
    document.getElementById('totalTime').textContent=fmt(audio.duration);
    document.getElementById('progressFill').style.width=(audio.currentTime/audio.duration*100)+'%';
    if(trks[idx])trks[idx].dur=audio.duration;
  }
});
audio.addEventListener('loadedmetadata',function(){
  document.getElementById('totalTime').textContent=fmt(audio.duration);
  if(trks[idx])trks[idx].dur=audio.duration;
  renderPL();
});
audio.addEventListener('ended',next);
audio.addEventListener('play',function(){playing=true;npCover.classList.add('spinning');document.getElementById('playIcon').style.display='none';document.getElementById('pauseIcon').style.display='block';});
audio.addEventListener('pause',function(){playing=false;npCover.classList.remove('spinning');document.getElementById('playIcon').style.display='block';document.getElementById('pauseIcon').style.display='none';});

function addTrack(name,url,mode,group,lrcUrl) {
  // 去重：url 非空时按裸 url（去掉 token）匹配，url 为空时按 name 匹配
  var bareUrl = url ? url.split('?')[0] : '';
  for(let i=0;i<trks.length;i++){
    if(url){
      var existBare=trks[i].url?trks[i].url.split('?')[0]:'';
      if(existBare===bareUrl){load(i);if(audio.paused){audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});}return;}
    }
    if(!url && trks[i].name===name && !trks[i].url){return;}
  }
  // 自动分组：未指定时按 mode 推断
  if(!group) {
    if(mode==='TTS'||mode==='编排') group='TTS/语音';
    else if(mode==='本地') group='本地音乐';
    else if(url && url.includes('ilovemusic')) group='电台流';
    else group='在线音乐';
  }
  // 存 lrc 映射
  if(lrcUrl && url) lrcMap[url]=lrcUrl;
  trks.push({name:name||url.split('/').pop().split('\\\\').pop().split('?')[0]||'音频',url:url,mode:mode||(url.startsWith('http')?'在线':'本地'),dur:0,group:group,lrcUrl:lrcUrl||''});
  if(!_batchLoading){ load(trks.length-1); if(trks[trks.length-1] && trks[trks.length-1].url){audio.play().catch(function(e){if(e.name!=="AbortError")console.warn(e)});} renderPL(); saveTrks(); }
}

function tok(url) {
  if (!TOKEN) return url;
  // 只对本地 /api/ 或 /widget/ 路径添加 token，外部 URL 不加（避免 CORS）
  if (url.startsWith('/api/') || url.startsWith('/widget/')) {
    return url + (url.indexOf('?') > -1 ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
  }
  return url;
}

// ── 主题切换 ──
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('hanako_audio_theme', theme); } catch(e) {}
  var icon = document.getElementById('themeIcon');
  if (theme === 'light') {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}
document.getElementById('themeBtn').addEventListener('click',function(){
  var cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});
(function initTheme(){
  var saved = 'dark';
  try { saved = localStorage.getItem('hanako_audio_theme') || 'dark'; } catch(e) {}
  applyTheme(saved);
})();

// ── 音频元数据读取 ──
function tryReadMetadata(audioEl, track) {
  // 浏览器原生不提供 ID3 API，但可以用 MediaSession 或解析文件头
  // 这里用文件名做智能提取 + URL 参数补全
  if (track._metaTried) return;
  track._metaTried = true;
  // 如果 name 看起来是文件名（有扩展名或 URL 末段），尝试美化
  var rawName = track.name;
  if (/\.(mp3|wav|ogg|flac|m4a)$/i.test(rawName)) {
    var baseName = rawName.replace(/\.[^.]+$/, '');
    // 常见模式：歌手 - 歌名 或 歌名 - 歌手
    if (baseName.indexOf(' - ') !== -1) {
      var parts = baseName.split(' - ');
      track.name = parts[0] + ' — ' + parts[1];
    } else {
      track.name = baseName;
    }
    // 更新 UI
    if (trks[idx] === track) {
      document.getElementById('trackName').textContent = track.name;
    }
    renderPL();
  }
  // 尝试通过 fetch 读取 ID3v2 头（仅同源或 CORS 允许时）
  if (track.url && !track.url.startsWith('data:')) {
    fetch(track.url, { method:'GET', headers:{'Range':'bytes=0-255'} })
      .then(function(r){ return r.arrayBuffer(); })
      .then(function(buf){
        var dv = new DataView(buf);
        // ID3v2 签名: 'ID3'
        if (dv.getUint8(0)===0x49 && dv.getUint8(1)===0x44 && dv.getUint8(2)===0x33) {
          var ver = dv.getUint8(3);
          // ID3v2.3/2.4 文本帧
          if (ver >= 3) {
            var text = new TextDecoder('utf-8').decode(new Uint8Array(buf).slice(10, 256));
            // 找 TIT2 (标题) 帧
            var tit2Pos = text.indexOf('TIT2');
            if (tit2Pos !== -1) {
              var titleStart = tit2Pos + 4 + 4 + 2; // frame ID + size + flags + encoding
              var titleBytes = new Uint8Array(buf).slice(10 + tit2Pos + 4 + 4 + 2 + 1, 256);
              var titleStr = '';
              for (var j=0; j<titleBytes.length && titleBytes[j]!==0; j++) { titleStr += String.fromCharCode(titleBytes[j]); }
              if (titleStr.trim()) {
                track.name = titleStr.trim();
                if (trks[idx] === track) {
                  document.getElementById('trackName').textContent = track.name;
                }
                renderPL();
              }
            }
          }
        }
      })
      .catch(function(){ /* 静默失败，CORS 或非音频文件 */ });
  }
}

// ── 收藏筛选 ──
document.getElementById('favFilterBtn').addEventListener('click',function(e){
  e.stopPropagation();
  this.classList.toggle('active');
  var icon=document.getElementById('favFilterIcon');
  icon.textContent=this.classList.contains('active')?'★':'☆';
  renderPL();
});

// ── Bus 面板 ──
// ── Music Search ──
var musicOpen = false;
document.getElementById('musicToggle').addEventListener('click', function(){
  musicOpen=!musicOpen;
  document.getElementById('musicBody').classList.toggle('open', musicOpen);
  this.classList.toggle('open', musicOpen);
});
document.getElementById('musicGo').addEventListener('click', doMusicSearch);
document.getElementById('musicInput').addEventListener('keydown', function(e){ if(e.key==='Enter') doMusicSearch(); });

function doMusicSearch(){
  var kw=document.getElementById('musicInput').value.trim();
  if(!kw) return;
  var sv=document.getElementById('musicServer').value;
  var el=document.getElementById('musicResults');
  el.innerHTML='<div class="music-loading">搜索中…</div>';
  fetch(API+'/widget/api/music/search?keyword='+encodeURIComponent(kw)+'&server='+sv).then(function(r){return r.json();}).then(function(res){
    if(!res.ok||!res.results||!res.results.length){ el.innerHTML='<div class="music-empty">没有结果</div>'; return; }
    el.innerHTML=res.results.map(function(t){
      return '<div class="music-item" data-title="'+esc(t.title)+'" data-url="'+esc(t.url)+'" data-lrc="'+esc(t.lrc||'')+'">'
        +(t.pic ? '<img class="music-thumb" src="'+esc(t.pic)+'" loading="lazy">' : '<div class="music-thumb-placeholder">♫</div>')
        +'<div class="music-info"><div class="music-title">'+esc(t.title)+'</div><div class="music-author">'+esc(t.author)+'</div></div>'
        +'<button class="music-play" title="播放">▶</button>'
        +'<button class="music-add" title="加入队列">+</button>'
        +'<button class="music-scene" title="加入场景">☾</button>'
        +'</div>';
    }).join('');
  }).catch(function(){ el.innerHTML='<div class="music-empty">搜索失败，Meting 服务不可用</div>'; });
}

document.getElementById('musicResults').addEventListener('click', function(e){
  var item = e.target.closest('.music-item');
  if(!item) return;
  var title = item.dataset.title;
  var searchKey = item.dataset.search; // 歌单条目：搜索关键词
  var url = item.dataset.url; // 搜索结果：直链
  var server = item.dataset.server; // 歌单条目的源
  // 歌单条目没有 data-url → 需要先搜索拿 URL
  // 尝试获取完整音频 URL（如果配了 cookie）
  function tryFullUrl(metingUrl, cb) {
    var idMatch = metingUrl.match(/[?&]id=([^&]+)/);
    var svMatch = metingUrl.match(/[?&]server=([^&]+)/);
    if (!idMatch) { cb(metingUrl); return; }
    var songId = idMatch[1];
    var sv = svMatch ? svMatch[1] : 'netease';
    var hasCookie = (sv === 'netease' && HAS_NETEASE_COOKIE) || (sv === 'tencent' && HAS_TENCENT_COOKIE);
    if (!hasCookie) { cb(metingUrl); return; }
    var fullUrlApi = API+'/widget/api/music/full-url?id='+encodeURIComponent(songId)+'&server='+sv+'&fallback='+encodeURIComponent(metingUrl);
    fetch(fullUrlApi).then(function(r){return r.json();}).then(function(d){
      if (d.ok && d.url && !d.url.includes('/404')) { cb(d.url); return; }
      cb(metingUrl);
    }).catch(function(){ cb(metingUrl); });
  }
  function withUrl(cb) {
    if (url) { tryFullUrl(url, cb); return; }
    if (!searchKey) { showToast('无法获取音频', 2000); return; }
    showToast('搜索完整音频…', 2000);
    var sv = server || document.getElementById('musicServer').value;
    fetch(API+'/widget/api/music/search?keyword='+encodeURIComponent(searchKey)+'&server='+sv).then(function(r){return r.json();}).then(function(res){
      if(res.ok && res.results && res.results.length) {
        tryFullUrl(res.results[0].url, function(u){ cb(u, res.results[0].title); });
      } else {
        showToast('未找到完整音频', 2000);
      }
    }).catch(function(){ showToast('搜索失败', 2000); });
  }
  if(e.target.closest('.music-play')){
    withUrl(function(u, t){ addTrack(t, u, '在线', null, item.dataset.lrc); });
  } else if(e.target.closest('.music-add')){
    withUrl(function(u, t){ busControl('play', {url:u, name:t, mode:'在线'}); });
  } else if(e.target.closest('.music-scene')){
    withUrl(function(u, t){
      var existing = document.getElementById('musicSceneMenu');
      if(existing) existing.remove();
      var menu = document.createElement('div');
      menu.id = 'musicSceneMenu';
      menu.className = 'music-scene-menu';
      menu.innerHTML = Object.keys(SCENES).map(function(k){ return '<div data-scene="'+k+'">'+SCENES[k].label+'</div>'; }).join('');
      item.style.position = 'relative';
      item.appendChild(menu);
      menu.addEventListener('click', function(ev){
        var opt = ev.target.closest('[data-scene]');
        if(!opt) return;
        var key = opt.dataset.scene;
        SCENES[key].playlist.push({ type:'play', url:u, name:t, mode:'在线' });
        saveScenes();
        showToast('已加入 '+SCENES[key].label+' 场景', 2000);
        menu.remove();
      });
      // 点外部关闭
      setTimeout(function(){ document.addEventListener('click', function cls(){ menu.remove(); document.removeEventListener('click', cls); }); }, 0);
    });
  }
});

// ── Playlist Import ──
document.getElementById('playlistGo').addEventListener('click', doPlaylistImport);
document.getElementById('playlistInput').addEventListener('keydown', function(e){ if(e.key==='Enter') doPlaylistImport(); });

function doPlaylistImport(){
  var raw=document.getElementById('playlistInput').value.trim();
  if(!raw) return;
  var id=raw;
  var idMatch=raw.match(/[?&]id=(\\d+)/);
  if(idMatch) id=idMatch[1];
  var sv=document.getElementById('musicServer').value;
  var el=document.getElementById('musicResults');
  el.innerHTML='<div class="music-loading">加载歌单中…</div>';
  fetch(API+'/widget/api/music/playlist?id='+encodeURIComponent(id)+'&server='+sv).then(function(r){return r.json();}).then(function(res){
    if(!res.ok||!res.tracks||!res.tracks.length){ el.innerHTML='<div class="music-empty">歌单为空或无法获取</div>'; return; }
    el.innerHTML='<div class="music-empty" style="padding-bottom:6px">歌单 '+res.tracks.length+' 首 <span style="color:var(--text-faint);font-size:10px">（点击播放时自动搜索完整音频）</span></div>'
      +'<div style="display:flex;gap:4px;padding:0 0 8px">'
      +'<button class="music-play" style="font-size:10px;padding:3px 8px">全部播放</button>'
      +'<button class="music-add" style="font-size:10px;padding:3px 8px;opacity:1">加入队列</button>'
      +'<button class="music-scene" style="font-size:10px;padding:3px 8px;opacity:1">加入场景</button>'
      +'</div>'
      + res.tracks.map(function(t){
        var searchKey = (t.title+' '+t.author).trim();
        return '<div class="music-item" data-title="'+esc(t.title)+'" data-search="'+esc(searchKey)+'" data-server="'+sv+'" data-pic="'+esc(t.pic||'')+'">'
          +(t.pic ? '<img class="music-thumb" src="'+esc(t.pic)+'" loading="lazy">' : '<div class="music-thumb-placeholder">♫</div>')
          +'<div class="music-info"><div class="music-title">'+esc(t.title)+'</div><div class="music-author">'+esc(t.author)+'</div></div>'
          +'<button class="music-play" title="播放">▶</button>'
          +'<button class="music-add" title="加入队列">+</button>'
          +'<button class="music-scene" title="加入场景">☾</button>'
          +'</div>';
      }).join('');
    el._playlistTracks = res.tracks;
    el._playlistServer = sv;
  }).catch(function(){ el.innerHTML='<div class="music-empty">歌单加载失败</div>'; });
}

// 歌单批量操作：全部播放 / 加入队列 / 加入场景
(function(){
  var el=document.getElementById('musicResults');
  var origClick = el.onclick;
  el.addEventListener('click', function(e){
    var tracks = el._playlistTracks;
    if(!tracks || !tracks.length) return;
    var sv = el._playlistServer || 'netease';
    // “全部播放” 按钮（歌单操作栏第一个 music-play）
    if(e.target.closest('.music-play') && !e.target.closest('.music-item .music-play')){
      showGroupPicker(function(groupName){
        if(!groupName) return;
        // 搜索第一首的完整 URL 播放，其余以名字加入（播放时自动搜索）
        var first = tracks[0];
        var firstKey = (first.title+' '+first.author).trim();
        showToast('搜索 '+first.title+' …', 1500);
        _batchLoading = true;
        fetch(API+'/widget/api/music/search?keyword='+encodeURIComponent(firstKey)+'&server='+sv).then(function(r){return r.json();}).then(function(res){
          if(res.ok && res.results && res.results.length) {
            addTrack(res.results[0].title, res.results[0].url, '在线', groupName, res.results[0].lrc);
          }
        });
        // 其余用搜索关键词加入（type=search 标记自动搜索）
        for(var i=1; i<tracks.length; i++){
          var t = tracks[i];
          var tk=(t.title+' '+t.author).trim();
          // 去重：已有同名且空 url 的条目 → 更新 group 而非跳过
          var existingIdx=-1;
          for(var j=0;j<trks.length;j++){ if(trks[j].name===t.title && !trks[j].url){existingIdx=j;break;} }
          if(existingIdx>=0){ trks[existingIdx].group=groupName; continue; }
          trks.push({name:t.title, url:'', mode:'在线', dur:0, searchKey:tk, searchServer:sv, group:groupName});
        }
        _batchLoading = false;
        renderPL(); saveTrks();
        showToast('已添加 '+tracks.length+' 首到分组「'+groupName+'」', 2500);
      });
    }
    // “加入队列” 按钮（歌单操作栏第一个 music-add）
    if(e.target.closest('.music-add') && !e.target.closest('.music-item .music-add')){
      showGroupPicker(function(groupName){
        if(!groupName) return;
        _batchLoading = true;
        tracks.forEach(function(t){
          var key = (t.title+' '+t.author).trim();
          // 去重：已有同名且空 url 的条目 → 更新 group 而非跳过
          var existingIdx=-1;
          for(var j=0;j<trks.length;j++){ if(trks[j].name===t.title && !trks[j].url){existingIdx=j;break;} }
          if(existingIdx>=0){ trks[existingIdx].group=groupName; return; }
          trks.push({name:t.title, url:'', mode:'在线', dur:0, searchKey:key, searchServer:sv, group:groupName});
        });
        _batchLoading = false;
        renderPL(); saveTrks();
        showToast('已添加 '+tracks.length+' 首到分组「'+groupName+'」', 2000);
      });
    }
    // “加入场景” 按钮（歌单操作栏第一个 music-scene）
    if(e.target.closest('.music-scene') && !e.target.closest('.music-item .music-scene')){
      var existing = document.getElementById('musicSceneMenu');
      if(existing) existing.remove();
      var menu = document.createElement('div');
      menu.id = 'musicSceneMenu';
      menu.className = 'music-scene-menu';
      menu.innerHTML = Object.keys(SCENES).map(function(k){ return '<div data-scene="'+k+'">'+SCENES[k].label+'</div>'; }).join('');
      el.parentElement.appendChild(menu);
      menu.style.position='relative';
      menu.addEventListener('click', function(ev){
        var opt=ev.target.closest('[data-scene]'); if(!opt) return;
        var key=opt.dataset.scene;
        tracks.forEach(function(t){
          var key2 = (t.title+' '+t.author).trim();
          SCENES[key].playlist.push({type:'play',url:'',name:t.title,mode:'在线',searchKey:key2,searchServer:sv});
        });
        saveScenes();
        showToast('已加入 '+tracks.length+' 首到 '+SCENES[key].label, 2000);
        menu.remove();
      });
      setTimeout(function(){ document.addEventListener('click',function cls(){menu.remove();document.removeEventListener('click',cls);}); },0);
    }
  });
})();


// ── Visualizer ──
(function(){
  var canvas = document.getElementById('visualizer');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var visRAF = null;
  var BAR_COUNT = 48;
  var BAR_GAP = 1.5;
  var AMBER = '#d4a76a';
  var AMBER_DIM = 'rgba(212,167,106,0.15)';

  // 尊 prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var simPhase = 0;

  // 伪随机波形 (基于正弦混合，随时间变化)
  function pseudoBar(i, phase) {
    return 0.3 + 0.35 * Math.sin(i*0.7+phase*1.3) + 0.2 * Math.sin(i*1.9+phase*0.7) + 0.15 * Math.cos(i*2.3+phase*2.1);
  }

  function draw() {
    visRAF = requestAnimationFrame(draw);
    var w = canvas.width = canvas.clientWidth * (window.devicePixelRatio||1);
    var h = canvas.height = canvas.clientHeight * (window.devicePixelRatio||1);
    ctx.clearRect(0,0,w,h);
    if (audio.paused) { drawSilent(w,h); return; }

    // 全部使用模拟波形 — 避免 createMediaElementSource 的 CORS 静音问题
    simPhase += 0.04;
    var vol = audio.volume || 1;
    var barW = (w - BAR_GAP * (BAR_COUNT-1)) / BAR_COUNT;
    for (var i=0; i<BAR_COUNT; i++) {
      var val = pseudoBar(i, simPhase) * vol;
      drawBar(w,h,barW,i, val);
    }
  }

  function drawBar(w,h,barW,i, norm) {
    norm = Math.max(0.02, Math.min(1, norm));
    var barH = Math.max(2, norm * h * 0.92);
    var x = i * (barW + BAR_GAP);
    var y = h - barH;
    var grd = ctx.createLinearGradient(x, h, x, y);
    grd.addColorStop(0, AMBER_DIM);
    grd.addColorStop(1, AMBER);
    ctx.fillStyle = grd;
    ctx.beginPath();
    var r = Math.min(barW/2, 2);
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+barW-r, y);
    ctx.quadraticCurveTo(x+barW, y, x+barW, y+r);
    ctx.lineTo(x+barW, h);
    ctx.lineTo(x, h);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.fill();
  }

  function drawSilent(w,h) {
    var barW = (w - BAR_GAP * (BAR_COUNT-1)) / BAR_COUNT;
    for (var i=0; i<BAR_COUNT; i++) {
      var x = i * (barW + BAR_GAP);
      ctx.fillStyle = AMBER_DIM;
      ctx.fillRect(x, h-2, barW, 2);
    }
  }

  function startVis() {
    if (!visRAF) draw();
  }

  audio.addEventListener('play', startVis);
  draw();
})();

// ── Lyric Panel ──
(function(){
  var lyricOpen=false;
  var lrcData=[]; // [{time:ms, text:string}]
  var currentLrcId=null;
  var lyricBody=document.getElementById('lyricBody');
  var lyricToggle=document.getElementById('lyricToggle');

  lyricToggle.addEventListener('click',function(){
    lyricOpen=!lyricOpen;
    lyricBody.classList.toggle('open',lyricOpen);
    lyricToggle.classList.toggle('open',lyricOpen);
  });
  // 初始渲染占位
  lyricBody.innerHTML='<div class="lyric-line" style="color:var(--text-faint);padding:8px 0">暂无歌词</div>';

  function parseLrc(raw){
    var lines=raw.split('\\n');
    var result=[];
    lines.forEach(function(line){
      var m=line.match(/\\[(\\d{1,2}):(\\d{2})(?:\\.(\\d{2,3}))?\\](.*)/);
      if(m){
        var ms=parseInt(m[1])*60000+parseInt(m[2])*1000+(m[3]?parseInt(m[3].padEnd(3,'0')):0);
        var txt=m[4].trim();
        if(txt) result.push({time:ms,text:txt});
      }
    });
    result.sort(function(a,b){return a.time-b.time;});
    return result;
  }

  function renderLrc(){
    if(!lrcData.length){ lyricBody.innerHTML='<div class="lyric-line" style="color:var(--text-faint);padding:8px 0">暂无歌词</div>'; return; }
    lyricBody.innerHTML=lrcData.map(function(l,i){
      return '<div class="lyric-line" data-lrc-idx="'+i+'">'+esc(l.text)+'</div>';
    }).join('');
  }

  function highlightLrc(timeMs){
    if(!lrcData.length) return;
    var idx=0;
    for(var i=0;i<lrcData.length;i++){ if(lrcData[i].time<=timeMs) idx=i; }
    var lines=lyricBody.querySelectorAll('.lyric-line');
    lines.forEach(function(el,i){ el.classList.toggle('current',i===idx); });
    if(lines[idx]) lines[idx].scrollIntoView({block:'center',behavior:'smooth'});
  }

  audio.addEventListener('timeupdate',function(){
    if(!lrcData.length||!lyricOpen) return;
    highlightLrc(audio.currentTime*1000);
  });

  var _lastLrcKey='';
  setInterval(function(){
    var t=trks[idx];
    if(!t||!t.url) return;
    var lrcUrl=t.lrcUrl||lrcMap[t.url]||'';
    var lrcKey=t.url+'|'+lrcUrl;
    if(lrcUrl && lrcKey!==_lastLrcKey){
      _lastLrcKey=lrcKey;
      var proxyUrl=API+'/widget/api/music/lrc-proxy?url='+encodeURIComponent(lrcUrl);
      fetch(proxyUrl).then(function(r){return r.text();}).then(function(raw){
        if(!raw||raw.length<10) return;
        lrcData=parseLrc(raw);
        renderLrc();
      }).catch(function(){});
    }
  },800);
})();

var lrcMap = {};
var busOpen=false;
document.getElementById('busToggle').addEventListener('click',function(){
  busOpen=!busOpen;
  document.getElementById('busBody').classList.toggle('open',busOpen);
  this.classList.toggle('open',busOpen);
  if(busOpen) refreshBus();
});
function refreshBus(){
  fetch(API+'/widget/api/bus/state').then(function(r){return r.json();}).then(function(s){
    var badge=document.getElementById('busStatusBadge');
    var st=s.status||'idle';
    badge.textContent=st==='idle'?'空闲':st==='playing'?'播放中':st==='paused'?'暂停':'错误';
    badge.className='bus-status'+(st==='playing'?' playing':st==='error'?' error':'');
    var qEl=document.getElementById('busQueue');
    if(!s.queue||!s.queue.length){
      qEl.innerHTML='<div class="bus-empty">编排队列为空</div>';
      return;
    }
    qEl.innerHTML=s.queue.map(function(item,i){
      var tp=item.type||'play';
      var label='';
      if(tp==='say') label=(item.text||'').slice(0,30);
      else if(tp==='play') label=item.name||item.url||'';
      else if(tp==='segue') label='过渡 '+(item.duration||3000)+'ms';
      else if(tp==='reason') label=(item.text||'').slice(0,30);
      var isCur = s.current && s.current.id===item.id;
      return '<div class="bus-queue-item" data-bus-idx="'+i+'" data-bus-id="'+esc(item.id||'')+'">'
        +'<span class="bus-q-type '+tp+'">'+tp+'</span>'
        +'<span class="bus-q-name'+(isCur?' bus-q-current':'')+'">'+esc(label)+'</span>'
        +'<button class="bus-q-rm" data-bus-rm="'+i+'" title="移除">✕</button>'
        +'</div>';
    }).join('');
    // Bus 队列条目删除事件委托
    qEl.onclick=function(e){
      var btn=e.target.closest('[data-bus-rm]');
      if(!btn) return;
      e.stopPropagation();
      var idx=parseInt(btn.dataset.busRm);
      busControl('remove',{index:idx});
    };
  }).catch(function(){});
}
function busControl(action,extra){
  // 乐观更新：立即反映 UI 变化，再异步确认
  if(action==='next') busOptimisticNext();
  else if(action==='remove' && extra && extra.index!=null) busOptimisticRemove(extra.index);
  else if(action==='clear') busOptimisticClear();

  var body=Object.assign({action:action},extra||{});
  return fetch(API+'/widget/api/bus/control',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  }).then(function(r){return r.json();}).then(function(res){
    refreshBus(); // 后端确认后刷新真实状态
    // say 合成失败：显示提示 + 自动跳到下一个
    if(res.event==='say_skipped') {
      showToast('语音生成失败（TTS 未启动），已跳过', 3000);
      setTimeout(function(){busControl('next');}, 500);
    }
    // 如果 bus 返回了播放条目，推入播放器
    if(res.event==='track_start' && res.item){
      // segue 类型：定时自动前进到下一首
      if(res.item.type==='segue' || (!res.item.url && res.item.duration)){
        var dur = res.item.duration || 3000;
        setTimeout(function(){busControl('next');}, dur);
      }
      // play 类型：推入播放器播放
      if(res.item.url){
        var url=res.item.url;
        if(TOKEN) url=tok(url);
        // Bus 播放：添加到主列表并播放，但不切换视图
        var bareUrl = url.split('?')[0];
        var exists = trks.some(function(t){ return (t.url||'').split('?')[0] === bareUrl; });
        if(!exists){
          trks.push({name:res.item.name||'Bus', url:url, mode:res.item.mode||'编排', dur:0, group:'编排'});
          load(trks.length-1);
          if(audio.paused){ audio.play().catch(function(e){if(e.name!=='AbortError')console.warn(e)}); }
          saveTrks();
        }else{
          for(var i=0;i<trks.length;i++){ if((trks[i].url||'').split('?')[0]===bareUrl){ load(i); if(audio.paused) audio.play().catch(function(){}); break; } }
        }
        showToast('编排播放: '+res.item.name, 1500);
      }
    }
    return res;
  });
}

// ── 乐观更新函数 ──
function busOptimisticNext(){
  var items=document.getElementById('busQueue').querySelectorAll('.bus-queue-item');
  if(!items.length) return;
  // 找到当前高亮的，移到下一个
  var curIdx=-1;
  items.forEach(function(el,i){ if(el.querySelector('.bus-q-current')) curIdx=i; });
  var nextIdx = curIdx<items.length-1 ? curIdx+1 : 0;
  items.forEach(function(el,i){
    var name=el.querySelector('.bus-q-name');
    if(name) name.classList.toggle('bus-q-current', i===nextIdx);
  });
  // 更新状态徽章
  var badge=document.getElementById('busStatusBadge');
  if(badge){ badge.textContent='播放中'; badge.className='bus-status playing'; }
}
function busOptimisticRemove(idx){
  var items=document.getElementById('busQueue').querySelectorAll('.bus-queue-item');
  if(items[idx]) items[idx].style.opacity='0.3'; // 淡出，等服务端确认后 refreshBus 会移除
}
function busOptimisticClear(){
  document.getElementById('busQueue').innerHTML='<div class="bus-empty">编排队列为空</div>';
  var badge=document.getElementById('busStatusBadge');
  if(badge){ badge.textContent='空闲'; badge.className='bus-status'; }
}
document.getElementById('busPlayBtn').addEventListener('click',function(){
  fetch(API+'/widget/api/bus/state').then(function(r){return r.json();}).then(function(s){
    if(s.status==='paused'){busControl('resume');}
    else if(s.status==='playing'){}
    else if(s.queue && s.queue.length){busControl('next');}
  }).catch(function(){});
});
document.getElementById('busNextBtn').addEventListener('click',function(){busControl('next');});
document.getElementById('busClearBtn').addEventListener('click',function(){busControl('clear');});
// 添加播放条目到 Bus 队列
document.getElementById('busPlayAddBtn').addEventListener('click',function(){
  var url=document.getElementById('busPlayInput').value.trim();
  if(!url)return;
  document.getElementById('busPlayInput').value='';
  busControl('play',{url:url,name:url.split('/').pop().split('?')[0]||'音频'});
});
document.getElementById('busPlayInput').addEventListener('keydown',function(e){
  if(e.key==='Enter')document.getElementById('busPlayAddBtn').click();
});
// 定时刷新 bus 状态（面板打开时）
setInterval(function(){ if(busOpen) refreshBus(); }, 3000);

// ── Scene presets（场景调度）──
var SCENES = {
  work: {
    label: "💻 工作",
    playlist: [
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio16.mp3", name: "Deep Focus", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio19.mp3", name: "Ambient", mode: "在线" },
      { type: "segue", duration: 2000, effect: "silence" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio17.mp3", name: "Lo-fi Beats", mode: "在线" }
    ]
  },
  chill: {
    label: "☕ 休息",
    playlist: [
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio13.mp3", name: "Chillout", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio14.mp3", name: "Lounge", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio15.mp3", name: "Piano", mode: "在线" }
    ]
  },
  late_night: {
    label: "🌙 深夜",
    playlist: [
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio19.mp3", name: "Ambient", mode: "在线" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio15.mp3", name: "Piano", mode: "在线" },
      { type: "segue", duration: 3000, effect: "silence" },
      { type: "play", url: "https://streams.ilovemusic.de/iloveradio13.mp3", name: "Chillout", mode: "在线" }
    ]
  }
};

// 根据当前时间自动推茬场景
function autoScene(){
  var h=new Date().getHours();
  if(h>=9 && h<12) return "work";
  if(h>=12 && h<14) return "chill";
  if(h>=14 && h<18) return "work";
  if(h>=18 && h<22) return "chill";
  return "late_night";
}

function applyScene(key){
  var scene=SCENES[key];
  if(!scene) return;
  // UI 高亮
  document.querySelectorAll('.scene-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.scene===key); });
  // 场景切换 = 替换 Bus 队列（先 clear 再 load）
  fetch(API+'/widget/api/bus/control',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'clear'})
  }).then(function(){
    return fetch(API+'/widget/api/bus/control',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'load', playlist:scene.playlist})
    });
  }).then(function(r){return r.json();}).then(function(res){
    refreshBus();
    if(res.ok) setTimeout(function(){busControl('next');}, 300);
  });
}

// 场景按钮点击
document.getElementById('sceneList').addEventListener('click', function(e){
  var btn=e.target.closest('.scene-btn');
  if(!btn) return;
  applyScene(btn.dataset.scene);
});

// 初始化：显示推荐场景
(function initScene(){
  var rec=autoScene();
  var badge=document.getElementById('sceneBadge');
  badge.textContent='推荐: '+SCENES[rec].label;
  // 高亮但不自动加载
  document.querySelectorAll('.scene-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.scene===rec); });
})();

// 每分钟检查时间，更新推荐
setInterval(function(){
  var rec=autoScene();
  var badge=document.getElementById('sceneBadge');
  badge.textContent='推荐: '+SCENES[rec].label;
}, 60000);

// 场景持久化：修改后保存到 localStorage
function saveScenes(){
  try { localStorage.setItem('hanako_audio_scenes', JSON.stringify(SCENES)); } catch(e) {}
}
function loadScenes(){
  try {
    var saved = JSON.parse(localStorage.getItem('hanako_audio_scenes'));
    if(saved){ Object.keys(saved).forEach(function(k){ if(SCENES[k]) SCENES[k].playlist = saved[k].playlist; }); }
  } catch(e) {}
}
loadScenes();

// 初始化

// 加载队列
fetch(API+'/widget/api/queue').then(function(r){return r.json();}).then(function(data){
  if(data&&data.length){
    var newTracks=[];
    data.forEach(function(t){
      var bareUrl=t.url||'';
      var found=false;
      for(var i=0;i<trks.length;i++){if(trks[i].url===tok(bareUrl)||trks[i].url===bareUrl){found=true;break;}}
      if(!found) newTracks.push(t);
    });
    if(newTracks.length){
      showGroupPicker(function(groupName){
        if(!groupName) groupName='本地音乐';
        newTracks.forEach(function(t){
          addTrack(t.name,tok(t.url||''),t.mode,groupName);
        });
      });
    }
  }
}).catch(function(){});

// 定时检查新队列 + 验证已有曲目文件是否仍存在
setInterval(function(){
  // 检查新队列
  fetch(API+'/widget/api/queue').then(function(r){return r.json();}).then(function(data){
    if(data&&data.length){data.forEach(function(t){
      var bareUrl=t.url||'';
      var found=false;
      for(var i=0;i<trks.length;i++){if(trks[i].url===tok(bareUrl)||trks[i].url===bareUrl){found=true;break;}}
      if(!found) addTrack(t.name,tok(bareUrl),t.mode);
    });}
  }).catch(function(){});
  // 验证本地文件是否仍存在（仅检查 /widget/media/ 开头的 URL）
  var toRemove=[];
  trks.forEach(function(t,i){
    if(t.url && t.url.indexOf('/widget/media/')!==-1 && t._checked){
      // 已经检测过 404 的，标记移除
      if(t._missing) toRemove.push(i);
    }
  });
  // 异步 HEAD 检查（每次最多检查 3 首，避免请求风暴）
  var checked=0;
  trks.forEach(function(t,i){
    if(t.url && t.url.indexOf('/widget/media/')!==-1 && !t._checked && checked<3){
      t._checked=true; checked++;
      fetch(t.url,{method:'HEAD'}).then(function(r){
        if(!r.ok) t._missing=true;
      }).catch(function(){ t._missing=true; });
    }
  });
  // 移除缺失的曲目
  if(toRemove.length){
    toRemove.reverse().forEach(function(i){ trks.splice(i,1); });
    if(idx>=trks.length) idx=Math.max(0,trks.length-1);
    if(trks.length) load(idx); else load(-1);
    renderPL();
    saveTrks();
  }
}, 30000);

function notifySize() {
  try { parent.postMessage({type:'resize-request',payload:{height:document.body.scrollHeight}},'*'); } catch(e) {}
}

// Theme CSS
try {
  const pDoc = window.parent.document;
  const src = pDoc.getElementById('theme-style') || pDoc.querySelector('style[id*="theme"]');
  if (src) {
    const s = document.createElement('style');
    s.id = 'widget-theme';
    s.textContent = src.textContent || '';
    document.head.appendChild(s);
  }
} catch(e) {}

parent.postMessage({type:'ready'},'*');
if (window.ResizeObserver) { new ResizeObserver(notifySize).observe(document.body); }
setTimeout(notifySize, 300);
})();
</script>
</body>
</html>`;
}
