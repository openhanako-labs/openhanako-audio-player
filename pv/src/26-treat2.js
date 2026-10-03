/* PV 引擎 · 26 处理扩充（⑭ treatment +14）
 *
 * JIZURA 的 27 件文字处理（treattrans 包）是 canvas 逐字画的：ctx.save/translate/vbands。
 * 我们这层是 DOM/CSS，所以搬的是**效果**不是代码——每件都用 CSS 原语重写一遍。
 *
 * 分工先划清（这是上一轮 ⑩ 学的教训：谁写哪个属性要事先定死，不然就是最后一个写的赢）：
 *   · .jv-w 的 transform      → 版式（位置与旋转）
 *   · .jv-w 的 translate      → 守卫 --gdx/--gdy + 本层 --ttx/--tty（合成在 base.css 里）
 *   · .jv-w 的 rotate / scale → 本层 --ttrot / --ttscale
 *   · i.jv-t 的 transform / opacity / filter → 登场层（WAAPI 动画）
 *   · i.jv-t 的涂装（stroke / shadow / clip）→ ⑩ 外观层
 * 所以本层**不碰 opacity、不碰 transform、不碰 text-shadow**：
 *   要淡用 filter: opacity()，要糊用 filter: blur()，要填色用 clip-path（外观层用的是 mask，不撞）。
 * 逐帧的件一律返回 cleanup 调 PV.offFrame——③⑤ 立过的规矩。
 */
