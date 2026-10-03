/* PV 引擎 · 27 背景扩充（⑮ bg +17）
 *
 * JIZURA 的 37 件背景（bgcamB 包）是 canvas 画的。这层搬的同样是效果：
 * 全部用 background-image 的渐变组合 + mask + animation 实现，不吃贴图。
 *
 * 归属规矩（与 ⑧ 一致，别越界）：只动 `.jv-bg-layer` 这一个节点上的
 * background-image / background-size / background-position / opacity / mask / animation。
 * 不碰 token、不碰 .jv-track、不碰 --lk-*（⑩ 外观）、不碰 --tt*（⑭ 处理）。
 * 强度一律读 fx.texture / fx.density / fx.chroma，动画件写进 bg.css 的 @keyframes。
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* 通用铺法：给 .jv-bg-layer 写一套背景 */
  var PAINT_KEYS = { img: 1, size: 1, pos: 1, op: 1, anim: 1, blend: 1, mask: 1 };
  function paint(c, o) {
    var el = PV.bgHost();
    if (!el) return null;
    /* 不认的键**直接抛**：写成 position 而不是 pos 会被静默丢掉，
     * 而这种错在画面上看不出来、在数据上又隐身（⑭ 刚踩过 setProperty 驼峰同款）。*/
    for (var key in o) if (!PAINT_KEYS[key]) throw new Error('bg paint: 不认识的选项 ' + key);
    if (o.img) el.style.setProperty('background-image', o.img);
    if (o.size) el.style.setProperty('background-size', o.size);
    if (o.pos) el.style.setProperty('background-position', o.pos);
    el.style.opacity = o.op == null ? '1' : String(o.op);
    if (o.anim) el.style.setProperty('animation', o.anim);
    if (o.blend) el.style.setProperty('mix-blend-mode', o.blend);
    if (o.mask) { el.style.setProperty('-webkit-mask-image', o.mask); el.style.setProperty('mask-image', o.mask); }
    return null;
  }
  function tex() { return PV.fx.texture; }
  function den() { return PV.fx.density; }
  function chm() { return PV.fx.chroma; }
  function F(pct) { return 'color-mix(in srgb, var(--jv-fg) ' + pct + '%, transparent)'; }
  function A(pct) { return 'color-mix(in srgb, var(--jv-acc) ' + pct + '%, transparent)'; }

  /* ---------- 和织物与印刷 ---------- */
  PV.reg('bg', 'seigaiha', {
    nm: '青海波', w: 0.8, tags: ['calm', 'editorial', 'graphic'],
    apply: function (c) {
      var u = Math.round(26 + den() * 26);
      return paint(c, {
        img: 'radial-gradient(circle at 50% 100%, transparent 0 ' + (u * 0.5 - 3) + 'px, ' + F(30) + ' ' +
          (u * 0.5 - 3) + 'px ' + (u * 0.5 - 1.5) + 'px, transparent ' + (u * 0.5 - 1.5) + 'px ' +
          (u * 0.5 + 3) + 'px, ' + F(30) + ' ' + (u * 0.5 + 3) + 'px ' + (u * 0.5 + 4.5) + 'px, transparent ' + (u * 0.5 + 4.5) + 'px)',
        size: u + 'px ' + (u / 2) + 'px',
        op: (0.1 + 0.34 * tex()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'tartan', {
    nm: '苏格兰格', w: 0.7, tags: ['pop', 'graphic', 'editorial'],
    apply: function (c) {
      var u = Math.round(30 + den() * 40), s = Math.max(3, Math.round(u / 7));
      function band(col) {
        return 'repeating-linear-gradient(0deg, ' + col + ' 0 ' + s + 'px, transparent ' + s + 'px ' + u + 'px),' +
          'repeating-linear-gradient(90deg, ' + col + ' 0 ' + s + 'px, transparent ' + s + 'px ' + u + 'px)';
      }
      return paint(c, {
        img: band(A(26)) + ',' + band(F(16)),
        op: (0.12 + 0.3 * tex()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'herringbone', {
    nm: '人字纹', w: 0.65, tags: ['editorial', 'graphic'],
    apply: function (c) {
      var u = Math.round(16 + den() * 20);
      return paint(c, {
        img: 'repeating-linear-gradient(45deg, ' + F(26) + ' 0 2px, transparent 2px ' + u + 'px),' +
          'repeating-linear-gradient(-45deg, ' + F(26) + ' 0 2px, transparent 2px ' + u + 'px)',
        size: u + 'px ' + u + 'px, ' + (u * 2) + 'px ' + (u * 2) + 'px',
        op: (0.1 + 0.3 * tex()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'argyle', {
    nm: '菱形格', w: 0.6, tags: ['pop', 'editorial', 'calm'],
    apply: function (c) {
      var u = Math.round(34 + den() * 34);
      return paint(c, {
        img: 'repeating-linear-gradient(45deg, ' + A(24) + ' 0 1.5px, transparent 1.5px ' + u + 'px),' +
          'repeating-linear-gradient(-45deg, ' + A(24) + ' 0 1.5px, transparent 1.5px ' + u + 'px),' +
          'repeating-linear-gradient(45deg, ' + F(10) + ' 0 ' + (u / 2) + 'px, transparent ' + (u / 2) + 'px ' + u + 'px)',
        op: (0.14 + 0.3 * tex()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'chevron', {
    nm: '山形纹', w: 0.6, tags: ['graphic', 'pop'],
    apply: function (c) {
      var u = Math.round(20 + den() * 26);
      return paint(c, {
        img: 'linear-gradient(135deg, ' + F(22) + ' 25%, transparent 25%),' +
          'linear-gradient(225deg, ' + F(22) + ' 25%, transparent 25%),' +
          'linear-gradient(45deg, ' + A(16) + ' 25%, transparent 25%),' +
          'linear-gradient(315deg, ' + A(16) + ' 25%, transparent 25%)',
        size: u + 'px ' + u + 'px',
        pos: (u / 2) + 'px 0, ' + (u / 2) + 'px 0, 0 0, 0 0',
        op: (0.12 + 0.3 * tex()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'isoCubes', {
    nm: '立方格', w: 0.55, tags: ['graphic', 'glitch'],
    apply: function (c) {
      var u = Math.round(40 + den() * 40);
      return paint(c, {
        img: 'conic-gradient(from 90deg at 33.3% 33.3%, ' + F(24) + ' 0 25%, transparent 0),' +
          'conic-gradient(from 210deg at 66.6% 66.6%, ' + A(20) + ' 0 25%, transparent 0)',
        size: u + 'px ' + u + 'px',
        op: (0.12 + 0.28 * tex()).toFixed(2)
      });
    }
  });

  /* ---------- 光学与几何 ---------- */
  PV.reg('bg', 'moire', {
    nm: '摩尔纹', w: 0.6, tags: ['glitch', 'graphic'],
    when: function () { return tex() > 0.2; },
    apply: function (c) {
      var a = Math.round(7 + PV.rnd(9)), b = a + 1 + Math.round(PV.rnd(3));
      return paint(c, {
        img: 'repeating-radial-gradient(circle at 34% 46%, ' + F(20) + ' 0 1px, transparent 1px ' + a + 'px),' +
          'repeating-radial-gradient(circle at 66% 54%, ' + A(18) + ' 0 1px, transparent 1px ' + b + 'px)',
        anim: 'jvBgMoire ' + (26 + Math.round(PV.rnd(20))) + 's linear infinite',
        op: (0.2 + 0.34 * tex()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'tunnel', {
    nm: '方洞', w: 0.55, tags: ['glitch', 'graphic', 'pop'],
    apply: function (c) {
      return paint(c, {
        img: 'repeating-radial-gradient(circle at 50% 50%, transparent 0 6%, ' + A(20) + ' 6% 6.6%, transparent 6.6% 13%)',
        anim: 'jvBgTunnel ' + (12 + Math.round(PV.rnd(10))) + 's ease-in-out infinite',
        op: (0.28 + 0.4 * chm()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'spiralArms', {
    nm: '旋臂', w: 0.5, tags: ['glitch', 'emotional'],
    apply: function (c) {
      var arms = 2 + Math.round(PV.rnd(4));
      return paint(c, {
        img: 'repeating-conic-gradient(from ' + Math.round(PV.rnd(360)) + 'deg at 50% 50%, ' +
          F(14) + ' 0 ' + (180 / arms).toFixed(1) + 'deg, transparent 0 ' + (360 / arms).toFixed(1) + 'deg)',
        anim: 'jvBgSpinSlow ' + (40 + Math.round(PV.rnd(50))) + 's linear infinite',
        mask: 'radial-gradient(circle at 50% 50%, #000 8%, transparent 72%)',
        op: (0.3 + 0.4 * tex()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'topo', {
    nm: '等高线', w: 0.6, tags: ['editorial', 'graphic', 'calm'],
    apply: function (c) {
      var u = Math.round(38 + den() * 46);
      return paint(c, {
        img: 'repeating-radial-gradient(ellipse 130% 78% at 22% 34%, transparent 0 ' + (u - 2) + 'px, ' +
          F(22) + ' ' + (u - 2) + 'px ' + u + 'px),' +
          'repeating-radial-gradient(ellipse 110% 90% at 78% 72%, transparent 0 ' + (u * 1.4 - 2) + 'px, ' +
          A(16) + ' ' + (u * 1.4 - 2) + 'px ' + (u * 1.4) + 'px)',
        op: (0.12 + 0.3 * tex()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'kaleido', {
    nm: '万花筒', w: 0.45, tags: ['pop', 'emotional', 'glitch'],
    when: function () { return chm() > 0.35; },
    apply: function (c) {
      return paint(c, {
        img: 'repeating-conic-gradient(from ' + Math.round(PV.rnd(90)) + 'deg at 50% 46%, ' + A(30) + ' 0 15deg, ' +
          F(12) + ' 0 30deg, transparent 0 45deg)',
        anim: 'jvBgHue ' + (16 + Math.round(PV.rnd(14))) + 's linear infinite',
        blend: 'soft-light',
        op: (0.3 + 0.45 * chm()).toFixed(2)
      });
    }
  });

  /* ---------- 场景 ---------- */
  PV.reg('bg', 'starfield', {
    nm: '星空', w: 0.6, tags: ['calm', 'emotional'],
    when: function () { return den() > 0.3; },
    apply: function (c) {
      var u1 = Math.round(26 + PV.rnd(20)), u2 = Math.round(u1 * 2.4);
      return paint(c, {
        img: 'radial-gradient(' + F(80) + ' 1px, transparent 1.4px),radial-gradient(' + A(70) + ' 1px, transparent 1.2px)',
        size: u1 + 'px ' + u1 + 'px, ' + u2 + 'px ' + u2 + 'px',
        anim: 'jvBgDrift ' + (30 + Math.round(PV.rnd(24))) + 's linear infinite',
        op: (0.3 + 0.45 * den()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'skyline', {
    nm: '街影', w: 0.5, tags: ['editorial', 'glitch', 'pop'],
    apply: function (c) {
      var h = Math.round(16 + PV.rnd(20));
      return paint(c, {
        img: 'repeating-linear-gradient(90deg, ' + F(18) + ' 0 ' + (7 + Math.round(PV.rnd(9))) + 'px, transparent 0 ' +
          (16 + Math.round(PV.rnd(14))) + 'px)',
        size: '100% ' + h + '%',
        pos: '0 100%',
        mask: 'linear-gradient(to top, #000 ' + (h * 0.55).toFixed(0) + '%, transparent ' + h + '%)',
        op: (0.16 + 0.3 * tex()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'sunset', {
    nm: '落日', w: 0.6, tags: ['emotional', 'calm', 'pop'],
    apply: function (c) {
      var y = Math.round(58 + PV.rnd(26)), x = Math.round(18 + PV.rnd(64));
      return paint(c, {
        img: 'radial-gradient(circle at ' + x + '% ' + y + '%, ' + A(60) + ' 0 8%, transparent 34%),' +
          'linear-gradient(180deg, transparent 20%, color-mix(in srgb, var(--jv-acc) 22%, transparent) 100%)',
        blend: 'screen',
        op: (0.4 + 0.5 * chm()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'godrays', {
    nm: '光芒', w: 0.55, tags: ['emotional', 'calm', 'pop'],
    apply: function (c) {
      return paint(c, {
        img: 'repeating-conic-gradient(from ' + (250 + Math.round(PV.rnd(40))) + 'deg at 50% -12%, ' +
          F(16) + ' 0 2.2deg, transparent 2.2deg 11deg)',
        mask: 'linear-gradient(to bottom, #000 0%, transparent 72%)',
        anim: 'jvBgRay ' + (22 + Math.round(PV.rnd(16))) + 's ease-in-out infinite alternate',
        blend: 'screen',
        op: (0.3 + 0.4 * chm()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'aurora', {
    nm: '极光', w: 0.55, tags: ['emotional', 'glitch', 'calm'],
    when: function () { return chm() > 0.25; },
    apply: function (c) {
      var a = Math.round(120 + PV.rnd(120));
      return paint(c, {
        img: 'linear-gradient(' + a + 'deg, transparent 18%, ' + A(34) + ' 34%, ' +
          'color-mix(in srgb, var(--jv-acc) 18%, #6cf) 48%, transparent 68%)',
        anim: 'jvBgAurora ' + (18 + Math.round(PV.rnd(16))) + 's ease-in-out infinite alternate',
        blend: 'screen',
        op: (0.32 + 0.45 * chm()).toFixed(2)
      });
    }
  });

  PV.reg('bg', 'vhs', {
    nm: 'VHS带', w: 0.5, tags: ['glitch', 'horror'],
    when: function () { return PV.fx.glitch > 0.3; },
    apply: function (c) {
      return paint(c, {
        img: 'repeating-linear-gradient(0deg, ' + F(9) + ' 0 2px, transparent 2px 5px),' +
          'linear-gradient(0deg, transparent 40%, ' + A(22) + ' 46%, transparent 52%)',
        size: '100% 100%, 100% 40%',
        anim: 'jvBgVhs 6s linear infinite',
        op: (0.22 + 0.4 * PV.fx.glitch).toFixed(2)
      });
    }
  });
})();
