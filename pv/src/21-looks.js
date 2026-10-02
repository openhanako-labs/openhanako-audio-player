/* PV 引擎 · 21 字形外观层（⑩ look）
 *
 * 吸收自 JIZURA 的 11p_looks.js——先纠正一句我上一轮说错的话：那个包是**混合包**，
 * 85 条里前 24 条才是真「字形外观」（袋文字/立体/傍点/マーカー…），后面混着背景、
 * 镜头、转场、后处理。而那 24 条对应的能力，我们**一件都没有**——133 件里没有一个
 * 改变文字本身涂装的层。所以这层是补空白，不是扩量。
 *
 * 归属规矩（比件数重要）：本层只写**涂装**——text-shadow / -webkit-text-stroke /
 * background-clip / text-decoration / text-emphasis / font-style / color，
 * 全部通过 .pv-jv[data-look=…] 作用在 `i.jv-t` 上。
 * 不碰 transform（归版式与镜头）、不碰 left/top 与 --fx/--fy/--fk（归守卫）、
 * 不碰 --drift-*（归保持层）。所以外观能和呼吸、拍震、守卫叠加而谁也不盖谁。
 *
 * vars 可以是对象，也可以是函数(ctx) —— 函数版让每件在自己那段里掷幅度，
 * 同一个件每段看起来不至于像一个模子。
 */
