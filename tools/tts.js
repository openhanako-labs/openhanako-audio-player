import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const name = 'tts';
const description = '用 CosyVoice 本地模型合成语音（零样本克隆/情感控制），自动播放并加入播放列表。';

const parameters = {
  type: 'object',
  properties: {
    text: { type: 'string', description: '要合成的文本' },
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

/** 取插件数据目录：环境变量 > USERPROFILE > cwd */
function getDataDir() {
  if (process.env.HANAKO_AUDIO_PLAYER_DIR) return process.env.HANAKO_AUDIO_PLAYER_DIR;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) return path.join(home, '.hanako', 'plugin-data', 'hanako-audio-player');
  return path.join(process.cwd(), 'hanako-audio-player');
}

/** 查找 executor.py：优先插件源码目录，回退到数据目录 */
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
  // 兜底：返回 plugins 目录下的路径，即便不存在
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

  // run executor synchronously
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

  // 验证 executor 是否真的生成了输出（exit code 0 不代表成功）
  const outputFile = path.join(getDataDir(), 'media', `${taskId}.wav`);
  if (!fs.existsSync(outputFile)) {
    return {
      content: [{ type: 'text', text: '❌ TTS 合成失败：执行器未生成音频文件，请检查 CosyVoice 配置和日志' }],
    };
  }

  // after success, add to playlist
  const mediaDirForQueue = path.join(getDataDir(), 'media');
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
      fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
    } catch (_) {}
  }

  return {
    content: [{ type: 'text', text: `🎤 CosyVoice 合成「${trackName}」\n已加入播放器` }]
  };
}

export { name, description, parameters, execute };
