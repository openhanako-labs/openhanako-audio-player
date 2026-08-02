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
    translate: { type: 'string', description: '中文翻译（当text为非中文时提供，会显示在合成结果下方）' },
  },
  required: ['text'],
};

/** 查找 venv Python 解释器 */
function findVenvPython(cosyVoiceBase) {
  if (!cosyVoiceBase) return 'python';
  // 去除环境变量可能带的引号
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
  const fallback = path.join(home, '.hanako', 'plugins', pluginId, 'executor.py');
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(`executor.py 未找到，已扫描路径：\n  ${candidates.concat(fallback).join('\n  ')}`);
}

/** 检测文本是否包含非中文（如日文）字符 */
function hasNonChinese(text) {
  return /[\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]/.test(text) && !/^[\u4e00-\u9fff\uff00-\uffef\u3000-\u303f\s\w]+$/.test(text);
}

async function execute(input, { sessionPath, pluginId, dataDir }) {
  const text = input.text;
  const trackName = text.length > 20 ? text.slice(0, 20) + '…' : text;
  const translation = input.translate || '';

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
  const execEnv = { ...process.env, HANAKO_AUDIO_PLAYER_DIR: dataDir };
  if (cosyVoiceBase) execEnv.COSYVOICE_BASE = cosyVoiceBase;
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
  const outputFile = path.join(dataDir, 'media', `${taskId}.wav`);
  if (!fs.existsSync(outputFile)) {
    return {
      content: [{ type: 'text', text: `❌ TTS 合成失败：执行器已退出但未找到输出文件\n  taskId=${taskId}\n  wav=${outputFile}` }],
    };
  }

  // 写入 _names.json 映射（文件名 → 完整文本）
  const namesPath = path.join(dataDir, 'media', '_names.json');
  try {
    const namesMap = fs.existsSync(namesPath) ? JSON.parse(fs.readFileSync(namesPath, 'utf-8')) : {};
    namesMap[`${taskId}.wav`] = text;
    const tmpNames = namesPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpNames, JSON.stringify(namesMap, null, 2), 'utf-8');
    fs.renameSync(tmpNames, namesPath);
  } catch (e) { console.warn('[tts] _names.json write failed:', e.message); }

  // 加入播放队列
  const fileName = `${taskId}.wav`;
  const mediaUrl = `/api/plugins/${pluginId}/widget/media/${encodeURIComponent(fileName)}`;
  const queuePath = path.join(dataDir, 'queue.json');

  let queue = [];
  try {
    if (fs.existsSync(queuePath)) {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
    }
  } catch (e) { console.warn('[tts] queue read failed:', e.message); }
  if (!queue.some(t => t.url === mediaUrl)) {
    queue.push({ name: trackName, url: mediaUrl, mode: '本地' });
    try {
      const tmpPath = queuePath + '.tmp.' + process.pid;
      fs.writeFileSync(tmpPath, JSON.stringify(queue, null, 2), 'utf-8');
      fs.renameSync(tmpPath, queuePath);
    } catch (e) { console.warn('[tts] queue write failed:', e.message); }
  }

  // 构建回复文本
  const hasNonChineseText = hasNonChinese(text);
  let replyText = `🎤 CosyVoice 合成「${trackName}」`;
  
  // 如果是非中文语言且提供了翻译，附加翻译
  if (hasNonChineseText && translation) {
    replyText += `\n📖 ${translation}`;
  } else if (hasNonChineseText && !translation) {
    // 非中文但没给翻译，提示一下
    replyText += `\n💡 检测到非中文文本，可使用 translate="..." 参数添加翻译`;
  }

  // 对话内嵌卡片（使用 widget 路由绕过 /play 鉴权问题）
  const cardRoute = input.translate ? `/widget?action=play_file&file=${encodeURIComponent(fileName)}&translate=${encodeURIComponent(input.translate)}` : `/widget?action=play_file&file=${encodeURIComponent(fileName)}`;

  return {
    content: [{ type: 'text', text: replyText }],
    details: {
      card: { type: 'iframe', route: cardRoute, aspectRatio: '10:3' },
      media: { items: [] },
    },
  };
}

export { name, description, parameters, execute };
