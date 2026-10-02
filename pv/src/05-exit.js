/* PV 引擎 · 05 退场层 exit
 * play(ctx, el, drop)：把上一行送走，动画收尾必须调 drop()（引擎负责摘掉元素）。
 * 旧实现没有这一层——innerHTML 直接覆盖，所以「退场」一直是零。
 */
(function () {
  'use strict';
  var PV = window.PV;

  function tk(el) { return Array.prototype.slice.call(el.querySelectorAll('.jv-t')); }
  function after(ms, fn) { var t = setTimeout(fn, ms); return function () { clearTimeout(t); }; }

  PV.reg('exit', 'none', {
    nm: '直切', w: 1.1,
    play: function (c, el, drop) { drop(); }
  });

  PV.reg('exit', 'fade', {
    nm: '淡出', tags: ['calm', 'emotional', 'editorial'], w: 1,
    play: function (c, el, drop) {
      var d = 260 + 220 * PV.fx.motion;
      el.classList.add('jv-out');
      if (el.animate) el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, fill: 'both', easing: 'ease-in' });
      PV.addStop(after(d, drop));
    }
  });

  /* 逐字散开：每字一个随机方向，配微旋转 */
  PV.reg('exit', 'scatter', {
    nm: '吹散', tags: ['emotional', 'pop', 'graphic'], w: 1,
    when: function (c) { return c.tokens.length <= 34; },
    play: function (c, el, drop) {
      var els = tk(el), dur = 380 + 200 * PV.fx.motion;
      els.forEach(function (e, i) {
        var a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 70;
        if (e.animate) e.animate([
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translate(' + (Math.cos(a) * r).toFixed(1) + 'px,' + (Math.sin(a) * r).toFixed(1) + 'px) rotate(' + (a * 30).toFixed(0) + 'deg) scale(.8)' }
        ], { duration: dur, delay: i * 8, fill: 'both', easing: 'cubic-bezier(.4,0,.6,1)' });
      });
      PV.addStop(after(dur + els.length * 8 + 30, drop));
    }
  });

  /* 爆散：先顿一下再炸开，落在拍点上更狠 */
  PV.reg('exit', 'burst', {
    nm: '爆散', tags: ['pop', 'glitch', 'graphic'], w: 0.9,
    when: function () { return PV.fx.motion > 0.35; },
    play: function (c, el, drop) {
      var els = tk(el);
      if (el.animate) el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.18 }, { opacity: 0, transform: 'scale(1.16)' }],
        { duration: 300, fill: 'both', easing: 'steps(3,end)' });
      els.forEach(function (e, i) {
        var a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 180;
        if (e.animate) e.animate([
          { opacity: 1, transform: 'none' },
          { opacity: 1, transform: 'translate(' + (Math.cos(a) * r * 0.3).toFixed(1) + 'px,' + (Math.sin(a) * r * 0.3).toFixed(1) + 'px)', offset: 0.3 },
          { opacity: 0, transform: 'translate(' + (Math.cos(a) * r).toFixed(1) + 'px,' + (Math.sin(a) * r).toFixed(1) + 'px) scale(.4)' }
        ], { duration: 420, delay: i * 6, fill: 'both', easing: 'cubic-bezier(.1,.7,.3,1)' });
      });
      PV.addStop(after(460, drop));
    }
  });

  /* 切片错位：整行切成几横条各自滑走 */
  PV.reg('exit', 'slice', {
    nm: '切片', tags: ['glitch', 'graphic'], w: 0.8,
    when: function () { return PV.fx.glitch > 0.3; },
    play: function (c, el, drop) {
      var n = 4, h = 100 / n;
      for (var i = 0; i < n; i++) {
        var b = document.createElement('div');
        b.className = 'jv-slice';
        b.style.top = (i * h) + '%';
        b.style.height = h + '%';
        b.style.clipPath = 'inset(' + (i * h) + '% 0 ' + (100 - (i + 1) * h) + '% 0)';
        b.textContent = el.textContent;
        el.appendChild(b);
        if (b.animate) b.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(' + (i % 2 ? 40 : -40) + '%)', opacity: 0 }],
          { duration: 280, fill: 'both', easing: 'cubic-bezier(.5,0,.9,.4)' });
      }
      Array.prototype.forEach.call(tk(el), function (e) { e.style.opacity = '0'; });
      PV.addStop(after(300, drop));
    }
  });

  /* 故障闪灭：抖三下再断 */
  PV.reg('exit', 'glitchOut', {
    nm: '闪灭', tags: ['glitch', 'horror'], w: 0.8,
    when: function () { return PV.fx.glitch > 0.45; },
    play: function (c, el, drop) {
      if (el.animate) el.animate([
        { opacity: 1, transform: 'none' },
        { opacity: 1, transform: 'translate(-3%,1%) skewX(6deg)', offset: 0.2 },
        { opacity: .25, transform: 'translate(4%,-2%) skewX(-8deg)', offset: 0.4 },
        { opacity: 1, transform: 'none', offset: 0.6 },
        { opacity: 0, transform: 'translate(-6%,0) scaleY(.4)' }
      ], { duration: 320, fill: 'both', easing: 'steps(6,end)' });
      PV.addStop(after(330, drop));
    }
  });

  /* 掉落：逐字加速坠出画面 */
  PV.reg('exit', 'smash', {
    nm: '坠出', tags: ['pop', 'graphic', 'emotional'], w: 0.9,
    when: function (c) { return c.tokens.length <= 30; },
    play: function (c, el, drop) {
      var els = tk(el);
      els.forEach(function (e, i) {
        if (e.animate) e.animate([
          { opacity: 1, transform: 'none' },
          { opacity: 1, transform: 'translateY(-.18em)', offset: 0.22 },
          { opacity: 0, transform: 'translateY(1.6em) rotate(' + (Math.random() * 24 - 12).toFixed(0) + 'deg)' }
        ], { duration: 420, delay: i * 26, fill: 'both', easing: 'cubic-bezier(.6,0,.9,.4)' });
      });
      PV.addStop(after(430 + els.length * 26, drop));
    }
  });
})();
