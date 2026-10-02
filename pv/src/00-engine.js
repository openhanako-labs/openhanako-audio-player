/* PV 引擎 · 00 层模型与注册表
 * ------------------------------------------------------------------
 * 一个 cut = layout + enter + hold + exit + decor*n + treatment*n + camera + transition
 * 每一层都是独立抽签的部件槽；部件只注册、不改核心。
 * 加一个新手法 = 在 pv/src 里加一个文件、写一次 PV.reg(...)，跑一次 build。
 * 契约详见 pv/README.md
 */
(function () {
  'use strict';
  var PV = window.PV || (window.PV = {});

  var GROUPS = ['style', 'layout', 'enter', 'hold', 'exit', 'decor', 'treatment', 'camera', 'transition'];
  var reg = {}, order = {};
  GROUPS.forEach(function (g) { reg[g] = {}; order[g] = []; });

  PV.GROUPS = GROUPS;

  PV.reg = function (group, key, def) {
    if (!reg[group]) throw new Error('PV.reg: 未知层 ' + group);
    if (reg[group][key]) throw new Error('PV.reg: 重复注册 ' + group + '/' + key);
    def = def || {};
    def.key = key; def.group = group;
    def.nm = def.nm || key;
    def.tags = def.tags || [];
    def.w = def.w == null ? 1 : def.w;
    reg[group][key] = def;
    if (order[group].indexOf(key) < 0) order[group].push(key);
    return def;
  };
  PV.part = function (group, key) { return reg[group][key] || null; };
  PV.parts = function (group) { return order[group].map(function (k) { return reg[group][k]; }); };
  PV.stats = function () {
    var o = {};
    GROUPS.forEach(function (g) { o[g] = order[g].length; });
    return o;
  };

  /* ---------- 随机：沿用旧实现的 LCG，同 seed 出同结果 ---------- */
  var _seed = 1;
  PV.seed = function (v) { _seed = (v >>> 0) || 1; };
  PV.getSeed = function () { return _seed; };
  PV.rnd = function (a) {
    _seed = (_seed * 1664525 + 1013904223) >>> 0;
    return (_seed / 4294967296) * (a == null ? 1 : a);
  };
  PV.pick = function (arr) { return arr[Math.floor(PV.rnd(arr.length))]; };
  /* 区间内重抽，避开连续两次同结果（旧实现用 while g++<8） */
  PV.pickNot = function (arr, last, tries) {
    if (!arr.length) return null;
    var p = PV.pick(arr), g = 0;
    while (arr.length > 1 && last && p.key === last && g++ < (tries || 8)) p = PV.pick(arr);
    return p;
  };

  /* ---------- 文本切分：拉丁按词、中日韩逐字 ---------- */
  PV.hasLatin = function (t) { return /[a-zA-Z]{3,}/.test(t || ''); };
  PV.tokens = function (txt) {
    txt = txt || '';
    if (/[a-zA-Z]{2,}/.test(txt)) return txt.split(/(\s+)/).filter(function (s) { return s.length; });
    return Array.from(txt);
  };
  PV.glyph = function (t) { return t === ' ' ? '\u00A0' : t; };

  /* ---------- 演出强度（③ 会由音频驱动覆写） ---------- */
  PV.fx = { motion: 1, glitch: 0, chroma: 0, decor: 1, density: 1, texture: 0, bgSwitch: 0 };
  /* 每层的默认件——① 的目标是行为不变，所以默认件就是旧实现的那一套 */
  PV.defaults = { enter: 'rise', hold: 'none', exit: 'none', transition: 'cut', camera: 'none', style: 'auto', decor: ['particles'], treatment: ['sweep'] };

  /* ---------- 音频钩子（③ 接 analyser；现在留给外部塞值） ---------- */
  PV.audio = { energy: null, beat: null };

  /* ---------- 状态 ---------- */
  var S = {
    lyrics: [], idx: -1, style: null, stage: null, layer: null, track: null,
    cur: null, lastLayout: '', stops: [], tag: null, ghosts: { up: null, dn: null }
  };
  PV.S = S;

  PV.stage = function () { return S.stage || (S.stage = document.getElementById('pvStage')); };
  PV.layer = function () { return S.layer; };
  PV.active = function () { return document.body.classList.contains('jizura-mode'); };
  PV.plan = function () { return S.plan; };
  PV.lyrics = function () { return S.lyrics; };
  PV.lineAt = function (i) { return S.lyrics[i] || null; };
  PV.curIdx = function () { return S.idx; };
  PV.style = function () { return S.style; };
  PV.setStyle = function (s) { S.style = s; };
  PV.lastLayout = function () { return S.lastLayout; };
  PV.setLastLayout = function (k) { S.lastLayout = k; };

  /* ---------- 舞台挂载：PV 用自己的层，不碰 folia 的 #pvTrack ---------- */
  PV.mount = function () {
    var st = PV.stage();
    if (!st) return null;
    var layer = st.querySelector('#pvJv');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'pvJv';
      layer.className = 'pv-jv';
      var tr = document.createElement('div');
      tr.className = 'jv-track';
      layer.appendChild(tr);
      st.appendChild(layer);
    }
    S.layer = layer;
    S.track = layer.querySelector('.jv-track');
    return layer;
  };

  PV.setLyrics = function (l) { S.lyrics = l || []; };

  /* ---------- ctx：所有层读同一个上下文 ---------- */
  PV.makeCtx = function (i, txt) {
    var line = PV.lineAt(i) || {};
    return {
      idx: i, line: line, text: txt == null ? (line.text || '') : txt,
      tokens: PV.tokens(line.text || ''),
      style: S.style, fx: PV.fx, audio: PV.audio,
      lyrics: S.lyrics,
      /* 层之间可写的字段 */
      stagger: 45, emphasis: 0, params: {}, ghost: true, decor: true,
      ltr: PV.hasLatin(line.text || '')
    };
  };

  /* ---------- 选件：fit/when 过滤 → 权重抽签 ---------- */
  PV.choose = function (group, ctx, opts) {
    opts = opts || {};
    if (opts.force) { var f = PV.part(group, opts.force); if (f) return f; }
    if (opts.pick === false) return PV.part(group, PV.defaults[group]);
    var all = PV.parts(group);
    if (!all.length) return null;
    var ok = all.filter(function (d) {
      if (d.special && !ctx.special) return false;         // title / interlude 这类专用件
      if (d.sp) return false;                              // 显式特殊件只由 special 路径调用
      if (d.fit && !d.fit(ctx)) return false;
      if (d.when && !d.when(ctx)) return false;
      return true;
    });
    if (!ok.length) ok = all.filter(function (d) { return !d.sp && !d.special; });
    if (!ok.length) ok = [PV.part(group, PV.defaults[group]) || all[0]];
    if (group === 'layout') return PV.pickNot(ok, opts.keepLast === false ? '' : S.lastLayout);
    return PV.pick(ok);
  };

  /* ---------- 一行 = 一个 cut 的配牌 ---------- */
  PV.planLine = function (i, opts) {
    opts = opts || {};
    var line = PV.lineAt(i);
    var ctx = PV.makeCtx(i, line ? line.text : '');
    if (opts.special) { ctx.special = opts.special; }
    /* 空行（间奏）不再渲染成一块空白，走专用版式 */
    if (!ctx.special && !(line && (line.text || '').trim())) ctx.special = 'interlude';
    var lay = opts.layout ? PV.part('layout', opts.layout)
      : (ctx.special ? PV.part('layout', ctx.special) || PV.choose('layout', ctx, opts)
        : (opts.pick === false ? PV.part('layout', 'center') : PV.choose('layout', ctx, opts)));
    if (!lay) lay = PV.part('layout', 'center');
    if (lay.pre) lay.pre(ctx);
    return {
      layout: lay,
      enter: PV.part('enter', opts.enter || lay.enter || PV.defaults.enter) || PV.part('enter', PV.defaults.enter),
      hold: PV.part('hold', opts.hold || lay.hold || PV.defaults.hold) || PV.part('hold', PV.defaults.hold),
      exit: PV.part('exit', opts.exit || PV.defaults.exit) || PV.part('exit', PV.defaults.exit),
      transition: PV.part('transition', opts.transition || PV.defaults.transition) || PV.part('transition', PV.defaults.transition),
      camera: PV.part('camera', opts.camera || PV.defaults.camera) || PV.part('camera', PV.defaults.camera),
      decor: (opts.decor == null ? PV.defaults.decor : opts.decor).map(function (k) { return PV.part('decor', k); })
        .filter(function (d) { return d && (!d.when || d.when(ctx)); }),
      treatment: (opts.treatment == null ? PV.defaults.treatment : opts.treatment).map(function (k) { return PV.part('treatment', k); }).filter(Boolean),
      ctx: ctx
    };
  };

  /* ---------- 渲染 ---------- */
  function stopAll() {
    S.stops.forEach(function (fn) { try { fn(); } catch (e) { } });
    S.stops.length = 0;
  }
  PV.addStop = function (fn) { S.stops.push(fn); };

  /* token 结构：外层归版式（位置/字号/旋转），内层 i 归登场层。
   * 旧实现把两件事写在同一个 span 上，jzWin 的 transform:none 会永久吃掉
   * scatter/cad/wave 自己写的旋转——这里拆开，顺手把那个缺陷修掉。 */
  PV.spans = function (ctx, extra) {
    return ctx.tokens.map(function (t, i) {
      var cls = 'jv-w' + (extra && extra.cls ? ' ' + extra.cls(i, t) : '');
      var st = (extra && extra.style ? extra.style(i, t) : '');
      return '<span class="' + cls + '" data-i="' + i + '"' + (st ? ' style="' + st + '"' : '') +
        '><i class="jv-t">' + PV.glyph(t) + '</i></span>';
    }).join('');
  };

  PV.render = function (plan) {
    if (!PV.mount()) return null;
    var ctx = plan.ctx;
    var el = document.createElement('div');
    el.className = 'jv-line jv-' + plan.layout.key;
    el.innerHTML = plan.layout.render ? (plan.layout.render(ctx) || '') : '';
    var toks = Array.prototype.slice.call(el.querySelectorAll('.jv-t'));
    ctx.el = el; ctx.tokensEls = toks; ctx.track = S.track; ctx.stage = S.stage;
    return { el: el, ctx: ctx, toks: toks };
  };

  PV.show = function (i, opts) {
    if (i == null || i < 0) return;
    opts = opts || {};
    if (i === S.idx && !opts.force && !opts.layout) return;
    var plan = PV.planLine(i, opts);
    if (!plan) return;
    var made = PV.render(plan);
    if (!made) return;
    S.idx = i;
    S.lastLayout = plan.layout.key;
    S.plan = plan;

    var prev = S.cur;
    S.cur = made.el;
    S.cutT = performance.now();
    /* 先停掉上一行的 hold/camera/计时器，再走衔接，顺序不能反过来 */
    stopAll();

    var swap = function () {
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      Array.prototype.slice.call(S.track.children).forEach(function (n) {
        if (n !== made.el && n.classList && n.classList.contains('jv-line')) n.parentNode.removeChild(n);
      });
      if (!made.el.parentNode) S.track.appendChild(made.el);
      /* 与旧实现一致：直接上 show，不跑容器自身的 opacity 过渡。
       * 容器淡入属于衔接层的活，② 里由 transition 件自己接管。 */
      made.el.classList.add('show');
    };
    if (plan.transition && plan.transition.play) plan.transition.play(made.ctx, prev, made.el, swap);
    else swap();

    if (plan.enter && plan.enter.apply) plan.enter.apply(made.ctx, made.toks);
    if (plan.hold && plan.hold.apply) { var sh = plan.hold.apply(made.ctx, made.el); if (sh) PV.addStop(sh); }
    if (plan.camera && plan.camera.apply) { var sc = plan.camera.apply(made.ctx, S.track); if (sc) PV.addStop(sc); }
    plan.decor.forEach(function (d) { if (d.apply) { var s = d.apply(made.ctx, made.el); if (s) PV.addStop(s); } });
    plan.treatment.forEach(function (d) { if (d.apply) { var s2 = d.apply(made.ctx, made.el); if (s2) PV.addStop(s2); } });

    if (S.tag) S.tag.textContent = 'LAYOUT · ' + plan.layout.nm;
    if (S.ghosts.up) S.ghosts.up.textContent = i > 0 && S.lyrics[i - 1] ? S.lyrics[i - 1].text : '';
    if (S.ghosts.dn) S.ghosts.dn.textContent = i < S.lyrics.length - 1 && S.lyrics[i + 1] ? S.lyrics[i + 1].text : '';
    PV.dispatch('pv:cut', plan);
    return plan;
  };

  /* ---------- 全局帧循环：hold / camera / treatment 的 frame 都从这里走 ---------- */
  var _raf = 0;
  PV.startLoop = function () {
    if (_raf) return;
    var tick = function () {
      _raf = requestAnimationFrame(tick);
      if (!PV.active()) return;
      var p = S.plan;
      if (!p || !S.cur || !S.cur.parentNode) return;
      var c = p.ctx;
      c.lt = (performance.now() - S.cutT) / 1000;
      if (p.hold && p.hold.frame) p.hold.frame(c);
      if (p.camera && p.camera.frame) p.camera.frame(c);
      p.treatment.forEach(function (t) { if (t.frame) t.frame(c); });
    };
    _raf = requestAnimationFrame(tick);
  };

  PV.empty = function (msg) {
    if (!PV.mount()) return;
    stopAll();
    S.cur = null; S.idx = -1;
    S.track.innerHTML = '<div class="jv-line jv-center show"><div class="cur" style="opacity:.4">' + (msg || '暂无歌词') + '</div></div>';
  };

  /* ---------- 事件 ---------- */
  PV.dispatch = function (name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e) { }
  };

  /* ---------- 测试钩子（无播放环境时用这些验骨架） ---------- */
  PV.demo = function (lines, i) {
    PV.setLyrics((lines || ['主歌的第一句歌词', 'Short latin line here', '夜']).map(function (t, n) {
      return { text: t, time: n * 4000, end: n * 4000 + 4000 };
    }));
    PV.mount();
    return PV.show(i == null ? 0 : i, { force: true });
  };
})();
