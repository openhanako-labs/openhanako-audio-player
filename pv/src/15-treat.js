/* PV 引擎 · 15 处理层扩容（⑤）
 * treatment 分两类：apply 建层（多数只建一次，随滑块改透明度/强度），frame 每帧推。
 * 一律挂在 #pvJv 上（整屏），不碰 folia 的 #pvTrack；全部 pointer-events:none。
 */
(function () {
  'use strict';
  var PV = window.PV;

  function layerEl(cls) {
    var L = PV.layer();
    if (!L) return null;
    var g = L.querySelector('.' + cls);
    if (!g) {
      g = document.createElement('div');
      g.className = 'jv-fx ' + cls;
      L.appendChild(g);
    }
    return g;
  }

  /* ---------- scan CRT 扫描线滚动 ---------- */
  PV.reg('treatment', 'scan', {
    nm: '扫描线', tags: ['glitch', 'graphic', 'editorial'], w: 0.8,
    when: function () { return PV.fx.texture > 0.25; },
    apply: function () {
      var g = layerEl('jv-scan');
      if (g) g.style.opacity = (0.12 + 0.4 * PV.fx.texture).toFixed(3);
      return null;
    }
  });

  /* ---------- vig 暗角随能量呼吸 ---------- */
  PV.reg('treatment', 'vig', {
    nm: '暗角', tags: ['calm', 'emotional', 'graphic'], w: 0.9,
    apply: function () {
      var g = layerEl('jv-vig');
      if (!g) return null;
      var fr = function () {
        var e = PV.audio.energy || 0;
        g.style.opacity = (0.34 + 0.4 * (1 - e)).toFixed(3);
      };
      fr();
      PV.onFrame(fr);
      return function () { PV.offFrame(fr); };
    }
  });

  /* ---------- punch 拍点轻闪（有节拍数据才中签） ---------- */
  PV.reg('treatment', 'punch', {
    nm: '拍闪', tags: ['pop', 'glitch', 'graphic'], w: 0.9,
    when: function () { return !!PV.audio.beat; },
    apply: function () {
      var g = layerEl('jv-punch');
      if (!g) return null;
      var last = -1;
      var fr = function () {
        var b = PV.audio.beat;
        if (!b) { g.style.opacity = '0'; return; }
        if (b.index !== last) {
          last = b.index;
          g.style.opacity = String(0.1 + 0.22 * (PV.audio.energy || 0.5));
        }
        g.style.opacity = (Math.max(0, parseFloat(g.style.opacity || '0') - 0.035)).toFixed(3);
      };
      PV.onFrame(fr);
      return function () { PV.offFrame(fr); };
    }
  });

  /* ---------- edgeglow 边缘光随能量 ---------- */
  PV.reg('treatment', 'edgeglow', {
    nm: '缘光', tags: ['pop', 'emotional', 'glitch'], w: 0.8,
    when: function () { return PV.audio.energy != null && PV.fx.chroma > 0.1; },
    apply: function () {
      var g = layerEl('jv-edge');
      if (!g) return null;
      var fr = function () {
        var e = PV.audio.energy || 0;
        g.style.opacity = (0.06 + 0.55 * e).toFixed(3);
      };
      fr();
      PV.onFrame(fr);
      return function () { PV.offFrame(fr); };
    }
  });

  /* ---------- glitchbars 随机色块错位（glitch 推） ---------- */
  PV.reg('treatment', 'glitchbars', {
    nm: '故障条', tags: ['glitch', 'graphic'], w: 0.8,
    when: function () { return PV.fx.glitch > 0.3; },
    apply: function () {
      var g = layerEl('jv-gbars');
      if (!g) return null;
      g.innerHTML = '<i></i><i></i><i></i><i></i>';
      var bars = g.children, last = 0;
      var fr = function () {
        var now = performance.now();
        if (now - last < 90) return;                 // ~11Hz 才像故障，60Hz 会糊成噪点
        last = now;
        var hot = PV.fx.glitch * (PV.audio.energy || 0.4);
        for (var i = 0; i < bars.length; i++) {
          var on = Math.random() < hot;
          bars[i].style.opacity = on ? (0.15 + Math.random() * 0.5 * hot).toFixed(3) : '0';
          bars[i].style.top = (Math.random() * 92).toFixed(1) + '%';
          bars[i].style.height = (1 + Math.random() * 9 * hot).toFixed(1) + 'px';
          bars[i].style.transform = 'translateX(' + ((Math.random() - 0.5) * 12 * hot).toFixed(1) + 'vw)';
        }
      };
      PV.onFrame(fr);
      return function () { PV.offFrame(fr); };
    }
  });

  /* ---------- duotone 套色层（chroma 推） ---------- */
  PV.reg('treatment', 'duotone', {
    nm: '套色', tags: ['graphic', 'editorial', 'pop'], w: 0.6,
    when: function () { return PV.fx.chroma > 0.45; },
    apply: function () {
      var g = layerEl('jv-duo');
      if (g) g.style.opacity = (0.08 + 0.3 * PV.fx.chroma).toFixed(3);
      return null;
    }
  });

  /* ---------- softfocus 入场与驻留时的虚实 ---------- */
  PV.reg('treatment', 'softfocus', {
    nm: '柔焦', tags: ['calm', 'emotional'], w: 0.6,
    when: function () { return PV.fx.texture > 0.3 && PV.fx.motion < 0.6; }   /* 原来是 .45：七档气氛没有一档同时满足 texture>.45 与 motion<.6，
     * 等于这件永远抽不到（死门槛）。.3 之后 calm 与 emotional 能到 */,
    apply: function (c) {
      if (!c.el) return null;
      c.el.style.filter = 'blur(' + (0.2 + 0.5 * PV.fx.texture).toFixed(2) + 'px) saturate(1.06)';
      return function () { if (c.el) c.el.style.filter = ''; };
    }
  });

  /* ---------- dust 细尘（比 particles 更碎，texture 推） ---------- */
  PV.reg('treatment', 'dust', {
    nm: '细尘', tags: ['calm', 'emotional', 'editorial'], w: 0.7,
    when: function () { return PV.fx.texture > 0.3; },
    apply: function () {
      var g = layerEl('jv-dust');
      if (!g) return null;
      if (!g.childElementCount) {
        var h = '';
        for (var i = 0; i < 26; i++) {
          h += '<i style="left:' + (Math.random() * 98).toFixed(1) + '%;top:' + (Math.random() * 98).toFixed(1) +
            '%;width:' + (1 + Math.random() * 2).toFixed(1) + 'px;height:' + (1 + Math.random() * 2).toFixed(1) +
            'px;animation-duration:' + (5 + Math.random() * 9).toFixed(1) + 's;animation-delay:-' + (Math.random() * 9).toFixed(1) + 's"></i>';
        }
        g.innerHTML = h;
      }
      g.style.opacity = (0.14 + 0.5 * PV.fx.texture).toFixed(3);
      return null;
    }
  });
})();

