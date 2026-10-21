/**
 * lib/auto-play.js — Agent 自主播放（对话驱动选歌）闭环的触发与编排层。
 *
 * 职责边界（刻意收窄，避免与蓝本 /mood 重复造轮子）：
 *   1. 判定「现在该不该主动给这个会话推一首歌」——关键词 / 心情 / 时段三维
 *   2. 把「按氛围选歌建单」这条任务，经 session:send 投回 agent（复用蓝本机制）
 *   3. 在 bus 上订阅会话事件，把判定接进「已有」的 message_end(user) /
 *      session_created 分支（不新增订阅，避免重复事件）
 *
 * 关键事实：
 *   - 选歌 / 播放 / 卡片 全部复用现有工具（audio_find_play / audio_list_music
 *     / audio_play），本文件**不**碰 playlist.json、不碰 UI、不碰 pv/。
 *   - session:send 必然进模型，需要 app/session.start-turn；session:list
 *     带 scope:"all" 需要 app/sessions.manage + app/sessions.read（read 已有）。
 *   - ctx.bus.request 是 RPC，晚于 apply 排干；必须在订阅回调 / execute 里才调。
 *
 * 纯函数（judgeTrigger / buildVibe / cooldown 状态转换）与 ctx 解耦，
 * 以便 tests/auto-play.test.js 不依赖宿主运行时即可实跑。
 */

import fs from "node:fs";

// ── 维度定义 ───────────────────────────────────────────

/**
 * 时段 vibe：整点 → 氛围标签 + 给 agent 的检索关键词。
 * 边界左闭右开 [start, end)。0-5 并入「深夜」。
 */
const HOUR_VIBES = [
  { start: 0, end: 5, vibe: "深夜", keywords: "Lo-fi 助眠 安静 纯音乐", desc: "深夜该安静下来了" },
  { start: 5, end: 9, vibe: "清晨", keywords: "清晨 轻快 明亮 民谣", desc: "清晨需要一点轻快" },
  { start: 9, end: 12, vibe: "专注", keywords: "专注 学习 纯音乐 钢琴", desc: "上午适合专注" },
  { start: 12, end: 14, vibe: "休闲", keywords: "午休 轻松 午后 爵士", desc: "午间放松一下" },
  { start: 14, end: 18, vibe: "活力", keywords: "活力 节奏 轻摇滚 电子", desc: "下午需要提神" },
  { start: 18, end: 22, vibe: "放松", keywords: "傍晚 放松 舒缓 R&B", desc: "傍晚放松" },
  { start: 22, end: 24, vibe: "深夜", keywords: "Lo-fi 助眠 安静 纯音乐", desc: "深夜该安静下来了" },
];

/** 心情 → vibe 关键词（命中即弱触发）。 */
const MOOD_VIBES = [
  { words: ["累", "疲惫", "困", "想睡", "乏"], vibe: "放松", keywords: "舒缓 安静 治愈 纯音乐", desc: "听起来有点累" },
  { words: ["放松", "躺", "闲", "休息", "歇"], vibe: "放松", keywords: "舒缓 轻音乐 治愈", desc: "想放松一下" },
  { words: ["开心", "高兴", "兴奋", "爽", "快乐"], vibe: "活力", keywords: "欢快 流行 节奏 电子", desc: "心情不错" },
  { words: ["专注", "工作", "学习", "写", "码", "coding", "干活"], vibe: "专注", keywords: "专注 学习 纯音乐 钢琴 白噪音", desc: "要专注做事" },
  { words: ["难过", "伤心", "低落", "丧", "emo", "哭"], vibe: "治愈", keywords: "治愈 安静 安慰 民谣", desc: "好像有点低落" },
  { words: ["运动", "健身", "跑步", "锻炼", "撸铁"], vibe: "活力", keywords: "运动 动感 电子 摇滚 燃", desc: "要动起来了" },
];

/**
 * 显式要歌关键词——强触发，不走冷却（用户主动开口）。
 * 命中即立即触发，不需要 vibe 判定。
 */
const EXPLICIT_WORDS = [
  "放首", "来首", "点首", "听首", "放点", "来点音乐", "放歌", "来歌", "点歌",
  "歌单", "播放", "听歌", "来点歌", "放一下", "唱首", "来一曲", "整首",
  "适合.*听", "推荐.*歌", "来点.*音乐", "背景音乐", "bgm",
];

// ── 纯函数：判定 ──────────────────────────────────────

