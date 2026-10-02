/* PV 引擎 · 24 退场扩充（⑫ exit +10）
 *
 * 契约同 05-exit.js：play(ctx, el, drop)，收尾**必须**调 drop()，否则上一行永远赖在台上。
 * drop 一律走 after() 注册成 stop——退出 PV 时会被取消，不留悬挂的定时器。
 * 同样只动 transform / opacity / clip-path / filter，不写 text-shadow 与颜色（⑩ 外观层的地盘）。
 *
 * 每件都自己声明 dur：引擎靠它算「退场还没走完就来下一段」的超时。
 */
(function () {
  'use strict';
  var PV = window.PV;

  function tk(el) { return Array.prototype.slice.call(el.querySelectorAll('.jv-t')); }
  function after(ms, fn) { var t = setTimeout(fn, ms); return function () { clearTimeout(t); }; }
  function M(k) { return (k || 1) * (0.7 + 0.6 * PV.fx.motion); }

  function whole(el, kf, dur, ease) {
    el.classList.add('jv-out');
    if (el.animate) el.animate(kf, { duration: dur, fill: 'both', easing: ease || 'ease-in' });
    return dur;
  }

  PV.reg('exit', 'driftUp', {
    nm: '上浮', tags: ['calm', 'emotional'], w: 0.8, dur: 460,
    play: function (c, el, drop) {
      var d = whole(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-1.1em)' }], M(460));
      PV.addStop(after(d + 30, drop));
    }
  });

  PV.reg('exit', 'driftSide', {
    nm: '侧飘', tags: ['editorial', 'graphic', 'pop'], w: 0.8, dur: 420,
    play: function (c, el, drop) {
      var dir = PV.rnd(1) < 0.5 ? -1 : 1;
      var d = whole(el, [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateX(' + (dir * 2.2).toFixed(2) + 'em)' }
      ], M(420));
      PV.addStop(after(d + 30, drop));
    }
  });

  PV.reg('exit', 'shrink', {
    nm: '收缩', tags: ['calm', 'editorial', 'graphic'], w: 0.7, dur: 400,
    play: function (c, el, drop) {
      var d = whole(el, [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(.72)' }
      ], M(400));
      PV.addStop(after(d + 30, drop));
    }
  });

  PV.reg('exit', 'rollOut', {
    nm: '旋出', tags: ['pop', 'graphic', 'emotional'], w: 0.7, dur: 520,
    when: function () { return PV.fx.motion > 0.3; },
    play: function (c, el, drop) {
      var dir = PV.rnd(1) < 0.5 ? -1 : 1;
      var d = whole(el, [
        { opacity: 1, transform: 'rotate(0deg) scale(1)' },
        { opacity: 0, transform: 'rotate(' + (dir * 26).toFixed(0) + 'deg) scale(.8) translateY(.5em)' }
      ], M(520));
      PV.addStop(after(d + 30, drop));
    }
  });

  PV.reg('exit', 'wipeOut', {
    nm: '擦出', tags: ['graphic', 'editorial'], w: 0.7, dur: 440,
    play: function (c, el, drop) {
      el.classList.add('jv-out');
      if (el.animate) el.animate([
        { clipPath: 'inset(0 0 0 0)', opacity: 1 },
        { clipPath: 'inset(0 100% 0 0)', opacity: 1 }
      ], { duration: M(440), fill: 'both', easing: 'ease-in' });
      PV.addStop(after(M(440) + 30, drop));
    }
  });

  PV.reg('exit', 'flipOut', {
    nm: '折出', tags: ['graphic', 'glitch', 'pop'], w: 0.6, dur: 460,
    play: function (c, el, drop) {
      var d = whole(el, [
        { opacity: 1, transform: 'perspective(500px) rotateX(0deg)' },
        { opacity: 0, transform: 'perspective(500px) rotateX(88deg)' }
      ], M(460));
      PV.addStop(after(d + 30, drop));
    }
  });

  PV.reg('exit', 'blurOut', {
    nm: '化开', tags: ['emotional', 'calm'], w: 0.7, dur: 560,
    play: function (c, el, drop) {
      var d = whole(el, [
        { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
        { opacity: 0, filter: 'blur(' + (6 + PV.fx.motion * 10).toFixed(1) + 'px)', transform: 'scale(1.06)' }
      ], M(560));
      PV.addStop(after(d + 30, drop));
    }
  });

  /* 逐字倒序退：最后一个字先走，读起来像被抽走 */
  PV.reg('exit', 'reverseFade', {
    nm: '倒序退', tags: ['editorial', 'calm', 'emotional'], w: 0.6, dur: 420,
    play: function (c, el, drop) {
      var els = tk(el), step = Math.max(14, 420 / Math.max(1, els.length)) * 0.5;
      el.classList.add('jv-out');
      els.forEach(function (e, i) {
        if (!e.animate) return;
        e.animate([{ opacity: 1 }, { opacity: 0 }],
          { duration: M(300), delay: (els.length - 1 - i) * step, fill: 'both', easing: 'ease-in' });
      });
      PV.addStop(after(M(300) + step * els.length + 40, drop));
    }
  });

  PV.reg('exit', 'crumble', {
    nm: '碎落', tags: ['horror', 'glitch', 'emotional'], w: 0.7, dur: 620,
    when: function () { return PV.fx.motion > 0.3; },
    fit: function (c) { return c.tokens.length <= 34; },
    play: function (c, el, drop) {
      var els = tk(el), d = M(560);
      el.classList.add('jv-out');
      els.forEach(function (e, i) {
        if (!e.animate) return;
        var dx = (PV.rnd(1) - 0.5) * 26, rot = (PV.rnd(1) - 0.5) * 40;
        e.animate([
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translate(' + dx.toFixed(1) + 'px, 1.6em) rotate(' + rot.toFixed(0) + 'deg)' }
        ], { duration: d, delay: i * 12, fill: 'both', easing: 'cubic-bezier(.4,0,.7,1)' });
      });
      PV.addStop(after(d + els.length * 12 + 40, drop));
    }
  });

  /* 甩出去：整行带残影加速横移，落在强拍行上最狠 */
  PV.reg('exit', 'whipOut', {
    nm: '甩出', tags: ['pop', 'glitch', 'graphic'], w: 0.7, dur: 360,
    when: function () { return PV.fx.motion > 0.45; },
    play: function (c, el, drop) {
      var dir = PV.rnd(1) < 0.5 ? -1 : 1;
      var d = whole(el, [
        { opacity: 1, transform: 'none' },
        { opacity: 0.9, transform: 'translateX(' + (dir * 0.4).toFixed(2) + 'em) skewX(' + (dir * 8) + 'deg)', offset: 0.3 },
        { opacity: 0, transform: 'translateX(' + (dir * 8).toFixed(1) + 'em) skewX(' + (dir * 18) + 'deg)' }
      ], M(340), 'cubic-bezier(.5,0,.9,.4)');
      PV.addStop(after(d + 20, drop));
    }
  });
})();
