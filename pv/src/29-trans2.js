/* PV 引擎 · 29 转场扩充（⑰ transition +12）
 *
 * 契约（同 07-transition.js）：play(ctx, prev, next, swap)。
 *   · swap() 负责把新行挂上、旧行摘掉——**必须调用**，不调就是白屏；
 *   · 想在 swap 之前先演一段（旧行还在台上），就先动 prev，再在动画结束时 swap；
 *   · 想在 swap 之后演（新行已上台），先 swap() 再动 next——我们的 wipe 系都是后者，
 *     因为 swap 之后 DOM 稳定，不会出现"新旧两层同时在 clip 里打架"。
 *
 * 他们的 trans 池是 24 件（各包里的 `trReg(...)`）。这轮搬 12 件纯 clip / transform 能做的：
 * 斜带擦、时钟擦、观音开门、百叶、市松推入、块溶、像素 mosaic、覆盖/揭开、
 * 立方翻、短册移、闪接、 blink。
 */
(function () {
  'use strict';
  var PV = window.PV;

  function an(el, kf, opt) {
    if (!el) return null;
    if (!el.animate) return null;
    var a = el.animate(kf, opt);
    PV.addStop(function () { try { a.cancel(); } catch (e) { } });
    return a;
  }
  function D(ms) { return Math.round(ms * (0.7 + 0.6 * PV.fx.motion)); }
  /* 延时收尾：注册成 stop，退出 PV 时不会吊着一个已失效的定时器 */
  function setAfter(ms, fn) { var t = setTimeout(fn, ms); return function () { clearTimeout(t); }; }

  /* 斜带擦：clip-path 用多边形扫过（我们的 wipe 是直边，这里是斜边） */
  PV.reg('transition', 'diagWipe', {
    nm: '斜带擦', tags: ['graphic', 'pop'], w: 0.8,
    play: function (c, prev, next, swap) {
      swap();
      var dir = PV.rnd(2) ? 1 : -1;
      var from = dir > 0 ? 'polygon(0 100%, 0 100%, 0 0, 0 0)' : 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)';
      next.style.clipPath = from;
      an(next, [{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }],
        { duration: D(420), fill: 'both', easing: 'cubic-bezier(.6,0,.2,1)' });
      PV.addStop(function () { next.style.removeProperty('clip-path'); });
    }
  });

  /* 时钟擦：从中心角度扫开（conic mask，DOM 上做不了 conic clip 就用旋转遮罩近似） */
  PV.reg('transition', 'clockWipe', {
    nm: '时钟擦', tags: ['graphic', 'editorial'], w: 0.6,
    when: function () { return PV.fx.texture > 0.1; },
    play: function (c, prev, next, swap) {
      swap();
      an(next, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        { duration: D(520), fill: 'both', easing: 'steps(9, end)' });
      PV.addStop(function () { next.style.removeProperty('clip-path'); });
    }
  });

  /* 开门（⑳ 真合成）：旧行从中间合拢关掉，新行从中间拉开——两帧互补 */
  PV.reg('transition', 'doors', {
    nm: '开门', tags: ['graphic', 'pop', 'editorial'], w: 0.7, ownsPrev: 1,
    play: function (c, prev, next, swap, drop) {
      swap();
      var d = D(420);
      if (next) an(next, [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }],
        { duration: d, fill: 'both', easing: 'cubic-bezier(.5,0,.2,1)' });
      if (prev) an(prev, [{ clipPath: 'inset(0 0 0 0)', opacity: 1 },
        { clipPath: 'inset(0 50% 0 50%)', opacity: 0 }],
        { duration: d, fill: 'both', easing: 'ease-in' });
      PV.addStop(setAfter(d + 20, drop));
    }
  });

  /* 百叶（⑳ 真合成）：N 片竖条依次揭掉旧行、揭开新行。
   * prev 逐条 clip 掉、next 逐条 clip 显——两边互补，才真的是“两帧合成”。*/
  PV.reg('transition', 'blinds', {
    nm: '百叶', tags: ['graphic', 'glitch'], w: 0.6,
    when: function () { return PV.fx.motion > 0.3; }, ownsPrev: 1,
    play: function (c, prev, next, swap, drop) {
      swap();
      var n = 5 + Math.round(PV.rnd(5)), step = 46, dur = D(200), tot = dur + step * n;
      for (var i = 0; i < n; i++) {
        var l = (i * 100 / n).toFixed(3), r = ((n - i - 1) * 100 / n).toFixed(3);
        var clip = 'inset(0 ' + r + '% 0 ' + l + '%)';
        if (prev) an(prev, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: clip }],
          { duration: dur, delay: i * step, fill: 'both', easing: 'ease-in' });
        if (next) an(next, [{ clipPath: clip }, { clipPath: 'inset(0 0 0 0)' }],
          { duration: dur, delay: i * step, fill: 'both', easing: 'ease-out' });
      }
      PV.addStop(setAfter(tot + 30, drop));
    }
  });

  /* 市松推（⑳ 真合成）：棋盘遮罩尺寸从小到大——旧行用反相遮罩同时退场。
   * 两件共用一个 mask 表达式，只是一个从疏到密、一个从密到疏。*/
  PV.reg('transition', 'checkerIn', {
    nm: '市松推', tags: ['graphic', 'pop'], w: 0.5, ownsPrev: 1,
    play: function (c, prev, next, swap, drop) {
      swap();
      var d = D(520), mask = 'repeating-conic-gradient(#000 0 25%, transparent 0 50%)';
      [next, prev].forEach(function (el, idx) {
        if (!el) return;
        el.style.setProperty('-webkit-mask-image', mask);
        el.style.setProperty('mask-image', mask);
        an(el, [
          { maskSize: (idx ? '6% 9%' : '400% 400%'), opacity: idx ? 1 : 1 },
          { maskSize: (idx ? '400% 400%' : '6% 9%'), opacity: idx ? 0 : 1 }
        ], { duration: d, fill: 'both', easing: 'ease-in-out' });
      });
      PV.addStop(setAfter(d + 30, function () {
        [next, prev].forEach(function (el) {
          if (!el) return;
          el.style.removeProperty('-webkit-mask-image'); el.style.removeProperty('mask-image');
          el.style.removeProperty('opacity');
        });
        drop();
      }));
    }
  });

  /* 块溶：mosaic 像素化后显形 */
  PV.reg('transition', 'pixelate', {
    nm: '像素化', tags: ['glitch', 'graphic'], w: 0.6,
    when: function () { return PV.fx.glitch > 0.15; },
    play: function (c, prev, next, swap) {
      swap();
      an(next, [
        { filter: 'blur(9px) contrast(2.4)', opacity: 0, transform: 'scale(1.06)' },
        { filter: 'blur(0px) contrast(1)', opacity: 1, transform: 'none' }
      ], { duration: D(440), fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  });

  /* 覆盖：新行整块压进来（带底色，遮住旧行） */
  PV.reg('transition', 'cover', {
    nm: '覆盖', tags: ['editorial', 'graphic'], w: 0.6,
    play: function (c, prev, next, swap) {
      swap();
      var dir = PV.rnd(2) < 1 ? 100 : -100;
      an(next, [{ transform: 'translateX(' + dir + '%)' }, { transform: 'none' }],
        { duration: D(420), fill: 'both', easing: 'cubic-bezier(.3,.9,.2,1)' });
      if (prev) an(prev, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(' + (-dir * 0.4) + '%)', opacity: .1 }],
        { duration: D(420), fill: 'both' });
    }
  });

  /* 立方翻：绕侧边 3D 转进来 */
  PV.reg('transition', 'cubeTurn', {
    nm: '立方翻', tags: ['graphic', 'pop'], w: 0.55,
    when: function () { return PV.fx.motion > 0.3; },
    play: function (c, prev, next, swap) {
      swap();
      var dir = PV.rnd(2) < 1 ? 1 : -1;
      next.style.transformOrigin = dir > 0 ? 'left center' : 'right center';
      an(next, [
        { transform: 'perspective(1000px) rotateY(' + (dir * 78) + 'deg)', opacity: .3 },
        { transform: 'perspective(1000px) rotateY(0deg)', opacity: 1 }
      ], { duration: D(480), fill: 'both', easing: 'cubic-bezier(.3,.8,.2,1)' });
      PV.addStop(function () { next.style.removeProperty('transform-origin'); });
    }
  });

  /* 短册移：竖向三段依次落位 */
  PV.reg('transition', 'sliceShiftIn', {
    nm: '短册移', tags: ['graphic', 'glitch', 'pop'], w: 0.55,
    play: function (c, prev, next, swap) {
      swap();
      var toks = (c.tokensEls || []).slice(0, 24);
      toks.forEach(function (el, i) {
        var d = (i % 3) * 70;
        an(el, [{ transform: 'translateY(-1.6em)', opacity: 0 }, { transform: 'none', opacity: 1 }],
          { duration: D(340), delay: d, fill: 'both', easing: 'cubic-bezier(.2,.9,.3,1)' });
      });
      if (!toks.length) an(next, [{ opacity: 0 }, { opacity: 1 }], { duration: D(300), fill: 'both' });
    }
  });

  /* 闪接：白闪一下再显形（我们已有 flash 是整屏闪，这个是先闪后现） */
  PV.reg('transition', 'flashCross', {
    nm: '闪接', tags: ['pop', 'glitch', 'emotional'], w: 0.55,
    when: function () { return PV.fx.motion > 0.35; },
    play: function (c, prev, next, swap) {
      swap();
      an(next, [{ opacity: 0, filter: 'brightness(3.2)' }, { opacity: 1, filter: 'brightness(1)' }],
        { duration: D(360), fill: 'both', easing: 'steps(3, end)' });
    }
  });

  /* 眨眼：旧行瞬间消失，新行延迟出现（留半拍黑） */
  PV.reg('transition', 'blink', {
    nm: '眨眼', tags: ['emotional', 'editorial', 'horror'], w: 0.5,
    play: function (c, prev, next, swap) {
      if (prev) prev.style.opacity = '0';
      var t = setTimeout(function () { swap(); }, D(90));
      PV.addStop(function () { clearTimeout(t); });
      an(next, [{ opacity: 0 }, { opacity: 1 }], { duration: D(280), fill: 'both', easing: 'ease-out' });
    }
  });

  /* 栅线擦：一条亮线先扫过，字跟在线后出现 */
  PV.reg('transition', 'ruleWipe', {
    nm: '栅线擦', tags: ['editorial', 'graphic'], w: 0.5,
    play: function (c, prev, next, swap) {
      swap();
      var line = document.createElement('i');
      line.className = 'jv-trans-line';
      next.appendChild(line);
      an(line, [{ transform: 'translateX(0) scaleX(1)', opacity: .9 }, { transform: 'translateX(100%) scaleX(.4)', opacity: 0 }],
        { duration: D(460), fill: 'both', easing: 'ease-in' });
      an(next, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        { duration: D(460), fill: 'both', easing: 'cubic-bezier(.5,0,.2,1)' });
      PV.addStop(function () { if (line.parentNode) line.parentNode.removeChild(line); });
    }
  });
})();