function matchExplicit(text) {
  for (const pat of EXPLICIT_WORDS) {
    const re = new RegExp(pat, "i");
    if (re.test(text)) return true;
  }
  return false;
}

function matchMood(text) {
  for (const m of MOOD_VIBES) {
    if (m.words.some((w) => text.includes(w))) return m;
  }
  return null;
}

export function hourVibe(hour) {
  const h = ((Math.floor(Number(hour)) % 24) + 24) % 24;
  return HOUR_VIBES.find((v) => h >= v.start && h < v.end) || HOUR_VIBES[0];
}

/**
 * 触发判定（纯函数，无副作用）。
 *
 * @param {object} opts
 * @param {string} opts.text      用户消息正文
 * @param {number} [opts.hour]    当前小时（0-23），缺省用本地时间
 * @returns {{ trigger: boolean, kind: "explicit"|"mood"|"hour"|null,
 *             vibe: string|null, keywords: string|null, desc: string|null }}
 */
export function judgeTrigger({ text, hour }) {
  const t = typeof text === "string" ? text : "";
  if (!t.trim()) return { trigger: false, kind: null, vibe: null, keywords: null, desc: null };

  // 1. 显式要歌：强触发，无需 vibe
  if (matchExplicit(t)) {
    return { trigger: true, kind: "explicit", vibe: null, keywords: null, desc: "用户主动要歌" };
  }

  // 2. 心情：弱触发
  const mood = matchMood(t);
  if (mood) {
    return { trigger: true, kind: "mood", vibe: mood.vibe, keywords: mood.keywords, desc: mood.desc };
  }

  // 3. 时段：弱触发
  const hv = hourVibe(hour ?? new Date().getHours());
  return { trigger: true, kind: "hour", vibe: hv.vibe, keywords: hv.keywords, desc: hv.desc };
}

/**
 * 把判定结果拼成投给 agent 的选歌任务文案。
 * explicit 不指定 vibe（用户已点歌，让 agent 按原话检索）；
 * mood/hour 给 vibe + 关键词，并明确「不打断话题、选完简短播报」。
 */
export function buildSelectPrompt({ kind, vibe, keywords, desc, sessionTitle }) {
  const where = sessionTitle ? `（会话「${sessionTitle}」）` : "";
  if (kind === "explicit") {
    return (
      `用户主动要放歌${where}。请：① 调用 audio_list_music 看本地/已有曲库；` +
      `② 若没有合适曲目，用 audio_find_play 按用户原意检索并加入队列（` +
      `playNow 让用户立即听到可设 true，否则只入队）；` +
      `③ 已在播就不打断，选完用一句话简短播报歌名即可。`
    );
  }
  return (
    `检测到当前氛围为「${vibe}」${desc ? `——${desc}` : ""}${where}。` +
    `请按这个氛围选歌建单：① 先 audio_list_music 看曲库有没有匹配的；` +
    `② 没有就用 audio_find_play 按关键词「${keywords}」搜（可多次成歌单，` +
    `server 默认 netease，想要 B 站音源传 'bilibili'）；` +
    `③ 不打断用户正在聊的话题，选完用一句话简短播报即可。`
  );
}

// ── 冷却（纯状态转换，可单测）──────────────────────────

export const COOLDOWN_MS = {
  explicit: 0,        // 显式要歌：不限（用户主动）
  mood: 10 * 60 * 1000,  // 10 分钟
  hour: 4 * 60 * 60 * 1000, // 4 小时
};

export function cooldownKeyFor(kind, hour) {
  if (kind === "hour") {
    const seg = Math.floor((hour ?? new Date().getHours()) / 4); // 0..5，4h 一段
    return `hour:${seg}`;
  }
  return kind; // explicit / mood
}

/**
 * 计算更新后的冷却表。纯函数：给定上次时间戳映射与当前 kind/hour/now，
 * 返回 { allowed, store } —— allowed 表示这次是否通过冷却，store 是新表。
 */
export function cooldownTick(prevStore, { kind, hour }, now = Date.now()) {
  const store = { ...(prevStore || {}) };
  // 显式要歌永不冷却
  if (kind === "explicit") return { allowed: true, store };

  const key = cooldownKeyFor(kind, hour);
  const prev = store[key];
  const neverBefore = prev === undefined;
  const window = COOLDOWN_MS[kind] || 0;
  // 从未触发（prev 为 undefined）即视为通过；不能用 0 当时间戳——epoch 0
  // 会让 `now - 0`（now 的绝对值，毫秒级往往远小于 4h 窗口）误判成冷却中。
  const allowed = neverBefore || (now - prev >= window);
  if (allowed) store[key] = now;
  return { allowed, store };
}

