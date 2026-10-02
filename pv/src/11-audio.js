/* PV 引擎 · ③ 音频驱动
 * 生产者，不是消费者：把频谱变成 PV.audio.energy / beat / bpm，供 fx 与件读。
 *
 * 数据源优先复用 App 已有的那条链——core 的 startReactiveLoop() 每帧把 analyser 的
 * 频谱摊到 window.__reactiveBins（零拷贝，同一个 buffer）。
 * 没有它（音频反应被关掉 / 独立预览台）才自建图。
 *
 * 归谁接 <audio>：core 与 PV 都靠 createMediaElementSource 接同一个元素，而一个元素只能接一次，
 * 谁先接谁赢。实测就是 PV 先接、把 core 的链顶掉了。所以只要用户开了音频反应，就让位给 core，
 * PV 只读它摊出来的频谱；等了 6s 频谱还没来（CORS 之类）才自建。
 *
 * 拍点检测：高通能量 → 自适应阈值的 onset → IOI 直方图定周期 → 相位锁定跟随。
 * 拍网格用歌自己的时钟（媒体时间），不用墙钟：拖进度条、暂停、变速都不该让相位漂走。
 */
(function () {
  'use strict';
  var PV = window.PV;

  var A = {
    on: false, mode: null,           // 'host' 复用 core / 'own' 自建 / 'none'
    ticks: 0,
    energy: 0, low: 0, mid: 0, high: 0,
    bpm: 0, confidence: 0,
    beat: null,                      // {since, len, index}
    time: null,                      // ms，扫光层的驱动时刻
    _onsets: [], _last: 0, _idx: 0, _period: 0, _grid: 0
  };
  Object.assign(PV.audio, A);

  /* ---------- 自建图 ---------- */
  var own = { actx: null, an: null, data: null, failed: false, err: null };

  PV.audio.stats = function () {
    return {
      on: A.on, mode: A.mode, ticks: A.ticks, energy: +A.energy.toFixed(3),
      bpm: +A.bpm.toFixed(1), confidence: +A.confidence.toFixed(2),
      beat: A.beat ? +A.beat.since.toFixed(3) : null, period: +A._period.toFixed(3),
      failed: !!own.failed, err: own.err,
      onsets: A._onsets.length, flux: +flux.toFixed(4),
      bins: own.data ? Array.prototype.slice.call(own.data, 0, 8).join(',') : null
    };
  };
  /* 诊断：阈值实时值（调参时用，不依赖它） */
  PV.audio.diag = function () {
    return { onsets: A._onsets.length, flux: +flux.toFixed(4), thr: +(PV.audio._thr || 0).toFixed(4),
      period: +A._period.toFixed(3), bpm: +A.bpm.toFixed(1), conf: +A.confidence.toFixed(2),
      rebases: PV.audio._rebases || 0, clock: clockMode, t: +(PV.audio.time || 0).toFixed(0) };
  };

  function audioEl() { return document.getElementById('audio') || document.querySelector('audio'); }

  /* 只对同源 / blob 源建图：给跨源无 CORS 的元素接 MediaElementSource，Chrome 会直接静音 */
  function ownableAudio() {
    var el = audioEl();
    if (!el) return null;
    var s = el.currentSrc || el.src;
    if (!s) return el;
    try {
      if (/^(blob|data):/i.test(s)) return el;
      var u = new URL(s, location.href);
      return u.origin === location.origin ? el : null;
    } catch (e) { return null; }
  }

  function hostWanted() {
    try { return localStorage.getItem('hana_audio_reactive') === '1'; } catch (e) { return false; }
  }
  var hostWaitSince = 0;
  function mayBuildOwn() {
    if (!hostWanted()) return true;
    var el = audioEl();
    /* 用户开了音频反应：core 有权接这个元素。没在播的时候它还没机会建，更不能抢。 */
    if (!el || el.paused) return false;
    if (!hostWaitSince) hostWaitSince = performance.now();
    return performance.now() - hostWaitSince > 4000;   // 播了 4s 还没频谱，那条链负不了责，PV 自建
  }

  /* 让位窗口以“真的要播了”为起点：core 的链是在 play 事件里才建的，
   * 从进 PV 那刻开始计时会把窗口白白耗掉（实测就是这样抢先接了元素，把 core 顶死）。 */
  function anchorHostWait() {
    var el = audioEl();
    if (!el || el._pvAnchor) return;
    el._pvAnchor = true;
    ['play', 'loadstart', 'srcchange'].forEach(function (ev) {
      el.addEventListener(ev, function () { hostWaitSince = performance.now(); }, false);
    });
  }

  function ownFrame() {
    if (own.failed) return null;
    if (own.actx && own.actx.state !== 'running' && own.actx.resume) own.actx.resume().catch(function () { });
    if (own.an) {
      /* 自建这条没人替我们填 buffer，core 那条是它的循环在填 */
      try { own.an.getByteFrequencyData(own.data); } catch (e) { own.err = 'getByte: ' + e.message; return null; }
      return own.data;
    }
    if (!mayBuildOwn()) return null;
    var el = ownableAudio();
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!el || !AC) return null;
    try {
      var actx = own.actx || (own.actx = new AC());
      var src = actx.createMediaElementSource(el);     // 同一元素第二次调必抛，所以只在这里建
      var an = actx.createAnalyser();
      an.fftSize = 128; an.smoothingTimeConstant = 0.6;
      src.connect(an); an.connect(actx.destination);
      own.an = an; own.data = new Uint8Array(an.frequencyBinCount);
      A.mode = 'own';
      try { own.an.getByteFrequencyData(own.data); } catch (e) { }
      return own.data;
    } catch (e) {
      own.err = String((e && e.name) + ': ' + (e && e.message));
      own.failed = true;
      return null;
    }
  }

  /* ---------- 统计工具 ---------- */
  var hist = [], HP = 45;             // 高通增量历史（约 1s）
  var rawWin = [], RAW_N = 90;        // raw 能量滚动窗口
  var flux = 0, prev = 0, pend = null;   // pend：待确认的 onset 峰

  function band(bins, from, to) {
    var s = 0, n = 0;
    for (var i = from; i < to && i < bins.length; i++) { s += bins[i]; n++; }
    return n ? s / n / 255 : 0;
  }
  function pAt(arr, q) {
    if (!arr.length) return 0;
    var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; });
    return a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * q)))];
  }
  function wall() { return performance.now() / 1000; }

  /* 时间基准一换（媒体时钟↔墙钟）或出现跳变（拖进度条），旧 onset 与网格全部作废重定基。
   * 不重定基的话 since 会变成负数——实测踩过。 */
  var clockMode = null, prevT = null;
  function rebase(t) {
    A._grid = t; A._onsets = []; A._period = 0; A.bpm = 0; A.confidence = 0; A.beat = null;
    hist.length = 0; rawWin.length = 0; prevT = t; pend = null;
    PV.audio._rebases = (PV.audio._rebases || 0) + 1;
  }
  function clock() {
    var el = audioEl();
    var playing = !!(el && !el.paused && isFinite(el.currentTime));
    var mode = playing ? 'media' : 'wall';
    if (mode !== clockMode) { clockMode = mode; rebase(playing ? el.currentTime : wall()); }
    var t = playing ? el.currentTime : wall();
    /* 跳变（拖动进度条）只在媒体时钟上判：墙钟的帧间隔本来就随刷新率变，
     * 后台标签页 rAF 被节流到 ~1Hz 时，每帧都会“跳”过 0.5s——实测把 onset 历史刷到每帧清零 */
    if (mode === 'media' && prevT != null && Math.abs(t - prevT) > 0.5) rebase(t);
    else prevT = t;
    return t;
  }

  /* 周期与拍点：不猜绝对 BPM，直接用检到的 onset 当拍。
   * 理由：网格命中法会跳——长周期的容差 (0.18×period) 会把八分音符全罩住，
   * “取最长达标周期”就一路漂到 1s（实测在 176→64→79→160 之间跳）；
   * IOI 直方图又消不了八度歧义。而视觉脉冲只需要“踩在每个瞬态上”，
   *  subdivision 错了仍然是音乐上对得上的。bpm 就当估计值报，不当目标。 */
  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[Math.floor(a.length / 2)];
  }
  function regularity(iois, med) {
    if (!iois.length || !med) return 0;
    var s = 0;
    for (var i = 0; i < iois.length; i++) s += Math.pow(iois[i] - med, 2);
    var sd = Math.sqrt(s / iois.length);
    return Math.max(0, Math.min(1, 1 - sd / (med * 0.6)));
  }
  function estimatePeriod(onsets) {
    if (onsets.length < 6) return 0;
    var iois = [];
    for (var i = 1; i < onsets.length; i++) {
      var d = onsets[i] - onsets[i - 1];
      if (d > 0.12 && d < 1.6) iois.push(d);
    }
    if (iois.length < 5) return 0;
    if (iois.length > 16) iois = iois.slice(-16);
    var med = median(iois);
    return { period: Math.max(0.24, Math.min(1.6, med)), reg: regularity(iois, med) };
  }

  /* onset 到达时直接把时间存下来；拍网格已简化为“距上一个瞬态”（见下） */

  PV.audioTick = function () {
    if (!A.on) return;
    A.ticks++;
    /* 行时刻先取：频谱不可用时（音频反应关了 / 跨源在线音源），扫光照样要有时间轴 */
    var au = audioEl();
    if (au && isFinite(au.currentTime)) { A.time = au.currentTime * 1000; PV.audio.time = A.time; }

    var bins = null;
    if (window.__reactiveReady && window.__reactiveBins) { bins = window.__reactiveBins; A.mode = 'host'; }
    else bins = ownFrame();
    if (!bins) {
      A.mode = A.mode || 'none'; A.energy = 0; A.beat = null;
      PV.audio.energy = null; PV.audio.beat = null; return;
    }

    var n = bins.length;
    /* 暂停状态下不判拍：频谱是静态的，硬算只会从平滑尾巴里编出假 onset；
     * 也免得 media↔wall 来回切将历史抹掉 */
    if (au && au.paused && au.currentTime > 0) {
      A.energy = 0; A.beat = null; A.confidence = 0;
      Object.assign(PV.audio, { energy: 0, beat: null, confidence: 0, time: A.time });
      return;
    }
    var low = band(bins, 0, Math.max(1, Math.floor(n * 0.12)));
    var mid = band(bins, Math.floor(n * 0.12), Math.floor(n * 0.45));
    var high = band(bins, Math.floor(n * 0.45), n);
    A.low = low; A.mid = mid; A.high = high;

    /* 能量：字节频谱很容易饱和（嗑鼓时低段直接顶 255）。拿最大值或单一 p95 当满量程，
     * 连续响的材料会长期贴在 1（实测踩过）；改成 p10..p95 的百分位区间归一化。 */
    var raw = low * 0.55 + mid * 0.3 + high * 0.15;
    rawWin.push(raw);
    if (rawWin.length > RAW_N) rawWin.shift();
    var lo = pAt(rawWin, 0.1), hi = pAt(rawWin, 0.95);
    A.energy = Math.max(0, Math.min(1, (raw - lo) / Math.max(0.035, hi - lo)));

    /* onset：高通能量的正增量超过近期均值 + 1.4σ，且与上一个至少隔 0.11s */
    var hp = low * 0.35 + mid * 0.45 + high * 0.2;
    flux = Math.max(0, hp - prev); prev = hp;
    hist.push(flux);
    if (hist.length > HP) hist.shift();
    var m = 0, q;
    for (q = 0; q < hist.length; q++) m += hist[q];
    m /= Math.max(1, hist.length);
    var sd = 0;
    for (q = 0; q < hist.length; q++) sd += Math.pow(hist[q] - m, 2);
    sd = Math.sqrt(sd / Math.max(1, hist.length));

    var t = clock();
    PV.audio._thr = m + 2 * sd;
    /* 静默不该产生 onset：实测音频放完之后，能从平滑衰减的尾巴里编出 194 BPM */
    var silent = raw < 0.02 || (au && au.paused);
    /* onset 门限：相对阈值 + 相对峰值 + 绝对地板 + 最短间隔。
     * 只用均值+kσ 会被宽带噪声喂饱：实测带 4% 白噪声的测试音里，中位 IOI 被压到 0.26s → 229 BPM。
     * 峰值门限（须达近期最大 flux 的 40%）才是“真瞬态”战“连续小抖动”的分水岭。 */
    var maxF = 0;
    for (var y = 0; y < hist.length; y++) if (hist[y] > maxF) maxF = hist[y];

    /* 峰选取：嗑鼓的衰减与噪声会在同一个拍上造成两个峰，周期就折了一半
     * （实测 96 BPM 的纯正拍测试音报出 0.318s → 189）。候选延后 0.18s 确认：
     * 窗口里若有更大的峰就替换。视觉脉冲用 0.18s 检测延迟看不出来。 */
    var cand = flux > m + 2 * sd && flux > maxF * 0.4 && flux > 0.02 && hp > 0.05 && !silent;
    if (cand && (!pend || flux > pend.flux)) pend = { t: t, flux: flux };
    if (pend && t - pend.t >= 0.18) {
      var p0 = pend; pend = null;
      if (p0.t - A._last > 0.2) { A._last = p0.t; A._onsets.push(p0.t); A._idx++; }
    }
    if (A._onsets.length > 40) A._onsets.splice(0, A._onsets.length - 40);

    var est = silent ? null : estimatePeriod(A._onsets);
    if (est && est.period) {
      /* 周期慢变，稳定性当置信度 */
      A._period = A._period ? A._period * 0.85 + est.period * 0.15 : est.period;
      A.bpm = 60 / A._period;
      A.confidence = est.reg;
    }
    if (A._period && !silent) {
      var since = t - A._last;                        // 距上一个瞬态：天然零漂移
      A.beat = { since: since, len: A._period, index: A._idx };
      if (since > A._period * 4) { A.beat = null; A.confidence = 0; }   // 瞬态断了就失效
    } else { A.beat = null; }
    if (silent) { A.beat = null; A.confidence = 0; A.energy = 0; }
    Object.assign(PV.audio, {
      energy: A.energy, beat: A.beat, bpm: A.bpm, time: A.time, confidence: A.confidence,
      low: A.low, mid: A.mid, high: A.high
    });
  };

  /* ---------- fx 随能量浮动 ----------
   * 同一套件在副歌和主歌里力度不同。PV.audioModulate=false 可关。
   * 面板/预览台改滑块要写 PV.setFxBase，直接改 PV.fx 会被下一帧的调制覆掉。 */
  var base = null;
  PV.audioModulate = true;

  PV._fxBaseChanged = function () {          // 气氛一换，基准重设成该气氛的预设
    var m = PV.mood && PV.part('mood', PV.mood);
    base = Object.assign({}, PV.fx);
    if (m && m.fx) Object.keys(m.fx).forEach(function (k) { base[k] = m.fx[k]; PV.fx[k] = m.fx[k]; });
  };

  function applyModulate() {
    if (!base) base = Object.assign({}, PV.fx);
    if (PV.audioModulate === false) { Object.assign(PV.fx, base); return; }
    var e = PV.audio.energy || 0;
    PV.fx.motion = Math.min(1, base.motion * (0.65 + 0.55 * e) + 0.08 * e);
    PV.fx.chroma = Math.min(1, base.chroma + e * 0.28);
    PV.fx.glitch = Math.min(1, base.glitch + (e > 0.75 ? (e - 0.75) * 0.9 : 0));
  }

  PV.setFxBase = function (k, v) {
    if (!base) base = Object.assign({}, PV.fx);
    if (typeof k === 'object') Object.keys(k).forEach(function (x) { base[x] = k[x]; });
    else base[k] = v;
    applyModulate();
    return PV.fx;
  };
  PV.restoreFxBase = function () { if (base) Object.assign(PV.fx, base); };

  PV.audioStart = function () {
    if (A.on) return;
    A.on = true; hostWaitSince = 0;
    anchorHostWait();
    PV.dispatch('pv:audio', { on: true });
  };
  PV.audioStop = function () {
    A.on = false; A.ticks = 0; A.mode = null;
    A.beat = null; A.energy = 0; A.bpm = 0; A.confidence = 0;
    rebase(0);
    A._idx = 0; clockMode = null;
    Object.assign(PV.audio, { energy: null, beat: null, bpm: 0, confidence: 0, time: null });
    if (base) Object.assign(PV.fx, base);
    if (own.actx) { try { own.actx.suspend(); } catch (e) { } }
  };

  /* 挂到引擎的帧循环上，不另开 rAF */
  PV.onFrame(function () { PV.audioTick(); applyModulate(); });
})();
