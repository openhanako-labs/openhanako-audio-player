/* PV 引擎 · 07 衔接层 transition
 * play(ctx, prev, next, swap)：决定新行什么时候上、怎么上。
 * prev 怎么送走属于退场层，不在这里抢；只有 overlap 类需要 transition 自己按住 prev。
 * 旧实现等于这里的 cut——innerHTML 直接覆盖。
 */
(function () {
  'use strict';
  var PV = window.PV;

  function an(el, kf, opt) {
    if (!el || !el.animate) return null;
    var a = el.animate(kf, opt);
    PV.addStop(function () { try { a.cancel(); } catch (e) { } });
    return a;
  }

  PV.reg('transition', 'cut', {
    nm: '硬切', w: 1,
    play: function (c, prev, next, swap) { swap(); }
  });

  PV.reg('transition', 'fade', {
    nm: '叠化', tags: ['calm', 'emotional', 'editorial'], w: 1,
    play: function (c, prev, next, swap) {
      swap();
      an(next, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 + 220 * PV.fx.motion, fill: 'both', easing: 'ease-out' });
    }
  });

  PV.reg('transition', 'wipe', {
    nm: '擦入', tags: ['graphic', 'pop', 'editorial'], w: 0.9,
    play: function (c, prev, next, swap) {
      var dir = PV.rnd(4);
      var from = ['inset(0 100% 0 0)', 'inset(0 0 0 100%)', 'inset(100% 0 0 0)', 'inset(0 0 100% 0)'][dir];
      swap();
      an(next, [{ clipPath: from, opacity: 1 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }],
        { duration: 320 + 180 * PV.fx.motion, fill: 'both', easing: 'cubic-bezier(.5,0,.2,1)' });
    }
  });

  PV.reg('transition', 'push', {
    nm: '推入', tags: ['pop', 'graphic'], w: 0.9,
    play: function (c, prev, next, swap) {
      var horiz = PV.rnd(2) < 1;
      var dx = horiz ? (PV.rnd(2) < 1 ? 46 : -46) : 0;
      var dy = horiz ? 0 : (PV.rnd(2) < 1 ? 42 : -42);
      swap();
      an(next, [{ transform: 'translate(' + dx + 'vw,' + dy + 'vh)' }, { transform: 'none' }],
        { duration: 360 + 160 * PV.fx.motion, fill: 'both', easing: 'cubic-bezier(.2,.9,.25,1)' });
      if (prev) an(prev, [{ transform: 'none', opacity: 1 }, { transform: 'translate(' + (-dx * 0.55) + 'vw,' + (-dy * 0.55) + 'vh)', opacity: .25 }],
        { duration: 360, fill: 'both', easing: 'ease-out' });
    }
  });

  PV.reg('transition', 'zoomThrough', {
    nm: '穿越', tags: ['pop', 'emotional', 'glitch'], w: 0.85,
    when: function () { return PV.fx.motion > 0.25; },
    play: function (c, prev, next, swap) {
      swap();
      an(next, [{ transform: 'scale(1.34)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 420, fill: 'both', easing: 'cubic-bezier(.16,.86,.32,1)' });
      if (prev) an(prev, [{ transform: 'none', opacity: 1 }, { transform: 'scale(1.3)', opacity: 0 }],
        { duration: 300, fill: 'both', easing: 'ease-in' });
    }
  });

  PV.reg('transition', 'iris', {
    nm: '光圈', tags: ['calm', 'graphic', 'editorial'], w: 0.7,
    play: function (c, prev, next, swap) {
      swap();
      an(next, [{ clipPath: 'circle(3% at 50% 50%)', opacity: 1 }, { clipPath: 'circle(78% at 50% 50%)', opacity: 1 }],
        { duration: 480, fill: 'both', easing: 'cubic-bezier(.3,.7,.3,1)' });
    }
  });

  PV.reg('transition', 'whip', {
    nm: '甩镜', tags: ['pop', 'glitch', 'graphic'], w: 0.8,
    when: function () { return PV.fx.motion > 0.5; },
    play: function (c, prev, next, swap) {
      var sgn = PV.rnd(2) < 1 ? 1 : -1;
      swap();
      an(next, [
        { transform: 'translateX(' + (sgn * 22) + 'vw) skewX(' + (sgn * 9) + 'deg)', filter: 'blur(7px)', opacity: .2 },
        { transform: 'translateX(' + (sgn * 3) + 'vw) skewX(' + (sgn * 2) + 'deg)', filter: 'blur(2px)', opacity: 1, offset: .6 },
        { transform: 'none', filter: 'blur(0)', opacity: 1 }
      ], { duration: 340, fill: 'both', easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
  });

  PV.reg('transition', 'flash', {
    nm: '白闪', tags: ['glitch', 'pop', 'graphic', 'horror'], w: 0.9,
    impact: 1,
    when: function (c) { return PV.fx.glitch > 0.12 || PV.fx.motion > 0.55 || !!(c && c.flash); },
    play: function (c, prev, next, swap) {
      swap();
      var layer = PV.layer();
      if (!layer) return;
      var f = document.createElement('div');
      f.className = 'jv-flash' + (PV.fx.glitch > 0.5 ? ' hard' : '');
      layer.appendChild(f);
      var t = setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 150);
      PV.addStop(function () { clearTimeout(t); if (f.parentNode) f.parentNode.removeChild(f); });
      if (f.animate) f.animate([{ opacity: .85 }, { opacity: 0 }], { duration: 150, fill: 'both', easing: 'steps(2,end)' });
    }
  });

  PV.reg('transition', 'blur', {
    nm: '虚接', tags: ['calm', 'emotional'], w: 0.8,
    play: function (c, prev, next, swap) {
      swap();
      an(next, [{ filter: 'blur(12px)', opacity: 0 }, { filter: 'blur(0)', opacity: 1 }],
        { duration: 460, fill: 'both', easing: 'ease-out' });
    }
  });
})();
