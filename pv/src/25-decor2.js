/* PV 引擎 · 25 装饰扩充（⑬ decor +18）
 *
 * JIZURA 的 decor 有 100 件（crosshair/トンボ/青海波/家紋/提灯…）。这次挑 18 件，标准：
 *   1) 纯 CSS 能画——不吃 SVG 路径、不吃贴图，离线优先；
 *   2) 形状不与已有 18 件撞（准星/刻度/网格/斜纹/粒子/引线那些已经在了）；
 *   3) 一律挂在本次 cut 的 .jv-line 里、带 jv-d 类——元素随段生灭，且不会被竖写带走方向（①⑤ 踩过两次）。
 *
 * 没有一件用「自带开关」：门槛只读已有的 fx（texture / density / chroma / glitch / decor），
 * 免得再造一个没人拧的旋钮。
 */
(function () {
  'use strict';
  var PV = window.PV;

  function el(cls, html) {
    var d = document.createElement('div');
    d.className = 'jv-d ' + cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function add(c, node) {
    if (!c.el) return null;
    var key = node.className.split(' ')[1];
    if (c.el.querySelector('.' + key)) return null;
    c.el.appendChild(node);
    return null;
  }
  function n(c, k) { return PV.rnd(k); }        // 走引擎 seed：同 seed 同画面
  function pad(x) { return (x < 10 ? '0' : '') + x; }

  /* ---- 纸面与印张 ---- */

  PV.reg('decor', 'crop', {
    nm: '裁切标', tags: ['editorial', 'graphic'], w: 0.7,
    when: function () { return PV.fx.texture > 0.1; },
    apply: function (c) { return add(c, el('jv-crop', '<i></i><i></i><i></i><i></i>')); }
  });

  PV.reg('decor', 'regmark', {
    nm: '套准标', tags: ['graphic', 'editorial'], w: 0.6,
    when: function () { return PV.fx.texture > 0.2; },
    apply: function (c) {
      return add(c, el('jv-regmark', '<i class="a"></i><i class="b"></i>'));
    }
  });

  PV.reg('decor', 'ruled', {
    nm: '稿纸线', tags: ['editorial', 'calm'], w: 0.8,
    when: function () { return PV.fx.texture > 0.12; },
    apply: function (c) { return add(c, el('jv-ruled')); }
  });

  PV.reg('decor', 'swatches', {
    nm: '色标', tags: ['graphic', 'editorial'], w: 0.55,
    when: function () { return PV.fx.chroma > 0.15; },
    apply: function (c) {
      var h = '';
      for (var i = 0; i < 5; i++) h += '<i style="opacity:' + (0.35 + n(c, 0.55)).toFixed(2) + '"></i>';
      return add(c, el('jv-swatches', '<div>' + h + '</div>'));
    }
  });

  PV.reg('decor', 'tally', {
    nm: '正字计数', tags: ['editorial', 'graphic'], w: 0.5,
    apply: function (c) {
      var k = 1 + Math.round(n(c, 4)), h = '';
      for (var i = 0; i < k; i++) h += '<i></i>';
      return add(c, el('jv-tally', '<div>' + h + '</div>'));
    }
  });

  /* ---- 标注与测量 ---- */

  PV.reg('decor', 'dimline', {
    nm: '尺寸线', tags: ['graphic', 'editorial'], w: 0.7,
    when: function () { return PV.fx.decor > 0.35; },
    apply: function (c) {
      var w = (12 + n(c, 30)).toFixed(0);
      return add(c, el('jv-dimline', '<div><i class="cap l"></i><i class="bar" style="width:' + w + '%"></i><i class="cap r"></i><b>' + w + 'u</b></div>'));
    }
  });

  PV.reg('decor', 'ruler', {
    nm: '标尺', tags: ['editorial', 'graphic'], w: 0.6,
    apply: function (c) {
      var h = '', N = 16 + Math.round(n(c, 10));
      for (var i = 0; i < N; i++) h += '<i style="height:' + (i % 5 === 0 ? 100 : 52) + '%"></i>';
      return add(c, el('jv-ruler', h));
    }
  });

  PV.reg('decor', 'guides', {
    nm: '参考线', tags: ['editorial', 'graphic', 'glitch'], w: 0.6,
    when: function () { return PV.fx.texture > 0.15; },
    apply: function (c) { return add(c, el('jv-guides', '<i class="v a"></i><i class="v b"></i><i class="h a"></i><i class="h b"></i>')); }
  });

  PV.reg('decor', 'timecode', {
    nm: '时间码', tags: ['glitch', 'editorial', 'graphic'], w: 0.7,
    when: function () { return PV.fx.glitch > 0.1; },
    apply: function (c) {
      var t = Math.round((c.t0 || 0) / 1000), fr = Math.round(n(c, 24));
      var s = pad(Math.floor(t / 60)) + ':' + pad(t % 60) + ':' + pad(fr) + ':' + pad(Math.round(n(c, 30)));
      return add(c, el('jv-timecode', '<i>' + s + '</i>'));
    }
  });

  PV.reg('decor', 'datestamp', {
    nm: '日期戳', tags: ['pop', 'emotional', 'graphic'], w: 0.6,
    apply: function (c) {
      /* 像相机日期印：用真实当天，不把今天写死在代码里 */
      var d = new Date();
      return add(c, el('jv-datestamp', "<i>'" + pad(d.getFullYear() % 100) + ' ' + pad(d.getMonth() + 1) + ' ' + pad(d.getDate()) + '</i>'));
    }
  });

  /* ---- 手绘与贴纸 ---- */

  PV.reg('decor', 'tape', {
    nm: '胶带', tags: ['pop', 'editorial', 'calm'], w: 0.7,
    apply: function (c) {
      var side = n(c, 2) < 1 ? 'tl' : 'br';
      return add(c, el('jv-tape ' + side, '<div><i></i><i></i></div>'));
    }
  });

  PV.reg('decor', 'circline', {
    nm: '手绘圈', tags: ['pop', 'editorial'], w: 0.6,
    when: function () { return PV.fx.decor > 0.4; },
    apply: function (c) { return add(c, el('jv-circline')); }
  });

  PV.reg('decor', 'scribble', {
    nm: '手绘线', tags: ['editorial', 'pop'], w: 0.6,
    apply: function (c) {
      var k = n(c, 2) < 1 ? 'under' : 'through';
      return add(c, el('jv-scribble ' + k, '<svg viewBox="0 0 200 12" preserveAspectRatio="none"><path d="M2 ' +
        (k === 'under' ? 8 : 6) + ' q 24 -6 48 0 t 48 0 t 48 0 t 48 0" /></svg>'));
    }
  });

  PV.reg('decor', 'brackets', {
    nm: '隅付き括号', tags: ['emotional', 'editorial', 'graphic'], w: 0.7,
    /* 直角引号配拉丁字母很怪，所以按文字类型筛（fit），而不是造个永远为真的 when */
    fit: function (c) { return !c.ltr; },
    apply: function (c) { return add(c, el('jv-brackets', '<i>「</i><i>」</i>')); }
  });

  PV.reg('decor', 'seal', {
    nm: '落款', tags: ['emotional', 'editorial', 'calm'], w: 0.35, sp: 1,
    /* sp:1 = 不进随机池。用户看到红章的第一反应是“为什么会有一个印”——
     * 说明它不是“点缀”而是“不明物体”。和条码同一处理：显式调用、预览台按钮还在，
     * 但系统不会自己在歌词上盖印。*/
    /* 两个门槛缺一不可：
     *   · fit —— 拉丁行里没有适合入印的字，拿拉丁字塞进方印就是一块噪点；
     *   · when —— 上一版什何门槛都没有，任何一行都可能被盖个红章（用户在
     *     《死囚牢》上看到的就是这个），装饰件得看气氛脸色，不能人人有份。
     * 另外：印文以前写死一个「印」字——和日期戳写死日期是同一类错。现在从本段取。*/
    fit: function (c) { return !c.ltr && (c.text || '').replace(/[^一-龥]/g, '').length > 0; },
    when: function () { return PV.fx.texture > 0.15 && PV.fx.decor > 0.35; },
    apply: function (c) {
      var han = (c.text || '').replace(/[^一-龥]/g, '');
      // 取最后一个汉字：句尾字做落款比句首更像署名
      var ch = han.charAt(han.length - 1) || '印';
      return add(c, el('jv-seal', '<i>' + ch + '</i>'));
    }
  });

  /* ---- 光与几何 ---- */

  PV.reg('decor', 'leak', {
    nm: '漏光', tags: ['emotional', 'calm', 'pop'], w: 0.7,
    when: function () { return PV.fx.chroma > 0.12; },
    apply: function (c) {
      var s = n(c, 2) < 1 ? 'l' : 'r';
      return add(c, el('jv-leak ' + s));
    }
  });

  PV.reg('decor', 'burstlines', {
    nm: '放射线', tags: ['pop', 'graphic', 'glitch'], w: 0.65,
    when: function () { return PV.fx.motion > 0.45; },
    apply: function (c) {
      var h = '', N = 26 + Math.round(n(c, 18));
      for (var i = 0; i < N; i++) h += '<i style="transform:rotate(' + (i * (360 / N) + n(c, 4)).toFixed(1) + 'deg);opacity:' + (0.18 + n(c, 0.4)).toFixed(2) + '"></i>';
      var corner = n(c, 2) < 1 ? 'tl' : 'br';
      return add(c, el('jv-burstlines ' + corner, h));
    }
  });

  PV.reg('decor', 'sqRings', {
    nm: '同心方', tags: ['graphic', 'glitch'], w: 0.55,
    when: function () { return PV.fx.texture > 0.2; },
    apply: function (c) {
      var h = '';
      for (var i = 0; i < 5; i++) h += '<i style="width:' + (18 + i * 13) + '%;height:' + (18 + i * 13) +
        '%;transform:rotate(' + (i * 4 + n(c, 6)).toFixed(1) + 'deg)"></i>';
      return add(c, el('jv-sqrings', h));
    }
  });

  PV.reg('decor', 'plusgrid', {
    nm: '加号阵', tags: ['graphic', 'glitch', 'editorial'], w: 0.6,
    when: function () { return PV.fx.density > 0.4; },
    apply: function (c) { return add(c, el('jv-plusgrid')); }
  });

  PV.reg('decor', 'checker', {
    nm: '市松带', tags: ['graphic', 'pop'], w: 0.55,
    when: function () { return PV.fx.density > 0.45; },
    apply: function (c) {
      var side = n(c, 2) < 1 ? 'bot' : 'top';
      return add(c, el('jv-checker ' + side));
    }
  });

  PV.reg('decor', 'hanzi', {
    nm: '汉字水印', tags: ['emotional', 'editorial', 'calm'], w: 0.5,
    fit: function (c) { return !c.ltr; },
    apply: function (c) {
      var pool = ['夢', '音', '夜', '影', '風', '光', '深', '静'];
      return add(c, el('jv-hanzi', pool[Math.floor(n(c, pool.length))]));
    }
  });

  PV.reg('decor', 'notes', {
    nm: '音符', tags: ['pop', 'emotional', 'calm'], w: 0.55,
    when: function () { return PV.fx.decor > 0.4; },
    apply: function (c) {
      var g = ['♪', '♫', '♩', '♬'], h = '';
      for (var i = 0; i < 3; i++) {
        h += '<i style="left:' + (6 + n(c, 84)).toFixed(1) + '%;top:' + (10 + n(c, 74)).toFixed(1) +
          '%;font-size:' + (14 + n(c, 22)).toFixed(0) + 'px;animation-delay:' + n(c, 3).toFixed(2) + 's">' +
          g[Math.floor(n(c, g.length))] + '</i>';
      }
      return add(c, el('jv-notes', h));
    }
  });
})();
