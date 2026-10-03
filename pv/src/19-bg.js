/* PV 引擎 · 19 背景层（⑧）
 *
 * JIZURA 的背景是 66 件、逐段重掷的，我们之前整块底只有一个风格纯色——
 * 这就是「只有那一排在动」的根因。补一个 bg 层：每段按概率换，图样自己带强度，
 * 由 fx.texture / fx.density / energy 推着走。
 *
 * 三条规矩：
 *  · 一律挂在 #pvJv 上（在 .jv-track 之下、 folia 的 .pv-bg 之上），inset:0、不吃交互。
 *  · 换不换由 PV.bgSwap 管（0=跟着风格走，1=每段都换）。段段换会眼晕，
 *    JIZURA 自己也是「頻度」滑块而不是恒定切换。
 *  · 只建一个宿主层反复换样式，不按段往 DOM 里堆节点——粒子那种「一层用到老」是有意为之。
 */
(function () {
  'use strict';
  var PV = window.PV;

  PV.bgSwap = 0.45;         // 每段换背景的概率
  PV.defaults.bg = 'solid';
  if (PV.rolling) PV.rolling.bg = true;

  var host = null;
  function bgHost() {
    var L = PV.layer();
    if (!L) return null;
    if (!host || !host.isConnected) {
      host = L.querySelector('.jv-bg-layer');
      if (!host) {
        host = document.createElement('div');
        host.className = 'jv-bg-layer';
        L.insertBefore(host, L.firstChild);      // 永远在最底下
      }
    }
    return host;
  }
  PV.bgHost = bgHost;

  function put(el, props) {
    if (!el) return;
    for (var k in props) if (props[k] == null) el.style.removeProperty(k); else el.style.setProperty(k, props[k]);
  }

  /* ---------- 12 件背景 ---------- */
  PV.reg('bg', 'solid', {
    nm: '纯色', w: 1.2, tags: ['calm', 'editorial', 'pop', 'graphic', 'emotional', 'glitch', 'horror'],
    apply: function (c) { put(bgHost(), { background: '', 'background-image': '' }); }
  });

  PV.reg('bg', 'duo', {
    nm: '双色', w: 1, tags: ['pop', 'emotional', 'calm', 'graphic'],
    apply: function (c) {
      var st = c.style || {}, ang = Math.round(PV.rnd(360));
      var a = st.sub || 'color-mix(in srgb,var(--jv-bg) 78%, var(--jv-acc))';
      put(bgHost(), { 'background-image': 'linear-gradient(' + ang + 'deg, transparent, ' + a + ' 130%)' });
    }
  });

  PV.reg('bg', 'vig', {
    nm: '晕影', w: 0.9, tags: ['calm', 'emotional', 'editorial', 'horror'],
    apply: function () {
      put(bgHost(), {
        'background-image': 'radial-gradient(120% 92% at 50% 42%, transparent 34%, rgba(0,0,0,.55) 100%)'
      });
    }
  });

  PV.reg('bg', 'grid', {
    nm: '网格', w: 0.9, tags: ['graphic', 'editorial', 'glitch'],
    apply: function (c) {
      var g = bgHost(), s = Math.round(26 + PV.fx.density * 34);
      put(g, {
        'background-image': 'linear-gradient(to right, color-mix(in srgb,var(--jv-fg) 16%, transparent) 1px, transparent 1px),' +
          'linear-gradient(to bottom, color-mix(in srgb,var(--jv-fg) 16%, transparent) 1px, transparent 1px)',
        'background-size': s + 'px ' + s + 'px'
      });
      g.style.opacity = String(0.1 + 0.35 * PV.fx.texture);
    }
  });

  PV.reg('bg', 'stripes', {
    nm: '斜纹', w: 0.8, tags: ['pop', 'graphic'],
    apply: function () {
      var st = Math.round(10 + PV.rnd(26));
      put(bgHost(), {
        'background-image': 'repeating-linear-gradient(' + (100 + Math.round(PV.rnd(40))) + 'deg, color-mix(in srgb,var(--jv-acc) 26%, transparent) 0 2px, transparent 2px ' + st + 'px)',
        opacity: '0.2'
      });
    }
  });

  PV.reg('bg', 'blocks', {
    nm: '色块', w: 0.7, tags: ['pop', 'graphic', 'editorial'],
    apply: function () {
      var n = 3 + Math.round(PV.rnd(2)), ls = [];
      for (var i = 0; i < n; i++) {
        var x = Math.round(PV.rnd(100)), y = Math.round(PV.rnd(100)), r = 12 + Math.round(PV.rnd(30));
        ls.push('radial-gradient(' + r + '% ' + r + '% at ' + x + '% ' + y + '%, color-mix(in srgb,var(--jv-acc) 22%, transparent), transparent 70%)');
      }
      put(bgHost(), { 'background-image': ls.join(','), opacity: '0.75' });
    }
  });

  PV.reg('bg', 'beam', {
    nm: '扫光', w: 0.7, tags: ['emotional', 'pop', 'calm'],
    apply: function () {
      var el = bgHost();
      put(el, {
        'background-image': 'linear-gradient(105deg, transparent 42%, color-mix(in srgb,var(--jv-fg) 14%, transparent) 50%, transparent 58%)',
        animation: 'jvBgBeam ' + (9 + Math.round(PV.rnd(9))) + 's linear infinite', opacity: ''
      });
    }
  });

  PV.reg('bg', 'rings', {
    nm: '同心圈', w: 0.7, tags: ['graphic', 'glitch', 'editorial'],
    apply: function () {
      put(bgHost(), {
        'background-image': 'repeating-radial-gradient(circle at 50% 50%, transparent 0 42px, color-mix(in srgb,var(--jv-acc) 14%, transparent) 42px 43px)',
        animation: 'jvBgZoom ' + (16 + Math.round(PV.rnd(10))) + 's ease-in-out infinite alternate', opacity: '.9'
      });
    }
  });

  PV.reg('bg', 'scan', {
    nm: '扫描线', w: 0.7, tags: ['glitch', 'horror', 'graphic'],
    when: function () { return PV.fx.texture > 0.15; },
    apply: function () {
      put(bgHost(), {
        'background-image': 'repeating-linear-gradient(0deg, rgba(255,255,255,.07) 0 1px, transparent 1px 4px)',
        animation: 'jvBgScan 7s linear infinite', opacity: String(0.14 + 0.4 * PV.fx.texture)
      });
    }
  });

  PV.reg('bg', 'dust', {
    nm: '浮尘', w: 0.7, tags: ['calm', 'emotional'],
    when: function () { return PV.fx.texture > 0.18; },
    apply: function () {
      put(bgHost(), {
        'background-image': 'radial-gradient(circle, color-mix(in srgb,var(--jv-fg) 30%, transparent) 1px, transparent 1.6px)',
        'background-size': '34px 34px, 57px 57px',
        animation: 'jvBgDrift 26s linear infinite', opacity: String(0.1 + 0.3 * PV.fx.texture)
      });
    }
  });

  PV.reg('bg', 'hue', {
    nm: '偏色', w: 0.6, tags: ['pop', 'glitch', 'emotional'],
    when: function () { return PV.fx.chroma > 0.3; },
    apply: function () {
      put(bgHost(), {
        'background-image': 'linear-gradient(160deg, color-mix(in srgb,var(--jv-acc) 30%, #0ff 30%), transparent 55%, color-mix(in srgb,var(--jv-acc) 26%, #f08 30%))',
        mixBlendMode: 'soft-light', animation: 'jvBgHue 12s linear infinite', opacity: String(0.35 + 0.5 * PV.fx.chroma)
      });
    }
  });

  /* 能量驱动的一层：没有音频数据时 when 不成立，抽不到 */
  PV.reg('bg', 'pulse', {
    nm: '能量底', w: 0.9, tags: ['pop', 'glitch', 'graphic'],
    when: function () { return PV.audio.energy != null; },
    apply: function () {
      var el = bgHost();
      if (!el) return null;
      el.style.setProperty('background-image', 'radial-gradient(120% 90% at 50% 60%, color-mix(in srgb,var(--jv-acc) 30%, transparent), transparent 62%)');
      el.style.mixBlendMode = 'screen';
      var fr = function () {
        var e = PV.audio.energy || 0, b = PV.audio.beat;
        var k = e * 0.55 + (b ? Math.max(0, 1 - b.since / (b.len * 0.6)) * 0.45 : 0);
        el.style.opacity = (0.05 + 0.5 * Math.min(1, k)).toFixed(3);
      };
      fr();
      PV.onFrame(fr);
      return function () { PV.offFrame(fr); el.style.mixBlendMode = ''; };
    }
  });

  /* ---------- 选与用 ---------- */
  var cur = null;
  PV.bgKey = function () { return cur; };

  PV.rollBg = function (ctx, opts) {
    if (opts.bg) return PV.part('bg', opts.bg) || PV.part('bg', PV.defaults.bg);
    if (PV.bgSwap <= 0) return cur ? PV.part('bg', cur) : PV.part('bg', PV.defaults.bg);
    if (cur && PV.rnd(1) > PV.bgSwap) return PV.part('bg', cur);   // 不换就沿用上件
    /* 决定换了就不再抽回同一件——否则「换率 0.45」实际只跑出 0.33，旋钮说的不算 */
    var b = PV.choose('bg', ctx, opts);
    for (var i = 0; i < 3 && b && cur && b.key === cur; i++) b = PV.choose('bg', ctx, opts);
    return b || PV.part('bg', 'solid');
  };

  PV.useBg = function (b, ctx) {
    if (typeof b === 'string') b = PV.part('bg', b);
    if (!b) b = PV.part('bg', PV.defaults.bg);
    if (!b) return null;
    cur = b.key;
    var el = bgHost();
    if (!el) return b;
    /* 换件前抹掉上一件留下的样式，否则 background-image / animation 会串台。
     * 清单要盖全：⑮ 加了带 mask / blend / position 的件后，这几个不在表里就会渗到下一段
     * （实测 9 件背景换到纯色后 mask 还在，整块底被遮得只余一角）。*/
    ['background-image', 'background-size', 'background-position', 'background',
     'animation', 'opacity', 'mix-blend-mode', 'filter',
     'mask-image', '-webkit-mask-image', 'mask-size', 'mask-position'].forEach(function (k) {
      el.style.removeProperty(k);
    });
    el.dataset.bg = b.key;
    if (b.apply) return b.apply(ctx || {}, el);
    return null;
  };
})();
