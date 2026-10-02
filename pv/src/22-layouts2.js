/* PV 引擎 · 22 版式扩充（⑨）
 *
 * 从 JIZURA 的 270+ 版式里挑结构上真不同的吸收进来。挑选标准三条：
 *   1) 与我们已有 21 套的构图逻辑不重复（不然只是换皮，抽到了也看不出来）；
 *   2) 纯 CSS/DOM 能表达，不依赖贴图与 canvas；
 *   3) 能被 fitGuard 兜住——绝对定位的都标 spread:1，让守卫按单字回收。
 *
 * 一条血规矩（⑩ 那轮刚踩的）：**不要在版式类上重写行元素的 position**。
 * .jv-line 本身是 position:absolute;inset:0，改写成 relative 会让当前行与
 * 前后幽灵行从"叠在一起"变成"竖着排队"，后两条直接排到舞台外面去。
 * 需要定位上下文就包一层自己的 div，或者依赖 .jv-line 已经是包含块这个事实。
 */
(function () {
  'use strict';
  var PV = window.PV;
  function cr(i) { var x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }   // 行内稳定伪随机，同 seed 同画面

  /* ---------- 1 下三分 ---------- */
  PV.reg('layout', 'l3', {
    nm: '下三分', tags: ['editorial', 'calm', 'pop'], w: 0.9,
    fit: function (c) { return c.tokens.length <= 24; },
    render: function (c) { return '<div class="l3box">' + PV.spans(c) + '</div>'; }
  });

  /* ---------- 2 阶梯 ---------- */
  PV.reg('layout', 'stair', {
    nm: '阶梯', tags: ['graphic', 'pop'], w: 0.8, spread: 1,
    pre: function (c) { c.stagger = 60; },
    fit: function (c) { return c.tokens.length <= 10; },
    render: function (c) {
      var n = c.tokens.length;
      return PV.spans(c, {
        style: function (i) {
          return 'left:' + (8 + i * (74 / Math.max(1, n - 1 || 1))).toFixed(1) + '%;top:' +
            (66 - i * (46 / Math.max(1, n))).toFixed(1) + '%';
        }
      });
    }
  });

  /* ---------- 3 之字 ---------- */
  PV.reg('layout', 'zigzag', {
    nm: '之字', tags: ['pop', 'graphic'], w: 0.8, spread: 1,
    fit: function (c) { return c.tokens.length <= 14; },
    render: function (c) {
      var n = c.tokens.length;
      return PV.spans(c, {
        style: function (i) {
          return 'left:' + (6 + i * (86 / Math.max(1, n))).toFixed(1) + '%;top:' +
            (i % 2 ? 58 : 28) + '%;transform:rotate(' + (i % 2 ? 4 : -4) + 'deg)';
        }
      });
    }
  });

  /* ---------- 4 弧顶 ---------- */
  PV.reg('layout', 'arc', {
    nm: '弧顶', tags: ['emotional', 'calm', 'pop'], w: 0.8, spread: 1,
    fit: function (c) { return c.tokens.length >= 3 && c.tokens.length <= 16; },
    render: function (c) {
      var n = c.tokens.length;
      return PV.spans(c, {
        style: function (i) {
          var t = (i / (n - 1 || 1)) * 2 - 1;                       // -1..1
          var ang = t * 1.15;
          return 'left:' + (50 + Math.sin(ang) * 42).toFixed(1) + '%;top:' +
            (30 + (1 - Math.cos(ang)) * 46).toFixed(1) + '%;transform:rotate(' +
            (t * 16).toFixed(1) + 'deg)';
        }
      });
    }
  });

  /* ---------- 5 螺旋 ---------- */
  PV.reg('layout', 'spiral', {
    nm: '螺旋', tags: ['glitch', 'graphic', 'emotional'], w: 0.6, spread: 1,
    fit: function (c) { return c.tokens.length >= 4 && c.tokens.length <= 14; },
    render: function (c) {
      var n = c.tokens.length;
      return PV.spans(c, {
        style: function (i) {
          var a = i * 0.72 + cr(i + (c.idx || 0)) * 0.4, r = 6 + i * (30 / n);
          return 'left:' + (50 + Math.cos(a) * r).toFixed(1) + '%;top:' +
            (50 + Math.sin(a) * r * 0.62).toFixed(1) + '%;font-size:' +
            (30 - i * 1.2).toFixed(0) + 'px;transform:rotate(' + (a * 26).toFixed(0) + 'deg)';
        }
      });
    }
  });

  /* ---------- 6 宫格 ---------- */
  PV.reg('layout', 'cells', {
    nm: '宫格', tags: ['graphic', 'editorial'], w: 0.8,
    fit: function (c) { return c.tokens.length >= 4 && c.tokens.length <= 12; },
    pre: function (c) { c.stagger = 40; },
    render: function (c) { return '<div class="cellgrid">' + PV.spans(c) + '</div>'; }
  });

  /* ---------- 7 头字下沉 ---------- */
  PV.reg('layout', 'dropcap', {
    nm: '头字下沉', tags: ['editorial', 'calm'], w: 0.9,
    fit: function (c) { return !c.ltr && c.tokens.length >= 5 && c.tokens.length <= 18; },
    render: function (c) {
      return PV.spans(c, { cls: function (i) { return i === 0 ? 'dc-first' : 'dc-rest'; } });
    }
  });

  /* ---------- 8 两端对齐 ---------- */
  PV.reg('layout', 'justified', {
    nm: '两端对齐', tags: ['editorial', 'calm', 'graphic'], w: 0.9,
    fit: function (c) { return c.tokens.length >= 6; },
    render: function (c) { return '<div class="justrow">' + PV.spans(c) + '</div>'; }
  });

  /* ---------- 9 框中框 ---------- */
  PV.reg('layout', 'framebox', {
    nm: '框中框', tags: ['graphic', 'editorial', 'pop'], w: 0.8,
    fit: function (c) { return c.tokens.length <= 20; },
    render: function (c) { return '<div class="fb2"><div class="fb1">' + PV.spans(c) + '</div></div>'; }
  });

  /* ---------- 10 气泡 ---------- */
  PV.reg('layout', 'bubble', {
    nm: '气泡', tags: ['pop', 'calm', 'emotional'], w: 0.8,
    fit: function (c) { return c.tokens.length <= 22; },
    render: function (c) { return '<div class="bub">' + PV.spans(c) + '<i class="bubtail"></i></div>'; }
  });

  /* ---------- 11 跑马 ---------- */
  PV.reg('layout', 'ticker', {
    nm: '跑马', tags: ['glitch', 'graphic', 'pop'], w: 0.7,
    fit: function (c) { return c.tokens.length >= 6; },
    render: function (c) {
      var t = PV.spans(c);
      return '<div class="tick"><div class="tickrun">' + t + t + '</div></div>';   // 两遍正文，滚动接缝看不出来
    }
  });

  /* ---------- 12 对分屏 ---------- */
  PV.reg('layout', 'splitscr', {
    nm: '对分', tags: ['graphic', 'pop', 'editorial'], w: 0.7, spread: 1,
    fit: function (c) { return c.tokens.length >= 4 && c.tokens.length <= 16; },
    render: function (c) {
      var half = Math.ceil(c.tokens.length / 2);
      return PV.spans(c, {
        style: function (i) {
          var up = i < half, k = up ? i : i - half;
          return 'left:' + (up ? 8 : 52) + '%;top:' + (up ? 16 : 54) + '%;width:40%;' +
            'font-size:' + (up ? 34 : 24) + 'px';
        }
      });
    }
  });

  /* ---------- 13 镜像 ---------- */
  PV.reg('layout', 'mirror', {
    nm: '镜像', tags: ['emotional', 'graphic'], w: 0.7,
    fit: function (c) { return c.tokens.length <= 18; },
    render: function (c) { return '<div class="mir">' + PV.spans(c) + '</div>'; }
  });

  /* ---------- 14 横倒 ---------- */
  PV.reg('layout', 'sideways', {
    nm: '横倒', tags: ['graphic', 'glitch', 'pop'], w: 0.7,
    fit: function (c) { return c.tokens.length <= 20; },
    render: function (c) { return '<div class="side90">' + PV.spans(c) + '</div>'; }
  });

  /* ---------- 15 点阵 ---------- */
  PV.reg('layout', 'dotmatrix', {
    nm: '点阵', tags: ['glitch', 'graphic'], w: 0.6,
    pre: function (c) { c.stagger = 30; },
    render: function (c) { return '<div class="dm">' + PV.spans(c) + '</div>'; }
  });

  /* ---------- 16 双栏 ---------- */
  PV.reg('layout', 'columns', {
    nm: '双栏', tags: ['editorial', 'calm'], w: 0.8,
    fit: function (c) { return c.tokens.length >= 6 && c.tokens.length <= 26; },
    render: function (c) { return '<div class="cols2">' + PV.spans(c) + '</div>'; }
  });

  /* ---------- 17 拼贴 ---------- */
  PV.reg('layout', 'ransom', {
    nm: '拼贴', tags: ['glitch', 'horror', 'graphic'], w: 0.7,
    pre: function (c) { c.stagger = 55; },
    render: function (c) {
      return PV.spans(c, {
        cls: function (i) { return 'rn' + Math.floor(cr(i + (c.idx || 0) * 3) * 4); },
        style: function (i) {
          var r = cr(i * 7 + (c.idx || 0));
          return 'transform:rotate(' + ((r - 0.5) * 16).toFixed(1) + 'deg);margin:0 ' +
            (2 + r * 6).toFixed(0) + 'px';
        }
      });
    }
  });

  /* ---------- 18 纵深堆 ---------- */
  PV.reg('layout', 'depth', {
    nm: '纵深堆', tags: ['emotional', 'glitch', 'calm'], w: 0.7, spread: 1,
    fit: function (c) { return c.tokens.length >= 3 && c.tokens.length <= 10; },
    pre: function (c) { c.stagger = 70; },
    render: function (c) {
      var n = c.tokens.length;
      return PV.spans(c, {
        style: function (i) {
          var k = i / (n - 1 || 1);
          return 'left:' + (24 + k * 10).toFixed(1) + '%;top:' + (18 + k * 52).toFixed(1) +
            '%;font-size:' + (46 - k * 20).toFixed(0) + 'px;opacity:' + (1 - k * 0.55).toFixed(2) +
            ';transform:rotate(' + (-3 + k * 6).toFixed(1) + 'deg)';
        }
      });
    }
  });

  /* ---------- 19 短册 ---------- */
  PV.reg('layout', 'tanzaku', {
    nm: '短册', tags: ['calm', 'editorial', 'emotional'], w: 0.7,
    fit: function (c) { return !c.ltr && c.tokens.length >= 3 && c.tokens.length <= 15; },
    render: function (c) {
      var n = c.tokens.length, strip = Math.min(3, Math.max(1, Math.ceil(n / 5)));
      var out = '';
      for (var s = 0; s < strip; s++) {
        var seg = c.tokens.slice(s * Math.ceil(n / strip), (s + 1) * Math.ceil(n / strip));
        out += '<div class="tz" style="transform:rotate(' + ((s - 1) * 2.5).toFixed(1) +
          'deg)">' + seg.map(function (t, i) {
            return '<span class="jv-w" data-i="' + (s * 5 + i) + '"><i class="jv-t">' + PV.glyph(t) + '</i></span>';
          }).join('') + '</div>';
      }
      return out;
    }
  });

  /* ---------- 20 场记板 ---------- */
  PV.reg('layout', 'clapper', {
    nm: '场记板', tags: ['graphic', 'pop'], w: 0.6,
    fit: function (c) { return c.tokens.length <= 18; },
    render: function (c) {
      return '<div class="clap"><div class="clapbar"></div><div class="claptxt">' + PV.spans(c) +
        '</div><div class="clapmeta">SCENE ' + String(((c.idx || 0) % 24) + 1).padStart(2, '0') +
        ' · TAKE ' + String(1 + Math.floor(cr(c.idx || 1) * 4)).padStart(2, '0') + '</div></div>';
    }
  });

  /* ---------- 21 胶片 ---------- */
  PV.reg('layout', 'filmstrip', {
    nm: '胶片', tags: ['editorial', 'calm', 'graphic'], w: 0.6,
    fit: function (c) { return c.tokens.length <= 20; },
    render: function (c) {
      return '<div class="fs"><i class="fsperf a"></i><div class="fstxt">' + PV.spans(c) +
        '</div><i class="fsperf b"></i></div>';
    }
  });

  /* ---------- 22 警示 ---------- */
  PV.reg('layout', 'hazard', {
    nm: '警示', tags: ['glitch', 'horror', 'graphic'], w: 0.6,
    fit: function (c) { return c.tokens.length <= 16; },
    render: function (c) {
      return '<div class="hz"><div class="hzstrip"></div><div class="hztxt">' + PV.spans(c) +
        '</div><div class="hzstrip b"></div></div>';
    }
  });
})();