(function () {
  'use strict';
  var PV = window.PV;

  function vars(el, o) { for (var k in o) el.style.setProperty(k, o[k]); }

  /* 一件处理：给本段的每个字按位置算一组 --tt* 值。
   * anim=true 时注册逐帧回调（随时间推进）。
   * 属性名必须写 CSS 写法（'clip-path'）：写成驼峰 clipPath 会被 style.setProperty
   * 静默丢掉——实测 karaokeFill 就这样完全没作用且不报错，只能靠逐件量改到几个字才拓得出来。
   * **不论动与不动都返回同一个 cleanup**：静太式的件也会留下面上的内联样式，
   * 不抹干净就会渗到下一段（⑩ 那边同一个坑）。*/
  function perChar(c, fn, anim) {
    var els = c.tokensEls || [], wraps = [];
    els.forEach(function (t) { if (t.parentElement) wraps.push(t.parentElement); });
    if (!wraps.length) return null;
    function paint(time) {
      for (var i = 0; i < wraps.length; i++) {
        var v = fn(i, wraps.length, time);
        if (v) vars(wraps[i], v);
      }
    }
    paint(0);
    if (!anim) return function () { clean(wraps, c); };
    var fr = function (lt) { paint(lt || 0); };
    PV.onFrame(fr);
    return function () { PV.offFrame(fr); clean(wraps, c); };
  }
  function clean(wraps, c) {
    for (var i = 0; i < wraps.length; i++) {
      var s = wraps[i].style;
      ['--ttx', '--tty', '--ttrot', '--ttscale', 'filter', 'clip-path', 'outline', 'border', 'border-radius', 'padding']
        .forEach(function (p) { s.removeProperty(p); });
    }
    if (c && c.el) c.el.style.removeProperty('letter-spacing');
  }

  /* ---------- 节奏与姿态 ---------- */
  PV.reg('treatment', 'sizeWave', {
    nm: '大小律动', w: 0.8, tags: ['pop', 'graphic', 'emotional'],
    apply: function (c) {
      var ph = PV.rnd(6.28);
      return perChar(c, function (i, n) {
        return { '--ttscale': (1 + 0.3 * Math.sin(ph + i * 0.9)).toFixed(3) };
      });
    }
  });

  PV.reg('treatment', 'rotateAlt', {
    nm: '摇摆字', w: 0.75, tags: ['pop', 'graphic', 'calm'],
    apply: function (c) {
      var amp = 2 + PV.rnd(6);
      return perChar(c, function (i) {
        return { '--ttrot': ((i % 2 ? 1 : -1) * amp).toFixed(1) + 'deg' };
      });
    }
  });

  PV.reg('treatment', 'baseShift', {
    nm: '基线错落', w: 0.75, tags: ['graphic', 'editorial', 'glitch'],
    apply: function (c) {
      return perChar(c, function (i) {
        var k = Math.sin((i + 1) * 2.399963) ;           // 黄金角伪随机，同 seed 稳定
        return { '--tty': (k * 9).toFixed(1) + 'px' };
      });
    }
  });

  PV.reg('treatment', 'jitterChar', {
    nm: '逐字抖动', w: 0.6, tags: ['glitch', 'horror'],
    when: function () { return PV.fx.glitch > 0.25; },
    apply: function (c) {
      var amp = 1 + PV.fx.glitch * 3;
      return perChar(c, function (i, n, t) {
        var s = Math.sin(t * 7 + i * 2.7) * amp, s2 = Math.cos(t * 9 + i * 1.9) * amp;
        return { '--ttx': s.toFixed(2) + 'px', '--tty': s2.toFixed(2) + 'px' };
      }, true);
    }
  });

  /* ---------- 时间与进度 ---------- */
  PV.reg('treatment', 'karaokeFill', {
    nm: '逐字填色', w: 0.85, tags: ['pop', 'editorial', 'emotional'],
    apply: function (c) {
      var span = Math.max(600, ((c.t1 || 4000) - (c.t0 || 0)) * 0.8) / 1000;
      return perChar(c, function (i, n, t) {
        var k = Math.min(1, Math.max(0, (t / span) * n - i));
        var p = Math.round(Math.max(0, Math.min(100, (1 - k) * 100)));
        return { 'clip-path': 'inset(0 ' + p + '% 0 0)' };
      }, true);
    }
  });

  PV.reg('treatment', 'focusPull', {
    nm: '虚实推进', w: 0.7, tags: ['emotional', 'calm'],
    when: function () { return PV.fx.chroma > 0.15; },
    apply: function (c) {
      return perChar(c, function (i, n, t) {
        var k = Math.sin(t * 1.1 - i * 0.5);
        return { filter: 'blur(' + Math.max(0, k * 2.4).toFixed(2) + 'px)' };
      }, true);
    }
  });

  PV.reg('treatment', 'afterglow', {
    nm: '余韵渐隐', w: 0.7, tags: ['calm', 'emotional'],
    apply: function (c) {
      var n = (c.tokensEls || []).length;
      return perChar(c, function (i) {
        var o = 1 - (i / Math.max(1, n - 1)) * (0.25 + PV.rnd(0.35));
        return { filter: 'opacity(' + o.toFixed(2) + ')' };
      });
    }
  });

  PV.reg('treatment', 'hueWave', {
    nm: '逐字换色', w: 0.6, tags: ['pop', 'glitch'],
    when: function () { return PV.fx.chroma > 0.3; },
    apply: function (c) {
      var step = 12 + PV.rnd(40);
      return perChar(c, function (i) {
        return { filter: 'hue-rotate(' + (i * step % 330) + 'deg) saturate(1.25)' };
      });
    }
  });

  /* ---------- 印刷与切版 ---------- */
  PV.reg('treatment', 'cutShift', {
    nm: '错位切断', w: 0.6, tags: ['glitch', 'graphic'],
    when: function () { return PV.fx.glitch > 0.2; },
    apply: function (c) {
      return perChar(c, function (i) {
        if (i % 3 !== 1) return null;
        var d = (PV.rnd(1) - 0.5) * 14;
        return { '--ttx': d.toFixed(1) + 'px', 'clip-path': 'inset(0 0 50% 0)' };
      });
    }
  });

  PV.reg('treatment', 'rgbSplitChar', {
    nm: '逐字色版错位', w: 0.6, tags: ['glitch', 'pop'],
    when: function () { return PV.fx.glitch > 0.15 && PV.fx.chroma > 0.15; },
    apply: function (c) {
      var d = 1.5 + PV.fx.glitch * 4;
      return perChar(c, function (i) {
        var f = i % 2 ? 'drop-shadow(' + d.toFixed(1) + 'px 0 0 rgba(255,0,80,.55))' : 'drop-shadow(-' + d.toFixed(1) + 'px 0 0 rgba(0,220,255,.5))';
        return { filter: f };
      });
    }
  });

  PV.reg('treatment', 'gridCell', {
    nm: '原稿用紙', w: 0.55, tags: ['editorial', 'graphic', 'calm'],
    fit: function (c) { return c.tokens.length <= 24; },
    apply: function (c) {
      return perChar(c, function () {
        return { outline: '1px solid color-mix(in srgb, var(--jv-fg) 30%, transparent)', outlineOffset: '3px' };
      });
    }
  });

  PV.reg('treatment', 'circledChar', {
    nm: '逐字圈', w: 0.5, tags: ['pop', 'emotional'],
    when: function () { return PV.fx.decor > 0.4; },
    fit: function (c) { return c.tokens.length <= 14; },
    apply: function (c) {
      return perChar(c, function () {
        return {
          border: '1px solid color-mix(in srgb, var(--jv-acc) 60%, transparent)',
          borderRadius: '50%', padding: '2px 4px'
        };
      });
    }
  });

  PV.reg('treatment', 'wideSpace', {
    nm: '字距拉开', w: 0.7, tags: ['editorial', 'calm', 'graphic'],
    apply: function (c) {
      if (c.el) c.el.style.setProperty('letter-spacing', (0.16 + PV.rnd(0.42)).toFixed(2) + 'em');
      return perChar(c, function () { return null; });
    }
  });
  PV.reg('treatment', 'spotChar', {
    nm: '一字加亮', w: 0.55, tags: ['pop', 'emotional', 'editorial'],
    apply: function (c) {
      var n = (c.tokensEls || []).length, hit = n ? Math.floor(PV.rnd(n)) : -1;
      return perChar(c, function (i) {
        if (i !== hit) return { filter: 'opacity(.72)' };
        return { '--ttscale': '1.18', filter: 'brightness(1.25) drop-shadow(0 0 6px color-mix(in srgb, var(--jv-acc) 60%, transparent))' };
      });
    }
  });
})();



