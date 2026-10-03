/* PV 引擎 · 28 镜头扩充（⑯ camera +12）
 *
 * 归属：镜头只写 `.jv-track` 的 transform（translate / scale / rotate）。
 * ⑬ 那轮补了规矩：applyIn 在换件前把 track 的 transform/filter 抹掉——
 * 因为 .jv-track 是常驻节点，不清场的话上一段的推镜会永久留在画面上。
 * 逐帧件一律返回 cleanup（PV.offFrame + 把 transform 归零）。
 *
 * 他们的 cam 池是 27 件（11p_looks.js 里 `reg('cam', …)`），这轮搬 12 件：
 * 姿态类（俯仰 / 侧倾往复 / 钟摆 / 眩晕 / 浮动噪声）与运镜类（snap pan / 电梯 /
 * 阶梯变焦 / 弹入 /  crash zoom / 地震 /  Rack focus / 周回）。
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* frame(c, fn, opts)：逐帧把 fn 返回的字符串写到 .jv-track 上。
   * opts 只认 { origin }——别的键直接抛，不给静默丢弃留路（⑮ 立的规矩）。*/
  function frame(c, fn, opts) {
    var tr = c.track || PV.S.track;
    if (!tr) return null;
    opts = opts || {};
    for (var key in opts) if (key !== 'origin') throw new Error('camera frame: 不认识的选项 ' + key);
    if (opts.origin) tr.style.transformOrigin = opts.origin;
    var fr = function () {
      var s = fn(tr);
      if (s) tr.style.transform = s;
    };
    fr();
    PV.onFrame(fr);
    return function () {
      PV.offFrame(fr);
      tr.style.removeProperty('transform');
      if (opts.origin) tr.style.removeProperty('transform-origin');
    };
  }
  function M(k) { return (k || 1) * (0.6 + 0.8 * PV.fx.motion); }   // 幅度跟着 motion 走

  /* 俯仰：绕 X 轴的透视倾斜 */
  PV.reg('camera', 'tiltDown', {
    nm: '俯仰', tags: ['emotional', 'graphic'], w: 0.6,
    apply: function (c) {
      var amp = M(4.5);
      return frame(c, function () {
        var k = Math.sin((c.lt || 0) * 0.55);
        return 'perspective(900px) rotateX(' + (k * amp).toFixed(2) + 'deg) scale(' + (1 + 0.012 * (1 - k)).toFixed(3) + ')';
      });
    }
  });

  /* 钟摆：绕顶边左右荡 */
  PV.reg('camera', 'pendulum', {
    nm: '钟摆', tags: ['calm', 'emotional', 'graphic'], w: 0.55,
    when: function () { return PV.fx.motion > 0.3; },
    apply: function (c) {
      var amp = M(2.6);
      return frame(c, function () {
        var t = c.lt || 0, d = Math.exp(-t * 0.5);           // 衰减摆动
        return 'rotate(' + (Math.sin(t * 2.6) * amp * d).toFixed(3) + 'deg)';
      }, { origin: '50% 0%' });
    }
  });

  /* 眩晕：缓慢推拉 + 微旋，越看越晃 */
  PV.reg('camera', 'vertigo', {
    nm: '眩晕', tags: ['glitch', 'horror', 'emotional'], w: 0.5,
    when: function () { return PV.fx.glitch > 0.25 || PV.fx.motion > 0.6; },
    apply: function (c) {
      var a = M(1.6);
      return frame(c, function () {
        var t = c.lt || 0;
        return 'scale(' + (1.02 + Math.sin(t * 0.9) * 0.03 * a).toFixed(4) + ') rotate(' +
          (Math.sin(t * 0.6) * a).toFixed(3) + 'deg)';
      });
    }
  });

  /* 浮动噪声：两条不同频正弦叠加，像漂在水上 */
  PV.reg('camera', 'floatNoise', {
    nm: '浮动', tags: ['calm', 'emotional'], w: 0.7,
    apply: function (c) {
      var a = M(7);
      return frame(c, function () {
        var t = c.lt || 0;
        var x = Math.sin(t * 0.7) * a + Math.sin(t * 1.9 + 1.2) * a * 0.4;
        var y = Math.cos(t * 0.55) * a * 0.8 + Math.sin(t * 2.3) * a * 0.25;
        return PV.tfMove(x, y);
      });
    }
  });

  /* 快摇：段首一次甩动，之后定住 */
  PV.reg('camera', 'snapPan', {
    nm: '快摇', tags: ['pop', 'graphic', 'glitch'], w: 0.6,
    when: function () { return PV.fx.motion > 0.45; },
    apply: function (c) {
      var dir = PV.rnd(2) < 1 ? 1 : -1, amp = M(9) * dir;
      return frame(c, function () {
        var t = c.lt || 0;
        var k = t < 0.34 ? Math.sin((t / 0.34) * Math.PI) : 0;   // 只在前 1/3 秒甩
        return PV.tfMove(k * amp, 0, 'rotate(' + (k * dir * 1.4).toFixed(2) + 'deg)');
      });
    }
  });

  /* 电梯：缓慢纵向位移，像升降 */
  PV.reg('camera', 'elevator', {
    nm: '升降', tags: ['editorial', 'calm', 'emotional'], w: 0.65,
    apply: function (c) {
      var amp = M(26), dir = PV.rnd(2) < 1 ? 1 : -1;
      return frame(c, function () {
        var t = Math.min(1, (c.lt || 0) / 5);
        return PV.tfMove(0, dir * amp * (t - 0.5));
      });
    }
  });

  /* 阶梯变焦：discrete 的几档推近，带机械感 */
  PV.reg('camera', 'stepZoom', {
    nm: '阶梯变焦', tags: ['glitch', 'graphic', 'pop'], w: 0.5,
    when: function () { return PV.fx.glitch > 0.15; },
    apply: function (c) {
      var steps = 4 + Math.round(PV.rnd(3)), base = 1.02 + PV.rnd(0.05);
      return frame(c, function () {
        var t = c.lt || 0;
        var idx = Math.floor(Math.min(1, t / 4.5) * steps);
        var k = base + idx * 0.035 * M(1);
        return PV.tfScale(k);
      });
    }
  });

  /* 弹入：段首过冲再回稳 */
  PV.reg('camera', 'bounceIn', {
    nm: '弹入', tags: ['pop', 'emotional'], w: 0.6,
    apply: function (c) {
      return frame(c, function () {
        var t = c.lt || 0;
        if (t > 0.9) return 'none';
        var k = Math.exp(-t * 5.5) * Math.cos(t * 17) * 0.06 * M(1);
        return PV.tfScale(1 + k);
      });
    }
  });

  /* 砸近：前 200ms 从远处砸进来，配冲击型行 */
  PV.reg('camera', 'crashZoom', {
    nm: '砸近', tags: ['pop', 'glitch', 'horror'], w: 0.5, impact: 1,
    when: function () { return PV.fx.motion > 0.4; },
    apply: function (c) {
      return frame(c, function () {
        var t = c.lt || 0;
        var k = Math.max(0, 1 - t / 0.36);
        return PV.tfScale(1 + 0.42 * k * k);
      });
    }
  });

  /* 地震：三轴同时抖，强度随时间衰减 */
  PV.reg('camera', 'earthquake', {
    nm: '地震', tags: ['horror', 'glitch'], w: 0.45,
    when: function () { return PV.fx.glitch > 0.45; },
    apply: function (c) {
      var a = M(11);
      return frame(c, function () {
        var t = c.lt || 0, d = Math.exp(-t * 0.75);
        var x = (Math.sin(t * 41.3) + Math.sin(t * 27.7)) * 0.5 * a * d;
        var y = (Math.cos(t * 37.1) + Math.sin(t * 23.3)) * 0.5 * a * d;
        return 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' +
          (x * 0.06).toFixed(3) + 'deg)';
      });
    }
  });

  /* 跟焦：从糊到实（模糊写在 track 的 filter 上，与 --lk-* 的涂装无关） */
  PV.reg('camera', 'rackFocus', {
    nm: '跟焦', tags: ['emotional', 'calm'], w: 0.55,
    apply: function (c) {
      var tr = c.track || PV.S.track;
      if (!tr) return null;
      var fr = function () {
        var t = c.lt || 0;
        var b = Math.max(0, 5.5 - t * 4.4);
        tr.style.filter = b > 0.05 ? 'blur(' + b.toFixed(2) + 'px)' : '';
      };
      fr();
      PV.onFrame(fr);
      return function () { PV.offFrame(fr); tr.style.removeProperty('filter'); };
    }
  });

  /* 周回：沿小椭圆轨迹游走 */
  PV.reg('camera', 'orbitDrift', {
    nm: '周回', tags: ['graphic', 'emotional', 'pop'], w: 0.5,
    when: function () { return PV.fx.motion > 0.35; },
    apply: function (c) {
      var a = M(13), ph = PV.rnd(6.28);
      return frame(c, function () {
        var t = (c.lt || 0) * 0.8 + ph;
        return PV.tfMove(Math.cos(t) * a, Math.sin(t * 1.13) * a * 0.55);
      });
    }
  });
})();