(function () {
  'use strict';
  var PV = window.PV;

  PV.defaults.look = 'none';
  if (PV.rolling) PV.rolling.look = true;

  function rnd(a, b, unit) { return (a + PV.rnd(b - a)).toFixed(1) + (unit || ''); }

  PV.reg('look', 'none', { nm: '无', w: 1.5, tags: ['calm', 'editorial', 'pop', 'graphic', 'emotional', 'glitch', 'horror'] });

  /* ---------- 描边族 ---------- */
  PV.reg('look', 'outline', {
    nm: '袋文字', w: 1, tags: ['pop', 'graphic'],
    vars: function () { return { '--lk-sw': rnd(0.035, 0.07, 'em') }; }
  });
  PV.reg('look', 'outlineFill', {
    nm: '缘取', w: 1, tags: ['pop', 'graphic', 'emotional'],
    vars: function () { return { '--lk-sw': rnd(0.04, 0.08, 'em'), '--lk-fill': 'var(--jv-fg)' }; }
  });
  PV.reg('look', 'doubleOutline', {
    nm: '二重缘', w: 0.7, tags: ['graphic', 'glitch'],
    vars: function () { return { '--lk-sw': rnd(0.04, 0.065, 'em'), '--lk-ring': rnd(2, 5, 'px') }; }
  });
  PV.reg('look', 'dotted', {
    nm: '点线缘', w: 0.55, tags: ['editorial', 'graphic'],
    when: function () { return PV.fx.texture > 0.2; },
    vars: function () { return { '--lk-sw': rnd(0.05, 0.08, 'em'), '--lk-dash': rnd(3, 6, 'px') }; }
  });
  PV.reg('look', 'echoOutline', {
    nm: '轮廓回响', w: 0.6, tags: ['emotional', 'glitch'],
    vars: function () { return { '--lk-sw': rnd(0.03, 0.05, 'em'), '--lk-echo': rnd(6, 14, 'px') }; }
  });

  /* ---------- 阴影族 ---------- */
  PV.reg('look', 'extrude', {
    nm: '立体', w: 0.9, tags: ['pop', 'graphic'],
    vars: function () {
      var a = (120 + PV.rnd(120)) * Math.PI / 180;                 // 光从左上，影子往右下
      return { '--lk-dx': Math.cos(a).toFixed(3), '--lk-dy': Math.abs(Math.sin(a)).toFixed(3), '--lk-n': 7 };
    }
  });
  PV.reg('look', 'longShadow', {
    nm: '长影', w: 0.7, tags: ['graphic', 'pop', 'horror'],
    vars: function () {
      var a = (110 + PV.rnd(130)) * Math.PI / 180, k = 0.9 + PV.rnd(0.6);
      return { '--lk-dx': (Math.cos(a) * k).toFixed(3), '--lk-dy': (Math.sin(a) * k).toFixed(3), '--lk-n': 14 };
    }
  });
  PV.reg('look', 'hardShadow', {
    nm: '偏移影', w: 0.9, tags: ['graphic', 'pop', 'glitch'],
    vars: function () {
      var a = (100 + PV.rnd(160)) * Math.PI / 180, k = 2 + PV.rnd(4);
      return { '--lk-dx': (Math.cos(a) * k).toFixed(2), '--lk-dy': (Math.sin(a) * k).toFixed(2) };
    }
  });
  PV.reg('look', 'softShadow', {
    nm: '柔影', w: 0.9, tags: ['calm', 'emotional'],
    vars: function () { return { '--lk-soft': rnd(0.3, 0.7, 'em') }; }
  });
  PV.reg('look', 'glow', {
    nm: '发光', w: 0.8, tags: ['emotional', 'pop'],
    when: function () { return PV.fx.chroma > 0.2; },
    vars: function () { return { '--lk-glow': rnd(0.4, 1.1, 'em') }; }
  });

  /* ---------- 填充族（background-clip:text） ---------- */
  PV.reg('look', 'gradientV', {
    nm: '纵向渐变', w: 0.9, tags: ['emotional', 'pop', 'graphic'],
    vars: function () { return { '--lk-clip': '1', '--lk-dir': Math.round(rnd(120, 240)) + 'deg' }; }
  });
  PV.reg('look', 'splitColor', {
    nm: '上下二色', w: 0.75, tags: ['graphic', 'pop'],
    vars: function () { return { '--lk-clip': '1', '--lk-stop': Math.round(38 + PV.rnd(24)) + '%' }; }
  });
  PV.reg('look', 'halftone', {
    nm: '网点', w: 0.6, tags: ['graphic', 'glitch', 'pop'],
    when: function () { return PV.fx.texture > 0.25; },
    vars: function () { return { '--lk-clip': '1', '--lk-dot': rnd(3, 7, 'px') }; }
  });
  PV.reg('look', 'stripes', {
    nm: '条纹填充', w: 0.6, tags: ['graphic', 'pop'],
    when: function () { return PV.fx.texture > 0.2; },
    vars: function () { return { '--lk-clip': '1', '--lk-pitch': rnd(4, 9, 'px'), '--lk-ang': Math.round(rnd(60, 130)) + 'deg' }; }
  });
  PV.reg('look', 'hatch', {
    nm: '斜线填充', w: 0.5, tags: ['editorial', 'graphic'],
    when: function () { return PV.fx.texture > 0.3; },
    vars: function () { return { '--lk-clip': '1', '--lk-pitch': rnd(2, 4.5, 'px') }; }
  });
  PV.reg('look', 'marker', {
    nm: '荧光标记', w: 0.8, tags: ['editorial', 'pop'],
    vars: function () { return { '--lk-mk': rnd(58, 86) + '%' }; }
  });

  /* ---------- 线与框族 ---------- */
  PV.reg('look', 'underline', {
    nm: '下划线', w: 0.8, tags: ['editorial', 'calm'],
    vars: function () { return { '--lk-ul': rnd(2, 5, 'px') }; }
  });
  PV.reg('look', 'strike', { nm: '删除线', w: 0.45, tags: ['editorial', 'glitch'] });
  PV.reg('look', 'boxed', {
    nm: '箱组', w: 0.7, tags: ['graphic', 'pop', 'editorial'],
    vars: function () { return { '--lk-pad': rnd(2, 8, 'px'), '--lk-bw': rnd(1, 2.5, 'px') }; }
  });
  PV.reg('look', 'emphasisDots', { nm: '傍点', w: 0.7, tags: ['emotional', 'editorial', 'calm'] });
  PV.reg('look', 'alternate', { nm: '交互色', w: 0.6, tags: ['pop', 'graphic'] });
  PV.reg('look', 'italic', { nm: '斜体', w: 0.7, tags: ['emotional', 'editorial'] });
  PV.reg('look', 'stencil', {
    nm: '镂空', w: 0.45, tags: ['glitch', 'horror', 'graphic'],
    when: function () { return PV.fx.glitch > 0.3; },
    vars: function () { return { '--lk-clip': '1', '--lk-sw': rnd(0.03, 0.05, 'em'), '--lk-bar': rnd(6, 14, 'px') }; }
  });

  /* ---------- 挂接：一层一件，只写 vars 与 data-look ---------- */
  var applied = [];

  function clearVars(el) {
    applied.forEach(function (k) { el.style.removeProperty(k); });
    applied = [];
  }

  PV.useLook = function (l, ctx) {
    if (typeof l === 'string') l = PV.part('look', l);
    if (!l) l = PV.part('look', PV.defaults.look);
    var el = PV.layer();
    if (!el) return l ? l.key : null;
    clearVars(el);
    el.dataset.look = l ? l.key : 'none';
    var v = l ? l.vars : null;
    if (v) {
      if (typeof v === 'function') v = v(ctx || {});
      Object.keys(v).forEach(function (k) {
        el.style.setProperty(k, v[k]);
        applied.push(k);
      });
    }
    return l ? l.key : null;
  };
  PV.lookKey = function () {
    var el = PV.layer();
    return el ? (el.dataset.look || 'none') : null;
  };
  PV.rollLook = function (ctx, opts) {
    if (opts.look) return PV.part('look', opts.look);
    if (PV.rolling.look === false) return PV.part('look', PV.defaults.look);
    return PV.choose('look', ctx, opts) || PV.part('look', 'none');
  };
})();
