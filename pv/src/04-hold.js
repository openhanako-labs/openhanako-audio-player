/* PV 引擎 · 04 保持层 hold
 * 行说完之前画面得活着。写在外层 .jv-w 或整行容器上，避开登场层的 i.jv-t。
 * frame(c) 由全局一条 rAF 驱动，c.lt = 本 cut 已过的秒数。
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* 量化随机时钟：24Hz 以内的整数步，抖动才不会糊成噪声 */
  function stepClock(hz) {
    return Math.floor(performance.now() / (1000 / (hz || 12)));
  }
  function sr(n) { var x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

  PV.reg('hold', 'none', { nm: '静止', w: 0.6 });

  PV.reg('hold', 'breathe', {
    nm: '呼吸', tags: ['calm', 'emotional'], w: 1,
    frame: function (c) {
      var k = 1 + Math.sin(c.lt * 1.5) * (0.004 + 0.011 * PV.fx.motion);
      c.el.style.transform = 'scale(' + k.toFixed(4) + ')';
    }
  });

  PV.reg('hold', 'sway', {
    nm: '轻摆', tags: ['pop', 'calm', 'emotional'], w: 1,
    when: function (c) { return PV.fx.motion > 0.18; },
    apply: function (c) {
      c._w = Array.prototype.slice.call(c.el.querySelectorAll('.jv-w'));
    },
    frame: function (c) {
      var ws = c._w || (c._w = Array.prototype.slice.call(c.el.querySelectorAll('.jv-w')));
      var amp = 1.6 + 5.5 * PV.fx.motion;
      for (var i = 0; i < ws.length; i++) {
        var p = Math.sin(c.lt * 2.1 + i * 0.55);
        ws[i].style.translate = (p * amp * 0.35).toFixed(2) + 'px ' + (p * amp).toFixed(2) + 'px';
      }
    }
  });

  PV.reg('hold', 'wave', {
    nm: '起伏', tags: ['pop', 'graphic'], w: 0.9,
    when: function (c) { return PV.fx.motion > 0.45; },
    apply: function (c) { c._w = Array.prototype.slice.call(c.el.querySelectorAll('.jv-w')); },
    frame: function (c) {
      var ws = c._w || [];
      var amp = 3 + 9 * PV.fx.motion;
      for (var i = 0; i < ws.length; i++) {
        ws[i].style.translate = '0 ' + (Math.sin(c.lt * 3.1 + i * 0.42) * amp).toFixed(2) + 'px';
      }
    }
  });

  PV.reg('hold', 'jitter', {
    nm: '抖动', tags: ['glitch', 'horror'], w: 0.9,
    when: function () { return PV.fx.glitch > 0.18; },
    apply: function (c) { c._w = Array.prototype.slice.call(c.el.querySelectorAll('.jv-w')); },
    frame: function (c) {
      var g = PV.fx.glitch, s = stepClock(10 + 14 * g);
      var amp = g * (2 + 5 * PV.fx.motion);
      var ws = c._w || [];
      for (var i = 0; i < ws.length; i++) {
        var dx = (sr(s * 7 + i * 31) - 0.5) * amp * 2;
        var dy = (sr(s * 11 + i * 17) - 0.5) * amp;
        ws[i].style.translate = dx.toFixed(2) + 'px ' + dy.toFixed(2) + 'px';
      }
    }
  });

  PV.reg('hold', 'drift', {
    nm: '漂移', tags: ['graphic', 'editorial', 'calm'], w: 0.8,
    apply: function (c) { c._x0 = c.el.getBoundingClientRect().left; },
    frame: function (c) {
      var d = 1.4 + 3.6 * PV.fx.motion;
      c.el.style.translate = (Math.sin(c.lt * 0.34) * d).toFixed(2) + 'px ' + (Math.cos(c.lt * 0.27) * d * 0.6).toFixed(2) + 'px';
    }
  });

  PV.reg('hold', 'pulse', {
    nm: '拍脉', tags: ['pop', 'glitch', 'graphic'], w: 1,
    when: function () { return !!(PV.audio.beat || PV.audio.energy != null); },
    frame: function (c) {
      var b = PV.audio.beat, e = PV.audio.energy;
      var k = 0;
      if (b && b.len) k = Math.max(0, 1 - b.since / (b.len * 0.55));
      else if (e != null) k = e;
      var s = 1 + k * (0.012 + 0.05 * PV.fx.motion);
      c.el.style.transform = 'scale(' + s.toFixed(4) + ')';
    }
  });
})();