// ── 编排层（依赖 ctx）──────────────────────────────────

export function createAutoPlay(ctx, state, { mood } = {}) {
  // 冷却表：键 cooldownKeyFor，值时间戳。内存态，重启清零（平衡档可接受）。
  let cooldownStore = {};
  let disposed = false;
  let ensured = false;
  let pending = null;

  const logger = ctx.logger || { info() {}, warn() {}, error() {} };

  /** 解析稳定 sessionId：与蓝本同款 realPath 比较 + 兜底原串。 */
  async function resolveSessionId(sessionPath) {
    const result = await ctx.bus.request("session:list", { scope: "all", lifecycle: "active" });
    const sessions = Array.isArray(result?.sessions) ? result.sessions : [];
    const canonical = safeRealPath(sessionPath);
    let target = canonical && sessions.find((x) => safeRealPath(x?.path) === canonical);
    if (!target) target = sessions.find((x) => x?.path === sessionPath);
    return typeof target?.sessionId === "string" ? target.sessionId : null;
  }

  async function deliver({ sessionPath, kind, vibe, keywords, desc }) {
    if (disposed) return { accepted: false, reason: "disposed" };
    const sessionId = await resolveSessionId(sessionPath);
    if (!sessionId) return { accepted: false, reason: "no-session-id" };
    const text = buildSelectPrompt({ kind, vibe, keywords, desc });
    try {
      const sent = await ctx.bus.request("session:send", {
        text,
        sessionId,
        scope: "all",
      });
      if (sent?.accepted !== true) return { accepted: false, reason: "not-accepted" };
      return { accepted: true };
    } catch (err) {
      logger.warn?.(`[auto-play] deliver failed: ${err?.message || err}`);
      return { accepted: false, reason: String(err?.message || err) };
    }
  }

  /** 总线事件入口：在 register-tools 已有分支里调用。 */
  async function handleEvent({ event, sessionPath, state: playingNow }) {
    if (disposed) return { handled: false, reason: "disposed" };
    const type = event?.type;
    if (type !== "session_created" && type !== "message_end") {
      return { handled: false, reason: "unsupported-event" };
    }
    // message_end 只在 user 角色分支调进来（register-tools 已过滤）；这里再保险一次。
    if (type === "message_end" && event?.message?.role !== "user") {
      return { handled: false, reason: "not-user" };
    }
    const text = String(event?.message?.text || "").trim();

    // 会话当前有播放则弱触发抑制（平衡档：不打断正在播的）
    if (playingNow) {
      return { handled: false, reason: "already-playing" };
    }

    const judge = judgeTrigger({ text });
    // session_created 场景没有消息文本 → 视作时段触发候选（仅当无播放且通过冷却）
    const effective = type === "session_created" && !judge.trigger
      ? judgeTrigger({ text: "", hour: new Date().getHours() })
      : judge;
    if (!effective.trigger) return { handled: false, reason: "no-trigger" };

    const { allowed, store } = cooldownTick(cooldownStore, {
      kind: effective.kind,
      hour: new Date().getHours(),
    });
    cooldownStore = store;
    if (!allowed) return { handled: false, reason: "cooldown" };

    const res = await deliver({
      sessionPath,
      kind: effective.kind,
      vibe: effective.vibe,
      keywords: effective.keywords,
      desc: effective.desc,
    });
    return { handled: res.accepted, reason: res.accepted ? null : res.reason };
  }

  const ensure = () => {
    if (disposed) return Promise.resolve(false);
    if (ensured) return Promise.resolve(true);
    if (pending) return pending;
    pending = (async () => {
      try {
        // 同蓝本：先 listOwn 看是否已有注册（隔离校验组合不会留毒化注册）。
        await mood?.ensure?.();
        ensured = true;
        return true;
      } catch (err) {
        logger.warn?.(`[auto-play] ensure failed: ${err?.message || err}`);
        return false;
      }
    })().finally(() => { pending = null; });
    return pending;
  };

  const dispose = () => {
    disposed = true;
    ensured = false;
    cooldownStore = {};
  };

  return { handleEvent, deliver, ensure, dispose, _cooldownStore: () => cooldownStore };
}

// ── 工具 ──────────────────────────────────────────────
// fs 仅用于 realPath；包进函数便于测试 mock / 无副作用隔离。
function safeRealPath(value) {
  try { return typeof value === "string" && value ? fs.realpathSync(value) : null; }
  catch { return null; }
}
