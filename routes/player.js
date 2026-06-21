/**
 * hanako-audio-player/routes/player.js
 *
 * 播放器路由：
 *   /widget                    — widget 页面（嵌入式）
 *   /widget/media/{filename} — 流式音频
 */

import fs from "node:fs";
import path from "node:path";
import { AudioBus } from "../tools/bus.js";

const MIME = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4" };

export default function (app, ctx) {
  const pluginId = ctx.pluginId;
  const dataDir = ctx.dataDir;
  const mediaDir = path.join(dataDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  // 兼容 dev 模式：工具把文件复制到 plugin-data 目录，路由需要同时检查多个位置
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const pluginDataMediaDir = home ? path.join(home, ".hanako", "plugin-data", "hanako-audio-player", "media") : null;
  // 额外扫描路径（用户配置的 plugin-data 位置）
  const extraMediaDirs = [];
  try {
    if (process.env.HANAKO_PLUGIN_DATA) {
      extraMediaDirs.push(path.join(process.env.HANAKO_PLUGIN_DATA, "hanako-audio-player", "media"));
    }
    // 常见变体：Work 目录下的 .hanako
    const workHanako = path.resolve("W:/Games/Hanako/.hanako/plugin-data/hanako-audio-player/media");
    if (fs.existsSync(workHanako)) extraMediaDirs.push(workHanako);
  } catch (e) {}

  function collectMediaFiles() {
    const files = [];
    const seen = new Set();
    const dirsToScan = [mediaDir];
    if (pluginDataMediaDir) dirsToScan.push(pluginDataMediaDir);
    extraMediaDirs.forEach(d => dirsToScan.push(d));
    for (const dir of dirsToScan) {
      try {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          if (!['mp3','wav','ogg','flac','m4a','webm'].includes(ext)) continue;
          // 按文件名去重（硬链接/挂载可能导致同一文件在不同路径）
          const nameKey = entry.name.toLowerCase();
          if (seen.has(nameKey)) continue;
          seen.add(nameKey);
          const fullPath = path.join(dir, entry.name);
          const stat = fs.statSync(fullPath);
          const url = `/api/plugins/${pluginId}/widget/media/${encodeURIComponent(entry.name)}`;
          files.push({ name: entry.name, size: stat.size, mtime: stat.mtimeMs, url });
        }
      } catch (e) { console.warn('[media] scan failed:', dir, e.message); }
    }
    files.sort((a, b) => b.mtime - a.mtime);
    return files;
  }

  // ── Widget 页面 ──
  app.get("/widget", (c) => {
    const hanaCss = c.req.query("hana-css") || "";
    const token = c.req.query("token") || "";
    const html = getWidgetHTML(pluginId, hanaCss, token);
    return c.html(html);
  });

  // ── 对话内嵌播放器（音频 base64 内嵌，绕过媒体端点鉴权）──
  app.get("/play", (c) => {
    const filename = c.req.query("file");
    const translate = c.req.query("translate") || "";
    if (!filename) return c.text("Missing file", 400);
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return c.text("Invalid filename", 400);
    }
    // 先查 dev dataDir，再查 plugin-data 共享目录，再查 extraMediaDirs
    let filePath = path.join(mediaDir, filename);
    if (!fs.existsSync(filePath) && pluginDataMediaDir) {
      filePath = path.join(pluginDataMediaDir, filename);
    }
    if (!fs.existsSync(filePath)) {
      for (const extraDir of extraMediaDirs) {
        const p = path.join(extraDir, filename);
        if (fs.existsSync(p)) { filePath = p; break; }
      }
    }
    if (!fs.existsSync(filePath)) return c.text("File not found", 404);

    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = MIME[ext] || "audio/mpeg";

    // 大文件（>1MB）走 redirect 到 widget/media 端点，避免全量加载到内存
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) {
      const redirectUrl = `/api/plugins/${pluginId}/widget/media/${encodeURIComponent(filename)}`;
      return c.redirect(redirectUrl);
    }

    const buf = fs.readFileSync(filePath);
    const base64 = buf.toString("base64");
    const audioSrc = `data:${mime};base64,${base64}`;

    // 读 _names.json 映射获取显示名（先 dev 目录，再生产目录）
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
}
.top{height:2px;background:linear-gradient(90deg,#d49a6a,#c48454)}
.body{padding:8px 12px}
.row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.icon{
  width:26px;height:26px;border-radius:5px;
  background:linear-gradient(135deg,#d49a6a,#c48454);
  display:flex;align-items:center;justify-content:center;
  font-size:13px;flex-shrink:0;color:white;
}
.name{color:#2c2c2c;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
.trans{color:#666;font-size:12px;line-height:1.4;padding:6px 0 2px 0;border-top:1px solid rgba(0,0,0,0.04);margin-top:6px;word-break:break-all}
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
  const queuePath = path.join(dataDir, "queue.json");
  // 兼容 dev 模式：部分工具可能写到生产数据目录
  const homeDir = process.env.USERPROFILE || process.env.HOME || "";
  const prodQueuePath = homeDir ? path.join(homeDir, ".hanako", "plugin-data", "hanako-audio-player", "queue.json") : null;

  // ── Bus 状态 ──
  const bus = new AudioBus({ pluginId, dataDir });

  // ── 助手列表（说话人）──
  app.get("/bus/agents", (c) => {
    // Work 目录固定路径
    const agentsDir = path.resolve("W:/Games/Hanako/Work/zhiyi/agents");
    let agents = [];
    try {
      if (fs.existsSync(agentsDir)) {
        const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
        agents = entries.filter(e => e.isDirectory()).map(e => ({ id: e.name, name: e.name }));
      }
    } catch (e) { console.warn("[bus] agents list failed:", e.message); }
    return c.json({ ok: true, agents });
  });

  app.get("/bus/state", (c) => {
    return c.json(bus.getState());
  });
  app.post("/bus/control", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const action = body.action || "state";
      let result;
      switch (action) {
        case "load":
          result = bus.load(body.playlist || []);
          break;
        case "say":
          result = bus.say(body.text || "", { spk: body.spk, instruct: body.instruct, translate: body.translate });
          break;
        case "play":
          result = bus.play(body.url || "", { name: body.name, mode: body.mode });
          break;
        case "next":
          result = bus.next();
          break;
        case "pause":
          result = bus.pause();
          break;
        case "resume":
          result = bus.resume();
          break;
        case "remove": {
          const idx = parseInt(body.index, 10);
          if (!isNaN(idx)) result = bus.remove(idx);
          else if (body.url) result = bus.removeByUrl(body.url);
          else result = { ok: false, code: 'missing_index_or_url' };
          break;
        }
        case "clear":
          result = bus.clear();
          break;
        default:
          result = bus.getState();
      }
      return c.json(result);
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });

  app.get("/widget/api/queue", (c) => {
    try {
      if (fs.existsSync(queuePath)) {
        return c.json(JSON.parse(fs.readFileSync(queuePath, "utf-8")));
      }
      // fallback: 生产目录
      if (prodQueuePath && fs.existsSync(prodQueuePath)) {
        return c.json(JSON.parse(fs.readFileSync(prodQueuePath, "utf-8")));
      }
    } catch (e) { console.warn('[queue] GET failed:', e.message); }
    return c.json([]);
  });

  // ── 媒体库（扫描多个 media/ 目录）──
  app.get("/widget/api/files", (c) => {
    try {
      const files = collectMediaFiles().map(({ name, size, mtime, url }) => ({ name, size, mtime, url }));
      return c.json({ ok: true, files });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });

  app.post("/widget/api/delete", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const filename = body.filename || "";
      if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
        return c.json({ ok: false, error: "invalid filename" }, 400);
      }
      // 在所有可能的 media 目录中查找并删除
      const dirsToScan = [mediaDir];
      if (pluginDataMediaDir) dirsToScan.push(pluginDataMediaDir);
      extraMediaDirs.forEach(d => dirsToScan.push(d));
      let deleted = false;
      for (const dir of dirsToScan) {
        const filePath = path.join(dir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deleted = true;
          break;
        }
      }
      if (!deleted) return c.json({ ok: false, error: "not found" }, 404);
      // 同步清理 bus-queue.json 中的引用
      try {
        const bus = new AudioBus({ pluginId, dataDir });
        const targetUrl = `/api/plugins/${pluginId}/widget/media/${encodeURIComponent(filename)}`;
        bus.queue = bus.queue.filter(it => {
          if (it.type === 'play' && it.url) return stripToken(it.url) !== stripToken(targetUrl);
          return true;
        });
        bus._saveQueue();
      } catch (e) { console.warn('[delete] bus cleanup failed:', e.message); }
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });

  app.post("/widget/api/queue", async (c) => {
    try {
      const body = await c.req.json();
      // 写入主目录
      fs.writeFileSync(queuePath, JSON.stringify(body, null, 2), "utf-8");
      // 也同步到生产目录（如果是 dev 模式）
      if (prodQueuePath && prodQueuePath !== queuePath) {
        try { fs.writeFileSync(prodQueuePath, JSON.stringify(body, null, 2), "utf-8"); } catch (e) { console.warn('[queue] prod sync write failed:', e.message); }
      }
      return c.json({ ok: true });
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
    // 额外扫描路径
    if (!fs.existsSync(filePath)) {
      for (const extraDir of extraMediaDirs) {
        const p = path.join(extraDir, filename);
        if (fs.existsSync(p)) { filePath = p; break; }
      }
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
      // 只支持单段 Range: bytes=N-M 或 bytes=N-
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

function getWidgetHTML(pluginId, hanaCss, token) {
  const apiBase = `/api/plugins/${pluginId}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<title>🎵 播放器</title>
${hanaCss ? `<link rel="stylesheet" href="${esc(hanaCss)}">` : ""}
<style>
:root {
  --bg: #FFFBF5;
  --surface: #FFFBF5;
  --border: rgba(0,0,0,0.06);
  --text: #2c2c2c;
  --text-dim: rgba(0,0,0,0.35);
  --accent: #d49a6a;
  --accent-end: #c48454;
  --radius: 8px;
}
* { margin:0; padding:0; box-sizing:border-box; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  display: flex; flex-direction: column;
  user-select: none;
}

/* Header */
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 8px; }
.header-icon {
  width: 24px; height: 24px; border-radius: 4px;
  background: linear-gradient(135deg, var(--accent), var(--accent-end));
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; flex-shrink: 0;
}
.header-title { font-weight: 600; font-size: 13px; }
.header-min { background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:18px; padding:2px 6px; border-radius:4px; transition:all 0.15s; }
.header-min:hover { background:rgba(0,0,0,0.04); color:var(--text); }

/* Track info */
.track-info {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px 6px;
  min-height: 36px;
}
.track-icon {
  width: 28px; height: 28px; border-radius: 4px;
  background: linear-gradient(135deg, var(--accent), var(--accent-end));
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.track-name { font-weight: 500; white-space: nowrap; overflow:hidden; text-overflow:ellipsis; }
.track-mode { font-size: 11px; color: var(--text-dim); }

/* Progress */
.progress-area { padding: 2px 12px 4px; }
.time-row { display:flex; justify-content:space-between; font-size:10px; color:var(--text-dim); margin-bottom:2px; font-variant-numeric:tabular-nums; }
.progress-bar { height:3px; background:rgba(0,0,0,0.06); border-radius:2px; cursor:pointer; position:relative; }
.progress-fill { height:100%; width:0%; border-radius:2px; background:linear-gradient(90deg,var(--accent),var(--accent-end)); position:relative; transition:width 0.05s linear; }
.progress-fill::after { content:''; position:absolute; right:-3px; top:-2.5px; width:7px; height:7px; border-radius:50%; background:var(--accent); opacity:0; transition:opacity 0.2s; }
.progress-bar:hover .progress-fill::after { opacity:1; }

/* Controls */
.controls-area {
  display:flex; align-items:center; justify-content:space-between;
  padding:6px 12px 10px; gap:8px;
}
.controls-center { display:flex; align-items:center; gap:4px; }
.btn {
  background:none; border:none; color:var(--text-dim); cursor:pointer;
  width:28px; height:28px; border-radius:4px;
  display:flex; align-items:center; justify-content:center;
  transition:all 0.15s; flex-shrink:0;
}
.btn:hover { background:rgba(0,0,0,0.04); color:var(--text); }
.btn svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.btn-play {
  width:32px; height:32px; border-radius:50%;
  background:linear-gradient(135deg,var(--accent),var(--accent-end));
  color:white; box-shadow:0 2px 10px rgba(212,154,106,0.3);
}
.btn-play:hover { transform:scale(1.05); box-shadow:0 4px 16px rgba(212,154,106,0.5); }
.btn-play svg { width:18px; height:18px; }
#pauseIcon rect { fill:white; }

/* Volume */
.volume-wrap { display:flex; align-items:center; gap:4px; }
.volume-slider { width:48px; height:2px; -webkit-appearance:none; appearance:none; background:rgba(0,0,0,0.1); border-radius:2px; cursor:pointer; }
.volume-slider::-webkit-slider-thumb { -webkit-appearance:none; width:6px; height:6px; border-radius:50%; background:var(--accent); cursor:pointer; }

/* Playlist */
.playlist-area { border-top:1px solid var(--border); flex:1; min-height:0; display:flex; flex-direction:column; }
.playlist-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:8px 12px; cursor:pointer; user-select:none;
  transition:background 0.15s;
}
.playlist-header:hover { background:rgba(255,255,255,0.03); }
.playlist-header-left { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-dim); }
.playlist-header svg { width:12px; height:12px; transition:transform 0.2s; }
.playlist-header.open svg { transform:rotate(180deg); }
.playlist-count { font-size:10px; color:var(--text-dim); margin-left:4px; }

.playlist-body {
  max-height:220px; overflow-y:auto; scroll-behavior:smooth;
}
.playlist-body::-webkit-scrollbar { width:6px; }
.playlist-body::-webkit-scrollbar-track { background:transparent; }
.playlist-body::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
.playlist-body::-webkit-scrollbar-thumb:hover { background:var(--text-dim); }
.playlist-item {
  display:flex; align-items:center; gap:8px;
  padding:6px 12px; cursor:pointer; transition:background 0.12s;
}
.playlist-item:hover { background:rgba(255,255,255,0.03); }
.playlist-item.active { background:linear-gradient(90deg,rgba(212,154,106,0.08),transparent); }
.playlist-item .status { width:16px; text-align:center; font-size:12px; color:var(--text-dim); flex-shrink:0; }
.playlist-item.active .status { color:var(--accent); }
.playlist-item .name { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12px; }
.playlist-item.active .name { color:var(--accent); }
.playlist-item .dur { font-size:10px; color:var(--text-dim); font-variant-numeric:tabular-nums; }
.playlist-item .rm {
  background:none; border:none; color:var(--text-dim); cursor:pointer;
  font-size:12px; padding:2px; opacity:0; transition:opacity 0.12s;
}
.playlist-item:hover .rm { opacity:0.5; }
.playlist-item .rm:hover { opacity:1 !important; color:var(--accent); }

/* Add URL */
.add-row {
  display:flex; align-items:center; gap:6px;
  padding:6px 12px 8px; border-top:1px solid var(--border);
}
.add-row input {
  flex:1; min-width:0;
  background:rgba(255,255,255,0.04); border:1px solid var(--border); border-radius:4px;
  color:var(--text); font-size:11px; padding:4px 8px; outline:none; font-family:inherit;
}
.add-row input::placeholder { color:var(--text-dim); }
.add-row input:focus { border-color:var(--accent); }
.add-row button {
  background:linear-gradient(135deg,var(--accent),var(--accent-end));
  border:none; border-radius:4px; color:white; font-size:11px;
  padding:4px 10px; cursor:pointer; font-family:inherit; font-weight:500;
  transition:all 0.15s; white-space:nowrap;
}
.add-row button:hover { box-shadow:0 2px 8px rgba(212,154,106,0.3); }

/* 预设按钮 */
.preset-btn {
  background:none;
  border:1px solid var(--border);
  border-radius:12px;
  color:var(--text-dim);
  font-size:11px;
  padding:3px 10px;
  cursor:pointer;
  transition:all 0.15s;
  font-family:inherit;
}
.preset-btn:hover {
  border-color:var(--accent);
  color:var(--accent);
  background:rgba(212,154,106,0.06);
}

.preset-wrap {
  position:relative;
  display:inline-flex;
}
.preset-del {
  position:absolute;
  top:-5px; right:-5px;
  width:14px; height:14px;
  border-radius:50%;
  background:rgba(0,0,0,0.4);
  color:#fff;
  font-size:10px;
  line-height:14px;
  text-align:center;
  cursor:pointer;
  opacity:0;
  transition:opacity 0.15s;
}
.preset-wrap:hover .preset-del {
  opacity:1;
}

/* Empty */
.empty { padding:20px 12px; text-align:center; color:var(--text-dim); font-size:12px; }

/* Bus Control Panel */
.bus-panel { border-top:1px solid var(--border); padding:8px 12px; background:rgba(0,0,0,0.01); flex-shrink:0; position:relative; z-index:50; }
.bus-status { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-dim); margin-bottom:6px; }
.bus-dot { width:6px; height:6px; border-radius:50%; background:var(--text-dim); flex-shrink:0; }
.bus-dot.playing { background:#22c55e; box-shadow:0 0 6px rgba(34,197,94,.4); }
.bus-dot.error { background:#ef4444; }
.bus-queue { max-height:100px; overflow-y:auto; margin-bottom:6px; }
.bus-queue-item { display:flex; align-items:center; gap:6px; padding:3px 0; font-size:11px; border-bottom:1px solid rgba(0,0,0,0.03); }
.bus-queue-item .type-tag { font-size:9px; padding:1px 4px; border-radius:3px; background:rgba(0,0,0,0.05); color:var(--text-dim); flex-shrink:0; }
.bus-queue-item .item-text { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bus-controls { display:flex; gap:4px; align-items:center; position:relative; z-index:50; }
.bus-controls input { flex:1; min-width:0; background:rgba(255,255,255,0.04); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:11px; padding:4px 8px; outline:none; font-family:inherit; }
.bus-controls select { background:var(--surface); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:11px; padding:4px; font-family:inherit; position:relative; z-index:60; }
.bus-btn { background:none; border:1px solid var(--border); border-radius:4px; color:var(--text-dim); font-size:11px; padding:4px 8px; cursor:pointer; font-family:inherit; white-space:nowrap; transition:all 0.15s; position:relative; z-index:60; }
.bus-btn:hover { border-color:var(--accent); color:var(--accent); }
.bus-btn.primary { background:linear-gradient(135deg,var(--accent),var(--accent-end)); border:none; color:white; }
.bus-btn.primary:hover { box-shadow:0 2px 8px rgba(212,154,106,.3); }

/* Collapsed */
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <div class="header-icon">♫</div>
    <span class="header-title">播放器</span>
  </div>
  <button class="header-min" id="popBtn" title="弹出窗口">↗</button>
</div>

<div class="track-info">
  <div class="track-icon" id="icon">♫</div>
  <div style="min-width:0">
    <div class="track-name" id="trackName">播放器</div>
    <div class="track-mode" id="trackMode">准备就绪</div>
  </div>
</div>

<div class="progress-area">
  <div class="time-row">
    <span id="currentTime">0:00</span>
    <span id="totalTime">0:00</span>
  </div>
  <div class="progress-bar" id="progressBar">
    <div class="progress-fill" id="progressFill"></div>
  </div>
</div>

<div class="controls-area">
  <button class="btn" id="prevBtn">
    <svg viewBox="0 0 24 24"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
  </button>
  <div class="controls-center">
    <button class="btn btn-play" id="playBtn">
      <svg id="playIcon" viewBox="0 0 24 24"><polygon points="8,5 19,12 8,19" fill="white"/></svg>
      <svg id="pauseIcon" viewBox="0 0 24 24" style="display:none"><rect x="7" y="5" width="4" height="14" rx="1" fill="white"/><rect x="13" y="5" width="4" height="14" rx="1" fill="white"/></svg>
    </button>
  </div>
  <div class="volume-wrap">
    <button class="btn" id="volumeBtn" style="width:auto">
      <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    </button>
    <input type="range" class="volume-slider" id="volumeSlider" min="0" max="100" value="80">
  </div>
  <button class="btn" id="nextBtn">
    <svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 21 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
  </button>
</div>

<!-- Bus 控制面板 -->
<div class="bus-panel" id="busPanel">
  <div class="bus-status" id="busStatus">
    <span class="bus-dot" id="busDot"></span>
    <span id="busStatusText">待机</span>
  </div>
  <div class="bus-queue" id="busQueue">
    <div class="empty" style="padding:8px">队列为空</div>
  </div>
  <div class="bus-controls">
    <input id="sayInput" type="text" placeholder="输入串场文本…" spellcheck="false">
    <select id="spkSelect">
      <option value="my_voice">my_voice</option>
      <option value="default">default</option>
    </select>
    <button class="bus-btn" id="busSayBtn">说</button>
    <button class="bus-btn" id="busNextBtn">下一首</button>
    <button class="bus-btn" id="busClearBtn">清空</button>
  </div>
</div>

<div class="playlist-area">
  <div class="playlist-header" id="plHeader">
    <div class="playlist-header-left">
      <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      <span>播放列表</span>
      <span class="playlist-count" id="plCount">0</span>
    </div>
    <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
  </div>
  <div class="playlist-body" id="plBody"></div>
  <div class="add-row">
    <input id="urlInput" type="text" placeholder="URL 或本地路径…" spellcheck="false">
    <button id="addBtn">添加</button>
  </div>
  <div class="add-row" id="presetAddRow" style="padding-top:0">
    <input id="presetNameInput" type="text" placeholder="电台名称…" spellcheck="false" style="flex:0.4">
    <button id="savePresetBtn" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--text-dim);font-size:11px;padding:4px 8px;cursor:pointer;font-family:inherit;white-space:nowrap;">存为电台</button>
  </div>
  <div class="presets-row" id="presetsRow">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 12px 2px;">
      <span style="font-size:11px;color:var(--text-dim);">在线电台</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding:2px 12px 10px;" id="presetsList">
      <div class="preset-wrap"><button class="preset-btn" data-url="https://music.163.com/song/media/outer/url?id=569213220.mp3">起风了</button><span class="preset-del" data-name="起风了">✕</span></div>
      <div class="preset-wrap"><button class="preset-btn" data-url="https://music.163.com/song/media/outer/url?id=27599862.mp3">夜に駆ける</button><span class="preset-del" data-name="夜に駆ける">✕</span></div>
      <div class="preset-wrap"><button class="preset-btn" data-url="https://music.163.com/song/media/outer/url?id=1387099973.mp3">Lemon</button><span class="preset-del" data-name="Lemon">✕</span></div>
    </div>
  </div>
</div>

<audio id="audio" preload="auto"></audio>
<script>
(function(){
"use strict";
const API = ${JSON.stringify(apiBase)};
const TOKEN = ${JSON.stringify(token)};
if (TOKEN) {
  const _f = window.fetch.bind(window);
  window.fetch = function(u, o) { o=o||{}; o.headers=o.headers||{}; o.headers["Authorization"]="Bearer "+TOKEN; return _f(u,o); };
}

const audio = document.getElementById('audio');
let trks = [], idx = 0, playing = false, shuffled = false, prevVol = 0.8;
function fmt(s) { if (!s||!isFinite(s)) return '0:00'; return Math.floor(s/60)+':'+Math.floor(s%60).toString().padStart(2,'0'); }

function load(i) {
  if (i<0||i>=trks.length) { trackName.textContent='播放器'; trackMode.textContent='暂停'; return; }
  idx=i; const t=trks[i];
  document.getElementById('trackName').textContent=t.name;
  document.getElementById('trackMode').textContent=t.mode||'';
  audio.src=t.url; audio.load(); renderPL();
}

function toggle() {
  if (!trks.length) return;
  if (audio.paused) { audio.play(); playing=true; }
  else { audio.pause(); playing=false; }
  document.getElementById('playIcon').style.display=playing?'none':'block';
  document.getElementById('pauseIcon').style.display=playing?'block':'none';
}

function next() {
  if (!trks.length) return;
  const n = shuffled ? Math.floor(Math.random()*trks.length) : (idx+1)%trks.length;
  load(n); if (audio.paused) { audio.play(); playing=true; toggle(); }
}
function prev() {
  if (!trks.length) return;
  if (audio.currentTime>3) { audio.currentTime=0; return; }
  const n = shuffled ? Math.floor(Math.random()*trks.length) : (idx-1+trks.length)%trks.length;
  load(n); if (audio.paused) { audio.play(); playing=true; toggle(); }
}

function renderPL() {
  document.getElementById('plCount').textContent=trks.length;
  if (!trks.length) { document.getElementById('plBody').innerHTML='<div class="empty">暂无曲目</div>'; return; }
  document.getElementById('plBody').innerHTML=trks.map(function(t,i) {
    const a=i===idx;
    return '<div class="playlist-item'+(a?' active':'')+'" data-i="'+i+'">'
      +'<span class="status">'+(a?'♫':(i+1))+'</span>'
      +'<span class="name">'+esc(t.name)+'</span>'
      +'<span class="dur">'+fmt(t.dur||0)+'</span>'
      +'<button class="rm" data-rm="'+i+'">✕</button></div>';
  }).join('');
  document.getElementById('plBody').querySelectorAll('.playlist-item').forEach(function(el){
    el.addEventListener('click',function(e){
      if(e.target.closest('.rm'))return;
      const i=parseInt(this.dataset.i);
      var url = trks[i] ? trks[i].url : '';
      if(!url) return;
      // 通知 Bus 播放此 URL
      fetch(API + '/bus/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'play', url: url, name: trks[i].name })
      }).catch(function(){});
      load(i); if(audio.paused){audio.play();playing=true;toggle();}
    });
  });
  document.getElementById('plBody').querySelectorAll('.rm').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      var i = parseInt(this.dataset.rm);
      var track = trks[i];
      if (!track) return;
      var url = track.url;
      var name = track.name;
      // 从 Bus 队列移除
      fetch(API + '/bus/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', url: url })
      }).catch(function(){});
      // 从 media/ 目录删除文件
      fetch(API + '/widget/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name })
      }).then(function(r){ return r.json(); }).then(function(res) {
        if (res && res.ok) {
          refreshBusState();
          loadMediaLib();
        }
      }).catch(function(){});
    });
  });
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Events
document.getElementById('playBtn').addEventListener('click',toggle);
document.getElementById('nextBtn').addEventListener('click',next);
document.getElementById('prevBtn').addEventListener('click',prev);
document.getElementById('volumeSlider').addEventListener('input',function(e){audio.volume=e.target.value/100;});
document.getElementById('volumeBtn').addEventListener('click',function(){if(audio.volume>0){prevVol=audio.volume;audio.volume=0;this.querySelector('svg').style.opacity=0.3;}else{audio.volume=prevVol;volumeSlider.value=prevVol*100;this.querySelector('svg').style.opacity=1;}});
document.getElementById('progressBar').addEventListener('click',function(e){const r=this.getBoundingClientRect();const p=(e.clientX-r.left)/r.width;if(audio.duration)audio.currentTime=p*audio.duration;});
document.addEventListener('keydown',function(e){if(e.code==='Space'&&e.target.tagName!=='INPUT'){e.preventDefault();toggle();}});
document.getElementById('plHeader').addEventListener('click',function(){this.classList.toggle('open');document.getElementById('plBody').classList.toggle('open');});
document.getElementById('addBtn').addEventListener('click',function(){const v=document.getElementById('urlInput').value.trim();if(!v)return;addTrack(null,v);document.getElementById('urlInput').value='';});
document.getElementById('urlInput').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('addBtn').click();});

// ── Preset persistence with localStorage ──
function addPresetDOM(name, url) {
  var list = document.getElementById('presetsList');
  // dedup
  for (var i = 0; i < list.children.length; i++) {
    var b = list.children[i].querySelector('.preset-btn');
    if (b && b.dataset.url === url) return;
  }
  var wrap = document.createElement('div'); wrap.className = 'preset-wrap';
  var btn = document.createElement('button'); btn.className = 'preset-btn'; btn.textContent = name; btn.dataset.url = url;
  var del = document.createElement('span'); del.className = 'preset-del'; del.textContent = '✕';
  wrap.appendChild(btn); wrap.appendChild(del);
  list.appendChild(wrap);
}

// 事件委托：点击电台按钮播放，点击 ✕ 删除并持久化
document.getElementById('presetsList').addEventListener('click', function(e) {
  var btn = e.target.closest('.preset-btn');
  var del = e.target.closest('.preset-del');
  if (btn) {
    addTrack(btn.textContent, btn.dataset.url, '电台');
  } else if (del) {
    del.parentElement.remove();
    savePresets();
  }
});
function savePresets() {
  var presets = [];
  document.querySelectorAll('#presetsList .preset-wrap').forEach(function(w) {
    var btn = w.querySelector('.preset-btn');
    if (btn) presets.push({ name: btn.textContent, url: btn.dataset.url });
  });
  try { localStorage.setItem('hanako_audio_presets', JSON.stringify(presets)); } catch(e) {}
}
function loadPresets() {
  var saved;
  try { saved = JSON.parse(localStorage.getItem('hanako_audio_presets')); } catch(e) {}
  if (!saved || !saved.length) return; // keep HTML defaults
  // replace defaults with saved presets
  var list = document.getElementById('presetsList');
  list.innerHTML = '';
  saved.forEach(function(p) { addPresetDOM(p.name, p.url); });
}

// 存为电台
document.getElementById('savePresetBtn').addEventListener('click',function(){
  var url=document.getElementById('urlInput').value.trim();
  var name=document.getElementById('presetNameInput').value.trim();
  if(!url)return;
  if(!name)name=url.split('/').pop().split('?')[0].replace(/\.\w+$/,'')||'电台';
  addPresetDOM(name, url);
  savePresets();
  document.getElementById('urlInput').value='';
  document.getElementById('presetNameInput').value='';
});

// 存为电台（由事件委托处理点击，此处只负责创建 DOM + 存 localStorage）

// 在线电台折叠
var presetsRow=document.getElementById('presetsRow');
var plHeader=document.getElementById('plHeader');
plHeader.addEventListener('dblclick',function(){presetsRow.style.display=presetsRow.style.display==='none'?'block':'none';});
document.getElementById('popBtn').addEventListener('click',function(){
  var url = 'http://localhost:14500' + API + '/widget?standalone=1&token=' + encodeURIComponent(TOKEN);
  window.open(url, 'hanako-player', 'width=480,height=400');
});

audio.addEventListener('timeupdate',function(){
  document.getElementById('currentTime').textContent=fmt(audio.currentTime);
  if(audio.duration){document.getElementById('totalTime').textContent=fmt(audio.duration);document.getElementById('progressFill').style.width=(audio.currentTime/audio.duration*100)+'%';if(trks[idx])trks[idx].dur=audio.duration;}
});
audio.addEventListener('loadedmetadata',function(){document.getElementById('totalTime').textContent=fmt(audio.duration);if(trks[idx])trks[idx].dur=audio.duration;renderPL();});
audio.addEventListener('ended',next);

function addTrack(name,url,mode) {
  if (!url) return;
  for(let i=0;i<trks.length;i++){if(trks[i].url===url){load(i);if(audio.paused){audio.play();playing=true;toggle();}return;}}
  trks.push({name:name||url.split('/').pop().split('\\\\').pop().split('?')[0]||'音频',url:url,mode:mode||(url.startsWith('http')?'在线':'本地'),dur:0});
  load(trks.length-1);if(audio.paused){audio.play();playing=true;toggle();}renderPL();
}

// 给 URL 加上 token
function tok(url) {
  if (!url) return url;
  if (!TOKEN) return url;
  return url + (url.indexOf('?') > -1 ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
}

// 去除 URL 中的 token 参数（用于去重）
function stripToken(url) {
  if (!url) return url;
  return url.split('?')[0];
}

// Demo tracks（可选：复制音频文件到 data/media/ 目录即可自动加载）
// addTrack('曲目名', tok(BASE+'文件.wav'), '标签');

// 加载持久化的电台预设（替换 HTML 默认值）
loadPresets();

// 加载助手列表填充说话人下拉框
function loadAgents() {
  fetch(API + '/bus/agents').then(function(r){ return r.json(); }).then(function(data) {
    if (!data || !data.ok || !Array.isArray(data.agents) || !data.agents.length) return;
    var sel = document.getElementById('spkSelect');
    if (!sel) return;
    sel.innerHTML = '';
    data.agents.forEach(function(a) {
      var opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      sel.appendChild(opt);
    });
  }).catch(function(){});
}
loadAgents();

// 加载媒体库（扫描 media/ 目录）
function loadMediaLib() {
  fetch(API+'/widget/api/files').then(function(r){return r.json();}).then(function(data){
    if(!data||!data.ok)return;
    trks = []; idx = 0; playing = false;
    (data.files||[]).forEach(function(f){
      trks.push({ name: f.name, url: f.url, mode: '本地', dur: 0 });
    });
    if(trks.length) load(0); else load(-1);
    renderPL();
  }).catch(function(){});
}
loadMediaLib();

// 定时刷新媒体库（文件增删变化）
setInterval(function(){
  fetch(API+'/widget/api/files').then(function(r){return r.json();}).then(function(data){
    if(!data||!data.ok)return;
    var newUrls = {};
    (data.files||[]).forEach(function(f){ newUrls[stripToken(f.url)] = f; });
    var oldUrls = {};
    trks.forEach(function(t){ oldUrls[stripToken(t.url)] = t; });
    // 添加新文件
    Object.keys(newUrls).forEach(function(url){
      if(!oldUrls[url]){
        var f = newUrls[url];
        addTrack(f.name, tok(url), '本地');
      }
    });
    // 移除已删除文件
    for(var i=trks.length-1;i>=0;i--){
      if(!newUrls[stripToken(trks[i].url)]) trks.splice(i,1);
    }
    if(idx>=trks.length) idx=Math.max(0,trks.length-1);
    renderPL();
  }).catch(function(){});
}, 10000);

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

// ── Bus 控制面板 ──
var lastBusCurrentUrl = '';
function refreshBusState() {
  fetch(API + '/bus/state').then(function(r){ return r.json(); }).then(function(st) {
    if (!st || !st.ok) return;
    var dot = document.getElementById('busDot');
    var txt = document.getElementById('busStatusText');
    if (dot && txt) {
      dot.className = 'bus-dot' + (st.status === 'playing' ? ' playing' : st.status === 'error' ? ' error' : '');
      txt.textContent = st.status === 'playing' ? '播放中' : st.status === 'paused' ? '暂停' : st.status === 'error' ? '错误' : '待机';
    }
    var qEl = document.getElementById('busQueue');
    if (qEl) {
      var items = (st.queue || []).concat(st.current ? [st.current] : []);
      if (!items.length) {
        qEl.innerHTML = '<div class="empty" style="padding:8px">队列为空</div>';
      } else {
        qEl.innerHTML = items.map(function(it) {
          var label = it.text || it.name || it.url || '';
          if (it.type === 'segue') label = '过渡 ' + (it.duration || 3000) + 'ms';
          if (it.type === 'reason') label = '备注: ' + (it.text || '');
          return '<div class="bus-queue-item">' + '<span class="type-tag">' + esc(it.type) + '</span>' + '<span class="item-text">' + esc(label) + '</span>' + '</div>';
        }).join('');
      }
    }
    // Bus current 是 play 类型且有 url 时，自动加入播放器
    if (st.current && st.current.type === 'play' && st.current.url) {
      var curUrl = stripToken(st.current.url);
      if (curUrl && curUrl !== lastBusCurrentUrl) {
        lastBusCurrentUrl = curUrl;
        addTrack(st.current.name || st.current.url, tok(st.current.url), st.current.mode);
      }
    }
  }).catch(function(){});
}

document.getElementById('busSayBtn').addEventListener('click', function() {
  var text = document.getElementById('sayInput').value.trim();
  if (!text) return;
  var spk = document.getElementById('spkSelect').value;
  fetch(API + '/bus/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'say', text: text, spk: spk })
  }).then(function(r){ return r.json(); }).then(function(res) {
    if (res && res.ok) {
      document.getElementById('sayInput').value = '';
      refreshBusState();
    }
  }).catch(function(){});
});
document.getElementById('sayInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('busSayBtn').click();
});
document.getElementById('busNextBtn').addEventListener('click', function() {
  fetch(API + '/bus/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'next' }) }).then(function(){ refreshBusState(); }).catch(function(){});
});
document.getElementById('busClearBtn').addEventListener('click', function() {
  fetch(API + '/bus/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear' }) }).then(function(){ refreshBusState(); }).catch(function(){});
});

setInterval(refreshBusState, 2000);
refreshBusState();

parent.postMessage({type:'ready'},'*');
if (window.ResizeObserver) { new ResizeObserver(notifySize).observe(document.body); }
setTimeout(notifySize, 300);
})();
</script>
</body>
</html>`;
}
