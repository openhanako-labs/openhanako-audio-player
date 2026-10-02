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

  var GROUPS = ['mood', 'style', 'face', 'bg', 'layout', 'enter', 'hold', 'exit', 'decor', 'treatment', 'camera', 'transition'];
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

  /* ---------- 演出强度 ---------- */
  PV.fx = { motion: 0.6, glitch: 0.2, chroma: 0.2, decor: 0.5, density: 0.7, texture: 0.2, bgSwitch: 0 };

  /* ---------- 气氛：决不是换皮，是换抽签分布 + 换滑块 ---------- */
  /* decor 这一列是后补的：先前没有一档气氛设过它，于是它恒等于1，
   * 所有「decor > 0.5 才进池」的门槛全部恒真，装饰抽得像筛子漏——
   * 用户连着两轮截图中那个成块硬边竖条就是这么来的。旋钮就得是旋钮。 */
  PV.mood = null;
  [['glitch', '故障', { motion: 0.9, glitch: 0.9, chroma: 0.8, texture: 0.7, density: 0.8, decor: 0.85 }],
   ['calm', '静', { motion: 0.25, glitch: 0, chroma: 0.1, texture: 0.3, density: 0.4, decor: 0.2 }],
   ['pop', '流行', { motion: 0.85, glitch: 0.15, chroma: 0.25, texture: 0.2, density: 0.6, decor: 0.6 }],
   ['graphic', '平面', { motion: 0.5, glitch: 0.1, chroma: 0.2, texture: 0.1, density: 0.5, decor: 0.7 }],
   ['editorial', '编辑', { motion: 0.35, glitch: 0, chroma: 0.05, texture: 0.15, density: 0.45, decor: 0.5 }],
   ['emotional', '情绪', { motion: 0.55, glitch: 0.2, chroma: 0.3, texture: 0.35, density: 0.5, decor: 0.45 }],
   ['horror', '恐怖', { motion: 0.7, glitch: 0.75, chroma: 0.5, texture: 0.8, density: 0.55, decor: 0.75 }]
  ].forEach(function (m) {
    PV.reg('mood', m[0], { nm: m[1], fx: m[2] });
  });

  PV.setMood = function (m) {
    var p = typeof m === 'string' ? PV.part('mood', m) : m;
    PV.mood = p ? p.key : null;
    if (p && p.fx) Object.keys(p.fx).forEach(function (k) { PV.fx[k] = p.fx[k]; });
    if (PV._fxBaseChanged) PV._fxBaseChanged();      // ③ 的强度调制以这套为基准
    if (PV.S.tag) PV.S.tag.textContent = 'LAYOUT · ' + (PV.lastLayout() || '—') + (PV.mood ? ' · ' + PV.mood : '');
    return PV.mood;
  };

  /* 哪几层参与抽签（关掉就用默认件，可以随时收收观感） */
  PV.rolling = { enter: true, hold: true, exit: true, transition: true, camera: true, decor: true, treatment: true };
  PV.decorMax = 2;        // 每段最多叠几件装饰（不含默认那几件）
  PV.treatMax = 1;

  /* 每层的默认件——① 的目标是行为不变，所以默认件就是旧实现的那一套 */
  PV.defaults = { enter: 'rise', hold: 'none', exit: 'none', transition: 'cut', camera: 'none', style: 'auto', decor: ['particles'], treatment: ['sweep'] };

  /* ---------- 音频钩子：③ 由 pv/src/11-audio.js 灌值 ---------- */
  PV.audio = { energy: null, beat: null, time: null, bpm: 0, confidence: 0, low: 0, mid: 0, high: 0 };

  /* ---------- 状态 ---------- */
  var S = {
    lyrics: [], idx: -1, style: null, stage: null, layer: null, track: null,
    cur: null, lastLayout: '', stops: [], tag: null, ghosts: { up: null, dn: null },
    cuts: null, cutI: 0, cutsLine: -1
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

  PV.setLyrics = function (l) { S.lyrics = l || []; S.cuts = null; S.cutI = 0; S.cutsLine = -1; };

  /* ---------- ctx：所有层读同一个上下文 ---------- */
  PV.makeCtx = function (i, txt) {
    var line = PV.lineAt(i) || {};
    return {
      idx: i, line: line, text: txt == null ? (line.text || '') : txt,
      tokens: PV.tokens(line.text || ''),
      style: S.style, fx: PV.fx, audio: PV.audio,
      lyrics: S.lyrics,
      cutI: 0, cutN: 1, t0: line.time || 0, t1: line.end || 0,
      /* 层之间可写的字段 */
      stagger: 45, emph: 0, flash: 0, note: '', params: {}, ghost: true, decor: true,
      ltr: PV.hasLatin(line.text || '')
    };
  };

  /* ---------- 选件：fit/when 过滤 → 气氛与强调偏置 → 权重抽签 ---------- */
  function bias(d, ctx) {
    var b = 1;
    if (PV.mood && d.tags && d.tags.length) b *= d.tags.indexOf(PV.mood) >= 0 ? 2.6 : 0.45;
    /* `*强调*` 的行优先冲击型件（件上标 impact:1） */
    if (ctx && (ctx.emph || ctx.flash) && d.impact) b *= 2.4;
    return b;
  }
  function weighted(arr, ctx) {
    var tot = 0;
    arr.forEach(function (d) { tot += (d.w || 1) * bias(d, ctx); });
    if (tot <= 0) return PV.pick(arr);
    var r = PV.rnd(tot);
    for (var i = 0; i < arr.length; i++) {
      r -= (arr[i].w || 1) * bias(arr[i], ctx);
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
  PV.choose = function (group, ctx, opts) {
    opts = opts || {};
    /* 显式指定某层的件（opts.layout / opts.enter / …） */
    if (opts[group]) { var want = PV.part(group, opts[group]); if (want) return want; }
    /* 不抽签的层直接用默认件（骰子也不会把它换掉） */
    if (PV.rolling[group] === false || opts.pick === false)
      return PV.part(group, opts[group] || PV.defaults[group]);
    var all = PV.parts(group);
    if (!all.length) return null;
    var ok = all.filter(function (d) {
      if (d.sp || d.special) return false;                 // title / interlude 这类专用件只走显式调用
      if (d.fit && !d.fit(ctx)) return false;
      if (d.when && !d.when(ctx)) return false;
      return true;
    });
    if (!ok.length) ok = all.filter(function (d) { return !d.sp && !d.special; });
    if (!ok.length) ok = [PV.part(group, PV.defaults[group]) || all[0]];
    if (group === 'layout') return PV.pickNot(ok, S.lastLayout);
    var p = weighted(ok, ctx);
    if (ok.length > 1 && p.key === opts.avoid) p = weighted(ok.filter(function (d) { return d.key !== p.key; }), ctx);
    return p;
  };

  /* 多件叠加（decor / treatment 用）：不重复地抽 k 件 */
  PV.chooseMany = function (group, ctx, opts, k) {
    var pool = PV.parts(group).filter(function (d) {
      if (d.sp) return false;
      if (d.fit && !d.fit(ctx)) return false;
      if (d.when && !d.when(ctx)) return false;
      return true;
    });
    var out = [];
    for (var i = 0; i < k && pool.length; i++) {
      var p = weighted(pool, ctx);
      if (!p) break;
      out.push(p);
      pool = pool.filter(function (d) { return d.key !== p.key; });
    }
    return out;
  };

  /* ---------- 一行（或一行里的一段）的配牌 ---------- */
  PV.planLine = function (i, opts) {
    opts = opts || {};
    var line = PV.lineAt(i);
    /* ④ 分 cut：不保留时重算（切分依赖字数与当时的拍子，重算才会跟着变）。
     * 注意缓存是按行存的：跳行时必须重切，沿用上一行的 cuts 会把 cutI 归到
     * 一个根本不存在的段上（实测：planLine(5,{cutI:1}) 拿到的是上一行的 0 段）。 */
    if (!opts.keepCuts || !S.cuts || S.cutsLine !== i) {
      S.cuts = (PV.splitLine ? PV.splitLine(line, i) : null) || [];
      S.cutsLine = i;
    }
    if (!S.cuts.length) S.cutI = 0;
    var cutI = opts.keepCuts ? Math.max(0, Math.min((opts.cutI == null ? S.cutI : opts.cutI), (S.cuts || []).length - 1)) : 0;
    S.cutI = cutI;
    var cut = S.cuts && S.cuts.length ? S.cuts[cutI] : null;

    var ctx = PV.makeCtx(i, cut ? cut.text : (line ? line.text : ''));
    if (cut) {
      ctx.tokens = cut.tokens;
      ctx.cutI = cut.i; ctx.cutN = cut.n; ctx.t0 = cut.t0; ctx.t1 = cut.t1;
      ctx.explicitCut = !!cut.explicit;
      ctx.emph = cut.emph || 0; ctx.flash = cut.flash || 0; ctx.note = cut.note || '';
      ctx.ltr = PV.hasLatin(ctx.text);
      /* 一行内多段时，每段自己算字数：长短句适配（fit）要按段而不是按整行 */
      ctx.line = Object.assign({}, line, { text: ctx.text, time: cut.t0, end: cut.t1 });
    }
    if (opts.special) { ctx.special = opts.special; }
    /* 空行（间奏）不再渲染成一块空白，走专用版式 */
    if (!ctx.special && !(ctx.text || '').trim()) ctx.special = 'interlude';
    var lay = (ctx.special && PV.part('layout', ctx.special))
      || (opts.layout ? PV.part('layout', opts.layout) : PV.choose('layout', ctx, opts));
    if (!lay) lay = PV.part('layout', 'center');
    if (lay.pre) lay.pre(ctx);
    var enterPart = PV.choose('enter', ctx, opts) || PV.part('enter', PV.defaults.enter);
    /* stagger 要按本段可用时长收：长句拆段后每段只有一秒上下，
     * 而「固定 45ms × 字数 + 入场时长」会比整段还长——尾字刚出完就换行，看着像卡了一下。
     * 入场最多占本段 62%，剩下留给驻留与阅读。*/
    if (enterPart) {
      var availMs = Math.max(0, (ctx.t1 || 0) - (ctx.t0 || 0));
      var nt = ctx.tokens.length, so = enterPart.staggerOf || 1;
      if (availMs > 320 && nt > 1) {
        var gapMax = (availMs * 0.62 - (enterPart.dur || 400)) / (nt - 1);
        if (gapMax > 4 && ctx.stagger * so > gapMax) ctx.stagger = +(gapMax / so).toFixed(1);
      }
    }
    /* ⑥ 字体：风格可以钉死（新闻就该黑体），没钉就按气氛/强调抽；
     * auto 风格不抢字体——那是“跟 App 主题”的意思，连字体一起跟才对 */
    var fc = PV.rollFace ? PV.rollFace(ctx, opts) : null;
    var bgPart = PV.rollBg ? PV.rollBg(ctx, opts) : null;
    if (ctx.style && ctx.style.id === 'auto' && !PV.faceManual) fc = null;
    /* decor / treatment 可叠 0..n 件；外部传字符串 = 只用那一件 */
    function stack(group) {
      var raw = opts[group];
      /* 点名（字符串 / 数组）只过 fit，不过 when：
       * when 是「抽签时的门槛」（ decor 不够大就别自己跳出来），
       * 而用户按下「条码」那颗钮就是指定它，拦在他面前只会变成“点了没反应”。
       * （预览台上装饰与处理两排按钮全部走这条路，之前被 texture/decor 门槛默默滤掉过。） */
      if (typeof raw === 'string') {
        return [raw].map(function (k) { return PV.part(group, k); })
          .filter(function (d) { return d && (!d.fit || d.fit(ctx)); });
      }
      if (Array.isArray(raw)) {
        return raw.map(function (k) { return typeof k === 'string' ? PV.part(group, k) : k; })
          .filter(function (d) { return d && (!d.fit || d.fit(ctx)); });
      }
      var base = (PV.defaults[group] || []).slice();
      var want = group === 'decor' ? PV.decorMax : PV.treatMax;
      if (PV.rolling[group] !== false && want > 0) {
        PV.chooseMany(group, ctx, opts, want).forEach(function (d) {
          if (d.key !== 'none' && base.indexOf(d.key) < 0) base.push(d.key);
        });
      }
      return base.map(function (k) { return PV.part(group, k); })
        .filter(function (d) { return d && (!d.when || d.when(ctx)); });
    }
    return {
      layout: lay,
      face: fc,
      bg: bgPart,
      enter: enterPart,
      hold: PV.choose('hold', ctx, opts) || PV.part('hold', PV.defaults.hold),
      exit: PV.choose('exit', ctx, opts) || PV.part('exit', PV.defaults.exit),
      transition: PV.choose('transition', ctx, opts) || PV.part('transition', PV.defaults.transition),
      camera: PV.choose('camera', ctx, opts) || PV.part('camera', PV.defaults.camera),
      decor: stack('decor'),
      treatment: stack('treatment'),
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
    ctx.el = el; ctx.tokensEls = toks; ctx.track = S.track; ctx.stage = S.stage; ctx.layout = plan.layout;
    return { el: el, ctx: ctx, toks: toks };
  };

  /* 一行的完整切换：上一行由它自己的 exit 送走，新行由 transition 接进来。
   * 旧实现里 exit 根本不存（innerHTML 直接覆盖），所以这是新增的执行路径。*/
  PV.show = function (i, opts) {
    if (i == null || i < 0) return;
    opts = opts || {};
    if (i === S.idx && !opts.force && !opts.layout) return;
    var plan = PV.planLine(i, opts);
    if (!plan) return;
    var made = PV.render(plan);
    if (!made) return;

    var prev = S.cur, oldPlan = S.plan;
    S.idx = i;
    S.lastLayout = plan.layout.key;
    S.plan = plan;
    S.cur = made.el;
    S.cutT = performance.now();
    stopAll();

    /* ① 送走上一行 */
    var drop = function () {
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      prev = null;
    };
    var ex = oldPlan && oldPlan.exit ? oldPlan.exit : PV.part('exit', PV.defaults.exit);
    if (prev) {
      /* 用上一行自己的 ctx：退场件要知道自己是谁的退场 */
      if (ex && ex.play) ex.play(oldPlan ? oldPlan.ctx : plan.ctx, prev, drop);
      else drop();
    }

    /* ② 接上新行：插入之后再跑登场层，否则 WAAPI 动画在游离元素上不会启动 */
    var swap = function () {
      if (made.el.parentNode) return;
      Array.prototype.slice.call(S.track.children).forEach(function (n) {
        if (n !== prev && n.classList && n.classList.contains('jv-line')) n.parentNode.removeChild(n);
      });
      S.track.appendChild(made.el);
      /* 容器自身的 opacity 过渡属于衔接层，这里直接上 show（与旧实现一致） */
      made.el.classList.add('show');
      applyIn(plan, made);
    };
    if (plan.transition && plan.transition.play) plan.transition.play(plan.ctx, prev, made.el, swap);
    else swap();
    if (!made.el.parentNode) swap();      // 衔接件没调 swap 时的兜底

    if (S.tag) S.tag.textContent = 'LAYOUT · ' + plan.layout.nm + (plan.face ? ' · ' + plan.face.nm : '') +
      (PV.mood ? ' · ' + PV.mood : '') +
      (S.cuts && S.cuts.length > 1 ? ' · ' + (S.cutI + 1) + '/' + S.cuts.length : '') +
      (PV.audioChain ? ' · 音' + PV.audioChain() : '');
    if (S.ghosts.up) S.ghosts.up.textContent = i > 0 && S.lyrics[i - 1] ? PV.plain(S.lyrics[i - 1].text) : '';
    if (S.ghosts.dn) S.ghosts.dn.textContent = i < S.lyrics.length - 1 && S.lyrics[i + 1] ? PV.plain(S.lyrics[i + 1].text) : '';
    PV.dispatch('pv:cut', plan);
    return plan;
  };

  function applyIn(plan, made) {
    if (plan.face && PV.useFace) PV.useFace(plan.face);
    else if (PV.clearFace) PV.clearFace();
    /* 背景先铺：它在最底下一层，背面动画不影响上面的几何 */
    if (plan.bg && PV.useBg) { var bgc = PV.useBg(plan.bg, made.ctx); if (bgc) PV.addStop(bgc); }
    /* 守卫先跑：此时只有版式写好的位置与旋转，还没有任何动画 transform，
     * 量到的就是落点。守卫自己只写 left/top 与 --fx/--fy/--fk，
     * 后面的登场/保持/镜头层照旧动 transform，互不抢占。 */
    fitGuard(made.ctx);
    if (plan.enter && plan.enter.apply) plan.enter.apply(made.ctx, made.toks);
    if (plan.hold && plan.hold.apply) { var sh = plan.hold.apply(made.ctx, made.el); if (sh) PV.addStop(sh); }
    if (plan.camera && plan.camera.apply) { var sc = plan.camera.apply(made.ctx, S.track); if (sc) PV.addStop(sc); }
    plan.decor.forEach(function (d) { if (d.apply) { var s = d.apply(made.ctx, made.el); if (s) PV.addStop(s); } });
    plan.treatment.forEach(function (d) { if (d.apply) { var s2 = d.apply(made.ctx, made.el); if (s2) PV.addStop(s2); } });
  }

  /* ---------- 装配守卫 ----------
   * 两件分开做，因为是两个层面的错：
   *  a) 散落类版式（件上标 spread:1）按百分比定位字，从不看字有多宽——长拉丁词把右边界顶出去。
   *  b) 整行超宽/超高（nowrap 长拉丁、竖写超长句）：缩 scale 再拉回边界。
   *
   * 只量 getBoundingClientRect，不再自己算 offsetLeft + 旋转包围盒。
   * 试过算：判定说 0 越界，真实矩形却漏出 17px——因为 token 的 offsetParent
   * 可能是版式自己的相对定位层，偏移原点与舞台差着一层 padding；这种语义账
   * 靠推是推不准的，浏览器算好的矩形就是答案。
   *
   * 三条约束：
   *  · 守卫跑在 enter.apply 之前——那时还没有任何动画 transform，量到的是落点。
   *  · 每次先把 --fx/--fy/--fk 抹掉再量，否则上一轮的位移会被这一轮量进去（不幂等，
   *    实测 --fk 会一路缩到 0.58）。
   *  · 只写 left/top 与 --fx/--fy/--fk，绝不碰 transform：那是版式（旋转）与镜头的地盘。 */
  function fitGuard(c) {
    var stage = c.stage || PV.stage(), el = c.el;
    if (!stage || !el) return;
    var sb = stage.getBoundingClientRect();
    if (sb.width < 40 || sb.height < 40) return;
    var PAD = 12;
    el.style.removeProperty('--fx'); el.style.removeProperty('--fy'); el.style.removeProperty('--fk');

    var toks = Array.prototype.slice.call(el.querySelectorAll('.jv-w'));
    if (!toks.length) return;

    function rects() {
      var minL = 1e9, maxR = -1e9, minT = 1e9, maxB = -1e9;
      toks.forEach(function (w) {
        var r = w.getBoundingClientRect();
        if (!r.width && !r.height) return;
        minL = Math.min(minL, r.left); maxR = Math.max(maxR, r.right);
        minT = Math.min(minT, r.top); maxB = Math.max(maxB, r.bottom);
      });
      if (minL > maxR) return null;
      return { minL: minL, maxR: maxR, minT: minT, maxB: maxB };
    }

    /* a) 散落类：字是绝对定位的，直接把越界的字往回挪（挪在 left/top 上，不动 transform）。
     * 挪完再量一次，避免"一个字的挪动把并集推到另一头"。 */
    if (c.layout && c.layout.spread) {
      for (var pass = 0; pass < 2; pass++) {
        var moved = 0;
        toks.forEach(function (w) {
          var s = w.style;
          if (!s.left && !s.top) return;
          var r = w.getBoundingClientRect();
          var dX = 0, dY = 0;
          if (r.right > sb.right - PAD) dX = (sb.right - PAD) - r.right;
          else if (r.left < sb.left + PAD) dX = (sb.left + PAD) - r.left;
          if (r.bottom > sb.bottom - PAD) dY = (sb.bottom - PAD) - r.bottom;
          else if (r.top < sb.top + PAD) dY = (sb.top + PAD) - r.top;
          if (!dX && !dY) return;
          moved++;
          if (dX) s.left = (w.offsetLeft + dX) + 'px';
          if (dY) s.top = (w.offsetTop + dY) + 'px';
        });
        if (!moved) break;
      }
    }

    /* b) 整行并集还是出界：先缩，缩完剩下的再平移 */
    var u = rects();
    if (!u) return;
    var lo = sb.left + PAD, hi = sb.right - PAD, vt = sb.top + PAD, vb = sb.bottom - PAD;
    var k = Math.min(1, (hi - lo) / Math.max(1, u.maxR - u.minL), (vb - vt) / Math.max(1, u.maxB - u.minT));
    k = Math.max(0.5, k);
    var ox = Math.max(0, u.maxR * 1 - hi) + Math.min(0, u.minL - lo);
    if (k < 0.999) {
      el.style.setProperty('--fk', k.toFixed(3));
      /* 缩放绕元素中心，所以缩放后的边界要按中心重算，不能简单乘 k */
      var cxm = (u.minL + u.maxR) / 2, cym = (u.minT + u.maxB) / 2;
      var hw = (u.maxR - u.minL) / 2 * k, hh = (u.maxB - u.minT) / 2 * k;
      var s2 = stage.getBoundingClientRect();
      var ncx = s2.left + s2.width / 2 + (cxm - (s2.left + s2.width / 2)) * k;
      var ncy = s2.top + s2.height / 2 + (cym - (s2.top + s2.height / 2)) * k;
      ox = Math.max(0, ncx + hw - hi) + Math.min(0, ncx - hw - lo);
      var oy = Math.max(0, ncy + hh - vb) + Math.min(0, ncy - hh - vt);
      if (ox) el.style.setProperty('--fx', ox.toFixed(1) + 'px');
      if (oy) el.style.setProperty('--fy', oy.toFixed(1) + 'px');
    } else {
      var oy2 = Math.max(0, u.maxB - vb) + Math.min(0, u.minT - vt);
      if (ox) el.style.setProperty('--fx', ox.toFixed(1) + 'px');
      if (oy2) el.style.setProperty('--fy', oy2.toFixed(1) + 'px');
    }
  }
  PV.fitGuard = fitGuard;

    /* ---------- 全局帧循环 ----------
   * 一条 rAF 喂所有 frame 型消费者：音频驱动→ 气氛偏置→ 本 cut 的 hold / camera / treatment。
   * 顺序不能换：音频先把 energy/beat 算完，后面的件才能读到本帧的新值。 */
  var _raf = 0, _subs = [];
  PV.onFrame = function (fn) { if (fn && _subs.indexOf(fn) < 0) _subs.push(fn); };
  PV.offFrame = function (fn) { var i = _subs.indexOf(fn); if (i >= 0) _subs.splice(i, 1); };
  PV.frameCount = function () { return _subs.length; };
  PV.startLoop = function () {
    if (_raf) return;
    var tick = function () {
      _raf = requestAnimationFrame(tick);
      if (!PV.active()) return;
      var p = S.plan;
      var c = p && p.ctx;
      if (c) c.lt = (performance.now() - S.cutT) / 1000;
      for (var i = 0; i < _subs.length; i++) { try { _subs[i](c); } catch (e) { } }
      if (!p || !S.cur || !S.cur.parentNode) return;
      if (p.hold && p.hold.frame) p.hold.frame(c);
      if (p.camera && p.camera.frame) p.camera.frame(c);
      p.treatment.forEach(function (t) { if (t.frame) t.frame(c); });
    };
    _raf = requestAnimationFrame(tick);
  };

  PV.empty = function (msg) {
    if (!PV.mount()) return;
    stopAll();
    S.cur = null; S.idx = -1; S.cuts = null; S.cutI = 0; S.cutsLine = -1; S.cuts = null; S.cutI = 0;
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
