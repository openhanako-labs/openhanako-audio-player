/* PV 引擎 · 02 版式层（layout）
 * 只管「字在画面上的位置与形态」；登场/保持/退场/镜头不在这层。
 * render(ctx) 返回 .jv-line 的内部 HTML；token 一律走 PV.spans，
 * 外层 span 归版式（位置/字号/旋转），内层 i.jv-t 归登场层。
 * fit(ctx) 决定是否够格被抽中；pre(ctx) 可覆写 stagger 等演出参数。
 */
(function () {
  'use strict';
  var PV = window.PV;
  var R = function (i, n) { return (i % n === 0); };

  /* ---------- 12 个基础版式 ---------- */
  PV.reg('layout', 'center', {
    nm: '中央', tags: ['calm', 'pop', 'graphic'], w: 1.4,
    render: function (c) { return '<div class="cur">' + PV.spans(c) + '</div>'; }
  });

  PV.reg('layout', 'mix', {
    nm: '大小混排', tags: ['pop', 'graphic', 'emotional'], w: 1.2,
    pre: function (c) { c.stagger = 50; },
    render: function (c) {
      return '<div>' + PV.spans(c, { cls: function (i) { return R(i, 3) === 1 ? 'sm' : 'big'; } }) + '</div>';
    }
  });

  PV.reg('layout', 'tategaki', {
    nm: '竖写', tags: ['calm', 'editorial'], w: 1,
    fit: function (c) { return !c.ltr && c.tokens.length >= 3 && c.tokens.length <= 16; },
    render: function (c) { return '<div class="cur">' + PV.spans(c) + '</div>'; }
  });

  PV.reg('layout', 'band', {
    nm: '流带', tags: ['pop', 'graphic'], w: 1,
    fit: function (c) { return c.tokens.length <= 20; },
    render: function (c) { return '<div class="bandrow">' + PV.spans(c) + '</div>'; }
  });

  PV.reg('layout', 'tile', {
    nm: '铺满', tags: ['graphic', 'glitch'], w: 0.8,
    fit: function (c) { return !c.ltr && c.tokens.length >= 6; },
    pre: function (c) { c.stagger = 35; },
    render: function (c) {
      return PV.spans(c, { style: function (i) { return 'font-size:' + (20 + ((i * 7) % 3) * 8) + 'px'; } });
    }
  });

  PV.reg('layout', 'scatter', {
    nm: '散落', tags: ['emotional', 'graphic'], w: 0.9, spread: 1,
    pre: function (c) { c.stagger = 55; },
    render: function (c) {
      return PV.spans(c, {
        style: function () {
          var x = 8 + PV.rnd(78), y = 12 + PV.rnd(70), r = (PV.rnd(30) - 15).toFixed(0), s = (18 + PV.rnd(22)).toFixed(0);
          return 'left:' + x + '%;top:' + y + '%;font-size:' + s + 'px;transform:rotate(' + r + 'deg)';
        }
      });
    }
  });

  PV.reg('layout', 'ring', {
    nm: '圆环', tags: ['calm', 'graphic'], w: 0.7,
    fit: function (c) { return c.tokens.length >= 3 && c.tokens.length <= 16; },
    render: function (c) {
      var ch = c.tokens.filter(function (s) { return s !== ' '; }), Rr = 130, t = '';
      ch.forEach(function (s, i) {
        var a = (i / ch.length) * Math.PI * 2 - Math.PI / 2;
        var x = (200 + Math.cos(a) * Rr).toFixed(1), y = (150 + Math.sin(a) * Rr).toFixed(1);
        var rot = (a * 180 / Math.PI + 90).toFixed(0);
        t += '<text x="' + x + '" y="' + y + '" fill="var(--jv-fg)" font-size="30" font-weight="800" text-anchor="middle"' +
          ' transform="rotate(' + rot + ' ' + x + ' ' + y + ')"><animate attributeName="opacity" from="0" to="1" dur="0.4s"' +
          ' begin="' + (i * 0.05) + 's" fill="freeze"/>' + PV.glyph(s) + '</text>';
      });
      return '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">' + t +
        '<circle cx="200" cy="150" r="4" fill="var(--jv-acc)"/></svg>';
    }
  });

  PV.reg('layout', 'wave', {
    nm: '波迹', tags: ['pop', 'calm'], w: 0.9,
    render: function (c) {
      return PV.spans(c, { style: function (i) { return 'transform:translateY(' + (Math.sin(i / 1.6) * 26).toFixed(0) + 'px)'; } });
    }
  });

  PV.reg('layout', 'break', {
    nm: '破框', tags: ['pop', 'graphic'], w: 1,
    fit: function (c) { return c.tokens.length <= 20; },
    render: function (c) {
      return '<div class="cur">' + PV.spans(c) + '</div><div class="sub2">TRACK ' +
        String((c.idx || 0) + 1).padStart(2, '0') + ' — PUNCH THROUGH</div>';
    }
  });

  PV.reg('layout', 'label', {
    nm: '贴标', tags: ['editorial', 'graphic'], w: 1,
    render: function (c) {
      return '<div class="tagbox" data-n="' + String((c.idx || 0) + 1).padStart(2, '0') + '">' + PV.spans(c) + '</div>';
    }
  });

  PV.reg('layout', 'type', {
    nm: '打字', tags: ['editorial', 'glitch'], w: 1,
    render: function (c) { return '<div>&gt; ' + PV.spans(c) + '<span class="caret"></span></div>'; }
  });

  PV.reg('layout', 'caption', {
    nm: '字幕', tags: ['editorial', 'calm'], w: 1,
    render: function (c) { return '<div class="capbar">' + PV.spans(c) + '</div>'; }
  });

  /* ---------- 7 个补齐版式 ---------- */
  PV.reg('layout', 'diag', {
    nm: '斜带', tags: ['pop', 'graphic'], w: 0.9,
    fit: function (c) { return c.tokens.length <= 14; },
    render: function (c) {
      return '<div class="bd"></div><div class="bd bd2"></div><div class="dt">' + PV.spans(c) + '</div>';
    }
  });

  PV.reg('layout', 'circle', {
    nm: '圆窗', tags: ['calm', 'emotional'], w: 0.8,
    fit: function (c) { return c.tokens.length <= 10; },
    render: function (c) { return '<div class="disc"></div><div class="ct">' + PV.spans(c) + '</div>'; }
  });

  PV.reg('layout', 'stack', {
    nm: '残像叠', tags: ['graphic', 'emotional'], w: 0.8,
    fit: function (c) { return c.tokens.length <= 12; },
    render: function (c) { return '<div class="sk">' + PV.spans(c) + '</div>'; }
  });

  PV.reg('layout', 'pill', {
    nm: '胶囊', tags: ['pop', 'editorial'], w: 0.9,
    fit: function (c) { return c.tokens.length <= 14; },
    render: function (c) {
      var l = c.lyrics, i = c.idx;
      var pv = i > 0 && l[i - 1] ? PV.plain(l[i - 1].text) : '';
      var nx = i < l.length - 1 && l[i + 1] ? PV.plain(l[i + 1].text) : '';
      return '<div class="pd pt2">' + pv + '</div><div class="pd pb2">' + nx + '</div><div class="pl">' + PV.spans(c) + '</div>';
    }
  });

  PV.reg('layout', 'cond', {
    nm: '纵压', tags: ['graphic', 'glitch'], w: 0.7,
    fit: function (c) { return !c.ltr && c.tokens.length <= 10; },
    render: function (c) { return '<div class="cd">' + PV.spans(c) + '</div>'; }
  });

  PV.reg('layout', 'cad', {
    nm: '星散', tags: ['emotional', 'calm'], w: 0.9, spread: 1,
    pre: function (c) { c.stagger = 60; },
    render: function (c) {
      // 词/字种子散落 + 微旋转 + 漂浮几何；发光交给 treatment 层的逐字扫光
      var txt = c.text, idx = c.idx || 0, seedBase = txt.length * 7 + idx * 13, out = '';
      var cr = function (o) { var x = Math.sin(seedBase + o) * 10000; return x - Math.floor(x); };
      var glyphs = ['◇', '✕', '△', '+', '□'];
      for (var d = 0; d < 4; d++) {
        out += '<span class="deco" style="left:' + (8 + cr(d + 40) * 84).toFixed(1) + '%;top:' + (10 + cr(d + 50) * 76).toFixed(1) +
          '%;font-size:' + (10 + cr(d + 60) * 16).toFixed(0) + 'px;animation-delay:' + (d * 1.7).toFixed(1) + 's;color:var(--jv-acc)">' +
          glyphs[Math.floor(cr(d + 70) * glyphs.length)] + '</span>';
      }
      return out + PV.spans(c, {
        style: function (i) {
          var x = 6 + cr(i * 3) * 82, y = 14 + cr(i * 3 + 1) * 64, r = (cr(i * 3 + 2) - 0.5) * 24, s = (22 + cr(i * 3 + 4) * 22).toFixed(0);
          return 'left:' + x.toFixed(1) + '%;top:' + y.toFixed(1) + '%;font-size:' + s + 'px;transform:rotate(' + r.toFixed(1) + 'deg)';
        }
      });
    }
  });

  PV.reg('layout', 'ren', {
    nm: '连行', tags: ['calm', 'editorial'], w: 1,
    render: function (c) {
      var l = c.lyrics, i = c.idx;
      var p = i > 0 && l[i - 1] ? PV.plain(l[i - 1].text) : '';
      var n = i < l.length - 1 && l[i + 1] ? PV.plain(l[i + 1].text) : '';
      return '<div class="prev">' + p + '</div><div class="rule"></div><div class="cur">' + PV.spans(c) +
        '</div><div class="rule"></div><div class="next">' + n + '</div>';
    }
  });

  /* ---------- 2 个专用版式：不进随机池，由 special 显式调用 ----------
   * 旧实现里它们只在部件表和 CSS 里存在，switch 没有对应分支——
   * 一旦被抽中就是白屏。这里补上 render，并且只走显式路径。 */
  PV.reg('layout', 'title', {
    nm: '标题', sp: 1,
    render: function (c) {
      var song = (document.querySelector('.np-title') || {}).textContent || '';
      return '<div class="tt">' + (c.text || song || '—') + '</div>' +
        '<div class="sb">' + ((document.querySelector('.np-artist') || {}).textContent || 'NOW PLAYING') + '</div>';
    }
  });

  PV.reg('layout', 'interlude', {
    nm: '间奏', sp: 1,
    render: function (c) {
      var mm = Math.floor((c.line && c.line.time || 0) / 60000), ss = Math.floor(((c.line && c.line.time || 0) / 1000) % 60);
      var v = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
      if (PV.rnd(1) < 0.5) {
        return '<div class="dg"></div><div class="ct2">' + v + '</div>';
      }
      return '<svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">' +
        [60, 110, 160, 200].map(function (r) { return '<circle cx="200" cy="200" r="' + r + '"/>'; }).join('') +
        '</svg><div class="nt">INTERLUDE</div>';
    }
  });
})();
