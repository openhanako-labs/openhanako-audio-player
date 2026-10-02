/* PV 引擎 · 14 装饰层扩容（⑤）
 *
 * 开头有一段「元数据补标」：给 ① 平移过来的既有件打 impact 标记——
 * `*强调*` 与行末 `!` 的行要靠冲击型件来体现，而件是分散在各文件里的，
 * 与其回头改十几个定义，不如在语法层落地处统一声明一次。只加元数据，不改行为。
 *
 * 装饰的规矩：一律挂在本次 cut 的 .jv-line 里（元素随段生灭，不用自己清理），
 * 并且全部 writing-mode:horizontal-tb —— 竖写版式会把子层的文字方向一起带走（①踩过）。
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* ---- 元数据补标：哪些件算「冲击型」（强调行优先抽它们） ---- */
  var IMPACT = {
    layout: ['break', 'mix', 'diag', 'stack', 'cond', 'tile', 'band', 'scatter', 'cad'],
    enter: ['slam', 'zoomIn', 'drop', 'scramble'],
    exit: ['burst', 'smash', 'scatter', 'glitchOut'],
    transition: ['whip', 'flash', 'zoomThrough', 'push']
  };
  Object.keys(IMPACT).forEach(function (g) {
    IMPACT[g].forEach(function (k) { var d = PV.part(g, k); if (d) d.impact = 1; });
  });

  /* ---------- 小工具 ---------- */
  function el(cls, html) {
    var d = document.createElement('div');
    d.className = 'jv-d ' + cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function add(c, node) {
    if (!c.el) return null;
    if (c.el.querySelector('.' + node.className.split(' ')[1])) return null;
    c.el.appendChild(node);
    return null;
  }
  function n(c, k) { return PV.rnd(k); }         // 走引擎的 seed，同 seed 同画面

  /* ---------- frame 双线框 + 角刻度 ---------- */
  PV.reg('decor', 'frame', {
    nm: '框', tags: ['editorial', 'graphic', 'calm'], w: 0.9,
    when: function () { return PV.fx.decor > 0.35; },
    apply: function (c) {
      return add(c, el('jv-frame',
        '<i class="e"></i><i class="e2"></i><b class="c tl"></b><b class="c tr"></b><b class="c bl"></b><b class="c br"></b>'));
    }
  });

  /* ---------- ticks 顶部刻度尺 ---------- */
  PV.reg('decor', 'ticks', {
    nm: '刻度', tags: ['graphic', 'editorial', 'glitch'], w: 0.8,
    when: function () { return PV.fx.decor > 0.4; },
    apply: function (c) {
      var h = '', N = 26;
      for (var i = 0; i < N; i++) h += '<i style="height:' + (i % 5 === 0 ? 13 : 6) + 'px;opacity:' + (i % 5 === 0 ? .8 : .4) + '"></i>';
      return add(c, el('jv-ticks', h));
    }
  });

  /* ---------- target 同心圆 + 十字准星 ---------- */
  PV.reg('decor', 'target', {
    nm: '准星', tags: ['graphic', 'glitch', 'editorial'], w: 0.7,
    when: function () { return PV.fx.decor > 0.45; },
    apply: function (c) {
      var r = Math.round(90 + n(c, 90));
      return add(c, el('jv-target',
        '<svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet" style="--r:' + r + 'px">' +
        '<circle cx="200" cy="200" r="' + r + '"/><circle cx="200" cy="200" r="' + Math.round(r * 0.62) + '"/>' +
        '<line x1="200" y1="' + (200 - r - 14) + '" x2="200" y2="' + (200 - r + 6) + '"/>' +
        '<line x1="200" y1="' + (200 + r + 14) + '" x2="200" y2="' + (200 + r - 6) + '"/>' +
        '<line x1="' + (200 - r - 14) + '" y1="200" x2="' + (200 - r + 6) + '" y2="200"/>' +
        '<line x1="' + (200 + r + 14) + '" y1="200" x2="' + (200 + r - 6) + '" y2="200"/>' +
        '<text x="' + (200 + r + 10) + '" y="' + (200 - r) + '" class="co">X ' + (100 + Math.round(n(c, 800))) +
        ' · Y ' + (100 + Math.round(n(c, 800))) + '</text></svg>'));
    }
  });

  /* ---------- barcode 条码 ---------- */
  PV.reg('decor', 'barcode', {
    nm: '条码', tags: ['graphic', 'editorial'], w: 0.6,
    when: function () { return PV.fx.decor > 0.5; },
    apply: function (c) {
      var h = '', side = n(c, 2) < 1 ? 'l' : 'r';
      for (var i = 0; i < 22; i++) h += '<i style="width:' + (1 + Math.round(n(c, 4))) + 'px;opacity:' + (0.35 + n(c, 0.5)).toFixed(2) + '"></i>';
      return add(c, el('jv-barcode ' + side, h));
    }
  });

  /* ---------- arrows 箭头组 ---------- */
  PV.reg('decor', 'arrows', {
    nm: '箭头', tags: ['pop', 'graphic'], w: 0.6,
    when: function () { return PV.fx.motion > 0.4; },
    apply: function (c) {
      var h = '', dir = n(c, 2) < 1 ? '▶' : '◀';
      for (var i = 0; i < 3; i++) h += '<span style="opacity:' + (0.2 + i * 0.22).toFixed(2) + ';animation-delay:' + (i * 0.16).toFixed(2) + 's">' + dir + '</span>';
      return add(c, el('jv-arrows ' + (n(c, 2) < 1 ? 'top' : 'bot'), h));
    }
  });

  /* ---------- spark 星芒 ---------- */
  PV.reg('decor', 'spark', {
    nm: '星芒', tags: ['pop', 'emotional', 'calm'], w: 0.7,
    when: function () { return PV.fx.decor > 0.4; },
    apply: function (c) {
      var h = '';
      for (var i = 0; i < 3; i++) {
        h += '<i style="left:' + (6 + n(c, 86)).toFixed(1) + '%;top:' + (8 + n(c, 78)).toFixed(1) +
          '%;width:' + (10 + Math.round(n(c, 26))) + 'px;height:' + (10 + Math.round(n(c, 26))) +
          'px;animation-delay:' + (n(c, 2.4)).toFixed(2) + 's"></i>';
      }
      return add(c, el('jv-spark', h));
    }
  });

  /* ---------- grid 网格底纹 ---------- */
  PV.reg('decor', 'grid', {
    nm: '网格', tags: ['graphic', 'editorial', 'glitch'], w: 0.7,
    when: function () { return PV.fx.texture > 0.15; },
    apply: function () {
      var layer = PV.layer();
      if (!layer) return null;
      if (!layer.querySelector('.jv-grid')) layer.insertBefore(el('jv-grid'), layer.firstChild);
      layer.querySelector('.jv-grid').style.opacity = (0.1 + 0.3 * PV.fx.texture).toFixed(3);
      return null;
    }
  });

  /* ---------- stripes 斜纹带 ---------- */
  PV.reg('decor', 'stripes', {
    nm: '斜纹', tags: ['pop', 'graphic'], w: 0.6,
    when: function () { return PV.fx.decor > 0.5; },
    apply: function (c) {
      return add(c, el('jv-stripes', '<i></i>'));
    }
  });

  /* ---------- bignum 巨大行号底纹 ---------- */
  PV.reg('decor', 'bignum', {
    nm: '底纹数字', tags: ['graphic', 'editorial', 'pop'], w: 0.7,
    when: function () { return PV.fx.density > 0.35; },
    apply: function (c) {
      return add(c, el('jv-bignum', String((c.idx || 0) + 1).padStart(2, '0')));
    }
  });

  /* ---------- ink 墨点 / 圆斑 ---------- */
  PV.reg('decor', 'ink', {
    nm: '墨点', tags: ['calm', 'emotional'], w: 0.6,
    when: function (c) { return PV.fx.decor > 0.4 && !c.ltr; },
    apply: function (c) {
      var h = '';
      for (var i = 0; i < 3; i++) {
        var s = (16 + Math.round(n(c, 70)));
        h += '<i style="left:' + (4 + n(c, 88)).toFixed(1) + '%;top:' + (6 + n(c, 82)).toFixed(1) +
          '%;width:' + s + 'px;height:' + Math.round(s * (0.5 + n(c, 0.7))) + 'px;opacity:' + (0.1 + n(c, 0.16)).toFixed(2) + '"></i>';
      }
      return add(c, el('jv-ink', h));
    }
  });

  /* ---------- note 注釈小字（`歌词|注釈`） ---------- */
  PV.reg('decor', 'note', {
    nm: '注釈', tags: ['editorial', 'calm'], w: 1,
    fit: function (c) { return !!c.note; },
    apply: function (c) {
      return add(c, el('jv-note', c.note));
    }
  });

  /* ---------- progress 本段进度条 ---------- */
  PV.reg('decor', 'progress', {
    nm: '进度', tags: ['graphic', 'editorial'], w: 0.7,
    when: function () { return PV.fx.decor > 0.5; },
    apply: function (c) {
      var d = el('jv-prog', '<i></i>');
      var r = add(c, d);
      var bar = c.el && c.el.querySelector('.jv-prog > i');
      if (!bar) return r;
      var span = Math.max(400, (c.t1 || 0) - (c.t0 || 0));
      var fr = function () {
        var p = PV.audio.time == null ? 0 : (PV.audio.time - (c.t0 || 0)) / span;
        bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, p)).toFixed(3) + ')';
      };
      fr();
      PV.onFrame(fr);
      return function () { PV.offFrame(fr); };
    }
  });

  /* ---------- waveband 随能量跳动的波形条 ---------- */
  PV.reg('decor', 'waveband', {
    nm: '波形条', tags: ['pop', 'glitch', 'graphic'], w: 0.8,
    when: function () { return PV.audio.energy != null; },
    apply: function (c) {
      var N = 16, h = '';
      for (var i = 0; i < N; i++) h += '<i></i>';
      var r = add(c, el('jv-wave-band ' + (n(c, 2) < 1 ? 'bot' : 'top'), h));
      var bars = c.el ? c.el.querySelectorAll('.jv-wave-band i') : [];
      if (!bars.length) return r;
      var fr = function () {
        var e = PV.audio.energy || 0, b = PV.audio.beat;
        var pulse = b ? Math.max(0, 1 - b.since / (b.len * 0.5)) : 0;
        for (var i = 0; i < bars.length; i++) {
          var k = 0.12 + e * 0.9 * (0.5 + 0.5 * Math.sin(i * 1.7 + (c.lt || 0) * 3.2)) + pulse * 0.35;
          bars[i].style.transform = 'scaleY(' + Math.max(0.06, Math.min(1.5, k)).toFixed(3) + ')';
        }
      };
      PV.onFrame(fr);
      return function () { PV.offFrame(fr); };
    }
  });

  /* ---------- cornernum 书刊页角（竖排小字 + 页码） ---------- */
  PV.reg('decor', 'cornernum', {
    nm: '页角', tags: ['editorial', 'calm'], w: 0.6,
    when: function (c) { return PV.fx.decor > 0.5 && !c.ltr; },
    apply: function (c) {
      return add(c, el('jv-corner',
        '<span class="pg">— ' + String((c.idx || 0) + 1).padStart(2, '0') + ' —</span>' +
        '<span class="vt">' + String((c.text || '').slice(0, 6)) + '</span>'));
    }
  });
})();
