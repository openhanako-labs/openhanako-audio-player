/**
 * hanako-audio-player/tools/tts-bus.js
 *
 * TTS 降级链 — L1: CosyVoice 本地 → L2: HTTP API → L3: 浏览器原生
 * 供 bus.js 调用，也可独立作为工具使用
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

const name = "tts_bus";
const description = "TTS 降级链：CosyVoice 本地 → HTTP API → 浏览器原生。自动降级，返回可播放音频URL或浏览器原生指令。";

const parameters = {
  type: "object",
  properties: {
    text: { type: "string", description: "要合成的文本", maxLength: 500 },
    spk: { type: "string", description: "说话人ID", default: "my_voice" },
    instruct: { type: "string", description: "情感指令" },
    refAudio: { type: "string", description: "参考音频路径（零样本克隆）" },
    refText: { type: "string", description: "参考文本" },
    translate: { type: "string", description: "翻译文本（非中文时）" },
    prefer: {
      type: "string",
      enum: ["auto", "cosyvoice", "http", "browser"],
      description: "优先使用哪一层（默认 auto 自动降级）",
      default: "auto",
    },
  },
  required: ["text"],
};

// ── 辅助函数（复用 tts.js 逻辑）──

function findVenvPython(cosyVoiceBase) {
  if (!cosyVoiceBase) return 'python';
  cosyVoiceBase = String(cosyVoiceBase).replace(/^["']|["']$/g, '');
  const candidates = [
    path.join(cosyVoiceBase, 'venv', 'Scripts', 'python.exe'),
    path.join(cosyVoiceBase, 'venv', 'Scripts', 'python'),
    path.join(cosyVoiceBase, 'venv', 'bin', 'python3'),
    path.join(cosyVoiceBase, 'venv', 'bin', 'python'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'python';
}

function findExecutor(pluginId) {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    path.join(home, ".hanako", "plugins", pluginId, "executor.py"),
    path.join(home, ".hanako", "plugin-data", pluginId, "executor.py"),
    path.join(process.cwd(), pluginId, "executor.py"),
  ];
  if (process.env.HANAKO_AUDIO_PLAYER_DIR) {
    candidates.unshift(path.join(process.env.HANAKO_AUDIO_PLAYER_DIR, "executor.py"));
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const fallback = path.join(home, ".hanako", "plugins", pluginId, "executor.py");
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(`executor.py 未找到，已扫描路径：\n  ${candidates.concat(fallback).join("\n  ")}`);
}

// ── 三层降级实现 ──

export class TTSBus {
  constructor(ctx) {
    this.ctx = ctx;
    this.pluginId = ctx.pluginId;
    this.dataDir = ctx.dataDir;
  }

  async synthesize(text, opts = {}) {
    const prefer = opts.prefer || "auto";
    let lastError = null;

    // 根据 prefer 决定执行顺序
    let layers = ["cosyvoice", "http", "browser"];
    if (prefer !== "auto") {
      layers = [prefer, ...layers.filter((l) => l !== prefer)];
    }

    for (const layer of layers) {
      try {
        switch (layer) {
          case "cosyvoice":
            return await this._cosyVoice(text, opts);
          case "http":
            return await this._httpTTS(text, opts);
          case "browser":
            return this._browserNative(text, opts);
        }
      } catch (e) {
        lastError = e;
        console.warn(`[TTS] ${layer} failed:`, e.message);
      }
    }

    // 全部失败
    return {
      ok: false,
      code: "all_failed",
      message: `所有 TTS 层均失败。最后错误: ${lastError?.message || "未知"}`,
    };
  }

  // L1: CosyVoice 本地 Python
  async _cosyVoice(text, opts) {
    const cosyVoiceBase = process.env.COSYVOICE_BASE;
    const venvPython = findVenvPython(cosyVoiceBase);

    const taskDir = path.join(this.dataDir, "tasks");
    fs.mkdirSync(taskDir, { recursive: true });

    const taskId = randomUUID().slice(0, 8);
    const task = {
      id: taskId,
      text,
      spk: opts.spk || "my_voice",
      refAudio: opts.refAudio || "",
      refText: opts.refText || "",
      instruct: opts.instruct || "",
      timestamp: Date.now(),
      status: "pending",
    };

    fs.writeFileSync(path.join(taskDir, `${taskId}.json`), JSON.stringify(task, null, 2), "utf-8");

    const executorPath = findExecutor(this.pluginId);
    const execEnv = { ...process.env, HANAKO_AUDIO_PLAYER_DIR: this.dataDir };
    if (cosyVoiceBase) execEnv.COSYVOICE_BASE = cosyVoiceBase;

    await execFileAsync(venvPython, [executorPath, "--input", taskId, "--mode", "auto"], {
      timeout: 120000,
      env: execEnv,
    });

    const outputFile = path.join(this.dataDir, "media", `${taskId}.wav`);
    if (!fs.existsSync(outputFile)) {
      throw new Error(`CosyVoice 执行完成但未找到输出文件: ${outputFile}`);
    }

    // 写入 _names.json 映射
    const namesPath = path.join(this.dataDir, "media", "_names.json");
    try {
      const namesMap = fs.existsSync(namesPath) ? JSON.parse(fs.readFileSync(namesPath, "utf-8")) : {};
      namesMap[`${taskId}.wav`] = text;
      const tmpNames = namesPath + '.tmp.' + process.pid;
      fs.writeFileSync(tmpNames, JSON.stringify(namesMap, null, 2), "utf-8");
      fs.renameSync(tmpNames, namesPath);
    } catch (e) { console.warn('[tts-bus] _names.json write failed:', e.message); }

    const mediaUrl = `/api/plugins/${this.pluginId}/widget/media/${encodeURIComponent(`${taskId}.wav`)}`;
    return {
      ok: true,
      layer: "cosyvoice",
      url: mediaUrl,
      filename: `${taskId}.wav`,
      taskId,
    };
  }

  // L2: HTTP TTS（预留接口）
  async _httpTTS(text, opts) {
    const httpUrl = process.env.TTS_HTTP_URL;
    if (!httpUrl) {
      throw new Error("TTS_HTTP_URL 未配置");
    }

    const res = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, spk: opts.spk, instruct: opts.instruct }),
    });

    if (!res.ok) {
      throw new Error(`HTTP TTS 返回 ${res.status}`);
    }

    const data = await res.json();
    if (!data.url) {
      throw new Error("HTTP TTS 响应缺少 url 字段");
    }

    return {
      ok: true,
      layer: "http",
      url: data.url,
      filename: data.filename || "",
    };
  }

  // L3: 浏览器原生（返回 special marker，前端处理）
  _browserNative(text, opts) {
    return {
      ok: true,
      layer: "browser",
      kind: "browser-native",
      text,
      opts: { spk: opts.spk, rate: opts.rate || 1, pitch: opts.pitch || 1 },
    };
  }
}

// ── 工具接口 ──

let ttsInstance = null;

export function getTTS(ctx) {
  if (!ttsInstance) ttsInstance = new TTSBus(ctx);
  return ttsInstance;
}

export async function execute(input, toolCtx) {
  const tts = getTTS(toolCtx);
  const result = await tts.synthesize(input.text, {
    spk: input.spk,
    instruct: input.instruct,
    refAudio: input.refAudio,
    refText: input.refText,
    translate: input.translate,
    prefer: input.prefer || "auto",
  });

  if (!result.ok) {
    return { content: [{ type: "text", text: `❌ TTS 失败：${result.message}` }] };
  }

  // 浏览器原生：返回前端指令
  if (result.kind === "browser-native") {
    return {
      content: [{ type: "text", text: `🗣️ 浏览器原生 TTS: ${input.text.slice(0, 50)}` }],
      details: {
        media: { items: [] },
        browserTTS: { text: result.text, opts: result.opts },
      },
    };
  }

  // 成功生成音频
  const mediaUrl = result.url;
  const cardRoute = `/widget?action=play_file&file=${encodeURIComponent(result.filename)}${input.translate ? "&translate=" + encodeURIComponent(input.translate) : ""}`;

  return {
    content: [{ type: "text", text: `🎤 ${result.layer === "cosyvoice" ? "CosyVoice" : "HTTP TTS"} 合成完成` }],
    details: {
      card: { type: "iframe", route: cardRoute, aspectRatio: "10:3" },
      media: { items: [] },
    },
  };
}

export { name, description, parameters };
