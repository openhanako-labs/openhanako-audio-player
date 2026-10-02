/* PV 引擎 · 01 风格层（配色 + 封面取色）
 * 旧实现里 JZ_STYLES 在 inject-jizura.mjs 与 inject-jizura-ui.mjs 各存一份，
 * 引擎和风格条会分叉。这里只有一份：风格即部件，注册一次，两边都读它。
 */
(function () {
  'use strict';
  var PV = window.PV;

  var STYLES = [
    { id: 'auto', nm: '自动', sp: 1 },
    { id: 'gold', nm: '金夜', bg: '#0A0907', fg: '#F3E7C4', sub: '#B39A62', acc: '#D4AF37', face: 'song' },
    { id: 'ocean', nm: '深海', bg: '#031A2E', fg: '#E4FAFF', sub: '#7FB2C8', acc: '#1FD2E6', face: 'hei' },
    { id: 'sakura', nm: '夜樱', bg: '#26091B', fg: '#FCE8F0', sub: '#D69DB6', acc: '#FF86B0', face: 'kai' },
    { id: 'vapor', nm: '蒸汽', bg: '#3A2A6E', fg: '#FFFFFF', sub: '#D6C8FF', acc: '#FF8FD8', face: 'yuan' },
    { id: 'synth80', nm: '合成80s', bg: '#0B0414', fg: '#FF4FD8', sub: '#A98BFF', acc: '#22E6FF', face: 'blk' },
    { id: 'newsprint', nm: '新闻', bg: '#E6E5E0', fg: '#111111', sub: '#4E4E4C', acc: '#D8141B', light: 1, face: 'hei' },
    { id: 'kraft', nm: '牛皮纸', bg: '#C49A6C', fg: '#1A1410', sub: '#46301E', acc: '#B8361B', light: 1, face: 'shu' },
    { id: 'sumi', nm: '墨与朱', bg: '#EFE5CF', fg: '#16130F', sub: '#5E574C', acc: '#B83A22', light: 1, face: 'xing' }
  ];

  STYLES.forEach(function (s) { PV.reg('style', s.id, s); });

  /* 封面主色 → 底色（auto 风格用；CORS 失败静默） */
  function ambient(url) {
    var layer = PV.layer && PV.layer();
    var st = PV.stage();
    if (!st || !url) return;
    var cur = PV.style();
    if (cur && cur.id !== 'auto') return;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var cv = document.createElement('canvas'); cv.width = cv.height = 8;
        var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 8, 8);
        var d = cx.getImageData(0, 0, 8, 8).data, r = 0, g = 0, b = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        st.style.setProperty('--jv-bg', 'color-mix(in srgb, rgb(' + r + ',' + g + ',' + b + ') 32%, var(--card-bg))');
      } catch (e) { }
    };
    img.src = url;
  }
  PV.ambient = ambient;

  PV.useStyle = function (s) {
    if (typeof s === 'string') s = PV.part('style', s);
    if (!s) return;
    PV.setStyle(s);
    var st = PV.stage();
    if (!st) return;
    if (s.id === 'auto') {
      st.style.removeProperty('--jv-bg');
      st.style.removeProperty('--jv-fg');
      st.style.removeProperty('--jv-acc');
      ambient(window._jzCover);
      return;
    }
    st.style.setProperty('--jv-bg', s.bg);
    st.style.setProperty('--jv-fg', s.fg);
    st.style.setProperty('--jv-acc', s.acc);
  };

  /* 骰子用：从当前可选风格里重掷（auto 也在池里，和旧行为一致） */
  PV.rollStyle = function () {
    var pool = PV.parts('style');
    var s = PV.pickNot(pool, PV.style() ? PV.style().id : '');
    PV.useStyle(s);
    return s;
  };
})();
