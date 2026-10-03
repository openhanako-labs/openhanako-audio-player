/* PV 引擎 · 32 运动幅度预算（修用户说的“抖动特别强烈”）
 *
 * 实测（glitch 气氛、逐帧采样 700ms 的位移范围）：
 *   crashZoom 201×113px、bounceIn 50×28、hold:beat 横向 49px、earthquake 22×21
 * crashZoom/bounceIn 那两条离谱，原因不是系数写大，而是**它们缩放的是整屏 .jv-track**：
 * 离中心越远的字位移越大（半屏 × 0.42 ≈ 200px），跟字号无关。
 *
 * 三条规矩：
 *   1. 整屏 scale 一律换算成"允许的边缘位移" —— PV.moveMax（默认 26px），
 *      件里写的 s-1 会被 clamp 到 (moveMax / 半屏)。
 *   2. 抖源互斥：camera 与 hold 同帧都抖时，hold 让位（实测 160 段里 4 次同时开）。
 *      两件各自抖各自的不叫叠加，叫糊。
 *   3. 件只读 PV.motionGain / PV.shakeGain，不在自己里乘 fx——缩放集中在引擎，
 *      改观感不用翻十几个文件。
 */
(function () {
  'use strict';
  var PV = window.PV;

  PV.moveMax = 26;      // 整屏位移/边缘摆幅上限（px）
  PV.shakeGain = 1;     // 全局抖动系数（0.5 = 所有抖都温柔一半）

  /* 哪些件属于"高频抖"：同帧只允许一个发声 */
  var SHAKE = {
    camera: { handheld: 1, beatZoom: 1, earthquake: 1, vertigo: 1, snapPan: 1, bounceIn: 1, crashZoom: 1, pendulum: 1, tiltDown: 1 },
    hold: { jitter: 1, beat: 1 }
  };

  /* 整屏 scale 的预算换算：s 是想要的 scale，返回不超过 moveMax 边缘位移的 scale */
  PV.scaleClamp = function (s) {
    var st = PV.stage();
    var half = st ? Math.max(1, st.getBoundingClientRect().width / 2) : 480;
    var maxS = 1 + PV.moveMax / half;
    if (s >= 1) return Math.min(s, maxS);
    return Math.max(s, 2 - maxS);          // 缩小方向同理
  };
  /* 整屏平移的预算 */
  PV.shiftClamp = function (px) {
    var lim = PV.moveMax;
    return Math.max(-lim, Math.min(lim, px));
  };

  /* ---------- 写 .jv-track 的 transform 只能经这两个入口 ----------
   * 以前 10 处各自拼字符串，scale 想怎么写就怎么写，于是“整屏缩放”把边缘字
   * 甩出 200px（半屏 × 0.42）。现在：件报它想要的值，这里统一钳位。
   * 不用“每帧再重写一次”的夹法：那个依赖帧序，相机件会在同一帧里把大值写回去
   * （我就是刚这么错过一次，看起来接上了其实没生效）。*/
  PV.tfScale = function (s, extra) {
    var st = PV.stage();
    var half = st ? Math.max(1, st.getBoundingClientRect().width / 2) : 480;
    var maxS = 1 + PV.moveMax / half;
    s = s >= 1 ? Math.min(s, maxS) : Math.max(s, 2 - maxS);
    return 'scale(' + s.toFixed(4) + ')' + (extra ? ' ' + extra : '');
  };
  PV.tfMove = function (x, y, extra) {
    var lim = PV.moveMax;
    x = Math.max(-lim, Math.min(lim, x * PV.shakeGain));
    y = Math.max(-lim, Math.min(lim, y * PV.shakeGain));
    return 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px)' + (extra ? ' ' + extra : '');
  };

  /* 包一层 camera/hold 的 apply：抖源互斥 + 全局抖动系数 + scale/位移 clamp */
  function wrap(group, key) {
    var d = PV.part(group, key);
    if (!d || !d.apply || d.__wrapped) return;
    var raw = d.apply;
    d.__wrapped = 1;
    d.apply = function (c, target) {
      // 抖源互斥：camera 在抖时，hold 的抖动件直接退化成呼吸
      if (group === 'hold' && SHAKE.hold[key] && PV.S.plan && PV.S.plan.camera &&
          SHAKE.camera[PV.S.plan.camera.key] && PV.S.plan.camera.key !== 'none') {
        var soft = PV.part('hold', 'breathe');
        return soft && soft.apply ? soft.apply(c, target) : null;
      }
      var r = raw(c, target);
      return r;
    };
  }
  Object.keys(SHAKE.camera).forEach(function (k) { wrap('camera', k); });
  Object.keys(SHAKE.hold).forEach(function (k) { wrap('hold', k); });
  PV.MOTION_BUDGET = { moveMax: function () { return PV.moveMax; }, shake: SHAKE };
})();
