const fs = require('fs');
const p = 'W:/Games/Hanako/.hanako/plugins/hanako-audio-player/routes/player.js';
let c = fs.readFileSync(p, 'utf-8');

const oldBlock = `// 环境变量：网易云 cookie（格式：MUSIC_U=xxxxxxxx），用于获取完整音频
const NETEASE_COOKIE = process.env.NETEASE_COOKIE || "";
// 环境变量：QQ音乐 cookie（格式：uin=xxx; qqmusic_key=xxx），用于获取完整音频
const TENCENT_COOKIE = process.env.TENCENT_COOKIE || "";`;

const newBlock = `// ── Cookie 加载：优先从 cookies.env 文件读取，回退到环境变量 ──
function _loadCookies() {
  let netease = process.env.NETEASE_COOKIE || "";
  let tencent = process.env.TENCENT_COOKIE || "";
  try {
    let cookiePath = null;
    // 方案1：import.meta.url（ESM）
    try {
      const _url = new URL("cookies.env", import.meta.url);
      // Windows 路径标准化：file:///W:/... → W:\...
      let fp = _url.pathname;
      if (fp.startsWith("/")) fp = fp.slice(1);
      fp = fp.replace(/\\//g, "\\\\");
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
      for (const line of raw.split("\\n")) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (!m) continue;
        if (m[1] === "NETEASE_COOKIE" && m[2].trim()) netease = m[2].trim();
        if (m[1] === "TENCENT_COOKIE" && m[2].trim()) tencent = m[2].trim();
      }
    }
  } catch(e) { console.warn("[player] cookies.env load failed:", e.message); }
  return { NETEASE_COOKIE: netease, TENCENT_COOKIE: tencent };
}
const { NETEASE_COOKIE, TENCENT_COOKIE } = _loadCookies();`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  console.log('Cookie loader added');
} else {
  console.log('ERROR: old block not found');
}

fs.writeFileSync(p, c, 'utf-8');
