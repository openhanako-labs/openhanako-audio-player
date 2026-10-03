/* PV 引擎 · 08 装饰与处理层 decor / treatment
 * decor：可叠加 0..n 件的附加图形，apply(ctx, lineEl) 返回 cleanup
 * treatment：按帧处理（扫光等），frame(ctx) 由全局 rAF 驱动
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* ================= decor ================= */
  PV.reg('decor', 'none', { nm: '无' });

  /* 全局粒子层：从 inject-ambient 搬来，参数原样（14 粒，30% 为方块描边） */
  PV.reg('decor', 'particles', {
    nm: '粒子', tags: ['calm', 'emotional', 'pop'], w: 1,
    when: function () { return PV.fx.decor > 0.2; },
    apply: function (c) {
      var layer = PV.layer();
      if (!layer) return null;
      var pl = layer.querySelector('.jv-particles');
      if (!pl) {
        pl = document.createElement('div');
        pl.className = 'jv-d jv-particles';
        if (!pl.childElementCount) {
          for (var pi = 0; pi < 14; pi++) {
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
        }
        layer.appendChild(pl);
      }
      var n = Math.max(0, Math.round(14 * PV.fx.density));
      Array.prototype.forEach.call(pl.children, function (el2, i) { el2.style.display = i < n ? '' : 'none'; });
      return null;
    }
  });

  /* 边角 HUD：坐标环 + 行号，够安静，给画面一个"被记录"的边 */
  PV.reg('decor', 'hud', {
    nm: 'HUD', tags: ['graphic', 'editorial', 'glitch'], w: 0.8,
    when: function () { return PV.fx.decor > 0.5; },
    apply: function (c) {
      var line = c.el;
      if (!line || line.querySelector('.jv-hud')) return null;
      var d = document.createElement('div');
      /* jv-d 带 horizontal-tb：不带就会被竖写版式把整块子层带走方向（⑤ 修了 HUD，这轮补上引线） */
      d.className = 'jv-d jv-hud';
      d.innerHTML = '<span class="no">No.' + String((c.idx || 0) + 1).padStart(2, '0') + '</span>' +
        '<span class="tc">TC ' + tc(c.line && c.line.time) + '</span>';
      line.appendChild(d);
      return null;
    }
  });

  function tc(ms) {
    ms = ms || 0;
    var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, f = Math.floor((ms % 1000) / 40);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(f).padStart(2, '0');
  }

  /* 细引 lines：左右两条短线把整行夹住 */
  PV.reg('decor', 'rule', {
    nm: '引线', tags: ['editorial', 'calm', 'graphic'], w: 0.7,
    when: function () { return PV.fx.decor > 0.5 && c_short(); },
    apply: function (c) {
      if (!c.el || c.el.querySelector('.jv-rules')) return null;
      var d = document.createElement('div');
      d.className = 'jv-d jv-rules';
      d.innerHTML = '<i></i><i></i>';
      c.el.appendChild(d);
      return null;
    }
  });
  function c_short() { return !PV.plan() || (PV.plan().ctx.tokens || []).length <= 18; }

  /* ================= treatment ================= */
  /* 逐字扫光（folia 的 MonetGlow 包络：smoothstep 升起→驻留→衰减）。
   * 时序优先 TTML 的 words，没有就按行起止均分。frame 型件：全局一条 rAF。 */
  PV.reg('treatment', 'sweep', {
    nm: '逐字扫光', w: 1,
    frame: function (c) {
      var els = c.tokensEls;
      if (!els || !els.length) return;
      var line = c.line || {}, toks = c.tokens || [];
      /* 时间源：有外部推值（PV.audio.time，预览台与③的音频链都用它）就用它，
       * 否则回落到 DOM 里的 <audio>。扫光不再自己读时钟，才能被驱动。 */
      var ms = PV.audio.time;
      if (ms == null) {
        var audio = document.querySelector('audio');
        if (!audio) return;
        ms = audio.currentTime * 1000;
      }
      var offs = [], acc = 0;
      toks.forEach(function (tk) { offs.push(acc); acc += tk === ' ' ? 1 : Array.from(tk).length; });
      var total = Math.max(1, acc);
      var next = PV.lyrics()[c.idx + 1];
      var whole = (c.cutN || 1) <= 1;      /* 有 cut（④）时用本段自己的时间窗；TTML 逐词时序只在整行不被切开时有效 */
      var t0 = !whole && c.t0 != null ? c.t0 : (line.time || 0);
      var t1 = !whole && c.t1 != null ? c.t1 : (line.end || (next && next.time) || (t0 + 4000));
      if (line.words && line.words.length && whole) {
        t0 = line.words[0].time;
        t1 = line.words[line.words.length - 1].time + line.words[line.words.length - 1].dur;
      }
      var span = Math.max(1, t1 - t0);
      var now = ms;
      for (var i = 0; i < els.length; i++) {
        var len = toks[i] === ' ' ? 1 : Array.from(toks[i]).length;
        var w0 = t0 + span * (offs[i] / total), w1 = t0 + span * ((offs[i] + len) / total);
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

  /* 色偏残影：整行三趟（青/红错位复制），chroma 滑块推它 */
  PV.reg('treatment', 'chroma', {
    nm: '色偏', tags: ['glitch', 'pop', 'graphic'], w: 0.9,
    when: function () { return PV.fx.chroma > 0.25; },
    apply: function (c) {
      var src = c.el;
      if (!src) return null;
      /* 整行克隆预算：衔接层已经拿走了残影名额（trail 正在拷上一行）时，
       * 这件就不拷了——两层同文字叠加就是用户报的 B 类重叠。*/
      if (PV.requestGhost && !PV.requestGhost('chroma')) return null;
      var d = (1 + 3.4 * PV.fx.chroma).toFixed(2);
      /* 只剩一层残影。原来是两层（青、红各一份整行副本）——那就是用户说的
       * 「歌词都重叠到一起」：chroma 高时两层透明度到 .58，看着就是第二行字。
       * 双色错位用一层就足够读到，不想碰 text-shadow 是因为那是 ⑩ 外观层的地盘。*/
      var g1 = clone(src, 'jv-ghostA', d + 'px ' + (-d) + 'px', 'color-mix(in srgb,var(--jv-acc) 70%,#0ff)');
      var g2 = null;
      function clone(el, cls, tr, col) {
        var n = el.cloneNode(true);
        n.className = el.className + ' ' + cls;
        n.setAttribute('aria-hidden', 'true');
        Array.prototype.forEach.call(n.querySelectorAll('.jv-t'), function (t) { t.style.color = col; t.style.textShadow = 'none'; });
        n.style.transform = 'translate(' + tr + ')';
        n.style.opacity = String(Math.min(.34, 0.18 + 0.2 * PV.fx.chroma));   /* 残影是色边，不是第二行歌词：上限 .34 */
        el.parentNode.insertBefore(n, el);
        return n;
      }
      return function () {
        [g1, g2].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
        if (PV.releaseGhost) PV.releaseGhost('chroma');
      };
    }
  });

  /* 扫描线 + 纸纹：texture 滑块推它，整层一片，不随 cut 重建 */
  PV.reg('treatment', 'grain', {
    nm: '纹理', tags: ['editorial', 'graphic', 'glitch', 'calm'], w: 0.7,
    when: function () { return PV.fx.texture > 0.2; },
    apply: function () {
      var layer = PV.layer();
      if (!layer) return null;
      var g = layer.querySelector('.jv-texture');
      if (!g) {
        g = document.createElement('div');
        g.className = 'jv-texture';
        layer.appendChild(g);
      }
      g.style.opacity = (0.08 + 0.4 * PV.fx.texture).toFixed(3);
      return null;
    }
  });
})();
