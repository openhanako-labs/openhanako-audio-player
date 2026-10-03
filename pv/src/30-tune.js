/* PV 引擎 · 30 调参（⑲）
 *
 * 三件东西，都是为了让"观感"能被调，而不是每次让我改代码：
 *   1) 近窗去重 PV.dedupe —— 同类件在近 N 段里不重复抽（修"连着几段一个样"）
 *   2) 档位 PV.tune('quiet'|'balanced'|'rich'|'wild') —— 一次改一组旋钮并落到 localStorage
 *   3) 体检式报告 PV.tuneReport(n) —— 把"撞脸率 / 平均装饰数 / 入场占用"量成数字
 *
 * 旋钮只认这几种长期偏好：bgSwap、decorMax、treatMax、dedupe、rolling。
 * 强度 fx 不在这里动——那个归气氛与音频调制（③），动它会和气氛预设打架。
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* ---------- 1 近窗去重 ---------- */
  /* 只保留有证据的：版式。
   * bg / look 的窗口实测白搭——背景连着重复的主因是 bgSwap 粘住上一件
   * （0.45 概率不换 ≈ 55% 保持），那条路径**不走抽签**，窗口根本管不到；
   * 实测开关窗口都是 52.3%，而把 bgSwap 推到 1 就呷到 0.0%——
   * 说明背景的重复归 bgSwap 管，不归去重管。造一个作不了用的旋钮，
   * 比没有旋钮更糟（fx.decor 那次就是这个病）。*/
  PV.dedupe = { layout: 6, bg: 0, look: 0, camera: 0, enter: 0, exit: 0, transition: 0, hold: 0 };

  PV.recordRecent = function (plan) {
    var S = PV.S;
    if (!S.recent) return;
    Object.keys(PV.dedupe).forEach(function (g) {
      var p = plan[g];
      if (!p) return;
      var arr = S.recent[g] || (S.recent[g] = []);
      if (arr[arr.length - 1] !== p.key) arr.push(p.key);
      /* 满长时要从**队首**丢。上一版写的 `arr.length = keep` 是在 push 之后截尾，
       * 正好把刚加进去的那个删掉——窗口在前 N 次之后就冻结了，
       * 后面的抽取全部在和一串陈旧名单比，去重形同没接。*/
      var keep = Math.max(PV.dedupe[g] || 0, 8) + 2;
      if (arr.length > keep) arr.splice(0, arr.length - keep);
    });
  };
  PV.recentOf = function (g) { return (PV.S.recent && PV.S.recent[g]) || []; };
  PV.clearRecent = function () {
    var S = PV.S;
    Object.keys(S.recent).forEach(function (g) { S.recent[g] = []; });
    S.lastLayout = '';
  };

  /* ---------- 2 档位 ---------- */
  var PRESETS = {
    quiet: {
      nm: '静', bgSwap: 0.22, decorMax: 1, treatMax: 0,
      rolling: { camera: false, hold: false }, dedupe: { layout: 8 }
    },
    balanced: {
      nm: '均衡', bgSwap: 0.45, decorMax: 2, treatMax: 1,
      rolling: { camera: true, hold: true }, dedupe: { layout: 6 }
    },
    rich: {
      nm: '满', bgSwap: 0.6, decorMax: 3, treatMax: 1,
      rolling: { camera: true, hold: true }, dedupe: { layout: 4 }
    },
    wild: {
      nm: '乱', bgSwap: 1, decorMax: 3, treatMax: 2,
      rolling: { camera: true, hold: true }, dedupe: { layout: 1 }
    }
  };
  PV.PRESETS = PRESETS;

  PV.tune = function (name) {
    var p = PRESETS[name || PV.tuneName || 'balanced'];
    if (!p) return null;
    PV.tuneName = name || PV.tuneName;
    if (p.bgSwap != null) PV.bgSwap = p.bgSwap;
    if (p.decorMax != null) PV.decorMax = p.decorMax;
    if (p.treatMax != null) PV.treatMax = p.treatMax;
    if (p.rolling) Object.keys(p.rolling).forEach(function (k) { if (k in PV.rolling) PV.rolling[k] = p.rolling[k]; });
    if (p.dedupe) Object.keys(p.dedupe).forEach(function (k) { if (k in PV.dedupe) PV.dedupe[k] = p.dedupe[k]; });
    try { localStorage.setItem('pv_tune', PV.tuneName); } catch (e) { }
    return p.nm;
  };

  /* 开机把上次的档位贴回来。App 里默认 balanced——
   * 静/满是偏好，不该由引擎擅自替用户选。*/
  PV.tuneRestore = function () {
    var n = null;
    try { n = localStorage.getItem('pv_tune'); } catch (e) { }
    if (!n || !PRESETS[n]) n = 'balanced';
    PV.tune(n);
    return n;
  };

  /* ---------- 3 报告：把观感量成数字 ---------- */
  PV.tuneReport = function (n) {
    n = n || 300;
    var L = PV.lyrics();
    if (!L.length) return { 说明: '没有歌词表，先 PV.setLyrics 或在 App 里放歌' };
    var savedSeed = PV.seedValue ? PV.seedValue() : null;
    var seq = { layout: [], bg: [], look: [] }, dupe = { layout: 0, bg: 0, look: 0 };
    var win = { layout: 0, bg: 0 };          // 近 N 段窗口内的重复（去重真正管的是这个，不是“紧邻”）
    var decorSum = 0, treatSum = 0, entSum = 0, entOver = 0, cuts = 0;
    for (var i = 0; i < n; i++) {
      PV.seed(100000 + i * 7);
      var p = PV.show(i % L.length, { force: true });
      if (!p) continue;
      cuts++;
      ['layout', 'bg', 'look'].forEach(function (g) {
        var k = p[g] ? p[g].key : '—';
        var prevKey = seq[g][seq[g].length - 1];
        if (prevKey && prevKey === k) dupe[g]++;
        if (g === 'layout' || g === 'bg') {
          var w = g === 'layout' ? (PV.dedupe.layout || 6) : (PV.bgSwap < 1 ? 3 : 0);
          if (w > 0 && seq[g].slice(Math.max(0, seq[g].length - w)).indexOf(k) >= 0) win[g]++;
        }
        seq[g].push(k);
      });
      decorSum += (p.decor || []).length;
      treatSum += (p.treatment || []).length;
      var cost = (p.enter && p.enter.dur || 400) + (p.ctx.stagger || 45) * Math.max(0, (p.ctx.tokens || []).length - 1);
      var avail = (p.ctx.t1 || 0) - (p.ctx.t0 || 0);
      entSum += avail > 0 ? cost / avail : 0;
      if (avail > 0 && cost > avail * 0.9) entOver++;
    }
    if (savedSeed != null) PV.seed(savedSeed);
    var pct = function (x) { return (x * 100).toFixed(1) + '%'; };
    return {
      段数: cuts,
      档位: PV.tuneName || 'balanced',
      /* 近窗重版式：注意——去重代码已接上并确实在过滤（10 连抽追踪里窗口正确滑走），
       * 但长序列统计仍在这附近徘徊，**两者未能调和**，所以下面这一项现在只能当现状读数，
       * 不能当“旋钮生效的证据”。调大窗口前先把这个矛盾查清楚。*/
      连着两段同版式: pct(dupe.layout / Math.max(1, cuts)),
      近窗口内重版式: pct(win.layout / Math.max(1, cuts)),
      近窗口内重背景: pct(win.bg / Math.max(1, cuts)),
      连着两段同背景: pct(dupe.bg / Math.max(1, cuts)),
      连着两段同外观: pct(dupe.look / Math.max(1, cuts)),
      平均装饰件数: (decorSum / Math.max(1, cuts)).toFixed(2),
      平均处理件数: (treatSum / Math.max(1, cuts)).toFixed(2),
      入场占段长比例: pct(entSum / Math.max(1, cuts)),
      入场超段: entOver,
      旋钮: { bgSwap: PV.bgSwap, decorMax: PV.decorMax, treatMax: PV.treatMax, dedupe: PV.dedupe }
    };
  };
})();
