/**
 * hanako-audio-player/index.js
 * 播放器插件入口
 */
import fs from "node:fs";
import path from "node:path";

export default class HanakoAudioPlayerPlugin {
  async onload() {
    const { dataDir, log } = this.ctx;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(path.join(dataDir, "media"), { recursive: true });
    fs.mkdirSync(path.join(dataDir, "tasks"), { recursive: true });
    log.info("hanako-audio-player plugin loaded");
  }
}
