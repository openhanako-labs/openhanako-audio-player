/* PV 引擎 · 06 镜头层 camera
 * 动的是 .jv-track（整屏），所以镜头与版式互不抢占。
 * 旧实现根本没有镜头层，而且 fix-jizura-layout 用 transform:none !important
 * 把 track 焊死了——那条规则已在迁移时删掉。
 */
(function () {
  'use strict';
  var PV = window.PV;

  function sr(n) { var x = Math.sin(n * 78.233) * 43758.5453; return x - Math.floor(x); }

  /* 本 cut 走到哪了：有行时长就按时长，没歌词时序时退化成 4 秒 */
  function prog(c) {
    var l = c.line || {};
    var d = (l.end && l.time && l.end > l.time) ? Math.max(0.6, (l.end - l.time) / 1000) : 4;
    return Math.min(1, Math.max(0, c.lt / d));
  }
  PV.prog = prog;

  PV.reg('camera', 'none', { nm: '固定', w: 0.8 });

  /* 缓推：整行时长里慢慢压近一点 */
  PV.reg('camera', 'pushIn', {
    nm: '缓推', tags: ['calm', 'emotional', 'editorial'], w: 1,
    apply: function (c) {
      c._cam = { dir: 1, k: 0.022 + 0.055 * PV.fx.motion, rot: (PV.rnd(2) - 1) * 0.5 };
    },
    frame: function (c) {
      var m = c._cam || (c._cam = { k: 0.04, rot: 0 });
      var p = prog(c);
      c.track.style.transform = 'scale(' + (1 + m.k * p).toFixed(4) + ') rotate(' + (m.rot * p).toFixed(2) + 'deg)';
    }
  });

  PV.reg('camera', 'pullOut', {
    nm: '缓拉', tags: ['calm', 'emotional'], w: 0.9,
    apply: function (c) { c._cam = { k: 0.03 + 0.05 * PV.fx.motion }; },
    frame: function (c) {
      var m = c._cam || { k: 0.04 };
      c.track.style.transform = 'scale(' + (1 + m.k * (1 - prog(c))).toFixed(4) + ')';
    }
  });

  /* 横移：往一个方向慢慢飘，幅度小 */
  PV.reg('camera', 'pan', {
    nm: '横移', tags: ['graphic', 'editorial', 'pop'], w: 0.9,
    apply: function (c) { c._cam = { x: (PV.rnd(2) < 1 ? -1 : 1) * (0.8 + 2.2 * PV.fx.motion), rot: (PV.rnd(2) - 1) * 0.9 }; },
    frame: function (c) {
      var m = c._cam || { x: 1, rot: 0 };
      var p = prog(c);
      c.track.style.transform = 'translateX(' + (m.x * p * 10).toFixed(2) + 'px) rotate(' + (m.rot * p).toFixed(2) + 'deg)';
    }
  });

  /* 荷兰角：歪着拍，配轻微呼吸 */
  PV.reg('camera', 'dutch', {
    nm: '荷兰角', tags: ['graphic', 'pop', 'emotional'], w: 0.8,
    apply: function (c) { c._cam = { a: (PV.rnd(2) < 1 ? -1 : 1) * (1.5 + 4.5 * PV.fx.motion) }; },
    frame: function (c) {
      var m = c._cam || { a: 3 };
      c.track.style.transform = 'rotate(' + m.a.toFixed(2) + 'deg) scale(1.035)';
    }
  });

  /* 手持：量化随机抖，跟 motion 走 */
  PV.reg('camera', 'handheld', {
    nm: '手持', tags: ['pop', 'emotional', 'glitch', 'horror'], w: 0.9,
    when: function () { return PV.fx.motion > 0.4; },
    frame: function (c) {
      var s = Math.floor(performance.now() / 90);
      var a = PV.fx.motion * 3.2;
      var dx = (sr(s) - 0.5) * a, dy = (sr(s + 91) - 0.5) * a, dr = (sr(s + 17) - 0.5) * a * 0.35;
      c.track.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) rotate(' + dr.toFixed(2) + 'deg)';
    }
  });

  /* 拍震：有音频数据才开——③ 接 analyser 之前不会中签 */
  PV.reg('camera', 'beatZoom', {
    nm: '拍震', tags: ['pop', 'glitch', 'graphic'], w: 1,
    when: function () { return !!(PV.audio.beat || PV.audio.energy != null); },
    frame: function (c) {
      var b = PV.audio.beat, e = PV.audio.energy, k = 0;
      if (b && b.len) k = Math.max(0, 1 - b.since / (b.len * 0.5));
      else if (e != null) k = e;
      var s = 1 + k * (0.015 + 0.06 * PV.fx.motion);
      c.track.style.transform = 'scale(' + s.toFixed(4) + ')';
    }
  });

  /* 升降：一边推近一边上移 */
  PV.reg('camera', 'crane', {
    nm: '升降', tags: ['editorial', 'calm', 'emotional'], w: 0.7,
    apply: function (c) { c._cam = { y: PV.rnd(2) < 1 ? -1 : 1 }; },
    frame: function (c) {
      var m = c._cam || { y: -1 };
      var p = prog(c);
      c.track.style.transform = 'translateY(' + (m.y * p * 16).toFixed(2) + 'px) scale(' + (1 + 0.03 * p).toFixed(4) + ')';
    }
  });
})();
