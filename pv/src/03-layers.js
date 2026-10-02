/* PV 引擎 · 03 演出层（enter / hold / exit / camera / transition / decor / treatment）
 * ① 这一步只做「把槽挖出来」：每个层的默认件就是旧实现的实际行为，
 * 所以重构后画面不变。真正的多件抽签在 ②③ 往里填。
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* ================= 登场 enter ================= */
  PV.reg('enter', 'none', { nm: '无', apply: function () { } });

  /* 旧实现唯一的入场：逐字淡入 + 上移一个 em。jzWin → jvRise，参数原样。 */
  PV.reg('enter', 'rise', {
    nm: '逐字升起', w: 1,
    apply: function (c, els) {
      var st = c.stagger == null ? 45 : c.stagger;
      els.forEach(function (el, i) {
        el.style.animation = 'jvRise .5s cubic-bezier(.22,1,.36,1) both';
        el.style.animationDelay = (i * st) + 'ms';
      });
    }
  });

  /* ================= 保持 hold ================= */
  PV.reg('hold', 'none', { nm: '静止', apply: function () { return null; } });

  /* ================= 退场 exit ================= */
  PV.reg('exit', 'none', { nm: '直切', play: function (c, el, done) { if (done) done(); } });

  /* ================= 镜头 camera ================= */
  PV.reg('camera', 'none', { nm: '固定', frame: function () { } });

  /* ================= 衔接 transition ================= */
  /* 旧实现就是 innerHTML 直接替换：硬切 */
  PV.reg('transition', 'cut', {
    nm: '硬切',
    play: function (c, prev, next, swap) { swap(); }
  });
  /* 槽位示范件（默认不启用，② 里给骰子加可选） */
  PV.reg('transition', 'fade', {
    nm: '交叉淡出', sp: 1,
    play: function (c, prev, next, swap) {
      if (prev) { prev.classList.remove('show'); prev.classList.add('jv-out'); }
      if (!prev) { swap(); return; }
      var t = setTimeout(swap, 420);
      PV.addStop(function () { clearTimeout(t); });
    }
  });

  /* ================= 装饰 decor ================= */
  PV.reg('decor', 'none', { nm: '无', apply: function () { return null; } });

  /* 全局粒子层：从 inject-ambient 搬来，参数原样（14 粒，30% 为方块描边） */
  PV.reg('decor', 'particles', {
    nm: '粒子', tags: ['calm', 'emotional', 'pop'], w: 1,
    when: function (c) { return PV.fx.decor > 0.2; },
    apply: function (c) {
      var layer = PV.layer();
      if (!layer) return null;
      var pl = layer.querySelector('.jv-particles');
      if (!pl) {
        pl = document.createElement('div');
        pl.className = 'jv-particles';
        for (var i = 0; i < 14; i++) {
          var sp = document.createElement('i');
          var sz = (2 + Math.random() * 4).toFixed(1);
          sp.style.width = sz + 'px'; sp.style.height = sz + 'px';
          sp.style.left = (Math.random() * 96).toFixed(1) + '%';
          sp.style.top = (10 + Math.random() * 80).toFixed(1) + '%';
          sp.style.animationDuration = (7 + Math.random() * 9).toFixed(1) + 's';
          sp.style.animationDelay = (-Math.random() * 10).toFixed(1) + 's';
          if (Math.random() < 0.3) sp.className = 'sq';
          pl.appendChild(sp);
        }
        layer.appendChild(pl);
      }
      var n = Math.max(0, Math.round(14 * PV.fx.density));
      Array.prototype.forEach.call(pl.children, function (el, i) { el.style.display = i < n ? '' : 'none'; });
      return null;
    }
  });

  /* ================= 处理 treatment =================
   * 逐字扫光（MonetGlow 包络：smoothstep 升起→驻留→衰减）。
   * 时序优先用 TTML 的 words，没有就按行的起止均分。
   * 它是 frame 型部件：全局一条 rAF 驱动，不随 cut 重建。 */
  PV.reg('treatment', 'sweep', {
    nm: '逐字扫光', w: 1,
    frame: function (c) {
      var els = c.tokensEls;
      if (!els || !els.length) return;
      var audio = document.querySelector('audio');
      if (!audio) return;
      var line = c.line || {};
      var toks = c.tokens || [];
      var offs = [], acc = 0;
      toks.forEach(function (tk) { offs.push(acc); acc += tk === ' ' ? 1 : Array.from(tk).length; });
      var total = Math.max(1, acc);
      var next = PV.lyrics()[c.idx + 1];
      var t0 = line.time || 0;
      var t1 = line.end || (next && next.time) || (t0 + 4000);
      if (line.words && line.words.length) {
        t0 = line.words[0].time;
        t1 = line.words[line.words.length - 1].time + line.words[line.words.length - 1].dur;
      }
      var span = Math.max(1, t1 - t0);
      var now = audio.currentTime * 1000;
      for (var i = 0; i < els.length; i++) {
        var w0 = t0 + span * (offs[i] / total), w1 = t0 + span * ((offs[i] + (toks[i] === ' ' ? 1 : Array.from(toks[i]).length)) / total);
        var el = els[i];
        if (now < w0) { el.style.color = 'color-mix(in srgb,var(--jv-fg) 38%,transparent)'; el.style.textShadow = 'none'; }
        else if (now > w1) { el.style.color = ''; el.style.textShadow = 'none'; }
        else {
          var p = (now - w0) / Math.max(1, w1 - w0);
          var glow = p * p * (3 - 2 * p);
          el.style.color = 'var(--jv-acc)';
          el.style.textShadow = '0 0 ' + (6 + 16 * glow).toFixed(1) + 'px var(--jv-acc), 0 0 ' + (2 + 5 * glow).toFixed(1) + 'px var(--jv-fg)';
        }
      }
    }
  });
})();
