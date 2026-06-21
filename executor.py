#!/usr/bin/env python
"""
CosyVoice Executor — 处理 pending TTS 任务
用法: python executor.py --input <taskId> --mode auto

自动发现 CosyVoice 项目根目录（环境变量 COSYVOICE_BASE 可选）:
  COSYVOICE_BASE         CosyVoice 项目根目录（不设则自动搜索）
  COSYVOICE_MODEL_DIR    模型目录（默认 BASE/models/CosyVoice2-0.5B）
  HANAKO_AUDIO_PLAYER_DIR  插件数据目录（默认 ~/.hanako/plugin-data/hanako-audio-player）
"""
import sys
import os
import json
import argparse


# ── 自动发现 CosyVoice 项目根目录 ──
_COSYVOICE_CACHE = None


def _is_cosyvoice_dir(path):
    return os.path.isdir(os.path.join(path, 'src', 'cosyvoice'))


def find_cosyvoice_base():
    """从多个来源自动发现 CosyVoice 项目根目录，找到后缓存到配置文件"""
    global _COSYVOICE_CACHE
    if _COSYVOICE_CACHE:
        return _COSYVOICE_CACHE

    user_home = os.environ.get('USERPROFILE', os.environ.get('HOME', ''))
    cfg_path = os.path.join(
        os.environ.get('HANAKO_AUDIO_PLAYER_DIR', '')
        or os.path.join(user_home, '.hanako', 'plugin-data', 'hanako-audio-player'),
        'cosyvoice_base.txt'
    )

    # 1) 环境变量
    base = os.environ.get('COSYVOICE_BASE', '')
    if base and _is_cosyvoice_dir(base):
        _COSYVOICE_CACHE = base
        return base

    # 2) 缓存文件
    if os.path.exists(cfg_path):
        with open(cfg_path) as f:
            base = f.read().strip()
            if base and _is_cosyvoice_dir(base):
                _COSYVOICE_CACHE = base
                return base

    # 3) 向上搜索 cwd 及父目录（最多 5 层）
    cwd = os.getcwd()
    for _ in range(5):
        for name in ['cosyvoice-tts', 'CosyVoice', 'CosyVoice2']:
            d = os.path.join(cwd, name)
            if _is_cosyvoice_dir(d):
                _save_cosyvoice_base(cfg_path, d)
                _COSYVOICE_CACHE = d
                return d
        parent = os.path.dirname(cwd)
        if parent == cwd:
            break
        cwd = parent

    # 4) 用户目录下常见位置
    if user_home:
        for sub in ['cosyvoice-tts', 'CosyVoice', 'CosyVoice2']:
            for prefix in [user_home, os.path.join(user_home, '.hanako')]:
                d = os.path.join(prefix, sub)
                if _is_cosyvoice_dir(d):
                    _save_cosyvoice_base(cfg_path, d)
                    _COSYVOICE_CACHE = d
                    return d

    return ''


def _save_cosyvoice_base(cfg_path, path):
    try:
        os.makedirs(os.path.dirname(cfg_path), exist_ok=True)
        with open(cfg_path, 'w') as f:
            f.write(path)
    except:
        pass


# ── 路径解析 ──
BASE = find_cosyvoice_base()
if not BASE:
    print('[FATAL] 未找到 CosyVoice 项目目录', file=sys.stderr)
    print('[HINT] 设置环境变量 COSYVOICE_BASE=CosyVoice项目根目录，或将项目放在常用路径下', file=sys.stderr)
    sys.exit(1)

sys.path.insert(0, os.path.join(BASE, 'src'))
sys.path.insert(0, os.path.join(BASE, 'src/third_party/Matcha-TTS'))

from cosyvoice.cli.cosyvoice import AutoModel
import soundfile as sf
import torch

# ── 模型目录 ──
MODEL_DIR = os.environ.get('COSYVOICE_MODEL_DIR', '')
if not MODEL_DIR:
    for candidate in ['CosyVoice2-0.5B', 'CosyVoice3-0.5B', 'CosyVoice-300M']:
        d = os.path.join(BASE, 'models', candidate)
        if os.path.isdir(d):
            MODEL_DIR = d
            break
if not MODEL_DIR:
    print('[FATAL] 未找到模型目录，请设置 COSYVOICE_MODEL_DIR', file=sys.stderr)
    sys.exit(1)

# ── 注册说话人参考配置（用于零样本模式保留语气）──
SPEAKER_REFS_PATH = os.path.join(BASE, 'speaker_refs.json')

