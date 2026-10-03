/* PV 引擎 · 16 衔接层扩容（⑤）
 * 补三件：残影（上一段留半透明拖影）、三段切片擦入、由下推入。
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

  /* 残影：上一段原地留一份半透明副本，新段同时进来 */
  PV.reg('transition', 'trail', {
    nm: '残影', tags: ['glitch', 'emotional', 'graphic'], w: 0.8,
    when: function () { return PV.fx.motion > 0.3; },
    play: function (c, prev, next, swap) {
      /* 整行克隆预算：同一时刻只允许一份。上一轮 chroma 已经在克隆当前行时，
       * 这件就只做个淡入，不再叠第三份同文字（用户报的“字影叠字影”就是这么来的）。*/
      var mine = PV.requestGhost && PV.requestGhost('trail');
      if (prev && mine) {
        var g = prev.cloneNode(true);
        g.className = prev.className + ' jv-trail';
        g.setAttribute('aria-hidden', 'true');
        if (g.style) g.style.opacity = '';
        prev.parentNode.appendChild(g);
        an(g, [{ opacity: Math.min(.32, PV.ghostMax || .3) }, { opacity: 0, transform: 'translateY(-.6em) scale(1.03)' }],
          { duration: 420, fill: 'forwards', easing: 'ease-out' });
        var t = setTimeout(function () {
          if (g.parentNode) g.parentNode.removeChild(g);
          PV.releaseGhost && PV.releaseGhost('trail');
        }, 480);
        PV.addStop(function () {
          clearTimeout(t);
          if (g.parentNode) g.parentNode.removeChild(g);
          PV.releaseGhost && PV.releaseGhost('trail');
        });
      } else if (prev) {
        an(prev, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'both', easing: 'ease-in' });
      }
      swap();
      an(next, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: 'both', easing: 'ease-out' });
    }
  });

  /* 三段横向切片依次擦入 */
  PV.reg('transition', 'sliceIn', {
    nm: '切三', tags: ['glitch', 'graphic', 'pop'], w: 0.7,
    play: function (c, prev, next, swap) {
      /* 整行克隆预算：这件一次就克隆三份（每条切片一份），
       * 是“同一句话被画四遍”的最大来源。领不到票就做个普通擦入。*/
      if (PV.requestGhost && !PV.requestGhost('sliceIn')) {
        swap();
        an(next, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
          { duration: 320, fill: 'both', easing: 'cubic-bezier(.5,0,.2,1)' });
        return;
      }
      swap();
      var h = ['inset(0 0 66.6% 0)', 'inset(33.3% 0 33.3% 0)', 'inset(66.6% 0 0 0)'];
      var w = ['inset(0 100% 66.6% 0)', 'inset(33.3% 100% 33.3% 0)', 'inset(66.6% 100% 0 0)'];
      for (var i = 0; i < 3; i++) {
        (function (i) {
          var b = document.createElement('div');
          b.className = 'jv-slice-in';
          b.style.clipPath = h[i];
          b.appendChild(next.cloneNode(true));
          b.firstChild.classList.add('show');
          b.style.opacity = '1';
          next.style.opacity = '0';
          next.parentNode.insertBefore(b, next);
          an(b, [{ clipPath: w[i], opacity: 1 }, { clipPath: h[i], opacity: 1, offset: 0.99 }, { clipPath: h[i], opacity: 0 }],
            { duration: 300 + i * 90, delay: i * 60, fill: 'both', easing: 'cubic-bezier(.5,0,.2,1)' });
          var t = setTimeout(function () {
            next.style.opacity = '';
            if (b.parentNode) b.parentNode.removeChild(b);
            if (i === 2 && PV.releaseGhost) PV.releaseGhost('sliceIn');
          }, 470 + i * 90);
          PV.addStop(function () { clearTimeout(t); if (b.parentNode) b.parentNode.removeChild(b); next.style.opacity = ''; });
        })(i);
      }
    }
  });

  /* 由下推入，上一段同时被顶上去 */
  PV.reg('transition', 'riseIn', {
    nm: '顶入', tags: ['pop', 'graphic', 'calm'], w: 0.8,
    play: function (c, prev, next, swap) {
      swap();
      var dist = Math.max(40, (c.stage ? c.stage.clientHeight : 400) * 0.16);
      an(next, [{ transform: 'translateY(' + dist.toFixed(0) + 'px)', opacity: .2 }, { transform: 'none', opacity: 1 }],
        { duration: 340 + 160 * PV.fx.motion, fill: 'both', easing: 'cubic-bezier(.18,.9,.28,1)' });
      if (prev) an(prev, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(' + (-dist * 0.8).toFixed(0) + 'px)', opacity: 0 }],
        { duration: 300, fill: 'both', easing: 'ease-in' });
    }
  });
})();
