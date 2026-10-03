/* PV 引擎 · 31 真合成转场补充（③ 续）
 * 三件从「只动新行」升级成 prev / next 互补：
 *   时钟擦 —— conic 遮罩角度扫过（注册 @property 才能动画自定义属性）
 *   斜带擦 —— 两边用互补的多边形 clip，旧行被斜边推走
 *   短册移 —— 竖条 mask 左右反向滑移，旧行拆成条退场
 *
 * 收尾一律靠 setAfter 定时 drop（不用 animationend：元素被摘走时事件可能不再触发）。
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
  function setAfter(ms, fn) { var t = setTimeout(fn, ms); return function () { clearTimeout(t); }; }
  function D(ms) { return Math.round(ms * (0.7 + 0.6 * PV.fx.motion)); }
  function clean(el, props) {
    if (!el) return;
    props.forEach(function (p) { el.style.removeProperty(p); });
  }
  var MASKS = ['mask-image', '-webkit-mask-image', 'mask-size', 'mask-position', '-webkit-mask-position'];

  /* 时钟擦（真合成）：conic 角度从 0 扫到 360，新行按角度揭开、旧行按角度消失 */
  PV.reg('transition', 'clockWipe', {
    nm: '时钟擦', tags: ['graphic', 'editorial'], w: 0.6,
    when: function () { return PV.fx.texture > 0.1; }, ownsPrev: 1,
    play: function (c, prev, next, swap, drop) {
      swap();
      var d = D(620);
      var support = window.CSS && CSS.registerProperty !== undefined;
      if (!support) {
        // 退化：走 steps 单向揭开，至少不会白屏
        if (next) an(next, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
          { duration: d, fill: 'both', easing: 'steps(9, end)' });
        PV.addStop(setAfter(d + 20, drop));
        return;
      }
      var conic = function (a) { return 'conic-gradient(from -90deg at 50% 50%, #000 ' + a + ', transparent 0)'; };
      /* 遮罩本身写在 css/trans2.css 的 [data-cw] 规则里（引用注册过的 --cwA），
       * 这里只开关标记 + 动画那个角度变量——未注册的自定义属性 WAAPI 不会插值。*/
      if (next) {
        next.dataset.cw = '1'; next.style.setProperty('--cwA', '0deg');
        an(next, [{ '--cwA': '0deg' }, { '--cwA': '360deg' }], { duration: d, fill: 'both', easing: 'cubic-bezier(.5,0,.2,1)' });
      }
      if (prev) {
        prev.dataset.cw = '1'; prev.style.setProperty('--cwA', '360deg');
        an(prev, [{ '--cwA': '360deg' }, { '--cwA': '0deg' }], { duration: d, fill: 'both', easing: 'cubic-bezier(.5,0,.2,1)' });
      }
      PV.addStop(setAfter(d + 30, function () {
        [next, prev].forEach(function (el) {
          if (!el) return;
          delete el.dataset.cw;
          el.style.removeProperty('--cwA');
        });
        clean(next, MASKS); clean(prev, MASKS); drop();
      }));
    }
  });

  /* 斜带擦（真合成）：prev 与 next 用互补多边形，斜边推过去 */
  PV.reg('transition', 'diagWipe', {
    nm: '斜带擦', tags: ['graphic', 'pop'], w: 0.8, ownsPrev: 1,
    play: function (c, prev, next, swap, drop) {
      swap();
      var d = D(460), dir = PV.rnd(2) ? 1 : -1;
      /* 斜边扫过：from = 全 hide，mid 用带斜度的多边形，to = 全显 */
      var slant = dir > 0
        ? ['polygon(0 100%, 0 100%, 0 0, 0 0)', 'polygon(-40% 100%, 60% 100%, 100% 0, 0 0)', 'inset(0 0 0 0)']
        : ['polygon(100% 0, 100% 0, 100% 100%, 100% 100%)', 'polygon(140% 0, 40% 0, 0 100%, 100% 100%)', 'inset(0 0 0 0)'];
      if (next) an(next, [
        { clipPath: slant[0] }, { clipPath: slant[1], offset: .6 }, { clipPath: slant[2] }
      ], { duration: d, fill: 'both', easing: 'cubic-bezier(.6,0,.2,1)' });
      if (prev) an(prev, [
        { clipPath: 'inset(0 0 0 0)', opacity: 1 },
        { clipPath: slant[1], opacity: .5, offset: .6 },
        { clipPath: slant[0], opacity: 0 }
      ], { duration: d, fill: 'both', easing: 'cubic-bezier(.6,0,.2,1)' });
      PV.addStop(setAfter(d + 30, function () { clean(next, ['clip-path']); clean(prev, ['clip-path', 'opacity']); drop(); }));
    }
  });

  /* 短册移（真合成）：竖条 mask 左右反向滑，旧行拆成条飘走 */
  PV.reg('transition', 'sliceShiftIn', {
    nm: '短册移', tags: ['graphic', 'glitch', 'pop'], w: 0.55,
    when: function () { return PV.fx.motion > 0.3; }, ownsPrev: 1,
    play: function (c, prev, next, swap, drop) {
      swap();
      var d = D(520), n = 4 + Math.round(PV.rnd(4));
      var mask = 'repeating-linear-gradient(90deg, #000 0 ' + (100 / (2 * n)).toFixed(3) + '%, transparent 0 ' + (100 / n).toFixed(3) + '%)';
      [next, prev].forEach(function (el, idx) {
        if (!el) return;
        var dir = idx ? -1 : 1;
        el.style.setProperty('mask-image', mask);
        el.style.setProperty('-webkit-mask-image', mask);
        an(el, [
          { maskPosition: (dir * 50) + '% 0', opacity: idx ? 1 : 0, transform: 'translateX(' + (dir * 1.2).toFixed(2) + 'em)' },
          { maskPosition: '0% 0', opacity: 1, transform: 'none' }
        ], { duration: d, fill: 'both', easing: 'cubic-bezier(.4,0,.2,1)' });
      });
      PV.addStop(setAfter(d + 30, function () {
        clean(next, MASKS.concat(['transform'])); clean(prev, MASKS.concat(['transform', 'opacity']));
        drop();
      }));
    }
  });
})();
