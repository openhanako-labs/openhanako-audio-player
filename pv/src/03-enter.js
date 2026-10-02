/* PV 引擎 · 03 登场层 enter
 * 只动 i.jv-t（内层）。版式写在外层 .jv-w 上的 transform 不受影响。
 * 一律用 WAAPI（el.animate），fill:both 保证停稳在终态。
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* 统一跑一条动画并登记取消 */
  function ani(c, el, kf, opt) {
    if (!el.animate) {                         // 极端降级：直接终态
      Object.keys(kf[kf.length - 1] || {}).forEach(function (p) {
        if (p !== 'offset') el.style[p] = kf[kf.length - 1][p];
      });
      return;
    }
    var a = el.animate(kf, opt);
    PV.addStop(function () { try { a.cancel(); } catch (e) { } });
  }

  function each(c, els, kf, opt, stagger, base) {
    var st = c.stagger == null ? 45 : c.stagger;
    if (stagger != null) st = stagger;
    els.forEach(function (el, i) {
      var o = Object.assign({ delay: (base || 0) + i * st, fill: 'both', easing: 'cubic-bezier(.22,1,.36,1)' }, opt || {});
      ani(c, el, kf, o);
    });
  }

  PV.reg('enter', 'none', { nm: '直出', dur: 0, staggerOf: 1, apply: function () { } });

  /* 旧实现唯一的入场：逐字淡入 + 上移一个 em（jzWin → rise，参数原样） */
  PV.reg('enter', 'rise', {
    nm: '升起', tags: ['calm', 'pop', 'graphic', 'editorial'], w: 1.3, dur: 500, staggerOf: 1,
    apply: function (c, els) {
      each(c, els, [{ opacity: 0, transform: 'translateY(.5em)' }, { opacity: 1, transform: 'none' }], { duration: 500 });
    }
  });

  PV.reg('enter', 'fade', {
    nm: '淡入', tags: ['calm', 'emotional'], w: 0.9, dur: 620, staggerOf: 0.5,
    apply: function (c, els) {
      each(c, els, [{ opacity: 0 }, { opacity: 1 }], { duration: 620, easing: 'ease-out' }, Math.max(18, (c.stagger || 45) * 0.5));
    }
  });

  PV.reg('enter', 'drop', {
    nm: '落下', tags: ['pop', 'graphic'], w: 1, dur: 560, staggerOf: 1,
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'translateY(-.7em) scale(1.12)' },
        { opacity: 0.6, transform: 'translateY(.12em) scale(.99)', offset: 0.62 },
        { opacity: 1, transform: 'none' }
      ], { duration: 560, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    }
  });

  PV.reg('enter', 'zoomIn', {
    nm: '放大落定', tags: ['emotional', 'pop'], w: 0.9, dur: 480, staggerOf: 0.45,
    apply: function (c, els) {
      each(c, els, [{ opacity: 0, transform: 'scale(1.85)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 480, easing: 'cubic-bezier(.16,.9,.3,1)' }, Math.max(14, (c.stagger || 45) * 0.45));
    }
  });

  PV.reg('enter', 'wipe', {
    nm: '擦出', tags: ['editorial', 'graphic'], w: 0.9, dur: 420, staggerOf: 0.6,
    fit: function (c) { return c.tokens.length <= 26; },
    apply: function (c, els) {
      each(c, els, [{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }],
        { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)' }, Math.max(22, (c.stagger || 45) * 0.6));
    }
  });

  PV.reg('enter', 'blur', {
    nm: '聚焦', tags: ['calm', 'emotional'], w: 0.8, dur: 540, staggerOf: 0.55,
    when: function () { return PV.fx.motion >= 0; },
    apply: function (c, els) {
      each(c, els, [{ opacity: 0, filter: 'blur(9px)' }, { opacity: 1, filter: 'blur(0)' }],
        { duration: 540, easing: 'ease-out' }, Math.max(20, (c.stagger || 45) * 0.55));
    }
  });

  /* 砸入：紧 stagger + 缩放过冲，整行像被拍到屏幕上 */
  PV.reg('enter', 'slam', {
    nm: '砸入', tags: ['pop', 'graphic', 'glitch'], w: 1, dur: 260, staggerOf: 0.4,
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'scale(2.1) rotate(-2deg)' },
        { opacity: 1, transform: 'scale(.97)', offset: 0.55 },
        { opacity: 1, transform: 'none' }
      ], { duration: 260, easing: 'cubic-bezier(.2,.9,.2,1)' }, 18);
    }
  });

  /* 乱码定格：先滚本行自己的字 + 符号，逐字落定 */
  var SYM = '＊＋◇○△□※';
  PV.reg('enter', 'scramble', {
    nm: '乱码定格', tags: ['glitch', 'graphic'], w: 0.8, dur: 90, staggerOf: 1,
    fit: function (c) { return c.tokens.length <= 24; },
    apply: function (c, els) {
      var pool = (c.text || '').replace(/\s/g, '').split('').concat(SYM.split(''));
      if (!pool.length || !els.length) return;
      var st = c.stagger == null ? 45 : c.stagger;
      var t0 = performance.now(), done = [], raf = 0;
      els.forEach(function (el, i) { el._final = el.textContent; done[i] = false; });
      /* 一条 rAF 看完一整行，切行时一次取消——旧写法每字一条链，取消只记得住最后一个 */
      var tick = function () {
        var d = performance.now() - t0, alive = false;
        for (var i = 0; i < els.length; i++) {
          if (done[i]) continue;
          alive = true;
          if (d >= 90 + i * st) { els[i].textContent = els[i]._final; done[i] = true; continue; }
          if (Math.floor(d / 46) !== Math.floor((d - 16) / 46)) els[i].textContent = pool[Math.floor(Math.random() * pool.length)];
        }
        if (alive) raf = requestAnimationFrame(tick);
      };
      tick();
      PV.addStop(function () { if (raf) cancelAnimationFrame(raf); });
    }
  });
})();
