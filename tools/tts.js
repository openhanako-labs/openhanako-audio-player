import fs from 'node:fs';
import path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const execFile = promisify(execFileCb);

const name = 'tts';
const description = '用 CosyVoice 本地模型合成语音（零样本克隆/情感控制），自动播放并加入播放列表';

const parameters = {
  type: 'object',
  properties: {
    text: { type: 'string', description: '要合成的文本（最大 500 字符）', maxLength: 500 },
    spk: { type: 'string', description: '说话人ID（需先克隆）', default: 'my_voice' },
    refAudio: { type: 'string', description: '参考音频路径（零样本克隆时必填）' },
    refText: { type: 'string', description: '参考文本（零样本克隆时必填）' },
    instruct: { type: 'string', description: '情感指令：开心/温柔/低沉/激动 等' },
  },
  required: ['text'],
};

/** 查找 venv Python 解释器 */
function findVenvPython(cosyVoiceBase) {
  if (!cosyVoiceBase) return 'python';
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

/** 取插件数据目录 */
function getDataDir() {
  if (process.env.HANAKO_AUDIO_PLAYER_DIR) return process.env.HANAKO_AUDIO_PLAYER_DIR;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return path.join(home, '.hanako', 'plugin-data', 'hanako-audio-player');
}

/** 查找 executor.py */
function findExecutor(pluginId) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, '.hanako', 'plugins', pluginId, 'executor.py'),
    path.join(home, '.hanako', 'plugin-data', pluginId, 'executor.py'),
    path.join(process.cwd(), pluginId, 'executor.py'),
  ];
  if (process.env.HANAKO_AUDIO_PLAYER_DIR) {
    candidates.unshift(path.join(process.env.HANAKO_AUDIO_PLAYER_DIR, 'executor.py'));
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(home, '.hanako', 'plugins', pluginId, 'executor.py');
}

async function execute(input, { sessionPath, pluginId }) {
  const text = input.text;
  const trackName = text.length > 20 ? text.slice(0, 20) + '…' : text;

  const dataDir = getDataDir();
  const taskDir = path.join(dataDir, 'tasks');
  fs.mkdirSync(taskDir, { recursive: true });

  const taskId = randomUUID().slice(0, 8);
  const task = {
    id: taskId,
    text: input.text,
    spk: input.spk || 'my_voice',
    refAudio: input.refAudio || '',
    refText: input.refText || '',
    instruct: input.instruct || '',
    timestamp: Date.now(),
    status: 'pending',
  };

  fs.writeFileSync(path.join(taskDir, `${taskId}.json`), JSON.stringify(task, null, 2), 'utf-8');

  // run executor
  const executorPath = findExecutor(pluginId);
  const cosyVoiceBase = process.env.COSYVOICE_BASE;
  const venvPython = findVenvPython(cosyVoiceBase);
  const execEnv = cosyVoiceBase ? { ...process.env, COSYVOICE_BASE: cosyVoiceBase } : process.env;
  try {
    await execFile(venvPython, [executorPath, '--input', taskId, '--mode', 'auto'], {
      timeout: 120000,
      env: execEnv,
    });
  } catch (e) {
    return {
      content: [{ type: 'text', text: `❌ TTS 合成失败：${e.message}` }],
    };
  }

  // 验证输出文件
  const outputFile = path.join(getDataDir(), 'media', `${taskId}.wav`);
  if (!fs.existsSync(outputFile)) {
    return {
      content: [{ type: 'text', text: `❌ TTS 合成失败：执行器已退出但未找到输出文件\n  taskId=${taskId}\n  wav=${outputFile}` }],
    };
  }

  // 加入播放队列
  const fileName = `${taskId}.wav`;
  const mediaUrl = `/api/plugins/${pluginId}/widget/media/${encodeURIComponent(fileName)}`;
  const queuePath = path.join(getDataDir(), 'queue.json');

  let queue = [];
  try {
    if (fs.existsSync(queuePath)) {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
    }
  } catch (_) {}
  if (!queue.some(t => t.url === mediaUrl)) {
    queue.push({ name: trackName, url: mediaUrl, mode: '本地' });
    try {
      const tmpPath = queuePath + '.tmp.' + process.pid;
      fs.writeFileSync(tmpPath, JSON.stringify(queue, null, 2), 'utf-8');
      fs.renameSync(tmpPath, queuePath);
    } catch (_) {}
  }

  // 对话内嵌卡片
  const cardRoute = `/play?file=${encodeURIComponent(fileName)}`;

  return {
    content: [{ type: 'text', text: `🎤 CosyVoice 合成「${trackName}」` }],
    details: {
      card: { type: 'iframe', route: cardRoute, aspectRatio: '10:3' },
      media: { items: [] },
    },
  };
}

export { name, description, parameters, execute };
