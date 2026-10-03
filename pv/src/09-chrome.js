/* PV 引擎 · 04 舞台附件（骰子 / 标签 / 前后行 ghost / 风格条）
 * 全部挂在 #pvJv 内部，所以 CSS 只要 .pv-jv{display:none} 就能一起收起，
 * 不再需要旧那套 body:not(.jizura-mode) .jizura-* {display:none!important}。
 */
(function () {
  'use strict';
  var PV = window.PV;

  PV.mountChrome = function () {
    var layer = PV.layer();
    if (!layer) return null;
    var S = PV.S;
    if (layer.querySelector('.jv-dice')) {
      S.tag = layer.querySelector('.jv-tag');
      S.ghosts = { up: layer.querySelector('.jv-ghost.up'), dn: layer.querySelector('.jv-ghost.dn') };
      return layer;
    }

    var tag = document.createElement('div');
    tag.className = 'jv-tag';
    tag.textContent = 'LAYOUT · —';
    /* 默认不出现（PV.tagOn=false），要看按 T。不再做“点一下循环三态”：
     * 既然平时不显示，那个可点区域就是个没人会发现而且会误触的隐形控件。*/
    tag.title = '配牌读数（按 T 开关）：版式 · 字体 · 外观 · 背景 · 气氛 · 第几段 · 音频链';
    layer.appendChild(tag);

    var dice = document.createElement('button');
    dice.className = 'jv-dice';
    dice.type = 'button';
    dice.textContent = '\uD83C\uDFB2';
    dice.title = 'おまかせ（R）— 重掷 seed 与风格';
    dice.addEventListener('click', function (e) { e.stopPropagation(); PV.omakase(); });
    dice.addEventListener('dblclick', function (e) { e.stopPropagation(); });
    layer.appendChild(dice);

    var gu = document.createElement('div'); gu.className = 'jv-ghost up';
    var gd = document.createElement('div'); gd.className = 'jv-ghost dn';
    layer.appendChild(gu); layer.appendChild(gd);

    /* 风格条：读注册表，不再有第二份风格表 */
    var bar = document.createElement('div');
    bar.className = 'jv-bar';
    PV.parts('style').forEach(function (s) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.title = s.nm;
      dot.className = 'jv-dot' + (s.id === 'auto' ? ' auto' : '');
      dot.style.setProperty('--d-bg', s.id === 'auto' ? 'var(--card-bg)' : s.bg);
      dot.style.setProperty('--d-acc', s.id === 'auto' ? 'var(--accent)' : s.acc);
      dot.addEventListener('click', function (e) { e.stopPropagation(); PV.useStyle(s); });
      dot.addEventListener('dblclick', function (e) { e.stopPropagation(); });
      bar.appendChild(dot);
    });
    layer.appendChild(bar);

    S.tag = tag;
    S.ghosts = { up: gu, dn: gd };
    return layer;
  };

  /* 当前风格在风格条上打点 */
  PV.markStyle = function () {
    var layer = PV.layer();
    if (!layer) return;
    var cur = PV.style();
    Array.prototype.forEach.call(layer.querySelectorAll('.jv-dot'), function (d, i) {
      var s = PV.parts('style')[i];
      d.classList.toggle('on', !!(cur && s && cur.id === s.id));
    });
  };
})();
