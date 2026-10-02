/* PV 引擎 · 17 字体表（⑥）
 *
 * 离线优先：不引 Google Fonts，只用本机已装字体。两件事分开：
 *
 * 1) 组栈。一条 font-family 里「拉丁 display 在前、中文 display 在后、generic 收尾」。
 *    CSS 是一个字一个字往下找的：Impact 没有汉字，汉字就顺到下一个族去——所以一个变量
 *    同时拿到英文的冲击感和中文的骨架，不必拆两套。
 *
 * 2) 探测（只做报告，不参与删栈）。这里踩过两个坑，都记下来：
 *    · 基线不能用裸 monospace，要用一个必然不存在的族名——否则黑体/宋体这类
 *      与系统回退走宽相同的字体会被判成「没装」（实测误杀 SimHei）。
 *    · 就算换了基线，**中文字体本质上量不出来**：所有 CJK 字体的汉字进宽都是 1em，
 *      '永字八法' 换任何中文字体宽度都不变。只有拉丁部分能区分。
 *      所以探测是三态：true（拉丁段有差异）/ false（无差异）/ null（只能靠汉字判，未知）。
 *    结论：探测只用来在面板上告诉你「这个字体大概率在不在」，栈永远带全部候选——
 *    没装的族 CSS 自己跳，拿一个会误判的探测去删栈只会把好字体静默丢掉。
 *
 * 字体是一层（group 'face'），参与气氛与强调偏置；风格可以钉死自己的字体
 * （新闻体就该黑体，不该被随机带走）。auto 风格连字体一起让给 App，不抢。
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* key, 名字, 中文栈, 拉丁栈, 字重, 字距, 气氛
   * 中文栈里英文名与本地化名都带：实测这台 Chrome 认「华文隶书」「等线」「微软雅黑」，
   * 却认不了 SimHei / SimSun / KaiTi / YouYuan——只写一种名字会静默掉回退。*/
  var DEF = [
    ['hei', '黑体', ['Microsoft YaHei', '微软雅黑', 'DengXian', '等线', 'SimHei', '黑体', 'PingFang SC'], ['Arial Black', 'Impact', 'Franklin Gothic Heavy'], 800, '.02em', ['pop', 'graphic', 'glitch', 'horror']],
    ['song', '宋体', ['STSong', '华文宋体', 'SimSun', '宋体', 'Songti SC', 'Noto Serif SC'], ['Georgia', 'Cambria'], 700, '.06em', ['editorial', 'calm', 'emotional']],
    ['kai', '楷体', ['STKaiti', '华文楷体', 'KaiTi', '楷体', 'KaiTi_GB2312', '楷体_GB2312'], ['Cambria', 'Georgia'], 600, '.12em', ['calm', 'emotional', 'editorial']],
    ['li', '隶书', ['STLishu', '华文隶书', 'LiSu', '隶书'], ['Cambria', 'Bodoni MT'], 700, '.14em', ['emotional', 'editorial', 'horror']],
    ['xing', '行楷', ['STXingkai', '华文行楷'], ['Harlow Solid Italic', 'Brush Script MT'], 600, '.10em', ['emotional', 'calm']],
    ['yuan', '圆体', ['STHupo', '华文琥珀', 'YouYuan', '幼圆', 'Microsoft YaHei'], ['Tw Cen MT', 'Berlin Sans FB'], 700, '.05em', ['pop', 'calm']],
    ['cai', '彩云', ['STCaiYun', '华文彩云', 'STZhongsong', '华文中宋'], ['Rockwell', 'Copperplate Gothic Light'], 700, '.16em', ['pop', 'emotional']],
    ['shu', '舒体', ['FZShuTi', '方正舒体', 'FZYaoTi', '方正姚体'], ['Rockwell', 'Bookman Old Style'], 700, '.06em', ['pop', 'graphic']],
    ['blk', '西洋黑', ['Microsoft YaHei', '微软雅黑', 'SimHei', '黑体'], ['Impact', 'Franklin Gothic Heavy', 'Arial Black'], 900, '-.01em', ['glitch', 'graphic', 'pop', 'horror']],
    ['scr', '西洋饰', ['SimHei', '黑体', 'Microsoft YaHei'], ['Bodoni MT', 'Copperplate Gothic Light', 'Elephant'], 700, '.10em', ['editorial', 'graphic']],
    ['goth', '哥特', ['Yu Gothic', 'Malgun Gothic', 'Microsoft JhengHei', '等线'], ['Bahnschrift', 'Franklin Gothic Demi'], 700, '.04em', ['glitch', 'graphic']],
    ['mono', '等宽', ['DengXian', '等线', 'Microsoft YaHei'], ['Consolas', 'Cascadia Mono', 'Courier New'], 700, '.02em', ['glitch', 'editorial', 'graphic']]
  ];

  var ctx2d = null, cache = {};
  function widths(f) {
    if (!ctx2d) ctx2d = document.createElement('canvas').getContext('2d');
    ctx2d.font = '64px ' + f;
    /* 只用拉丁段判：汉字进宽对所有 CJK 字体都是 1em，量了也白量 */
    return ctx2d.measureText('AWMWwm@123&fl').width;
  }
  function baseW() { if (cache.__b == null) cache.__b = widths('"__no_such_face_zzq__", monospace'); return cache.__b; }

  /* true 有 / false 没有 / null 判不了（该族只在中文段出现，或它与回退同宽） */
  function has(fam) {
    if (cache[fam] != null) return cache[fam];
    cache[fam] = Math.abs(widths('"' + fam + '", monospace') - baseW()) > 0.6;
    return cache[fam];
  }
  PV.faceHas = has;

  function look(fam) {
    /* 中文名也能量：'永' 这类汉字在任何中文字体里都是 1em，但本地化族名
     * 能否解析可以从拉丁段差异看出——量不出差异就当未知，不删栈 */
    return has(fam);
  }

  function stack(cjk, lat) {
    return lat.concat(cjk).map(function (f) { return '"' + f + '"'; }).join(',') + ',sans-serif';
  }

  DEF.forEach(function (d) {
    var all = d[2].concat(d[3]);
    var hit = [], miss = [], unk = [];
    all.forEach(function (f) {
      var v = look(f);
      if (v === true) hit.push(f); else if (v === false) miss.push(f); else unk.push(f);
    });
    PV.reg('face', d[0], {
      nm: d[1], tags: d[6], w: 1,
      weight: d[4], track: d[5],
      mono: d[0] === 'mono',
      cjk: d[2], latin: d[3],
      hit: hit, miss: miss, unknown: unk,
      stack: stack(d[2], d[3])
    });
  });

  PV.facesReport = function () {
    return PV.parts('face').map(function (f) {
      return f.key + ' ' + f.nm + '：判到 ' + f.hit.length + '、判无 ' + f.miss.length + '、判不了 ' + f.unknown.length +
        (f.hit.length ? '（' + f.hit.join(' ') + '）' : '');
    });
  };

  /* ---------- 应用 ---------- */
  var cur = null;
  PV.face = function (f) { if (f) cur = f; return cur; };

  PV.useFace = function (f) {
    if (typeof f === 'string') f = PV.part('face', f);
    if (!f) return PV.clearFace();
    cur = f;
    var st = PV.stage();
    if (!st) return f;
    st.style.setProperty('--jv-face', f.stack);
    st.style.setProperty('--jv-face-weight', String(f.weight));
    st.style.setProperty('--jv-face-track', f.track);
    return f;
  };
  PV.clearFace = function () {
    cur = null;
    var st = PV.stage();
    if (st) {
      st.style.removeProperty('--jv-face');
      st.style.removeProperty('--jv-face-weight');
      st.style.removeProperty('--jv-face-track');
    }
    return null;
  };
  PV.applyMonoStack = function () {
    var st = PV.stage(), m = PV.part('face', 'mono');
    if (st && m) st.style.setProperty('--jv-mono', m.stack);
  };

  PV.faceManual = false;                 // false = 参与抽签；字符串 = 钉死某个 face key
  PV.setFaceManual = function (k) {
    if (!k || k === 'auto') { PV.faceManual = false; PV.clearFace(); return null; }
    var f = PV.part('face', k);
    if (!f) return null;
    PV.faceManual = k;
    PV.useFace(f);
    return f;
  };

  /* 抽签优先级：本段指定 > 风格钉死 > 手动锁定 > 气氛/强调加权 */
  PV.rollFace = function (ctx, opts) {
    if (opts.face) return PV.part('face', opts.face);
    var st = ctx.style;
    if (st && st.face) { var pin = PV.part('face', st.face); if (pin) return pin; }
    if (PV.faceManual) { var mf = PV.part('face', PV.faceManual); if (mf) return mf; }
    return PV.choose('face', ctx, opts) || PV.part('face', 'hei');
  };
})();