def load_speaker_refs():
    """加载说话人参考音频配置，用于零样本模式取代 SFT"""
    try:
        if os.path.exists(SPEAKER_REFS_PATH):
            with open(SPEAKER_REFS_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    return {}

# ── 插件数据目录 ──
USER_HOME = os.environ.get('USERPROFILE', os.environ.get('HOME', ''))

# ── 预检查 whisper 可用性 ──
_WHISPER_OK = False
try:
    import whisper
    _WHISPER_OK = True
except ImportError:
    pass

PLUGIN_DATA = os.environ.get(
    'HANAKO_AUDIO_PLAYER_DIR',
    os.path.join(USER_HOME, '.hanako', 'plugin-data', 'hanako-audio-player')
)

TASK_DIR = os.path.join(PLUGIN_DATA, 'tasks')
MEDIA_DIR = os.path.join(PLUGIN_DATA, 'media')
os.makedirs(MEDIA_DIR, exist_ok=True)

_model = None
_speaker_refs = None

def get_model():
    global _model
    if _model is None:
        print(f'加载 CosyVoice 模型 [{MODEL_DIR}] ...', file=sys.stderr)
        _model = AutoModel(model_dir=MODEL_DIR, fp16=True)
        print(f'模型就绪 | CUDA: {torch.cuda.is_available()}', file=sys.stderr)
    return _model

def get_speaker_ref(spk_name):
    """查找说话人对应的参考音频配置（支持中英文 ID 匹配）"""
    global _speaker_refs
    if _speaker_refs is None:
        _speaker_refs = load_speaker_refs()
    # 直接匹配
    if spk_name in _speaker_refs:
        return _speaker_refs[spk_name]
    # 中文名→英文名映射查找
    cn_to_en = {
        '洛琪希': 'luoqixi', '艾莉丝': 'alice', '瑞贝卡': 'rebecca',
        '爱弥斯': 'aimis', '奥菲莉娅': 'ophelia', '我的声音': 'my_voice',
    }
    en_name = cn_to_en.get(spk_name, '')
    if en_name and en_name in _speaker_refs:
        return _speaker_refs[en_name]
    return None

def process_task(task_id):
    task_path = os.path.join(TASK_DIR, f'{task_id}.json')
    if not os.path.exists(task_path):
        print(f'[ERROR] 任务文件不存在: {task_path}', file=sys.stderr)
        return False

    with open(task_path, 'r', encoding='utf-8') as f:
        task = json.load(f)

    text = task.get('text', '')
    spk = task.get('spk', 'my_voice')
    ref_audio = task.get('refAudio', '')
    ref_text = task.get('refText', '')
    instruct = task.get('instruct', '')

    # ── 自动转录 ──
    if ref_audio and not ref_text and os.path.exists(ref_audio):
        print(f'[转录] 参考音频无文本，自动 Whisper 转录: {ref_audio}', file=sys.stderr)
        if not _WHISPER_OK:
            print('[转录失败] whisper 未安装。请运行: pip install openai-whisper', file=sys.stderr)
        else:
            try:
                wm = whisper.load_model('base')
                wr = wm.transcribe(ref_audio, language='zh')
                ref_text = wr['text'].strip()
                print(f'[转录] 结果: {ref_text}', file=sys.stderr)
                task['refText'] = ref_text
                with open(task_path, 'w', encoding='utf-8') as f:
                    json.dump(task, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f'[转录失败] {e}', file=sys.stderr)
    tid = task.get('id', task_id)

    if not text:
        print('[ERROR] 空文本', file=sys.stderr)
        return False

    output_path = os.path.join(MEDIA_DIR, f'{tid}.wav')
    cosy = get_model()
    spk_list = list(cosy.frontend.spk2info.keys())

    if ref_audio and ref_text and os.path.exists(ref_audio):
        # 用户显式传入参考 → 零样本
        print(f'[零样本克隆] 参考: {ref_audio}', file=sys.stderr)
        result = cosy.inference_zero_shot(text, ref_text, ref_audio, stream=False)
    elif instruct and spk in spk_list:
        print(f'[Instruct] spk: {spk} | {instruct}', file=sys.stderr)
        result = cosy.inference_instruct(text, spk, instruct, stream=False)
    elif spk in spk_list:
        print(f'[SFT] spk: {spk}', file=sys.stderr)
        result = cosy.inference_sft(text, spk, stream=False)
    elif spk_list:
        spk = spk_list[0]
        print(f'[fallback] 说话人: {spk}', file=sys.stderr)
        result = cosy.inference_sft(text, spk, stream=False)
    else:
        print('[ERROR] 无可用说话人', file=sys.stderr)
        return False

    for item in result:
        audio = item['tts_speech']
        arr = audio.squeeze().cpu().numpy()
        sf.write(output_path, arr, cosy.sample_rate)
        duration = audio.shape[-1] / cosy.sample_rate
        print(f'输出: {output_path}', file=sys.stderr)
        print(f'时长: {duration:.1f}s', file=sys.stderr)

        task['status'] = 'completed'
        task['output'] = output_path
        task['duration'] = round(duration, 1)
        with open(task_path, 'w', encoding='utf-8') as f:
            json.dump(task, f, ensure_ascii=False, indent=2)
        return True

    return False

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='任务 ID')
    parser.add_argument('--mode', default='auto')
    args = parser.parse_args()

    ok = process_task(args.input)
    if ok:
        print(f'[DONE] {args.input}.wav')
        sys.exit(0)
    else:
        print(f'[FAILED] {args.input}', file=sys.stderr)
        sys.exit(1)
