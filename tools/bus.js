/**
 * hanako-audio-player/tools/bus.js
 *
 * 节目编排引擎 — 实现总线协议 { say, play[], segue, reason }
 * 负责解析 playlist、管理队列状态、驱动播放流程
 */

import fs from "node:fs";
import path from "node:path";

const name = "audio_bus";
const description = "音频总线编排引擎：解析 say/play/segue/reason 序列，驱动播放队列。";

const parameters = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["load", "say", "play", "segue", "next", "pause", "resume", "clear", "state"],
      description: "操作类型",
    },
    playlist: {
      type: "array",
      description: "播放列表（load 时使用），每个元素是 { type, ... } 对象",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["say", "play", "segue", "reason"] },
          text: { type: "string" },
          url: { type: "string" },
          name: { type: "string" },
          duration: { type: "number" },
          effect: { type: "string" },
          spk: { type: "string" },
          instruct: { type: "string" },
          refAudio: { type: "string" },
          refText: { type: "string" },
          translate: { type: "string" },
        },
        required: ["type"],
      },
    },
    text: { type: "string", description: "say 类型的文本内容" },
    spk: { type: "string", description: "说话人ID" },
    instruct: { type: "string", description: "情感指令" },
    url: { type: "string", description: "play 类型的音频URL" },
    name: { type: "string", description: "曲目名称" },
    duration: { type: "number", description: "segue 持续时间（毫秒）" },
    effect: { type: "string", description: "过渡效果（fade/silence）" },
    translate: { type: "string", description: "翻译文本（非中文时）" },
  },
  required: ["action"],
};

const TTL_MS = 30 * 60 * 1000; // 30 分钟

export class AudioBus {
  constructor(ctx) {
    this.ctx = ctx;
    this.dataDir = ctx.dataDir;
    this.queuePath = path.join(this.dataDir, "queue.json");
    this.statePath = path.join(this.dataDir, "bus-state.json");
    this.queue = [];
    this.current = null;
    this.history = [];
    this.status = "idle"; // idle | playing | error
    this._loadPersistent();
  }

  // ── 持久化 ──

  _loadPersistent() {
    try {
      if (fs.existsSync(this.queuePath)) {
        this.queue = JSON.parse(fs.readFileSync(this.queuePath, "utf-8"));
      }
    } catch (e) {
      console.warn("[bus] load queue failed:", e.message);
      this.queue = [];
    }
    try {
      if (fs.existsSync(this.statePath)) {
        const st = JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
        this.history = st.history || [];
        this.status = st.status || "idle";
      }
    } catch (e) {
      console.warn("[bus] load state failed:", e.message);
    }
  }

  _saveQueue() {
    try {
      const tmp = this.queuePath + ".tmp." + process.pid;
      fs.writeFileSync(tmp, JSON.stringify(this.queue, null, 2), "utf-8");
      fs.renameSync(tmp, this.queuePath);
    } catch (e) {
      console.warn("[bus] save queue failed:", e.message);
    }
  }

  _saveState() {
    try {
      const st = {
        status: this.status,
        current: this.current,
        history: this.history.slice(-100), // 只保留最近100条
        updatedAt: Date.now(),
      };
      const tmp = this.statePath + ".tmp." + process.pid;
      fs.writeFileSync(tmp, JSON.stringify(st, null, 2), "utf-8");
      fs.renameSync(tmp, this.statePath);
    } catch (e) {
      console.warn("[bus] save state failed:", e.message);
    }
  }

  // ── 协议解析 ──

  load(playlist) {
    if (!Array.isArray(playlist)) {
      return { ok: false, code: "bad_format", message: "playlist 必须是数组" };
    }
    this.queue = playlist.map((item) => this._normalize(item));
    this.current = null;
    this.status = "idle";
    this._saveQueue();
    this._saveState();
    return { ok: true, queue: this.queue };
  }

  _normalize(item) {
    const t = item.type || "play";
    const base = { type: t, id: item.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };

    switch (t) {
      case "say":
        return {
          ...base,
          text: item.text || "",
          spk: item.spk || "my_voice",
          instruct: item.instruct || "",
          translate: item.translate || "",
          refAudio: item.refAudio || "",
          refText: item.refText || "",
        };
      case "play":
        return {
          ...base,
          url: item.url || "",
          name: item.name || path.basename(item.url || "音频"),
          mode: item.mode || (item.url && item.url.startsWith("http") ? "在线" : "本地"),
        };
      case "segue":
        return {
          ...base,
          duration: item.duration || 3000,
          effect: item.effect || "silence",
        };
      case "reason":
        return {
          ...base,
          text: item.text || "",
        };
      default:
        return { ...base, text: String(item) };
    }
  }

  // ── 播放控制 ──

  async next() {
    if (!this.queue.length) {
      this.current = null;
      this.status = "idle";
      this._saveState();
      return { ok: true, event: "bus_idle" };
    }

    const item = this.queue.shift();
    this.current = item;
    this.status = "playing";
    this._saveQueue();
    this._saveState();

    // 触发事件
    const event = { event: "track_start", item };
    this.history.push({ ...item, playedAt: Date.now() });
    this._saveState();

    // 如果是 segue，自动等待后 next
    if (item.type === "segue") {
      setTimeout(() => this.next(), item.duration || 3000);
    }

    return { ok: true, event: "track_start", item };
  }

  pause() {
    this.status = "paused";
    this._saveState();
    return { ok: true, status: "paused" };
  }

  resume() {
    this.status = "playing";
    this._saveState();
    return { ok: true, status: "playing" };
  }

  clear() {
    this.queue = [];
    this.current = null;
    this.status = "idle";
    this._saveQueue();
    this._saveState();
    return { ok: true, event: "bus_idle" };
  }

  getState() {
    return {
      ok: true,
      status: this.status,
      current: this.current,
      queue: this.queue,
      history: this.history.slice(-20),
    };
  }

  // ── 便捷方法（供工具调用）──

  say(text, opts = {}) {
    const item = { type: "say", text, spk: opts.spk || "my_voice", instruct: opts.instruct || "", translate: opts.translate || "" };
    this.queue.push(item);
    this._saveQueue();
    // 如果当前 idle，自动启动
    if (this.status === "idle") return this.next();
    return { ok: true, queued: item, queueLength: this.queue.length };
  }

  play(url, opts = {}) {
    const item = { type: "play", url, name: opts.name || path.basename(url), mode: opts.mode || (url.startsWith("http") ? "在线" : "本地") };
    this.queue.push(item);
    this._saveQueue();
    if (this.status === "idle") return this.next();
    return { ok: true, queued: item, queueLength: this.queue.length };
  }
}

// ── 工具接口（供 Hanako 工具调用）──

let busInstance = null;

export function getBus(ctx) {
  if (!busInstance) busInstance = new AudioBus(ctx);
  return busInstance;
}

export async function execute(input, toolCtx) {
  const bus = getBus(toolCtx);
  const action = input.action || "state";

  switch (action) {
    case "load":
      return bus.load(input.playlist || []);
    case "say": {
      if (!input.text) return { ok: false, code: "missing_text", message: "say 需要 text" };
      return bus.say(input.text, { spk: input.spk, instruct: input.instruct, translate: input.translate });
    }
    case "play": {
      if (!input.url) return { ok: false, code: "missing_url", message: "play 需要 url" };
      return bus.play(input.url, { name: input.name, mode: input.mode });
    }
    case "next":
      return bus.next();
    case "pause":
      return bus.pause();
    case "resume":
      return bus.resume();
    case "clear":
      return bus.clear();
    case "state":
    default:
      return bus.getState();
  }
}

export { name, description, parameters };
