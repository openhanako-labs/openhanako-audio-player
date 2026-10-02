/* PV 引擎 · 23 登场扩充（⑪ enter +12）
 *
 * 规矩不变（见 03-enter.js）：只动内层 i.jv-t，全部 WAAPI，fill:both 停稳在终态。
 * 一件都不能碰 text-shadow / color 这类涂装——那是 ⑩ 外观层用 CSS 写的，
 * 动画的优先级压过普通作者样式，进场一写就把外观永久盖掉了（这个雷在 ⑦ 之前踩过一次，
 * 那次是 transform）。所以这里只用 transform / opacity / filter / clip-path。
 *
 * dur 与 staggerOf 必须写准：体检的「入场超时」用它算总时长，
 * 少写一点就等于骗过守卫，实机上字还在动下一段就来了。
 */
(function () {
  'use strict';
  var PV = window.PV;

  function ani(c, el, kf, opt) {
    /* 同 03-enter：读本段的 tempo，段太短就连时长一起缩，不缩就等于引擎白收了一刀 */
    if (opt && opt.duration != null && c && c.tempo && c.tempo < 1)
      opt = Object.assign({}, opt, { duration: Math.max(90, Math.round(opt.duration * c.tempo)) });
    var a = el.animate(kf, opt);
    PV.addStop(function () { try { a.cancel(); } catch (e) { } });
  }
  function each(c, els, kf, opt, stagger) {
    var st = c.stagger == null ? 45 : c.stagger;
    if (stagger != null) st = stagger * (c.tempo || 1);
    var o = Object.assign({ fill: 'both', easing: 'cubic-bezier(.22,1,.36,1)' }, opt || {});
    els.forEach(function (el, i) { o.delay = i * st; ani(c, el, kf, o); });
  }
  function M(k) { return (k || 1) * (0.7 + 0.6 * PV.fx.motion); }   // 强度调制：静=慢而轻，故障=快而狠

  PV.reg('enter', 'flip', {
    nm: '翻入', tags: ['graphic', 'pop', 'glitch'], w: 0.8, dur: 460, staggerOf: 0.8,
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'perspective(500px) rotateX(-92deg)' },
        { opacity: 1, transform: 'perspective(500px) rotateX(0deg)' }
      ], { duration: M(460), easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    }
  });

  PV.reg('enter', 'spin', {
    nm: '旋入', tags: ['pop', 'graphic', 'emotional'], w: 0.7, dur: 520, staggerOf: 0.7,
    when: function () { return PV.fx.motion > 0.35; },
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'rotate(-140deg) scale(.3)' },
        { opacity: 1, transform: 'rotate(0deg) scale(1)' }
      ], { duration: M(520) });
    }
  });

  PV.reg('enter', 'slideL', {
    nm: '左滑入', tags: ['editorial', 'graphic', 'pop'], w: 0.8, dur: 380, staggerOf: 0.55,
    apply: function (c, els) {
      var step = 0.55 + PV.rnd(0.5);
      each(c, els, [
        { opacity: 0, transform: 'translateX(-' + (step).toFixed(2) + 'em)' },
        { opacity: 1, transform: 'translateX(0)' }
      ], { duration: M(380), easing: 'cubic-bezier(.16,1,.3,1)' });
    }
  });

  PV.reg('enter', 'slideR', {
    nm: '右滑入', tags: ['editorial', 'graphic'], w: 0.7, dur: 380, staggerOf: 0.55,
    apply: function (c, els) {
      var step = 0.55 + PV.rnd(0.5);
      each(c, els, [
        { opacity: 0, transform: 'translateX(' + step.toFixed(2) + 'em)' },
        { opacity: 1, transform: 'translateX(0)' }
      ], { duration: M(380), easing: 'cubic-bezier(.16,1,.3,1)' });
    }
  });

  PV.reg('enter', 'skewIn', {
    nm: '斜切入', tags: ['glitch', 'graphic', 'pop'], w: 0.7, dur: 420, staggerOf: 0.6,
    when: function () { return PV.fx.glitch > 0.1; },
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'skewX(26deg) translateX(-.6em)' },
        { opacity: 1, transform: 'skewX(0deg) translateX(0)' }
      ], { duration: M(420) });
    }
  });

  PV.reg('enter', 'pop', {
    nm: '弹入', tags: ['pop', 'emotional'], w: 0.8, dur: 520, staggerOf: 0.75,
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'scale(.4)' },
        { opacity: 1, transform: 'scale(1.14)', offset: 0.62 },
        { opacity: 1, transform: 'scale(1)' }
      ], { duration: M(520), easing: 'cubic-bezier(.3,1.4,.5,1)' });
    }
  });

  PV.reg('enter', 'maskUp', {
    nm: '幕升', tags: ['editorial', 'calm', 'emotional'], w: 0.8, dur: 520, staggerOf: 0.4,
    apply: function (c, els) {
      each(c, els, [
        { clipPath: 'inset(100% 0 0 0)' },
        { clipPath: 'inset(0% 0 0 0)' }
      ], { duration: M(520) });
    }
  });

  PV.reg('enter', 'maskDown', {
    nm: '幕落', tags: ['editorial', 'graphic'], w: 0.6, dur: 480, staggerOf: 0.35,
    apply: function (c, els) {
      each(c, els, [
        { clipPath: 'inset(0 0 100% 0)' },
        { clipPath: 'inset(0 0 0% 0)' }
      ], { duration: M(480) });
    }
  });

  PV.reg('enter', 'jitterIn', {
    nm: '抖定', tags: ['glitch', 'horror'], w: 0.7, dur: 460, staggerOf: 0.5,
    when: function () { return PV.fx.glitch > 0.25; },
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'translate(-4px,3px)' },
        { opacity: .7, transform: 'translate(3px,-2px)' },
        { opacity: .85, transform: 'translate(-2px,-3px)' },
        { opacity: 1, transform: 'translate(0,0)' }
      ], { duration: M(460), easing: 'steps(4,end)' });
    }
  });

  PV.reg('enter', 'unfold', {
    nm: '展开', tags: ['graphic', 'editorial', 'calm'], w: 0.7, dur: 460, staggerOf: 0.6,
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'scaleY(.04)' },
        { opacity: 1, transform: 'scaleY(1)' }
      ], { duration: M(460), transformOrigin: '50% 100%' });
    }
  });

  PV.reg('enter', 'swingIn', {
    nm: '摆入', tags: ['emotional', 'pop', 'calm'], w: 0.6, dur: 640, staggerOf: 0.7,
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'rotate(-24deg) translateY(-.4em)' },
        { opacity: 1, transform: 'rotate(9deg)', offset: 0.55 },
        { opacity: 1, transform: 'rotate(-3deg)', offset: 0.8 },
        { opacity: 1, transform: 'rotate(0deg)' }
      ], { duration: M(640), transformOrigin: '50% 0%' });
    }
  });

  PV.reg('enter', 'waveIn', {
    nm: '浪入', tags: ['pop', 'emotional', 'graphic'], w: 0.7, dur: 560, staggerOf: 1,
    fit: function (c) { return c.tokens.length <= 26; },
    apply: function (c, els) {
      each(c, els, [
        { opacity: 0, transform: 'translateY(1.4em)' },
        { opacity: 1, transform: 'translateY(-.22em)', offset: 0.7 },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: M(560) });
    }
  });
})();
