import fs from "node:fs";
import path from "node:path";

export const MIME = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4" };

// ── Cookie 加载：优先从 cookies.env 文件读取，回退到环境变量 ──
export function loadCookies() {
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

export function streamPipe(nodeStream, writable) {
  const writer = writable.getWriter();
  nodeStream.on("data", (chunk) => writer.write(chunk));
  nodeStream.on("end", () => writer.close());
  nodeStream.on("error", () => writer.close());
}

export function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function escAttr(s) {
  return esc(s);
}

// 注：服务端未实际调用（客户端脚本内另有同名实现），保留以维持原文件顶层定义集合
export function showToast(msg, dur) {
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
