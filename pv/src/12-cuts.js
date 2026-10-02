/* PV 引擎 · 12 分 cut 与拍对齐（④）
 *
 * 一行 ≠ 一个 cut。规则：
 *   1. 显式 `/` 优先（写 `今夜/我还在这里` 就按它切）；
 *   2. 没写就按字数自动切：超过 PV.maxCutChars 的行在词边界（拉丁）或标点/空格处断开，
 *      最多 PV.maxCuts 段——长句不再挤成一坨，短句一律不动；
 *   3. 时间：有 TTML words 用词的真实起止；没有就按字符权重在行的起止之间分配；
 *   4. PV.beatSnap 为真且节拍可信时，把每个 cut 的起点吸到最近的拍点（最多吸半拍）。
 *
 * 推进由帧循环做：PV.audio.time 越过下一段起点就换段。没有播放时钟时一行就是一段，
 * 行为与 ③ 之前完全一致。
 */
(function () {
  'use strict';
  var PV = window.PV;

  PV.beatSnap = true;
  PV.autoSplit = true;
  PV.maxCutChars = 13;      // 超过这个字数才考虑自动切
  PV.maxCuts = 3;

  var MARK = /[，。、！？；：,.!?;:…—–)」』”’]/;
  function isSpace(t) { return /^\s+$/.test(t); }
  function len(t) { return isSpace(t) ? 1 : Array.from(t.replace(/\u00a0/g, ' ')).length; }

  /* 先按显式 / 断成组 */
  function bySlash(tokens) {
    var gs = [], cur = [], i;
    for (i = 0; i < tokens.length; i++) {
      if (tokens[i] === '/') { if (cur.length) gs.push(cur); cur = []; continue; }
      cur.push(tokens[i]);
    }
    if (cur.length) gs.push(cur);
    if (!gs.length) gs = [tokens.slice()];
    return gs.map(function (g) { return { tokens: g, explicit: gs.length > 1 }; });
  }

  /* 在 [lo,hi] 里挑最后一个好断点（空格 / 标点之后 / 拉丁词后） */
  function findBreak(toks, lo, hi) {
    var best = -1;
    hi = Math.min(hi, toks.length - 1);
    for (var i = lo; i <= hi; i++) {
      if (i + 1 >= toks.length) break;
      if (isSpace(toks[i]) || MARK.test(toks[i]) || toks[i + 1] === ' ' || /[a-zA-Z]{2,}/.test(toks[i])) best = i + 1;
    }
    return best;
  }

  function autoSplit(g) {
    var toks = g.tokens.slice();
    if (!PV.autoSplit || g.explicit || len2(toks) <= PV.maxCutChars) return [g];
    var out = [], guard = 0;
    while (toks.length && out.length < PV.maxCuts && guard++ < 8) {
      var rest = len2(toks);
      if (rest <= PV.maxCutChars || out.length === PV.maxCuts - 1) { out.push({ tokens: toks, explicit: false }); break; }
      var lo = Math.max(3, Math.round(PV.maxCutChars * 0.55));
      var hi = Math.min(toks.length - 1, Math.round(PV.maxCutChars * 1.35));
      var br = findBreak(toks, lo, hi);
      if (br <= 0 || br >= toks.length) br = Math.min(toks.length - 1, Math.max(lo, Math.floor(toks.length / 2)));
      out.push({ tokens: toks.slice(0, br), explicit: false });
      toks = toks.slice(br);
      while (toks.length && isSpace(toks[0])) toks = toks.slice(1);
    }
    return out;
  }
  function len2(toks) { var s = 0; toks.forEach(function (t) { s += len(t); }); return s; }

  /* 拍点吸附：偏移不超过 limit 才吸，宁可不吸也不硬掰 */
  function snapMs(ms, perMs) {
    if (!PV.beatSnap || !perMs || perMs < 120) return ms;
    var b = PV.audio.beat;
    if (!b || (PV.audio.confidence || 0) < 0.35) return ms;
    var phase = ((ms % perMs) + perMs) % perMs;
    var off = phase - Math.round(phase / perMs) * perMs;
    if (Math.abs(off) > perMs * 0.5) return ms;
    return Math.max(0, ms - off);
  }

  PV.splitLine = function (line, i) {
    var raw = (line && line.text) || '';
    if (!raw.trim()) return [];
    var toks = PV.tokens(raw);
    var groups = [];
    bySlash(toks).forEach(function (g) { autoSplit(g).forEach(function (x) { groups.push(x); }); });
    if (!groups.length) return [];

    var w = groups.map(function (g) { return Math.max(1, len2(g.tokens)); }), tot = 0;
    w.forEach(function (x) { tot += x; });

    var t0 = line.time || 0, t1 = line.end || 0;
    if (!t1) { var nx = PV.lyrics()[i + 1]; t1 = nx && nx.time ? nx.time : t0 + 4000; }
    var span = Math.max(800, t1 - t0);

    var cuts = [], acc = 0;
    groups.forEach(function (g, gi) {
      var s = t0 + span * (acc / tot), e = t0 + span * ((acc + w[gi]) / tot);
      acc += w[gi];
      cuts.push({
        i: gi, n: groups.length, tokens: g.tokens, text: g.tokens.join('').replace(/\u00a0/g, ' ').trim(),
        t0: s, t1: e, explicit: !!g.explicit
      });
    });

    /* TTML 逐词时间：比字符权重更准，直接覆盖 */
    var ws = line.words;
    if (ws && ws.length && cuts.length > 1) {
      var wEnd = ws[ws.length - 1].time + (ws[ws.length - 1].dur || 0);
      cuts.forEach(function (c) {
        var f0 = c.i / cuts.length, f1 = (c.i + 1) / cuts.length;
        c.t0 = ws[0].time + (wEnd - ws[0].time) * f0;
        c.t1 = ws[0].time + (wEnd - ws[0].time) * f1;
      });
    }

    var perMs = PV.audio.beat ? PV.audio.beat.len * 1000 : 0;
    for (var k = 1; k < cuts.length; k++) {
      /* 吸附可以往回也可以往后，但不能跑过上一段的头或本段的尾 */
      var sn = snapMs(cuts[k].t0, perMs);
      var lo = cuts[k - 1].t0 + 320, hi = Math.max(lo + 200, cuts[k].t1 - 160);
      cuts[k].t0 = Math.max(lo, Math.min(hi, sn));
      cuts[k - 1].t1 = Math.min(cuts[k].t0, Math.max(cuts[k - 1].t0 + 400, cuts[k - 1].t1));
    }
    cuts[cuts.length - 1].t1 = Math.max(cuts[cuts.length - 1].t1, t1);
    return cuts;
  };

  /* 帧推进：过了下一段的起点就换段 */
  PV.cutTick = function () {
    var S = PV.S;
    if (!S.cuts || S.cuts.length < 2) return;
    var now = PV.audio.time;
    if (now == null || S.idx < 0) return;
    var nextI = S.cutI + 1;
    if (nextI >= S.cuts.length) return;
    if (now >= S.cuts[nextI].t0) PV.show(S.idx, { force: true, keepCuts: true, cutI: nextI });
  };
  PV.onFrame(PV.cutTick);

  PV.cutsInfo = function () {
    var S = PV.S;
    return { line: S.idx, cut: S.cutI, n: S.cuts ? S.cuts.length : 1, at: PV.audio.time,
      times: (S.cuts || []).map(function (c) { return [Math.round(c.t0), Math.round(c.t1)]; }) };
  };
})();
